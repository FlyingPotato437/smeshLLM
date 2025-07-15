#!/usr/bin/env python3
"""
Raspberry Pi Meshtastic to Supabase Live Data Uploader

Standalone script that reads live Meshtastic telemetry from TTY device
and uploads directly to Supabase in real-time.

Compatible with existing cron workflow on Raspberry Pi.
"""

import os
import sys
import json
import time
import requests
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
import threading
import signal
import uuid
import hashlib
import csv
import glob
import os
from collections import defaultdict

# Configuration - Set via environment variables or modify here
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://vanqyqnugswokfchdhpk.supabase.co')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhbnF5cW51Z3N3b2tmY2hkaHBrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDcwMTQ0MSwiZXhwIjoyMDY2Mjc3NDQxfQ.iWDU9-lOzMRn_nFwP7izNRTsOxY8trVRFY-lVw7TaY4')  # Embedded for Pi deployment
# If you prefer to bypass the Next.js ingestion route, leave API_BASE_URL blank.
# When blank, the script writes directly to Supabase REST.
API_BASE_URL = os.getenv('API_BASE_URL', '')
DATA_DIR = os.getenv('DATA_DIR', '/home/pi/Documents/smesh/snode')
POLL_INTERVAL_SEC = int(os.getenv('POLL_INTERVAL_SEC', '60'))
UPLOAD_BATCH_SIZE = int(os.getenv('UPLOAD_BATCH_SIZE', '10'))
UPLOAD_INTERVAL_SEC = int(os.getenv('UPLOAD_INTERVAL_SEC', '30'))
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# Location disabled - no GPS coordinates available

# Setup logging
log_level = logging.DEBUG if DEBUG else logging.INFO
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/pi/Documents/smesh/snode/data/meshtastic_upload.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('MeshtasticUploader')

class MeshtasticTelemetryUploader:
    """
    Handles receiving Meshtastic telemetry and uploading to Supabase
    """
    
    def __init__(self):
        self.upload_queue = []
        self.queue_lock = threading.Lock()
        self.upload_session = requests.Session()
        self.running = True
        self.last_upload = datetime.now()
        self.total_uploaded = 0
        self.last_read_positions = defaultdict(int)
        
        # Configure session headers
        if SUPABASE_SERVICE_KEY:
            self.upload_session.headers.update({
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'apikey': SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
                'User-Agent': 'RaspberryPi-Meshtastic-Uploader/1.0'
            })
        
        # Start upload worker thread
        self.upload_thread = threading.Thread(target=self._upload_worker, daemon=True)
        self.upload_thread.start()

        # Start poll worker thread
        # self.poll_thread = threading.Thread(target=self._poll_worker, daemon=True) # Removed as per edit hint
        # self.poll_thread.start() # Removed as per edit hint
        
        logger.info(f"Initialized uploader - API: {API_BASE_URL}")
    
    def add_telemetry(self, node_id: str, packet: Dict[str, Any]):
        """Add telemetry data to upload queue"""
        try:
            timestamp = datetime.now(timezone.utc)
            
            # Process different telemetry types
            if 'decoded' in packet and 'telemetry' in packet['decoded']:
                telemetry = packet['decoded']['telemetry']
                
                # Device metrics (battery, voltage, etc)
                if 'deviceMetrics' in telemetry:
                    device_data = self._format_device_metrics(node_id, telemetry['deviceMetrics'], packet, timestamp)
                    if device_data:
                        with self.queue_lock:
                            self.upload_queue.append(device_data)
                            logger.debug(f"Added device metrics from {node_id} to queue")
                
                # Environment metrics (temperature, humidity, etc)
                if 'environmentMetrics' in telemetry:
                    env_data = self._format_environment_metrics(node_id, telemetry['environmentMetrics'], packet, timestamp)
                    if env_data:
                        with self.queue_lock:
                            self.upload_queue.append(env_data)
                            logger.debug(f"Added environment metrics from {node_id} to queue")
                
                # Air quality metrics (PM2.5, PM10, etc)
                if 'airQualityMetrics' in telemetry:
                    air_data = self._format_air_quality_metrics(node_id, telemetry['airQualityMetrics'], packet, timestamp)
                    if air_data:
                        with self.queue_lock:
                            self.upload_queue.append(air_data)
                            logger.debug(f"Added air quality metrics from {node_id} to queue")
            
        except Exception as e:
            logger.error(f"Error processing telemetry from {node_id}: {e}")
    
    def _generate_sensor_uuid(self, sensor_id: str) -> str:
        """Generate deterministic UUID from sensor ID"""
        namespace = uuid.UUID('550e8400-e29b-41d4-a716-446655440000')
        return str(uuid.uuid5(namespace, sensor_id))
    
    def _format_device_metrics(self, node_id: str, metrics: Dict, packet: Dict, timestamp: datetime) -> Optional[Dict]:
        """Format device telemetry for Supabase upload"""
        try:
            # Include all fields for consistent batch upload structure
            return {
                'sensor_id': node_id,
                'timestamp': timestamp.isoformat(),
                'telemetry_type': 'device',
                'location': None,
                'voltage': metrics.get('voltage'),
                'battery_level': metrics.get('batteryLevel'),
                'air_util_tx': metrics.get('airUtilTx'),
                'uptime_seconds': metrics.get('uptimeSeconds'),
                'channel_utilization': metrics.get('channelUtilization'),
                'temperature_c': None,
                'relative_humidity_pct': None,
                'barometric_pressure': None,
                'gas_resistance': None,
                'iaq': None,
                'wind_direction': None,
                'wind_speed': None,
                'pm25_ugm3': None,
                'pm10_ugm3': None,
                'pm100_ugm3': None,
                'pm1_ugm3': None,
                'ch3_voltage': None,
                'ch3_current': None,
                'rssi': packet.get('rxRssi'),
                'snr': packet.get('rxSnr'),
                'hop_limit': packet.get('hopLimit'),
                'hop_start': None,
                'raw_data': metrics
            }
        except Exception as e:
            logger.error(f"Error formatting device metrics: {e}")
            return None
    
    def _format_environment_metrics(self, node_id: str, metrics: Dict, packet: Dict, timestamp: datetime) -> Optional[Dict]:
        """Format environment telemetry for Supabase upload"""
        try:
            # Include all fields for consistent batch upload structure
            return {
                'sensor_id': node_id,
                'timestamp': timestamp.isoformat(),
                'telemetry_type': 'environment',
                'location': None,
                'voltage': None,
                'battery_level': None,
                'air_util_tx': None,
                'uptime_seconds': None,
                'channel_utilization': None,
                'temperature_c': metrics.get('temperature'),
                'relative_humidity_pct': metrics.get('relativeHumidity'),
                'barometric_pressure': metrics.get('barometricPressure'),
                'gas_resistance': metrics.get('gasResistance'),
                'iaq': metrics.get('iaq'),
                'wind_direction': metrics.get('windDirection'),
                'wind_speed': metrics.get('windSpeed'),
                'pm25_ugm3': None,
                'pm10_ugm3': None,
                'pm100_ugm3': None,
                'pm1_ugm3': None,
                'ch3_voltage': None,
                'ch3_current': None,
                'rssi': packet.get('rxRssi'),
                'snr': packet.get('rxSnr'),
                'hop_limit': None,
                'hop_start': None,
                'raw_data': metrics
            }
        except Exception as e:
            logger.error(f"Error formatting environment metrics: {e}")
            return None
    
    def _format_air_quality_metrics(self, node_id: str, metrics: Dict, packet: Dict, timestamp: datetime) -> Optional[Dict]:
        """Format air quality telemetry for Supabase upload"""
        try:
            # Include all fields for consistent batch upload structure
            return {
                'sensor_id': node_id,
                'timestamp': timestamp.isoformat(),
                'telemetry_type': 'air_quality',
                'location': None,
                'voltage': None,
                'battery_level': None,
                'air_util_tx': None,
                'uptime_seconds': None,
                'channel_utilization': None,
                'temperature_c': None,
                'relative_humidity_pct': None,
                'barometric_pressure': None,
                'gas_resistance': None,
                'iaq': None,
                'wind_direction': None,
                'wind_speed': None,
                'pm25_ugm3': metrics.get('pm25Standard') or metrics.get('pm25Environmental'),
                'pm10_ugm3': metrics.get('pm10Standard') or metrics.get('pm10Environmental'),
                'pm100_ugm3': metrics.get('pm100Standard') or metrics.get('pm100Environmental'),
                'pm1_ugm3': metrics.get('pm10Standard'),  # Assuming this maps to PM1
                'ch3_voltage': None,
                'ch3_current': None,
                'rssi': packet.get('rxRssi'),
                'snr': packet.get('rxSnr'),
                'hop_limit': None,
                'hop_start': None,
                'raw_data': metrics
            }
        except Exception as e:
            logger.error(f"Error formatting air quality metrics: {e}")
            return None
    
    def _upload_worker(self):
        """Background worker that uploads queued data"""
        while self.running:
            try:
                time.sleep(UPLOAD_INTERVAL_SEC)
                
                with self.queue_lock:
                    if len(self.upload_queue) == 0:
                        continue
                    
                    # Take a batch for upload
                    batch = self.upload_queue[:UPLOAD_BATCH_SIZE]
                    del self.upload_queue[:UPLOAD_BATCH_SIZE]  # remove items taken
                
                if batch:
                    self._upload_batch(batch)
                    
            except Exception as e:
                logger.error(f"Upload worker error: {e}")
                time.sleep(5)  # Brief pause before retrying
    
    def _upload_batch(self, batch: List[Dict]):
        """Upload a batch of telemetry data to Supabase"""
        if not batch:
            return
            
        logger.info(f"Uploading batch of {len(batch)} telemetry records...")
        
        try:
            # Decide where to upload
            if API_BASE_URL:
                # Use the dedicated Meshtastic ingestion API (Next.js)
                url = f'{API_BASE_URL.rstrip("/")}/api/ingest/meshtastic'
            else:
                # Direct PostgREST insert into Supabase
                url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/meshtastic_telemetry"
            response = self.upload_session.post(url, json=batch, timeout=30)
            
            if response.status_code in (200, 201):
                result_msg = 'OK'
                try:
                    result_json = response.json()
                    result_msg = result_json.get('message', 'OK') if isinstance(result_json, dict) else str(result_json)
                except ValueError:
                    pass  # No JSON body for 201
                self.total_uploaded += len(batch)
                self.last_upload = datetime.now()
                logger.info(f"Upload successful ({response.status_code}): {result_msg} (Total uploaded: {self.total_uploaded})")
            else:
                logger.error(f" Upload failed: {response.status_code} - {response.text}")
                # Re-queue failed items
                with self.queue_lock:
                    self.upload_queue.extend(batch)
                    
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error during upload: {e}")
            # Re-queue failed items
            with self.queue_lock:
                self.upload_queue.extend(batch)
        except Exception as e:
            logger.error(f"Unexpected upload error: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current upload statistics"""
        with self.queue_lock:
            queue_size = len(self.upload_queue)
        
        return {
            'queue_size': queue_size,
            'total_uploaded': self.total_uploaded,
            'last_upload': self.last_upload.isoformat() if self.last_upload else None,
            'upload_thread_alive': self.upload_thread.is_alive()
        }
    
    def shutdown(self):
        """Gracefully shutdown the uploader"""
        logger.info("Shutting down uploader...")
        self.running = False
        
        # Upload remaining items
        with self.queue_lock:
            if self.upload_queue:
                logger.info(f"Uploading final {len(self.upload_queue)} items...")
                self._upload_batch(self.upload_queue)
                self.upload_queue.clear()
        
        # Wait for upload thread to finish
        if self.upload_thread.is_alive():
            self.upload_thread.join(timeout=10)

    def find_latest_data_dir(self):
        data_dirs = glob.glob(os.path.join(DATA_DIR, 'data-*'))
        if not data_dirs:
            return None
        return max(data_dirs, key=os.path.getmtime)

    def _poll_once(self):
        try:
            latest_dir = self.find_latest_data_dir()
            if latest_dir:
                f864_dir = os.path.join(latest_dir, 'f864')
                if os.path.exists(f864_dir):
                    csv_files = glob.glob(os.path.join(f864_dir, 'airQualityMetrics_*.csv'))
                    for csv_file in csv_files:
                        self._process_csv_file(csv_file)
        except Exception as e:
            logger.error(f'Poll error: {e}')

    def _process_csv_file(self, csv_file):
        with open(csv_file, 'r') as f:
            f.seek(0, os.SEEK_END)
            file_size = f.tell()
            last_pos = self.last_read_positions[csv_file]
            if last_pos < file_size:
                f.seek(last_pos)
                reader = csv.reader(f)
                if last_pos == 0:
                    next(reader, None)  # Skip header
                for row in reader:
                    if row:
                        telemetry = self._parse_csv_row_to_telemetry(row)
                        if telemetry:
                            with self.queue_lock:
                                self.upload_queue.append(telemetry)
                self.last_read_positions[csv_file] = file_size

    def _parse_csv_row_to_telemetry(self, row):
        try:
            timestamp = row[0]
            node_id = row[1].replace('0x', '')  # Strip 0x if present
            metrics = {
                'pm10Standard': float(row[2]) if row[2] else None,
                'pm25Standard': float(row[3]) if row[3] else None,
                'pm100Standard': float(row[4]) if row[4] else None,
                'pm10Environmental': float(row[5]) if row[5] else None,
                'pm25Environmental': float(row[6]) if row[6] else None,
                'pm100Environmental': float(row[7]) if row[7] else None,
            }
            packet = {
                'rxSnr': float(row[8]) if row[8] else None,
                'rxRssi': float(row[9]) if row[9] else None,
                'rxTime': row[10] if row[10] else None,
                'hopStart': int(row[11]) if row[11] else None,
                'hopLimit': int(row[12]) if row[12] else None,
            }
            return self._format_air_quality_metrics(node_id, metrics, packet, datetime.fromisoformat(timestamp))
        except Exception as e:
            logger.error(f'Error parsing row: {e}')
            return None


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    global uploader
    if uploader:
        uploader.shutdown()
    sys.exit(0)


def main():
    """Main entry point"""
    logger.info("Starting Raspberry Pi Meshtastic to Supabase Uploader")
    logger.info(f"  Data Directory: {DATA_DIR}")
    logger.info(f"  Poll Interval: {POLL_INTERVAL_SEC}s")
    logger.info(f"  API Base: {API_BASE_URL}")
    logger.info(f"  Upload Interval: {UPLOAD_INTERVAL_SEC}s")
    logger.info(f"  Batch Size: {UPLOAD_BATCH_SIZE}")
    logger.info(f"  Debug Mode: {DEBUG}")
    
    # Check dependencies
    # MESHTASTIC_AVAILABLE is removed, so no check here.
    
    if not SUPABASE_SERVICE_KEY:
        logger.error("SUPABASE_SERVICE_KEY environment variable required")
        sys.exit(1)
    
    # Check data directory
    if not os.path.exists(DATA_DIR):
        logger.error(f"Data directory {DATA_DIR} not found")
        sys.exit(1)
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize components
    global uploader
    uploader = MeshtasticTelemetryUploader()
    
    # Start polling and wait for uploads
    uploader._poll_once()
    time.sleep(UPLOAD_INTERVAL_SEC * 2)  # Wait for potential uploads
    uploader.shutdown()


if __name__ == "__main__":
    main() 