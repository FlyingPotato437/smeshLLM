/**
 * Real Physics-Informed Neural Network (PINN) Service
 * Interfaces with Python PINN service for atmospheric modeling
 * Trained on real n5_stanford.csv sensor data for enhanced predictions
 */

import { supabase } from '../database/supabase';

export interface PINNTrainingParams {
  // Data configuration
  dataSource: 'n5_stanford' | 'sensor_data' | 'custom';
  trainingDataPath?: string;
  
  // Model configuration
  epochs?: number;
  learningRate?: number;
  hiddenLayers?: number[];
  physicsPenalty?: number;
  
  // Training constraints
  maxTrainingTime?: number; // minutes
  validationSplit?: number;
  
  // User identification
  createdBy?: string;
}

export interface PINNPredictionParams {
  // Spatial coordinates
  latitude: number;
  longitude: number;
  altitude?: number; // meters
  
  // Temporal parameters
  timestamp: Date;
  forecastHours?: number;
  
  // Environmental context
  temperature?: number; // Celsius
  humidity?: number; // percentage
  windSpeed?: number; // m/s
  windDirection?: number; // degrees
  
  // Model selection
  modelId?: string;
  usePhysicsConstraints?: boolean;
}

export interface PINNTrainingResult {
  trainingId: string;
  status: 'pending' | 'training' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  
  // Training metrics (when completed)
  finalLoss?: number;
  validationAccuracy?: number;
  physicsLoss?: number;
  dataLoss?: number;
  
  // Model metadata
  epochs?: number;
  modelVersion?: string;
  datasetSize?: number;
}

export interface PINNPredictionResult {
  predictionId: string;
  modelId: string;
  
  // Atmospheric predictions
  pm25Concentration: number; // μg/m³
  pm10Concentration: number; // μg/m³
  
  // Physics-informed confidence metrics
  uncertainty: number; // 0-1
  physicsConsistency: number; // 0-1
  
  // Spatial-temporal context
  coordinates: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  timestamp: Date;
  
  // Additional physics outputs
  velocityField?: {
    u: number; // m/s
    v: number; // m/s
    w: number; // m/s
  };
  temperatureGradient?: number;
  pressureField?: number; // Pa
}

/**
 * Real PINN Service Implementation
 * Integrates with Python atmospheric PINN backend for physics-informed predictions
 */
export class PINNService {
  private readonly apiBaseUrl: string;
  
  constructor() {
    // Python PINN service endpoint
    this.apiBaseUrl = process.env.PINN_SERVICE_URL || 'http://127.0.0.1:8001';
  }

  /**
   * Start PINN training on n5_stanford.csv or other atmospheric data
   */
  async startTraining(params: PINNTrainingParams): Promise<PINNTrainingResult> {
    try {
      // Validate input parameters
      this.validateTrainingParams(params);
      
      // Create database record for tracking
      const trainingRecord = await this.createTrainingRecord(params);
      
      // Start the actual PINN training
      const result = await this.executePINNTraining(trainingRecord.training_id, params);
      
      return {
        trainingId: trainingRecord.training_id,
        status: result.status,
        startedAt: result.started_at ? new Date(result.started_at) : undefined,
        modelVersion: result.model_version,
        datasetSize: result.dataset_size
      };
      
    } catch (error) {
      console.error('Error starting PINN training:', error);
      throw new Error(`Failed to start PINN training: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get atmospheric predictions using trained PINN model
   */
  async predict(params: PINNPredictionParams): Promise<PINNPredictionResult> {
    try {
      // Validate input parameters
      this.validatePredictionParams(params);
      
      // Prepare request payload for Python service
      const payload = {
        latitude: params.latitude,
        longitude: params.longitude,
        altitude: params.altitude || 100, // default 100m AGL
        timestamp: params.timestamp.toISOString(),
        forecast_hours: params.forecastHours || 1,
        temperature: params.temperature,
        humidity: params.humidity,
        wind_speed: params.windSpeed,
        wind_direction: params.windDirection,
        model_id: params.modelId || 'latest',
        use_physics_constraints: params.usePhysicsConstraints !== false
      };

      // Call Python PINN service
      const response = await fetch(`${this.apiBaseUrl}/pinn/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`PINN service error: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Store prediction in database for caching and analytics
      await this.storePrediction(result);
      
      return {
        predictionId: result.prediction_id,
        modelId: result.model_id,
        pm25Concentration: result.pm25_concentration,
        pm10Concentration: result.pm10_concentration,
        uncertainty: result.uncertainty,
        physicsConsistency: result.physics_consistency,
        coordinates: {
          latitude: params.latitude,
          longitude: params.longitude,
          altitude: params.altitude || 100
        },
        timestamp: params.timestamp,
        velocityField: result.velocity_field,
        temperatureGradient: result.temperature_gradient,
        pressureField: result.pressure_field
      };
      
    } catch (error) {
      console.error('Error getting PINN prediction:', error);
      throw new Error(`Failed to get PINN prediction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get training status and metrics
   */
  async getTrainingStatus(trainingId: string): Promise<PINNTrainingResult> {
    try {
      // Query database for training status
      const { data: trainingData, error } = await supabase
        .from('pinn_training_runs')
        .select('*')
        .eq('training_id', trainingId)
        .single();

      if (error) throw error;
      if (!trainingData) throw new Error(`Training ${trainingId} not found`);

      return {
        trainingId: trainingData.training_id,
        status: trainingData.status,
        startedAt: trainingData.started_at ? new Date(trainingData.started_at) : undefined,
        completedAt: trainingData.completed_at ? new Date(trainingData.completed_at) : undefined,
        error: trainingData.error_message,
        finalLoss: trainingData.final_loss,
        validationAccuracy: trainingData.validation_accuracy,
        physicsLoss: trainingData.physics_loss,
        dataLoss: trainingData.data_loss,
        epochs: trainingData.epochs,
        modelVersion: trainingData.model_version,
        datasetSize: trainingData.dataset_size
      };
      
    } catch (error) {
      console.error('Error getting PINN training status:', error);
      throw new Error(`Failed to get training status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute PINN training using Python service
   */
  private async executePINNTraining(trainingId: string, params: PINNTrainingParams): Promise<any> {
    try {
      // Prepare request payload for Python service
      const payload = {
        training_id: trainingId,
        data_source: params.dataSource,
        training_data_path: params.trainingDataPath,
        epochs: params.epochs || 1000,
        learning_rate: params.learningRate || 0.001,
        hidden_layers: params.hiddenLayers || [128, 128, 64],
        physics_penalty: params.physicsPenalty || 1.0,
        max_training_time: params.maxTrainingTime || 30,
        validation_split: params.validationSplit || 0.2,
        created_by: params.createdBy || 'WildFireGPTAlgorithm'
      };

      // Update training status to 'training'
      await supabase
        .from('pinn_training_runs')
        .update({ 
          status: 'training', 
          started_at: new Date().toISOString() 
        })
        .eq('training_id', trainingId);

      // Call Python PINN service
      const response = await fetch(`${this.apiBaseUrl}/pinn/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`PINN service error: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Update database with results
      if (result.status === 'completed') {
        await this.storeTrainingResults(trainingId, result);
      } else if (result.status === 'failed') {
        await supabase
          .from('pinn_training_runs')
          .update({ 
            status: 'failed', 
            error_message: result.error,
            completed_at: new Date().toISOString()
          })
          .eq('training_id', trainingId);
      }

      return result;
      
    } catch (error) {
      // Mark training as failed in database
      await supabase
        .from('pinn_training_runs')
        .update({ 
          status: 'failed', 
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('training_id', trainingId);
        
      throw error;
    }
  }

  /**
   * Store PINN training results in database
   */
  private async storeTrainingResults(trainingId: string, result: any): Promise<void> {
    try {
      await supabase
        .from('pinn_training_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          final_loss: result.final_loss,
          validation_accuracy: result.validation_accuracy,
          physics_loss: result.physics_loss,
          data_loss: result.data_loss,
          model_version: result.model_version,
          dataset_size: result.dataset_size
        })
        .eq('training_id', trainingId);

    } catch (error) {
      console.error('Error storing PINN training results:', error);
      throw error;
    }
  }

  /**
   * Store PINN prediction in database for caching and analytics
   */
  private async storePrediction(result: any): Promise<void> {
    try {
      await supabase
        .from('pinn_predictions')
        .insert({
          prediction_id: result.prediction_id,
          model_id: result.model_id,
          prediction_ts: new Date().toISOString(),
          location: `POINT(${result.longitude} ${result.latitude})`,
          altitude_m: result.altitude,
          pm25_concentration: result.pm25_concentration,
          pm10_concentration: result.pm10_concentration,
          uncertainty: result.uncertainty,
          physics_consistency: result.physics_consistency,
          velocity_field: result.velocity_field,
          temperature_gradient: result.temperature_gradient,
          pressure_field: result.pressure_field
        });

    } catch (error) {
      console.warn('Error storing PINN prediction (non-critical):', error);
      // Non-critical error - prediction still works without storage
    }
  }

  /**
   * Create database record for PINN training run
   */
  private async createTrainingRecord(params: PINNTrainingParams): Promise<any> {
    const { data, error } = await supabase
      .from('pinn_training_runs')
      .insert({
        data_source: params.dataSource,
        training_data_path: params.trainingDataPath,
        epochs: params.epochs || 1000,
        learning_rate: params.learningRate || 0.001,
        hidden_layers: params.hiddenLayers || [128, 128, 64],
        physics_penalty: params.physicsPenalty || 1.0,
        max_training_time: params.maxTrainingTime || 30,
        validation_split: params.validationSplit || 0.2,
        status: 'pending',
        created_by: params.createdBy || 'WildFireGPTAlgorithm'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Validate training parameters
   */
  private validateTrainingParams(params: PINNTrainingParams): void {
    if (!params.dataSource || !['n5_stanford', 'sensor_data', 'custom'].includes(params.dataSource)) {
      throw new Error('Invalid data source: must be n5_stanford, sensor_data, or custom');
    }
    
    if (params.epochs && (params.epochs <= 0 || params.epochs > 10000)) {
      throw new Error('Invalid epochs: must be between 1 and 10000');
    }
    
    if (params.learningRate && (params.learningRate <= 0 || params.learningRate > 1)) {
      throw new Error('Invalid learning rate: must be between 0 and 1');
    }
    
    if (params.maxTrainingTime && (params.maxTrainingTime <= 0 || params.maxTrainingTime > 240)) {
      throw new Error('Invalid training time: must be between 1 and 240 minutes');
    }
  }

  /**
   * Validate prediction parameters
   */
  private validatePredictionParams(params: PINNPredictionParams): void {
    if (!params.latitude || params.latitude < -90 || params.latitude > 90) {
      throw new Error('Invalid latitude: must be between -90 and 90');
    }
    
    if (!params.longitude || params.longitude < -180 || params.longitude > 180) {
      throw new Error('Invalid longitude: must be between -180 and 180');
    }
    
    if (params.altitude && (params.altitude < 0 || params.altitude > 20000)) {
      throw new Error('Invalid altitude: must be between 0 and 20000 meters');
    }
    
    if (!params.timestamp) {
      throw new Error('Timestamp is required');
    }
    
    if (params.forecastHours && (params.forecastHours <= 0 || params.forecastHours > 72)) {
      throw new Error('Invalid forecast hours: must be between 1 and 72');
    }
  }

  /**
   * Health check for PINN service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET'
      });
      return response.ok;
    } catch (error) {
      console.warn('PINN service health check failed:', error);
      return false;
    }
  }

  /**
   * Get available trained models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/pinn/models`);
      if (!response.ok) {
        return ['default']; // Fallback
      }
      
      const data = await response.json();
      return data.models || ['default'];
      
    } catch (error) {
      console.warn('Could not fetch available PINN models:', error);
      return ['default']; // Fallback
    }
  }
}