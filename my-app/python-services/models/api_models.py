#!/usr/bin/env python3
"""
Standardized API Models for SmeshLLM Python Services
Provides consistent request/response models across all services
"""

from datetime import datetime
from typing import Dict, Any, Optional, List, Union
from enum import Enum
from pydantic import BaseModel, Field


class ServiceStatus(str, Enum):
    """Service status enumeration"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    INITIALIZING = "initializing"
    MAINTENANCE = "maintenance"


class ErrorSeverity(str, Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ServiceResponse(BaseModel):
    """Standardized service response model"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    service: str
    execution_time_ms: Optional[float] = None
    request_id: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class HealthCheckResponse(BaseModel):
    """Service health check response"""
    service_name: str
    status: ServiceStatus
    details: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    is_initialized: bool = False
    uptime_seconds: Optional[float] = None
    version: Optional[str] = None
    dependencies: Dict[str, ServiceStatus] = {}
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ServiceError(BaseModel):
    """Standardized error model"""
    error_id: str
    error_type: str
    error_code: str
    message: str
    severity: ErrorSeverity
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    service_name: str
    recoverable: bool = True
    suggested_action: Optional[str] = None
    stack_trace: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PaginationParams(BaseModel):
    """Pagination parameters"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=1000)
    
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PaginatedResponse(BaseModel):
    """Paginated response wrapper"""
    items: List[Any]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_previous: bool
    
    @classmethod
    def create(cls, items: List[Any], total_count: int, pagination: PaginationParams):
        total_pages = (total_count + pagination.page_size - 1) // pagination.page_size
        return cls(
            items=items,
            total_count=total_count,
            page=pagination.page,
            page_size=pagination.page_size,
            total_pages=total_pages,
            has_next=pagination.page < total_pages,
            has_previous=pagination.page > 1
        )


class GeographicCoordinates(BaseModel):
    """Geographic coordinates model"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    elevation: Optional[float] = None  # meters above sea level
    
    def validate_coordinates(self) -> bool:
        """Validate coordinate ranges"""
        return -90 <= self.latitude <= 90 and -180 <= self.longitude <= 180


class TimeRange(BaseModel):
    """Time range model"""
    start_time: datetime
    end_time: datetime
    
    def validate_range(self) -> bool:
        """Validate that end_time is after start_time"""
        return self.end_time > self.start_time
    
    @property
    def duration_hours(self) -> float:
        """Get duration in hours"""
        return (self.end_time - self.start_time).total_seconds() / 3600


class APIKeyInfo(BaseModel):
    """API key information (without exposing the actual key)"""
    has_key: bool
    key_prefix: Optional[str] = None  # First few characters for identification
    key_source: Optional[str] = None  # "environment", "config", "parameter"
    is_valid: Optional[bool] = None
    last_used: Optional[datetime] = None
    usage_count: int = 0
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ServiceMetrics(BaseModel):
    """Service performance metrics"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    average_response_time_ms: float = 0.0
    last_request_time: Optional[datetime] = None
    uptime_seconds: float = 0.0
    memory_usage_mb: Optional[float] = None
    cpu_usage_percent: Optional[float] = None
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate as percentage"""
        if self.total_requests == 0:
            return 0.0
        return (self.successful_requests / self.total_requests) * 100
    
    @property
    def error_rate(self) -> float:
        """Calculate error rate as percentage"""
        if self.total_requests == 0:
            return 0.0
        return (self.failed_requests / self.total_requests) * 100
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class BatchRequest(BaseModel):
    """Batch request wrapper"""
    requests: List[Dict[str, Any]]
    batch_id: Optional[str] = None
    parallel_execution: bool = True
    max_concurrent: int = Field(default=10, ge=1, le=50)
    timeout_seconds: Optional[float] = None


class BatchResponse(BaseModel):
    """Batch response wrapper"""
    batch_id: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    results: List[ServiceResponse]
    execution_time_ms: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# Specific service request/response models

class OpenAQRequest(BaseModel):
    """OpenAQ service request"""
    coordinates: GeographicCoordinates
    radius_km: float = Field(default=25, ge=1, le=100)
    parameters: List[str] = Field(default=["pm25", "pm10", "o3", "no2"])
    limit: int = Field(default=100, ge=1, le=1000)
    include_locations: bool = True
    include_measurements: bool = True


class HysplitRequest(BaseModel):
    """HYSPLIT service request"""
    coordinates: GeographicCoordinates
    time_range: TimeRange
    meteorological_data: str = Field(default="GFS")
    run_type: str = Field(default="trajectory")
    particle_count: int = Field(default=10000, ge=100, le=100000)
    output_resolution: float = Field(default=1.0, ge=0.1, le=10.0)
    run_id: Optional[str] = None


class WeatherRequest(BaseModel):
    """Weather service request"""
    coordinates: GeographicCoordinates
    forecast_hours: int = Field(default=24, ge=1, le=240)
    include_fire_weather: bool = True
    include_elevation: bool = True
    scenario_type: str = Field(default="general")


class NASAFIRMSRequest(BaseModel):
    """NASA FIRMS service request"""
    coordinates: GeographicCoordinates
    radius_km: float = Field(default=50, ge=1, le=500)
    days_back: int = Field(default=1, ge=1, le=10)
    satellite: str = Field(default="VIIRS_SNPP_NRT")
    confidence_threshold: int = Field(default=50, ge=0, le=100)


class RAGRequest(BaseModel):
    """RAG service request"""
    query: str = Field(..., min_length=1, max_length=1000)
    max_results: int = Field(default=10, ge=1, le=50)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    include_metadata: bool = True
    context_window: int = Field(default=512, ge=100, le=2048)


# Response models for specific services

class LocationData(BaseModel):
    """Generic location data"""
    id: Optional[str] = None
    name: str
    coordinates: GeographicCoordinates
    country: Optional[str] = None
    region: Optional[str] = None
    metadata: Dict[str, Any] = {}


class MeasurementData(BaseModel):
    """Generic measurement data"""
    parameter: str
    value: float
    unit: str
    timestamp: datetime
    location: LocationData
    quality_flag: Optional[str] = None
    metadata: Dict[str, Any] = {}
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TrajectoryPoint(BaseModel):
    """Atmospheric trajectory point"""
    timestamp: datetime
    coordinates: GeographicCoordinates
    meteorological_data: Dict[str, float] = {}
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class FireDetection(BaseModel):
    """Fire detection data"""
    detection_id: str
    coordinates: GeographicCoordinates
    detection_time: datetime
    confidence: int
    brightness: Optional[float] = None
    satellite: str
    metadata: Dict[str, Any] = {}
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class WeatherData(BaseModel):
    """Weather data"""
    timestamp: datetime
    coordinates: GeographicCoordinates
    temperature_c: float
    humidity_percent: float
    wind_speed_ms: float
    wind_direction_deg: float
    pressure_hpa: float
    fire_weather_index: Optional[float] = None
    risk_level: Optional[str] = None
    metadata: Dict[str, Any] = {}
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# Utility functions for creating standardized responses

def create_success_response(
    data: Any,
    service: str,
    execution_time_ms: Optional[float] = None,
    request_id: Optional[str] = None
) -> ServiceResponse:
    """Create a standardized success response"""
    return ServiceResponse(
        success=True,
        data=data if isinstance(data, dict) else {"result": data},
        service=service,
        execution_time_ms=execution_time_ms,
        request_id=request_id
    )


def create_error_response(
    error: Union[str, Exception],
    service: str,
    error_code: Optional[str] = None,
    execution_time_ms: Optional[float] = None,
    request_id: Optional[str] = None
) -> ServiceResponse:
    """Create a standardized error response"""
    error_message = str(error) if isinstance(error, Exception) else error
    return ServiceResponse(
        success=False,
        error=error_message,
        error_code=error_code or "UNKNOWN_ERROR",
        service=service,
        execution_time_ms=execution_time_ms,
        request_id=request_id
    )


def create_health_response(
    service_name: str,
    status: ServiceStatus,
    details: Dict[str, Any] = None,
    is_initialized: bool = False,
    uptime_seconds: Optional[float] = None
) -> HealthCheckResponse:
    """Create a standardized health check response"""
    return HealthCheckResponse(
        service_name=service_name,
        status=status,
        details=details or {},
        is_initialized=is_initialized,
        uptime_seconds=uptime_seconds
    )