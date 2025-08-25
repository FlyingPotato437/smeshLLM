#!/usr/bin/env python3
"""
Base Service Class for SmeshLLM Python Services
Provides common functionality, error handling, and service lifecycle management
"""

import logging
import asyncio
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel


class ServiceHealth(BaseModel):
    """Service health status model"""
    service_name: str
    status: str  # "healthy", "degraded", "unhealthy"
    details: Dict[str, Any] = {}
    timestamp: datetime
    is_initialized: bool = False
    error_message: Optional[str] = None


class BaseService(ABC):
    """Base class for all SmeshLLM services"""
    
    def __init__(self, service_name: str):
        self.service_name = service_name
        self.logger = logging.getLogger(f"{self.__class__.__module__}.{self.__class__.__name__}")
        self.is_initialized = False
        self._startup_time = None
        self._last_health_check = None
        
    async def initialize(self) -> bool:
        """Initialize service resources"""
        try:
            self.logger.info(f"🚀 Initializing {self.service_name}")
            await self._initialize_service()
            self.is_initialized = True
            self._startup_time = datetime.utcnow()
            self.logger.info(f"✅ {self.service_name} initialized successfully")
            return True
        except Exception as e:
            self.logger.error(f"❌ Failed to initialize {self.service_name}: {e}")
            self.is_initialized = False
            return False
    
    @abstractmethod
    async def _initialize_service(self):
        """Service-specific initialization logic"""
        pass
    
    async def health_check(self) -> ServiceHealth:
        """Check service health"""
        try:
            health_details = await self._check_service_health()
            status = "healthy" if self.is_initialized else "unhealthy"
            
            # Update last health check time
            self._last_health_check = datetime.utcnow()
            
            return ServiceHealth(
                service_name=self.service_name,
                status=status,
                details=health_details,
                timestamp=self._last_health_check,
                is_initialized=self.is_initialized
            )
        except Exception as e:
            self.logger.error(f"Health check failed for {self.service_name}: {e}")
            return ServiceHealth(
                service_name=self.service_name,
                status="unhealthy",
                details={"error": str(e)},
                timestamp=datetime.utcnow(),
                is_initialized=self.is_initialized,
                error_message=str(e)
            )
    
    @abstractmethod
    async def _check_service_health(self) -> Dict[str, Any]:
        """Service-specific health check logic"""
        pass
    
    async def cleanup(self):
        """Cleanup service resources"""
        try:
            self.logger.info(f"🧹 Cleaning up {self.service_name}")
            await self._cleanup_service()
            self.is_initialized = False
            self.logger.info(f"✅ {self.service_name} cleanup completed")
        except Exception as e:
            self.logger.error(f"❌ Cleanup failed for {self.service_name}: {e}")
    
    @abstractmethod
    async def _cleanup_service(self):
        """Service-specific cleanup logic"""
        pass
    
    def get_service_info(self) -> Dict[str, Any]:
        """Get basic service information"""
        return {
            "service_name": self.service_name,
            "is_initialized": self.is_initialized,
            "startup_time": self._startup_time.isoformat() if self._startup_time else None,
            "last_health_check": self._last_health_check.isoformat() if self._last_health_check else None,
            "uptime_seconds": (datetime.utcnow() - self._startup_time).total_seconds() if self._startup_time else 0
        }
    
    async def __aenter__(self):
        """Async context manager entry"""
        if not self.is_initialized:
            await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.cleanup()


class ExternalAPIService(BaseService):
    """Base class for services that interact with external APIs"""
    
    def __init__(self, service_name: str, api_base_url: str, api_key: Optional[str] = None):
        super().__init__(service_name)
        self.api_base_url = api_base_url
        self.api_key = api_key
        self._request_count = 0
        self._error_count = 0
        self._last_request_time = None
    
    def _record_request(self, success: bool = True):
        """Record API request statistics"""
        self._request_count += 1
        self._last_request_time = datetime.utcnow()
        if not success:
            self._error_count += 1
    
    def get_api_stats(self) -> Dict[str, Any]:
        """Get API usage statistics"""
        error_rate = (self._error_count / self._request_count) if self._request_count > 0 else 0
        return {
            "total_requests": self._request_count,
            "error_count": self._error_count,
            "error_rate": error_rate,
            "last_request_time": self._last_request_time.isoformat() if self._last_request_time else None,
            "api_base_url": self.api_base_url,
            "has_api_key": bool(self.api_key)
        }
    
    async def _check_service_health(self) -> Dict[str, Any]:
        """Default health check for external API services"""
        health_details = self.get_api_stats()
        health_details.update({
            "api_accessible": await self._test_api_connection(),
            "service_info": self.get_service_info()
        })
        return health_details
    
    @abstractmethod
    async def _test_api_connection(self) -> bool:
        """Test connection to external API"""
        pass