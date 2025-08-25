#!/usr/bin/env python3
"""
SmeshLLM Intelligent Data Fusion Engine
Novel algorithm for real-time wildfire data stream integration

Key Features:
1. Parallel Asynchronous Data Retrieval
2. Priority-Based Data Streaming  
3. Intelligent Caching & Preprocessing
4. Scientific Data Quality Weighting
5. Timeout-Resistant Chunked Processing
6. Dynamic Resource Allocation
"""

import asyncio
import time
import logging
import json
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import numpy as np
from datetime import datetime, timedelta
import hashlib

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DataStreamPriority(Enum):
    """Priority levels for data streams"""
    CRITICAL = 1    # Wind, fire weather (immediate safety)
    HIGH = 2        # Fire detection, fuel models (risk assessment)
    MEDIUM = 3      # Air quality, elevation (context)
    LOW = 4         # Historical data, extended forecasts

@dataclass
class DataStreamConfig:
    """Configuration for each data stream"""
    name: str
    priority: DataStreamPriority
    timeout_ms: int
    cache_duration_minutes: int
    quality_weight: float  # Scientific reliability weight (0-1)
    required_for_safety: bool = False

@dataclass 
class ProcessedDataStream:
    """Container for processed data stream"""
    stream_id: str
    data: Any
    quality_score: float
    processing_time_ms: float
    timestamp: datetime
    confidence: float
    metadata: Dict[str, Any] = field(default_factory=dict)

class SmeshDataFusionEngine:
    """
    Novel intelligent data fusion engine for wildfire analysis
    Implements scientific data prioritization and parallel processing
    """
    
    def __init__(self):
        # Data stream configurations with scientific prioritization
        self.stream_configs = {
            'wind_data': DataStreamConfig(
                name='Wind Analysis', 
                priority=DataStreamPriority.CRITICAL,
                timeout_ms=3000,
                cache_duration_minutes=5,
                quality_weight=0.95,
                required_for_safety=True
            ),
            'fire_weather': DataStreamConfig(
                name='Fire Weather Conditions',
                priority=DataStreamPriority.CRITICAL, 
                timeout_ms=3000,
                cache_duration_minutes=10,
                quality_weight=0.95,
                required_for_safety=True
            ),
            'fuel_models': DataStreamConfig(
                name='LANDFIRE Fuel Models',
                priority=DataStreamPriority.HIGH,
                timeout_ms=5000,
                cache_duration_minutes=60,  # Fuel data changes slowly
                quality_weight=0.90,
                required_for_safety=True
            ),
            'fire_detection': DataStreamConfig(
                name='NASA FIRMS Active Fires',
                priority=DataStreamPriority.HIGH,
                timeout_ms=4000, 
                cache_duration_minutes=15,
                quality_weight=0.85,
                required_for_safety=False
            ),
            'air_quality': DataStreamConfig(
                name='Air Quality Index',
                priority=DataStreamPriority.MEDIUM,
                timeout_ms=2000,
                cache_duration_minutes=30,
                quality_weight=0.75,
                required_for_safety=False
            ),
            'elevation': DataStreamConfig(
                name='Elevation Data',
                priority=DataStreamPriority.MEDIUM,
                timeout_ms=1000,
                cache_duration_minutes=240,  # Topography is static
                quality_weight=0.80,
                required_for_safety=False
            )
        }
        
        # In-memory cache with TTL
        self.cache = {}
        self.cache_timestamps = {}
        
        # Performance monitoring
        self.performance_metrics = {
            'total_requests': 0,
            'cache_hits': 0,
            'timeouts': 0,
            'avg_response_time_ms': 0.0
        }
    
    def _generate_cache_key(self, stream_id: str, latitude: float, longitude: float) -> str:
        """Generate deterministic cache key for location-based queries"""
        location_hash = hashlib.md5(f"{latitude:.6f},{longitude:.6f}".encode()).hexdigest()[:8]
        return f"{stream_id}_{location_hash}"
    
    def _is_cache_valid(self, cache_key: str, stream_id: str) -> bool:
        """Check if cached data is still valid based on TTL"""
        if cache_key not in self.cache_timestamps:
            return False
        
        cached_time = self.cache_timestamps[cache_key]
        ttl_minutes = self.stream_configs[stream_id].cache_duration_minutes
        expiry_time = cached_time + timedelta(minutes=ttl_minutes)
        
        return datetime.now() < expiry_time
    
    def _cache_data(self, cache_key: str, data: Any) -> None:
        """Store data in cache with timestamp"""
        self.cache[cache_key] = data
        self.cache_timestamps[cache_key] = datetime.now()
    
    async def _fetch_stream_with_timeout(self, 
                                       stream_id: str, 
                                       fetch_func: callable,
                                       *args, **kwargs) -> Optional[ProcessedDataStream]:
        """
        Fetch data stream with intelligent timeout and error handling
        """
        config = self.stream_configs[stream_id]
        start_time = time.time()
        
        try:
            # Apply timeout based on priority
            timeout_seconds = config.timeout_ms / 1000.0
            data = await asyncio.wait_for(
                fetch_func(*args, **kwargs), 
                timeout=timeout_seconds
            )
            
            processing_time = (time.time() - start_time) * 1000
            
            # Calculate data quality score based on completeness and reliability
            quality_score = self._calculate_data_quality(data, config)
            confidence = min(quality_score * config.quality_weight, 1.0)
            
            return ProcessedDataStream(
                stream_id=stream_id,
                data=data,
                quality_score=quality_score,
                processing_time_ms=processing_time,
                timestamp=datetime.now(),
                confidence=confidence,
                metadata={
                    'source': config.name,
                    'priority': config.priority.name,
                    'timeout_ms': config.timeout_ms
                }
            )
            
        except asyncio.TimeoutError:
            logger.warning(f"⏰ Timeout for {stream_id} after {config.timeout_ms}ms")
            self.performance_metrics['timeouts'] += 1
            return None
            
        except Exception as e:
            logger.error(f"❌ Error fetching {stream_id}: {e}")
            return None
    
    def _calculate_data_quality(self, data: Any, config: DataStreamConfig) -> float:
        """
        Calculate scientific data quality score (0-1) based on completeness and validity
        """
        if data is None:
            return 0.0
        
        quality_factors = []
        
        # Data completeness check
        if isinstance(data, dict):
            non_null_fields = sum(1 for v in data.values() if v is not None and v != "")
            total_fields = len(data)
            completeness = non_null_fields / total_fields if total_fields > 0 else 0.0
            quality_factors.append(completeness)
            
            # Check for error indicators
            if 'error' in data or 'failed' in str(data).lower():
                quality_factors.append(0.0)
            else:
                quality_factors.append(1.0)
        
        # Temporal freshness (more recent = higher quality)
        if isinstance(data, dict) and 'timestamp' in data:
            try:
                data_time = datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00'))
                age_minutes = (datetime.now() - data_time.replace(tzinfo=None)).total_seconds() / 60
                freshness = max(0.0, 1.0 - (age_minutes / 60.0))  # Degrade over 1 hour
                quality_factors.append(freshness)
            except:
                quality_factors.append(0.8)  # Default if timestamp parsing fails
        else:
            quality_factors.append(0.9)  # No timestamp available
        
        # Return weighted average quality score
        return np.mean(quality_factors) if quality_factors else 0.0
    
    async def fetch_integrated_wildfire_data(self, 
                                           latitude: float, 
                                           longitude: float,
                                           data_fetchers: Dict[str, callable]) -> Dict[str, Any]:
        """
        Main fusion algorithm: Parallel data retrieval with scientific prioritization
        
        Args:
            latitude: Target latitude
            longitude: Target longitude  
            data_fetchers: Dict mapping stream_id to async fetch functions
            
        Returns:
            Scientifically integrated wildfire data with quality metrics
        """
        start_time = time.time()
        self.performance_metrics['total_requests'] += 1
        
        logger.info(f"🔬 SmeshLLM Data Fusion: Processing {len(data_fetchers)} streams for ({latitude}, {longitude})")
        
        # Phase 1: Check cache for all streams
        cached_streams = {}
        pending_fetches = {}
        
        for stream_id, fetch_func in data_fetchers.items():
            cache_key = self._generate_cache_key(stream_id, latitude, longitude)
            
            if self._is_cache_valid(cache_key, stream_id):
                cached_streams[stream_id] = self.cache[cache_key]
                self.performance_metrics['cache_hits'] += 1
                logger.info(f"📋 Cache hit: {stream_id}")
            else:
                pending_fetches[stream_id] = fetch_func
        
        # Phase 2: Parallel fetch with priority-based ordering
        processed_streams = {}
        
        if pending_fetches:
            # Group by priority for staged execution
            priority_groups = {}
            for stream_id, fetch_func in pending_fetches.items():
                # Use configured priority if available, otherwise default to MEDIUM
                if stream_id in self.stream_configs:
                    priority = self.stream_configs[stream_id].priority
                else:
                    # Create dynamic config for unknown streams
                    priority = DataStreamPriority.MEDIUM
                    self.stream_configs[stream_id] = DataStreamConfig(
                        name=f'Dynamic {stream_id}',
                        priority=priority,
                        timeout_ms=3000,
                        cache_duration_minutes=10,
                        quality_weight=0.7,
                        required_for_safety=False
                    )
                
                if priority not in priority_groups:
                    priority_groups[priority] = []
                priority_groups[priority].append((stream_id, fetch_func))
            
            # Execute critical streams first, then parallel execution for others
            for priority in sorted(priority_groups.keys(), key=lambda p: p.value):
                tasks = []
                
                for stream_id, fetch_func in priority_groups[priority]:
                    if priority == DataStreamPriority.CRITICAL:
                        # Critical streams: Sequential for reliability
                        result = await self._fetch_stream_with_timeout(
                            stream_id, fetch_func, latitude, longitude
                        )
                        if result:
                            processed_streams[stream_id] = result
                            # Cache the result
                            cache_key = self._generate_cache_key(stream_id, latitude, longitude)
                            self._cache_data(cache_key, result)
                    else:
                        # Non-critical: Parallel execution
                        task = self._fetch_stream_with_timeout(
                            stream_id, fetch_func, latitude, longitude
                        )
                        tasks.append((stream_id, task))
                
                # Wait for parallel tasks
                if tasks:
                    results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)
                    for (stream_id, _), result in zip(tasks, results):
                        if isinstance(result, ProcessedDataStream):
                            processed_streams[stream_id] = result
                            # Cache successful results
                            cache_key = self._generate_cache_key(stream_id, latitude, longitude)
                            self._cache_data(cache_key, result)
        
        # Phase 3: Integrate cached and fresh data
        all_streams = {}
        all_streams.update(cached_streams)
        all_streams.update(processed_streams)
        
        # Phase 4: Scientific data fusion and quality assessment
        fusion_result = self._fuse_data_scientifically(all_streams, latitude, longitude)
        
        # Performance metrics
        total_time_ms = (time.time() - start_time) * 1000
        self.performance_metrics['avg_response_time_ms'] = (
            (self.performance_metrics['avg_response_time_ms'] * (self.performance_metrics['total_requests'] - 1) + 
             total_time_ms) / self.performance_metrics['total_requests']
        )
        
        logger.info(f"⚡ Data fusion completed in {total_time_ms:.1f}ms ({len(cached_streams)} cached, {len(processed_streams)} fresh)")
        
        return fusion_result
    
    def _fuse_data_scientifically(self, streams: Dict[str, Any], latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Apply scientific data fusion algorithms to integrate all streams
        """
        fused_data = {
            'location': {
                'latitude': latitude,
                'longitude': longitude,
                'coordinate_system': 'WGS84'
            },
            'data_streams': {},
            'scientific_assessment': {},
            'quality_metrics': {},
            'fusion_metadata': {
                'algorithm': 'SmeshLLM-DataFusion-v1.0',
                'timestamp': datetime.now().isoformat(),
                'streams_processed': len(streams),
                'cache_efficiency': self.performance_metrics['cache_hits'] / max(1, self.performance_metrics['total_requests']),
                'performance': self.performance_metrics.copy()
            }
        }
        
        # Extract and organize data by stream
        quality_scores = []
        safety_critical_available = True
        
        for stream_id, stream_data in streams.items():
            config = self.stream_configs[stream_id]
            
            if isinstance(stream_data, ProcessedDataStream):
                # Fresh processed data
                fused_data['data_streams'][stream_id] = {
                    'data': stream_data.data,
                    'quality_score': stream_data.quality_score,
                    'confidence': stream_data.confidence,
                    'processing_time_ms': stream_data.processing_time_ms,
                    'timestamp': stream_data.timestamp.isoformat(),
                    'source': config.name,
                    'priority': config.priority.name
                }
                quality_scores.append(stream_data.quality_score * config.quality_weight)
            else:
                # Cached data
                fused_data['data_streams'][stream_id] = {
                    'data': stream_data.data if hasattr(stream_data, 'data') else stream_data,
                    'quality_score': 0.8,  # Assume good quality for cached data
                    'confidence': 0.8,
                    'processing_time_ms': 0,  # From cache
                    'source': config.name,
                    'priority': config.priority.name,
                    'cached': True
                }
                quality_scores.append(0.8 * config.quality_weight)
            
            # Check safety-critical data availability
            if config.required_for_safety and stream_id not in streams:
                safety_critical_available = False
        
        # Scientific quality assessment
        overall_quality = np.mean(quality_scores) if quality_scores else 0.0
        fused_data['quality_metrics'] = {
            'overall_data_quality': overall_quality,
            'safety_critical_complete': safety_critical_available,
            'stream_count': len(streams),
            'quality_distribution': {
                'excellent': sum(1 for q in quality_scores if q > 0.9),
                'good': sum(1 for q in quality_scores if 0.7 < q <= 0.9),
                'fair': sum(1 for q in quality_scores if 0.5 < q <= 0.7),
                'poor': sum(1 for q in quality_scores if q <= 0.5)
            }
        }
        
        # Scientific risk assessment integration
        fused_data['scientific_assessment'] = self._generate_scientific_assessment(fused_data)
        
        return fused_data
    
    def _generate_scientific_assessment(self, fused_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate scientific risk assessment based on integrated data
        """
        assessment = {
            'data_completeness': 'complete' if fused_data['quality_metrics']['safety_critical_complete'] else 'partial',
            'confidence_level': 'high' if fused_data['quality_metrics']['overall_data_quality'] > 0.8 else 'medium',
            'recommended_action': 'proceed_with_analysis' if fused_data['quality_metrics']['overall_data_quality'] > 0.7 else 'request_additional_data'
        }
        
        # Specific risk factors based on available data
        risk_factors = []
        
        # Check wind conditions
        if 'wind_data' in fused_data['data_streams']:
            wind_data = fused_data['data_streams']['wind_data']['data']
            if isinstance(wind_data, dict) and 'wind_speed_ms' in wind_data:
                if wind_data['wind_speed_ms'] > 15:  # 33+ mph
                    risk_factors.append('extreme_wind_conditions')
                elif wind_data['wind_speed_ms'] > 8:  # 18+ mph
                    risk_factors.append('high_wind_conditions')
        
        # Check fire weather
        if 'fire_weather' in fused_data['data_streams']:
            fire_weather = fused_data['data_streams']['fire_weather']['data']
            if isinstance(fire_weather, dict) and 'fire_weather' in fire_weather:
                danger_rating = fire_weather['fire_weather'].get('fire_danger_rating', '').upper()
                if danger_rating in ['EXTREME', 'VERY_HIGH']:
                    risk_factors.append('extreme_fire_weather')
        
        assessment['identified_risk_factors'] = risk_factors
        assessment['risk_level'] = 'high' if len(risk_factors) > 1 else 'moderate' if risk_factors else 'low'
        
        return assessment

# Global instance
data_fusion_engine = SmeshDataFusionEngine()

async def get_integrated_wildfire_analysis(latitude: float, longitude: float, data_fetchers: Dict[str, callable]) -> Dict[str, Any]:
    """
    Main entry point for integrated wildfire data analysis
    """
    return await data_fusion_engine.fetch_integrated_wildfire_data(latitude, longitude, data_fetchers)
