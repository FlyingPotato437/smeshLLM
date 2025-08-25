#!/usr/bin/env python3
"""
Centralized Error Handling for SmeshLLM Python Services
Provides consistent error handling, logging, and response formatting
"""

import logging
import traceback
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, Union
from enum import Enum
from pydantic import BaseModel


class ErrorSeverity(str, Enum):
    """Error severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(str, Enum):
    """Error categories for better classification"""
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    EXTERNAL_API = "external_api"
    DATABASE = "database"
    NETWORK = "network"
    COMPUTATION = "computation"
    SYSTEM = "system"
    UNKNOWN = "unknown"


class ServiceError(BaseModel):
    """Standardized error model"""
    error_id: str
    error_type: str
    category: ErrorCategory
    severity: ErrorSeverity
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime
    service_name: str
    recoverable: bool = True
    suggested_action: Optional[str] = None
    stack_trace: Optional[str] = None


class ErrorHandler:
    """Centralized error handler for all services"""
    
    def __init__(self, service_name: str):
        self.service_name = service_name
        self.logger = logging.getLogger(f"error_handler.{service_name}")
        self._error_count = 0
        self._error_history = []
    
    def handle_error(
        self,
        error: Exception,
        category: ErrorCategory = ErrorCategory.UNKNOWN,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        recoverable: bool = True,
        suggested_action: Optional[str] = None,
        additional_details: Optional[Dict[str, Any]] = None
    ) -> ServiceError:
        """Handle and log an error"""
        
        self._error_count += 1
        error_id = f"{self.service_name}_{self._error_count}_{int(datetime.utcnow().timestamp())}"
        
        # Create error object
        service_error = ServiceError(
            error_id=error_id,
            error_type=type(error).__name__,
            category=category,
            severity=severity,
            message=str(error),
            details=additional_details or {},
            timestamp=datetime.utcnow(),
            service_name=self.service_name,
            recoverable=recoverable,
            suggested_action=suggested_action,
            stack_trace=traceback.format_exc() if severity in [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL] else None
        )
        
        # Log the error
        self._log_error(service_error)
        
        # Store in history (keep last 100 errors)
        self._error_history.append(service_error)
        if len(self._error_history) > 100:
            self._error_history.pop(0)
        
        return service_error
    
    def _log_error(self, error: ServiceError):
        """Log error with appropriate level"""
        log_message = f"[{error.error_id}] {error.category.value.upper()}: {error.message}"
        
        if error.severity == ErrorSeverity.CRITICAL:
            self.logger.critical(log_message)
            if error.stack_trace:
                self.logger.critical(f"Stack trace: {error.stack_trace}")
        elif error.severity == ErrorSeverity.HIGH:
            self.logger.error(log_message)
            if error.stack_trace:
                self.logger.error(f"Stack trace: {error.stack_trace}")
        elif error.severity == ErrorSeverity.MEDIUM:
            self.logger.warning(log_message)
        else:
            self.logger.info(log_message)
        
        if error.suggested_action:
            self.logger.info(f"Suggested action: {error.suggested_action}")
    
    def get_error_stats(self) -> Dict[str, Any]:
        """Get error statistics"""
        if not self._error_history:
            return {
                "total_errors": 0,
                "error_rate": 0,
                "recent_errors": []
            }
        
        # Count errors by category and severity
        category_counts = {}
        severity_counts = {}
        
        for error in self._error_history:
            category_counts[error.category.value] = category_counts.get(error.category.value, 0) + 1
            severity_counts[error.severity.value] = severity_counts.get(error.severity.value, 0) + 1
        
        # Get recent errors (last 10)
        recent_errors = [
            {
                "error_id": error.error_id,
                "category": error.category.value,
                "severity": error.severity.value,
                "message": error.message,
                "timestamp": error.timestamp.isoformat(),
                "recoverable": error.recoverable
            }
            for error in self._error_history[-10:]
        ]
        
        return {
            "total_errors": len(self._error_history),
            "category_breakdown": category_counts,
            "severity_breakdown": severity_counts,
            "recent_errors": recent_errors
        }
    
    def clear_error_history(self):
        """Clear error history"""
        self._error_history.clear()
        self._error_count = 0
        self.logger.info("Error history cleared")


# Global error handlers for common error types
def handle_validation_error(error: Exception, service_name: str, field_name: str = None) -> ServiceError:
    """Handle validation errors"""
    handler = ErrorHandler(service_name)
    details = {"field": field_name} if field_name else None
    return handler.handle_error(
        error,
        category=ErrorCategory.VALIDATION,
        severity=ErrorSeverity.LOW,
        recoverable=True,
        suggested_action="Check input parameters and try again",
        additional_details=details
    )


def handle_external_api_error(error: Exception, service_name: str, api_name: str, endpoint: str = None) -> ServiceError:
    """Handle external API errors"""
    handler = ErrorHandler(service_name)
    details = {"api_name": api_name, "endpoint": endpoint} if endpoint else {"api_name": api_name}
    return handler.handle_error(
        error,
        category=ErrorCategory.EXTERNAL_API,
        severity=ErrorSeverity.MEDIUM,
        recoverable=True,
        suggested_action=f"Check {api_name} API status and retry",
        additional_details=details
    )


def handle_computation_error(error: Exception, service_name: str, operation: str = None) -> ServiceError:
    """Handle computation/processing errors"""
    handler = ErrorHandler(service_name)
    details = {"operation": operation} if operation else None
    return handler.handle_error(
        error,
        category=ErrorCategory.COMPUTATION,
        severity=ErrorSeverity.HIGH,
        recoverable=False,
        suggested_action="Review input data and computation parameters",
        additional_details=details
    )


def handle_network_error(error: Exception, service_name: str, target: str = None) -> ServiceError:
    """Handle network connectivity errors"""
    handler = ErrorHandler(service_name)
    details = {"target": target} if target else None
    return handler.handle_error(
        error,
        category=ErrorCategory.NETWORK,
        severity=ErrorSeverity.MEDIUM,
        recoverable=True,
        suggested_action="Check network connectivity and retry",
        additional_details=details
    )


def handle_service_errors(func):
    """Decorator to handle service errors automatically"""
    import functools
    
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            # Try to get service name from self if it's a method
            service_name = "unknown"
            if args and hasattr(args[0], 'service_name'):
                service_name = args[0].service_name
            elif args and hasattr(args[0], '__class__'):
                service_name = args[0].__class__.__name__
            
            # Log the error but don't raise it - let the service handle it
            handler = ErrorHandler(service_name)
            error_obj = handler.handle_error(
                e,
                category=ErrorCategory.SYSTEM,
                severity=ErrorSeverity.MEDIUM,
                recoverable=True,
                suggested_action="Check service logs for details"
            )
            
            # Re-raise the original exception
            raise e
    
    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            # Try to get service name from self if it's a method
            service_name = "unknown"
            if args and hasattr(args[0], 'service_name'):
                service_name = args[0].service_name
            elif args and hasattr(args[0], '__class__'):
                service_name = args[0].__class__.__name__
            
            # Log the error but don't raise it - let the service handle it
            handler = ErrorHandler(service_name)
            error_obj = handler.handle_error(
                e,
                category=ErrorCategory.SYSTEM,
                severity=ErrorSeverity.MEDIUM,
                recoverable=True,
                suggested_action="Check service logs for details"
            )
            
            # Re-raise the original exception
            raise e
    
    # Return appropriate wrapper based on whether function is async
    if asyncio.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper