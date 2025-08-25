#!/usr/bin/env python3
"""
Async Utility Functions for SmeshLLM Python Services
Provides helper functions for async operations, task management, and concurrency control
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional, TypeVar, Union
from functools import wraps
import time

T = TypeVar('T')

logger = logging.getLogger(__name__)


async def run_with_timeout(
    coro: Awaitable[T], 
    timeout_seconds: float, 
    timeout_message: str = "Operation timed out"
) -> T:
    """Run an async operation with a timeout"""
    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        logger.warning(f"Timeout after {timeout_seconds}s: {timeout_message}")
        raise asyncio.TimeoutError(timeout_message)


async def run_with_retries(
    coro_func: Callable[[], Awaitable[T]],
    max_retries: int = 3,
    delay_seconds: float = 1.0,
    backoff_multiplier: float = 2.0,
    exceptions: tuple = (Exception,)
) -> T:
    """Run an async operation with exponential backoff retries"""
    
    last_exception = None
    delay = delay_seconds
    
    for attempt in range(max_retries + 1):
        try:
            return await coro_func()
        except exceptions as e:
            last_exception = e
            if attempt == max_retries:
                logger.error(f"Failed after {max_retries} retries: {e}")
                break
            
            logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
            await asyncio.sleep(delay)
            delay *= backoff_multiplier
    
    raise last_exception


async def gather_with_concurrency_limit(
    tasks: List[Awaitable[T]], 
    max_concurrent: int = 10
) -> List[T]:
    """Run multiple async tasks with a concurrency limit"""
    
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def limited_task(task: Awaitable[T]) -> T:
        async with semaphore:
            return await task
    
    limited_tasks = [limited_task(task) for task in tasks]
    return await asyncio.gather(*limited_tasks)


class AsyncTaskManager:
    """Manage background async tasks"""
    
    def __init__(self, max_concurrent_tasks: int = 50):
        self.max_concurrent_tasks = max_concurrent_tasks
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.completed_tasks: Dict[str, Any] = {}
        self.failed_tasks: Dict[str, Exception] = {}
        self._task_counter = 0
    
    def create_task(
        self, 
        coro: Awaitable[T], 
        task_name: Optional[str] = None,
        callback: Optional[Callable[[T], None]] = None
    ) -> str:
        """Create and track a background task"""
        
        if len(self.active_tasks) >= self.max_concurrent_tasks:
            raise RuntimeError(f"Maximum concurrent tasks ({self.max_concurrent_tasks}) reached")
        
        self._task_counter += 1
        task_id = task_name or f"task_{self._task_counter}_{int(time.time())}"
        
        async def task_wrapper():
            try:
                result = await coro
                self.completed_tasks[task_id] = result
                if callback:
                    callback(result)
                return result
            except Exception as e:
                self.failed_tasks[task_id] = e
                logger.error(f"Task {task_id} failed: {e}")
                raise
            finally:
                if task_id in self.active_tasks:
                    del self.active_tasks[task_id]
        
        task = asyncio.create_task(task_wrapper())
        self.active_tasks[task_id] = task
        
        logger.info(f"Created task {task_id}")
        return task_id
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get the status of a task"""
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            return {
                "status": "running",
                "done": task.done(),
                "cancelled": task.cancelled()
            }
        elif task_id in self.completed_tasks:
            return {
                "status": "completed",
                "result": self.completed_tasks[task_id]
            }
        elif task_id in self.failed_tasks:
            return {
                "status": "failed",
                "error": str(self.failed_tasks[task_id])
            }
        else:
            return {"status": "not_found"}
    
    async def wait_for_task(self, task_id: str, timeout: Optional[float] = None) -> Any:
        """Wait for a specific task to complete"""
        if task_id not in self.active_tasks:
            if task_id in self.completed_tasks:
                return self.completed_tasks[task_id]
            elif task_id in self.failed_tasks:
                raise self.failed_tasks[task_id]
            else:
                raise ValueError(f"Task {task_id} not found")
        
        task = self.active_tasks[task_id]
        if timeout:
            return await asyncio.wait_for(task, timeout=timeout)
        else:
            return await task
    
    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a running task"""
        if task_id in self.active_tasks:
            task = self.active_tasks[task_id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            del self.active_tasks[task_id]
            logger.info(f"Cancelled task {task_id}")
            return True
        return False
    
    async def cancel_all_tasks(self):
        """Cancel all running tasks"""
        tasks_to_cancel = list(self.active_tasks.keys())
        for task_id in tasks_to_cancel:
            await self.cancel_task(task_id)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get task manager statistics"""
        return {
            "active_tasks": len(self.active_tasks),
            "completed_tasks": len(self.completed_tasks),
            "failed_tasks": len(self.failed_tasks),
            "max_concurrent": self.max_concurrent_tasks,
            "active_task_ids": list(self.active_tasks.keys())
        }


def async_cache(ttl_seconds: int = 300):
    """Decorator to cache async function results with TTL"""
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        cache: Dict[str, tuple] = {}  # key -> (result, expiry_time)
        
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Create cache key from function arguments
            cache_key = f"{func.__name__}_{hash(str(args) + str(sorted(kwargs.items())))}"
            
            # Check if cached result is still valid
            if cache_key in cache:
                result, expiry_time = cache[cache_key]
                if datetime.utcnow() < expiry_time:
                    logger.debug(f"Cache hit for {func.__name__}")
                    return result
                else:
                    del cache[cache_key]
            
            # Execute function and cache result
            logger.debug(f"Cache miss for {func.__name__}, executing...")
            result = await func(*args, **kwargs)
            expiry_time = datetime.utcnow() + timedelta(seconds=ttl_seconds)
            cache[cache_key] = (result, expiry_time)
            
            return result
        
        return wrapper
    return decorator


async def safe_gather(*awaitables, return_exceptions: bool = True) -> List[Union[T, Exception]]:
    """Safely gather multiple awaitables, logging any exceptions"""
    results = await asyncio.gather(*awaitables, return_exceptions=return_exceptions)
    
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Task {i} failed: {result}")
    
    return results


class RateLimiter:
    """Simple rate limiter for async operations"""
    
    def __init__(self, max_calls: int, time_window: float):
        self.max_calls = max_calls
        self.time_window = time_window
        self.calls: List[float] = []
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """Acquire permission to make a call (blocks if rate limit exceeded)"""
        async with self._lock:
            now = time.time()
            
            # Remove old calls outside the time window
            self.calls = [call_time for call_time in self.calls if now - call_time < self.time_window]
            
            # If we're at the limit, wait until we can make another call
            if len(self.calls) >= self.max_calls:
                sleep_time = self.time_window - (now - self.calls[0])
                if sleep_time > 0:
                    logger.debug(f"Rate limit reached, sleeping for {sleep_time:.2f}s")
                    await asyncio.sleep(sleep_time)
                    return await self.acquire()  # Recursive call after waiting
            
            # Record this call
            self.calls.append(now)


def rate_limited(max_calls: int, time_window: float):
    """Decorator to rate limit async functions"""
    limiter = RateLimiter(max_calls, time_window)
    
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            await limiter.acquire()
            return await func(*args, **kwargs)
        return wrapper
    return decorator