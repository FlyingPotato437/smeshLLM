# Design Document

## Overview

This design addresses the critical runtime failures in the SmeshLLM Python services by implementing systematic fixes for asyncio conflicts, API method signatures, meteorological data access, and overall service architecture. The solution maintains backward compatibility while improving reliability and maintainability.

## Architecture

### Service Layer Refactoring

The current monolithic service approach will be refactored into a modular architecture:

```
python-services/
├── core/
│   ├── __init__.py
│   ├── base_service.py          # Base service class with common functionality
│   ├── error_handler.py         # Centralized error handling
│   └── async_utils.py           # Async utility functions
├── services/
│   ├── __init__.py
│   ├── openaq_service.py        # Fixed OpenAQ implementation
│   ├── hysplit_service.py       # Fixed HYSPLIT implementation
│   ├── weather_service.py       # Weather service
│   └── nasa_firms_service.py    # NASA FIRMS service
├── models/
│   ├── __init__.py
│   └── api_models.py            # Pydantic models
├── tests/
│   ├── __init__.py
│   ├── test_services.py         # Service tests
│   └── test_integration.py      # Integration tests
└── main.py                      # FastAPI application
```

### Error Handling Strategy

Implement a three-tier error handling approach:
1. **Service Level**: Each service handles its own errors and provides fallbacks
2. **API Level**: FastAPI endpoints catch service errors and return appropriate HTTP responses
3. **System Level**: Global exception handlers for unexpected errors

### Async Operation Management

Replace problematic `asyncio.run()` calls with proper async/await patterns:
- Use `asyncio.create_task()` for background operations
- Implement proper async context managers
- Use `asyncio.gather()` for concurrent operations

## Components and Interfaces

### Base Service Class

```python
class BaseService:
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.is_initialized = False
    
    async def initialize(self):
        """Initialize service resources"""
        pass
    
    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        pass
    
    async def cleanup(self):
        """Cleanup service resources"""
        pass
```

### OpenAQ Service Interface

```python
class OpenAQService(BaseService):
    async def get_locations_nearby(self, latitude: float, longitude: float, radius_km: float) -> List[Dict]
    async def get_latest_measurements(self, latitude: float, longitude: float, parameters: List[str]) -> List[Dict]
    async def validate_coordinates(self, latitude: float, longitude: float) -> bool
```

### HYSPLIT Service Interface

```python
class HysplitService(BaseService):
    async def execute_run(self, request: HysplitRunRequest) -> str
    async def get_run_status(self, run_id: str) -> HysplitResult
    async def download_meteorological_data(self, date: datetime, source: str) -> List[str]
    async def atmospheric_physics_fallback(self, location: LocationModel, duration: int) -> List[Dict]
```

## Data Models

### Standardized Request/Response Models

```python
class ServiceResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)
    service: str
    
class HealthCheckResponse(BaseModel):
    service_name: str
    status: str  # "healthy", "degraded", "unhealthy"
    details: Dict[str, Any]
    timestamp: datetime
```

### Enhanced Error Models

```python
class ServiceError(BaseModel):
    error_type: str
    message: str
    details: Optional[Dict[str, Any]] = None
    recoverable: bool = True
    suggested_action: Optional[str] = None
```

## Error Handling

### OpenAQ Service Error Handling

1. **Method Signature Fixes**: Ensure all methods have correct parameter signatures
2. **API Rate Limiting**: Implement exponential backoff for API calls
3. **Data Validation**: Validate coordinates and parameters before API calls
4. **Fallback Mechanisms**: Use cached data when API is unavailable

### HYSPLIT Service Error Handling

1. **Asyncio Management**: Replace `asyncio.run()` with proper async patterns
2. **Meteorological Data Fallback**: Use multiple data sources and fallback to physics approximation
3. **Resource Management**: Proper cleanup of temporary files and processes
4. **Timeout Handling**: Set appropriate timeouts for long-running operations

### Weather Service Error Handling

1. **API Resilience**: Handle API failures gracefully
2. **Data Caching**: Cache weather data to reduce API calls
3. **Coordinate Validation**: Validate geographic coordinates
4. **Unit Conversion**: Ensure consistent units across all responses

## Testing Strategy

### Unit Testing

- Test each service class independently
- Mock external API calls
- Validate error handling paths
- Test async operation patterns

### Integration Testing

- Test service interactions
- Validate real API connections
- Test error propagation
- Verify fallback mechanisms

### Health Check Testing

- Automated health checks for all services
- Dependency validation
- Performance monitoring
- Error rate tracking

## Performance Considerations

### Async Optimization

- Use connection pooling for HTTP requests
- Implement request batching where possible
- Cache frequently accessed data
- Use background tasks for non-critical operations

### Resource Management

- Limit concurrent operations
- Implement proper cleanup for temporary resources
- Monitor memory usage for long-running processes
- Use streaming for large data transfers

## Security Considerations

### API Key Management

- Store API keys in environment variables
- Implement key rotation mechanisms
- Log API usage without exposing keys
- Validate API key formats

### Input Validation

- Sanitize all user inputs
- Validate geographic coordinates
- Limit request sizes and rates
- Implement CORS properly

## Deployment Strategy

### Development Environment

- Use environment-specific configuration
- Enable debug logging
- Mock external services for testing
- Hot reload for development

### Production Environment

- Disable debug logging
- Use production API endpoints
- Implement monitoring and alerting
- Enable performance metrics

## Migration Plan

1. **Phase 1**: Fix critical bugs (OpenAQ, HYSPLIT asyncio)
2. **Phase 2**: Refactor service architecture
3. **Phase 3**: Add comprehensive testing
4. **Phase 4**: Implement monitoring and alerting
5. **Phase 5**: Performance optimization