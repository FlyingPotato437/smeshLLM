// Core sensor data types based on the CSV structure
export interface PiSensorReading {
  id?: string;
  datetime: string;
  from_node: string;
  pm10Standard: number;
  pm25Standard: number;
  pm100Standard: number;
  pm10Environmental: number;
  pm25Environmental: number;
  pm100Environmental: number;
  rxSnr?: number;
  hopLimit?: number;
  rxRssi?: number;
  hopStart?: number;
  from_short_name: string;
  temperature?: number;
  relativeHumidity?: number;
  barometricPressure?: number;
  gasResistance?: number;
  iaq?: number;
  latitude: number;
  longitude: number;
  elevation: string;
}

// Fire detection data from NASA FIRMS
export interface FireDetection {
  id?: string;
  acquisition_ts: string;
  latitude: number;
  longitude: number;
  frp_mw: number;
  confidence: string;
}

// Meteorological grid data from NOAA
export interface MeteorologicalData {
  id?: string;
  valid_ts: string;
  pressure_pa: number;
  latitude: number;
  longitude: number;
  u_wind_ms: number;
  v_wind_ms: number;
  w_wind_ms?: number;
  temperature_k: number;
  rh_percent: number;
}

// Satellite AOD data
export interface SatelliteAOD {
  id?: string;
  acquisition_ts: string;
  latitude: number;
  longitude: number;
  aod: number;
  aerosol_index?: number;
}

// AI model predictions
export interface PlumePrediction {
  id?: string;
  prediction_ts: string;
  generated_at: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  conc_pm25_ug_m3: number;
  conc_pm10_ug_m3: number;
  model_version: string;
  rmse_validation?: number;
  metadata?: Record<string, any>;
}

// 3D visualization data point
export interface VisualizationPoint {
  position: [number, number, number]; // [lng, lat, altitude]
  concentration: number;
  timestamp: string;
  source: 'sensor' | 'prediction' | 'satellite';
  color?: [number, number, number, number]; // RGBA
}

// Component props interfaces
export interface NavLinkProps {
  href?: string;
  children: React.ReactNode;
  hasDropdown?: boolean;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export interface DropdownMenuProps {
  children: React.ReactNode;
  isOpen: boolean;
}

export interface DropdownItemProps {
  href?: string;
  children: React.ReactNode;
  icon?: React.ReactElement;
}

// Animation and UI types
export interface AnimatedDot {
  x: number;
  y: number;
  baseColor: string;
  targetOpacity: number;
  currentOpacity: number;
  opacitySpeed: number;
  baseRadius: number;
  currentRadius: number;
}

export interface RotatingTextRef {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
} 