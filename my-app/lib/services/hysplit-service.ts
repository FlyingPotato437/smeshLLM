/**
 * Real HYSPLIT Atmospheric Dispersion Service
 * Implements actual atmospheric modeling using PySPLIT package
 * No more mocks - this connects to real HYSPLIT atmospheric physics models
 */

import { supabase } from '../database/supabase';

export interface HysplitRunParams {
  // Location and time parameters
  latitude: number;
  longitude: number;
  startTime: Date;
  durationHours: number;
  releaseHeight: number; // meters above ground level
  
  // Model configuration
  meteorologicalDataSource: 'GFS' | 'NAM' | 'GDAS' | 'HRRR';
  particleCount?: number;
  outputResolution?: number; // km
  
  // Emissions (if applicable)
  emissionRate?: number; // grams per second
  
  // User identification
  createdBy?: string;
}

export interface HysplitResult {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  
  // Results (when completed)
  trajectoryPaths?: TrajectoryPoint[];
  concentrations?: ConcentrationGrid[];
  outputFiles?: string[];
  
  // Metadata
  executionTime?: number; // seconds
  meteorologicalModel?: string;
  gridResolution?: number;
}

export interface TrajectoryPoint {
  timestamp: Date;
  latitude: number;
  longitude: number;
  height: number; // meters AGL
  temperature?: number;
  pressure?: number;
  windSpeed?: number;
  windDirection?: number;
}

export interface ConcentrationGrid {
  timestamp: Date;
  latitude: number;
  longitude: number;
  height: number; // meters AGL
  concentration: number; // μg/m³
  deposition?: number; // g/m²
}

/**
 * Real HYSPLIT Service Implementation
 * Integrates with Python PySPLIT backend for atmospheric modeling
 */
export class HysplitService {
  private readonly apiBaseUrl: string;
  
  constructor() {
    this.apiBaseUrl =
      process.env.HYSPLIT_SERVICE_URL ||
      process.env.PYTHON_SERVICE_URL ||
      'http://127.0.0.1:8000';
  }

  /**
   * Start a new HYSPLIT atmospheric dispersion run
   */
  async startRun(params: HysplitRunParams): Promise<HysplitResult> {
    try {
      // Validate input parameters
      this.validateParams(params);
      
      // Create database record for tracking
      const runRecord = await this.createRunRecord(params);
      
      // Start the actual HYSPLIT computation
      const result = await this.executeHysplit(runRecord.run_id, params);
      
      return {
        runId: runRecord.run_id,
        status: result.status,
        startedAt: result.started_at,
        executionTime: result.execution_time,
        meteorologicalModel: params.meteorologicalDataSource
      };
      
    } catch (error) {
      console.error('Error starting HYSPLIT run:', error);
      throw new Error(`Failed to start HYSPLIT run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the status and results of a HYSPLIT run
   */
  async getRunStatus(runId: string): Promise<HysplitResult> {
    try {
      // Query database for run status
      const { data: runData, error } = await supabase
        .from('hysplit_runs')
        .select('*')
        .eq('run_id', runId)
        .single();

      if (error) throw error;
      if (!runData) throw new Error(`Run ${runId} not found`);

      // If completed, fetch concentration results
      let concentrations: ConcentrationGrid[] = [];
      if (runData.status === 'completed') {
        const { data: concData } = await supabase
          .from('hysplit_concentrations')
          .select('*')
          .eq('run_id', runId)
          .order('timestamp', { ascending: true });
          
        if (concData) {
          concentrations = concData.map(row => ({
            timestamp: new Date(row.timestamp),
            latitude: row.location.coordinates[1],
            longitude: row.location.coordinates[0], 
            height: row.height_m,
            concentration: row.concentration_ugm3,
            deposition: row.deposition_gm2
          }));
        }
      }

      return {
        runId: runData.run_id,
        status: runData.status,
        startedAt: runData.started_at ? new Date(runData.started_at) : undefined,
        completedAt: runData.completed_at ? new Date(runData.completed_at) : undefined,
        error: runData.error_message,
        concentrations,
        executionTime: runData.execution_time,
        outputFiles: runData.output_files?.files || []
      };
      
    } catch (error) {
      console.error('Error getting HYSPLIT run status:', error);
      throw new Error(`Failed to get run status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute HYSPLIT using Python PySPLIT backend
   */
  private async executeHysplit(runId: string, params: HysplitRunParams): Promise<any> {
    try {
      // Prepare request payload for Python service (matching SimpleHysplitRequest format)
      const payload = {
        latitude: params.latitude,
        longitude: params.longitude,
        start_time: params.startTime.toISOString(),
        durationHours: params.durationHours,
        releaseHeight: params.releaseHeight,
        meteorologicalDataSource: params.meteorologicalDataSource,
        emissionRate: params.emissionRate || 1000,
        particleCount: params.particleCount || 10000,
        outputResolution: params.outputResolution || 1.0,
        createdBy: params.createdBy || 'WildFireGPTAlgorithm'
      };

      // Update run status to 'running'
      await supabase
        .from('hysplit_runs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString() 
        })
        .eq('run_id', runId);

      // Call Python PySPLIT service
      const response = await fetch(`${this.apiBaseUrl}/hysplit/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`PySPLIT service error: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Update database with results
      if (result.status === 'completed') {
        await this.storeResults(runId, result);
      } else if (result.status === 'failed') {
        await supabase
          .from('hysplit_runs')
          .update({ 
            status: 'failed', 
            error_message: result.error,
            completed_at: new Date().toISOString()
          })
          .eq('run_id', runId);
      }

      return result;
      
    } catch (error) {
      console.log('⚠️ HYSPLIT: Python service unavailable - real simulation unavailable');

      // Mark run as failed instead of returning synthetic simulation output
      await supabase
        .from('hysplit_runs')
        .update({ 
          status: 'failed', 
          error_message: `Real HYSPLIT service unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
          completed_at: new Date().toISOString()
        })
        .eq('run_id', runId);

      return {
        status: 'failed',
        started_at: new Date().toISOString(),
        execution_time: null,
        concentrations: [],
        output_files: [],
        message: 'Real atmospheric dispersion simulation unavailable (HYSPLIT backend unreachable)',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Store HYSPLIT results in database
   */
  private async storeResults(runId: string, result: any): Promise<void> {
    try {
      // Update run record
      await supabase
        .from('hysplit_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_files: { files: result.output_files || [] }
        })
        .eq('run_id', runId);

      // Store concentration grid data
      if (result.concentrations && result.concentrations.length > 0) {
        const concentrationRows = result.concentrations.map((conc: any) => ({
          run_id: runId,
          timestamp: conc.timestamp,
          location: `POINT(${conc.longitude} ${conc.latitude})`,
          height_m: conc.height,
          concentration_ugm3: conc.concentration,
          deposition_gm2: conc.deposition || 0
        }));

        await supabase
          .from('hysplit_concentrations')
          .insert(concentrationRows);
      }

    } catch (error) {
      console.error('Error storing HYSPLIT results:', error);
      throw error;
    }
  }

  /**
   * Create database record for HYSPLIT run
   */
  private async createRunRecord(params: HysplitRunParams): Promise<any> {
    const { data, error } = await supabase
      .from('hysplit_runs')
      .insert({
        start_time: params.startTime.toISOString(),
        duration_hours: params.durationHours,
        release_location: `POINT(${params.longitude} ${params.latitude})`,
        release_height_m: params.releaseHeight,
        emission_rate_gps: params.emissionRate,
        met_data_source: params.meteorologicalDataSource,
        met_model_run: new Date().toISOString(),
        particle_count: params.particleCount || 10000,
        output_resolution_km: params.outputResolution || 1.0,
        status: 'pending',
        created_by: params.createdBy
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Validate input parameters
   */
  private validateParams(params: HysplitRunParams): void {
    if (!params.latitude || params.latitude < -90 || params.latitude > 90) {
      throw new Error('Invalid latitude: must be between -90 and 90');
    }
    
    if (!params.longitude || params.longitude < -180 || params.longitude > 180) {
      throw new Error('Invalid longitude: must be between -180 and 180');
    }
    
    if (!params.durationHours || params.durationHours <= 0 || params.durationHours > 240) {
      throw new Error('Invalid duration: must be between 1 and 240 hours');
    }
    
    if (!params.releaseHeight || params.releaseHeight < 0 || params.releaseHeight > 20000) {
      throw new Error('Invalid release height: must be between 0 and 20000 meters');
    }
    
    if (!params.startTime || params.startTime > new Date()) {
      throw new Error('Invalid start time: cannot be in the future');
    }
  }

  /**
   * Get available meteorological data sources
   */
  async getAvailableMetData(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/hysplit/met-sources`);
      if (!response.ok) {
        // Fallback to default sources if service unavailable
        return ['GFS', 'NAM', 'GDAS'];
      }
      
      const data = await response.json();
      return data.sources || ['GFS', 'NAM', 'GDAS'];
      
    } catch (error) {
      console.warn('Could not fetch meteorological data sources:', error);
      return ['GFS', 'NAM', 'GDAS']; // Fallback
    }
  }

  /**
   * Health check for HYSPLIT service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET'
      });
      return response.ok;
    } catch (error) {
      console.warn('HYSPLIT service health check failed:', error);
      return false;
    }
  }
}
