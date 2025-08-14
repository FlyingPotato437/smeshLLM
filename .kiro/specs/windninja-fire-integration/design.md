# Design Document

## Overview

This design implements a production-ready WindNinja integration with comprehensive fire detection and vegetation monitoring capabilities, following the proven architectural patterns from NASA's ODIN-RS framework. The system will provide high-resolution terrain-aware wind modeling, real-time multi-satellite fire detection, and vegetation analysis for enhanced wildfire prediction accuracy.

The design emphasizes real data sources, robust error handling, and follows the established service architecture patterns already present in the SmeshLLM platform.

## Architecture

### Service Layer Architecture

Following the existing BaseService pattern, we implement specialized services that integrate with external systems:

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                      │
├─────────────────────────────────────────────────────────────┤
│  WindNinja Service  │  Fire Detection  │  Vegetation Service │
│  - Real WindNinja   │  - NASA FIRMS    │  - NDVI Analysis    │
│  - Docker Container │  - GOES-R FDCC   │  - Fuel Moisture    │
│  - DEM Processing   │  - VIIRS/MODIS   │  - Landfire Data   │
├─────────────────────────────────────────────────────────────┤
│              Core Services (BaseService)                    │
│  - Error Handling   │  - Async Utils   │  - Data Validation  │
├─────────────────────────────────────────────────────────────┤
│                    External Data Sources                    │
│  - NOAA HRRR       │  - NASA FIRMS    │  - USGS DEM        │
│  - WindNinja CLI   │  - GOES Satellites│  - Landfire WMS    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

The system follows a pipeline approach similar to ODIN-RS:

1. **Input Processing**: Coordinates, time range, and analysis parameters
2. **Data Acquisition**: Parallel fetching of DEM, weather, fire, and vegetation data
3. **WindNinja Execution**: High-resolution wind field modeling with real terrain
4. **Fire Risk Analysis**: Integration of wind, fire detections, and vegetation
5. **Output Generation**: Standardized response with visualization-ready data

## Components and Interfaces

### 1. Enhanced WindNinja Service

Based on the ODIN wind service patterns, implementing real WindNinja integration:

```python
class RealWindNinjaService(BaseService):
    """Production WindNinja service using Docker container"""
    
    # Core Methods
    async def fetch_dem_data(lat: float, lng: float, extent_km: float) -> str
    async def run_windninja_simulation(config: WindNinjaConfig) -> WindNinjaResult
    async def generate_wind_products(result: WindNinjaResult) -> WindProducts
    
    # Output Products (following ODIN patterns)
    - huvw_grid.csv: WGS84 grid for particle animation
    - huvw_vector.csv: ECEF vectors for display
    - huvw_contour.json: GeoJSON wind speed contours
    - wind_analysis.json: Statistical analysis
```

**Key Features:**
- Uses official `firelab/windninja:latest` Docker image
- Real SRTM 30m DEM data via WindNinja's fetch_dem utility
- Configurable mesh resolution (50m-500m)
- Multiple output formats for different visualization needs
- Comprehensive error handling and fallback analysis

### 2. Multi-Source Fire Detection Service

Implementing real-time fire detection from multiple satellite sources:

```python
class FireDetectionService(BaseService):
    """Multi-source fire detection service"""
    
    # NASA FIRMS Integration
    async def get_firms_fires(request: FIRMSRequest) -> List[FireDetection]
    
    # GOES-R Integration (following ODIN patterns)
    async def get_goes_fires(satellite_id: int, region: BoundingBox) -> List[GoesFireDetection]
    
    # VIIRS/MODIS Integration
    async def get_viirs_fires(region: BoundingBox, hours_back: int) -> List[ViirsFireDetection]
    
    # Unified Fire Analysis
    async def analyze_fire_risk(fires: List[FireDetection], wind_data: WindData) -> FireRiskAssessment
```

**Data Sources:**
- NASA FIRMS API (MODIS/VIIRS active fires)
- GOES-R ABI L2 FDCC (Fire Detection and Characterization)
- Real-time satellite data with 5-15 minute latency
- Historical fire perimeter data integration

### 3. Vegetation and Fuel Analysis Service

Following ODIN's landfire integration patterns:

```python
class VegetationService(BaseService):
    """Vegetation and fuel analysis service"""
    
    # Landfire Integration
    async def get_fuel_vegetation_cover(region: BoundingBox) -> VegetationCover
    async def get_fuel_vegetation_type(region: BoundingBox) -> VegetationType
    
    # NDVI Analysis
    async def calculate_vegetation_indices(region: BoundingBox) -> VegetationIndices
    
    # Fuel Moisture Estimation
    async def estimate_fuel_moisture(weather_data: WeatherData, vegetation: VegetationData) -> FuelMoisture
    
    # Fire Risk Assessment
    async def assess_fire_risk(vegetation: VegetationData, weather: WeatherData) -> FireRisk
```

**Data Sources:**
- USGS Landfire WMS services (FVC, FVT data)
- MODIS NDVI from NASA
- Weather-based fuel moisture calculations
- Terrain-adjusted fire behavior modeling

### 4. Weather Data Integration Service

Enhanced weather service following ODIN HRRR patterns:

```python
class WeatherService(BaseService):
    """Enhanced weather data service"""
    
    # HRRR Integration (following ODIN patterns)
    async def get_hrrr_data(region: BoundingBox, fields: List[str]) -> HrrrData
    
    # Real-time Weather Stations
    async def get_mesonet_data(region: BoundingBox) -> MesonetData
    
    # Fire Weather Calculations
    async def calculate_fire_weather_indices(weather_data: WeatherData) -> FireWeatherIndices
```

## Data Models

### Core Data Models

Following the established API models pattern:

```python
@dataclass
class WindNinjaConfig:
    elevation_file: str
    initialization_method: str = "domainAverageInitialization"
    input_speed: float
    input_direction: float
    mesh_resolution: float = 100.0
    vegetation: str = "grass"
    output_wind_height: float = 10.0

@dataclass
class FireDetection:
    latitude: float
    longitude: float
    brightness: float  # Kelvin
    confidence: int    # 0-100%
    acquisition_time: datetime
    satellite: str
    instrument: str
    frp: float        # Fire Radiative Power (MW)

@dataclass
class VegetationAnalysis:
    fuel_type: str
    fuel_load: float
    moisture_content: float
    ndvi: float
    fire_risk_rating: str

@dataclass
class IntegratedFireAnalysis:
    location: Coordinates
    wind_analysis: WindAnalysis
    fire_detections: List[FireDetection]
    vegetation_analysis: VegetationAnalysis
    fire_behavior_prediction: FireBehaviorPrediction
    risk_assessment: RiskAssessment
```

### Response Models

Standardized response format for all services:

```python
class ServiceResponse(BaseModel):
    success: bool
    execution_time: float
    request_id: str
    data: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}
```

## Error Handling

### Robust Error Handling Strategy

Following the established error handling patterns:

1. **Service-Level Errors**: Each service handles its own failures gracefully
2. **Fallback Mechanisms**: When real data sources fail, provide simplified analysis
3. **Partial Success**: Return partial results when some services succeed
4. **Clear Error Messages**: Actionable error messages for users and developers

```python
class ServiceError(Exception):
    """Base service error with context"""
    def __init__(self, message: str, service: str, context: Dict = None):
        self.message = message
        self.service = service
        self.context = context or {}

# Error handling decorators
@handle_service_errors
async def service_method():
    # Service implementation with automatic error handling
    pass
```

### Fallback Analysis

When external services fail, provide physics-based fallback analysis:

- **WindNinja Unavailable**: Simplified terrain wind estimation
- **Fire Data Unavailable**: Historical fire risk analysis
- **Vegetation Data Unavailable**: Generic fuel model assumptions

## Testing Strategy

### Integration Testing with Real Data

Following ODIN's testing approach:

1. **Real Data Validation**: Test with actual coordinates and current conditions
2. **Service Health Checks**: Automated endpoint validation
3. **End-to-End Testing**: Complete workflow from input to visualization
4. **Performance Testing**: Response time and resource usage validation

```python
# Test Configuration
TEST_LOCATIONS = [
    {"name": "Big Sur", "lat": 36.294, "lng": -121.778},
    {"name": "Santa Clara County", "lat": 37.4419, "lng": -122.1430},
    {"name": "Los Angeles", "lat": 34.04, "lng": -118.02}
]

async def test_integrated_fire_analysis():
    """Test complete fire analysis workflow"""
    for location in TEST_LOCATIONS:
        result = await run_complete_fire_analysis(
            latitude=location["lat"],
            longitude=location["lng"],
            extent_km=20
        )
        assert result.success
        assert result.wind_analysis is not None
        assert len(result.fire_detections) >= 0
```

### Command-Line Testing

Provide CLI tools for testing and validation:

```bash
# Test WindNinja integration
python -m services.windninja_service --test --lat 37.4419 --lng -122.1430

# Test fire detection
python -m services.fire_detection_service --test --region "37.4,-122.1,37.5,-122.0"

# Test complete integration
python -m test_complete_integration --location "Big Sur"
```

## Performance Considerations

### Optimization Strategy

1. **Parallel Processing**: Concurrent data fetching from multiple sources
2. **Caching**: Cache DEM data, vegetation data, and recent wind analyses
3. **Resource Management**: Proper cleanup of temporary files and Docker containers
4. **Async Operations**: Non-blocking I/O for all external API calls

### Resource Requirements

- **WindNinja Docker**: 2-4 GB RAM, 1-2 CPU cores per simulation
- **DEM Data**: 50-200 MB per 20km x 20km region
- **Temporary Storage**: 500 MB - 2 GB per analysis
- **Network**: Reliable internet for real-time data sources

## Security Considerations

### API Key Management

- Environment variable configuration for all API keys
- Clear documentation for obtaining required keys
- Graceful degradation when keys are unavailable

### Data Privacy

- No storage of user location data beyond request processing
- Temporary file cleanup after analysis completion
- Secure handling of external API responses

## Deployment Integration

### Docker Integration

The WindNinja service requires Docker, following the existing containerization patterns:

```dockerfile
# WindNinja service requirements
FROM firelab/windninja:latest
# Additional Python dependencies for integration
```

### Environment Configuration

```bash
# Required environment variables
NASA_FIRMS_API_KEY=your_firms_api_key
WINDNINJA_DOCKER_IMAGE=firelab/windninja:latest
DEM_CACHE_DIR=/tmp/dem_cache
WORK_DIR=/tmp/windninja_work
```

This design provides a robust, production-ready integration that follows established patterns while providing real data and comprehensive fire analysis capabilities.