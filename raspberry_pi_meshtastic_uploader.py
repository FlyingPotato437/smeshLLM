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

try:
    from meshtastic.serial_interface import SerialInterface
    from pubsub import pub
    MESHTASTIC_AVAILABLE = True
except ImportError:
    print("ERROR: meshtastic package not available. Install with: pip install meshtastic pypubsub")
    MESHTASTIC_AVAILABLE = False

# Configuration - Set via environment variables or modify here
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://vanqyqnugswokfchdhpk.supabase.co')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhbnF5cW51Z3N3b2tmY2hkaHBrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDcwMTQ0MSwiZXhwIjoyMDY2Mjc3NDQxfQ.iWDU9-lOzMRn_nFwP7izNRTsOxY8trVRFY-lVw7TaY4')  # Embedded for Pi deployment
# If you prefer to bypass the Next.js ingestion route, leave API_BASE_URL blank.
# When blank, the script writes directly to Supabase REST.
API_BASE_URL = os.getenv('API_BASE_URL', '')
TTY_DEVICE = os.getenv('TTY_DEVICE', '/dev/ttyUSB0')
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
        
        # Configure session headers
        if SUPABASE_SERVICE_KEY:
            self.upload_session.headers.update({
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'User-Agent': 'RaspberryPi-Meshtastic-Uploader/1.0'
            })
        
        # Start upload worker thread
        self.upload_thread = threading.Thread(target=self._upload_worker, daemon=True)
        self.upload_thread.start()
        
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


class MeshtasticReceiver:
    """
    Handles Meshtastic radio interface and packet reception
    """
    
    def __init__(self, tty_device: str, uploader: MeshtasticTelemetryUploader):
        self.tty_device = tty_device
        self.uploader = uploader
        self.interface = None
        self.running = True
        
        # Stats
        self.packets_received = 0
        self.telemetry_packets = 0
        self.start_time = datetime.now()
        
        logger.info(f"Initializing Meshtastic receiver on {tty_device}")
    
    def start(self):
        """Start receiving Meshtastic packets"""
        try:
            # Check if TTY device exists
            if not os.path.exists(self.tty_device):
                raise FileNotFoundError(f"TTY device {self.tty_device} not found")
            
            # Initialize Meshtastic interface
            self.interface = SerialInterface(self.tty_device)
            logger.info(f"Connected to Meshtastic device on {self.tty_device}")
            
            # Subscribe to packet reception
            pub.subscribe(self._on_receive, "meshtastic.receive")
            logger.info("Subscribed to meshtastic.receive")
            
            # Main loop
            logger.info("Starting packet reception loop...")
            while self.running:
                time.sleep(1)
                
                # Print stats every 60 seconds
                if self.packets_received > 0 and self.packets_received % 60 == 0:
                    self._print_stats()
                    
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        except Exception as e:
            logger.error(f"Error in receiver: {e}")
            raise
        finally:
            self.stop()
    
    def _on_receive(self, packet, interface):
        """Handle received Meshtastic packet"""
        try:
            self.packets_received += 1
            
            # Extract node information
            from_node = packet.get('from', 0)
            from_id = packet.get('fromId', 'unknown')
            node_hex = hex(from_node) if from_node else 'unknown'
            
            logger.debug(f"Packet from {from_id} ({node_hex})")
            
            # Check if this is telemetry
            if packet.get('decoded', {}).get('portnum') == 'TELEMETRY_APP':
                self.telemetry_packets += 1
                
                logger.info(f"Telemetry packet #{self.telemetry_packets} from {from_id}")
                
                # Send to uploader
                self.uploader.add_telemetry(from_id, packet)
                
                # Log telemetry details
                telemetry = packet.get('decoded', {}).get('telemetry', {})
                for key in ['deviceMetrics', 'environmentMetrics', 'airQualityMetrics']:
                    if key in telemetry:
                        metrics = telemetry[key]
                        logger.info(f"  {key}: {self._summarize_metrics(metrics)}")
            
        except Exception as e:
            logger.error(f"Error processing packet: {e}")
    
    def _summarize_metrics(self, metrics: Dict) -> str:
        """Create a brief summary of metrics for logging"""
        summary_parts = []
        
        # Device metrics
        if 'batteryLevel' in metrics:
            summary_parts.append(f"Battery={metrics['batteryLevel']}%")
        if 'voltage' in metrics:
            summary_parts.append(f"Voltage={metrics['voltage']:.2f}V")
        
        # Environment metrics
        if 'temperature' in metrics:
            summary_parts.append(f"Temp={metrics['temperature']:.1f}°C")
        if 'relativeHumidity' in metrics:
            summary_parts.append(f"RH={metrics['relativeHumidity']:.1f}%")
        
        # Air quality metrics
        if 'pm25Standard' in metrics:
            summary_parts.append(f"PM2.5={metrics['pm25Standard']:.1f}μg/m³")
        if 'pm10Standard' in metrics:
            summary_parts.append(f"PM10={metrics['pm10Standard']:.1f}μg/m³")
        
        return ", ".join(summary_parts) if summary_parts else str(metrics)
    
    def _print_stats(self):
        """Print reception and upload statistics"""
        uptime = datetime.now() - self.start_time
        upload_stats = self.uploader.get_stats()
        
        logger.info(f" STATS - Uptime: {uptime}")
        logger.info(f"  Packets received: {self.packets_received}")
        logger.info(f"  Telemetry packets: {self.telemetry_packets}")
        logger.info(f"  Upload queue: {upload_stats['queue_size']}")
        logger.info(f"  Total uploaded: {upload_stats['total_uploaded']}")
        logger.info(f"  Last upload: {upload_stats['last_upload']}")
    
    def stop(self):
        """Stop the receiver"""
        logger.info("Stopping Meshtastic receiver...")
        self.running = False
        
        try:
            if self.interface:
                pub.unsubscribe(self._on_receive, "meshtastic.receive")
                self.interface.close()
                logger.info(" Meshtastic interface closed")
        except Exception as e:
            logger.error(f"Error closing interface: {e}")


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    global receiver, uploader
    if receiver:
        receiver.stop()
    if uploader:
        uploader.shutdown()
    sys.exit(0)


def main():
    """Main entry point"""
    logger.info("Starting Raspberry Pi Meshtastic to Supabase Uploader")
    logger.info(f"  TTY Device: {TTY_DEVICE}")
    logger.info(f"  API Base: {API_BASE_URL}")
    logger.info(f"  Upload Interval: {UPLOAD_INTERVAL_SEC}s")
    logger.info(f"  Batch Size: {UPLOAD_BATCH_SIZE}")
    logger.info(f"  Debug Mode: {DEBUG}")
    
    # Check dependencies
    if not MESHTASTIC_AVAILABLE:
        logger.error(" Meshtastic package not available")
        sys.exit(1)
    
    if not SUPABASE_SERVICE_KEY:
        logger.error("SUPABASE_SERVICE_KEY environment variable required")
        sys.exit(1)
    
    # Check TTY device
    if len(sys.argv) > 1:
        tty_device = sys.argv[1]
    else:
        tty_device = TTY_DEVICE
    
    if not os.path.exists(tty_device):
        logger.error(f"TTY device {tty_device} not found")
        sys.exit(1)
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize components
    global uploader, receiver
    uploader = MeshtasticTelemetryUploader()
    receiver = MeshtasticReceiver(tty_device, uploader)
    
    try:
        # Start receiving
        receiver.start()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main() 