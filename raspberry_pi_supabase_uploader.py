#!/usr/bin/env python3
"""
Raspberry Pi Meshtastic to Supabase Data Uploader
Reads sensor data from Meshtastic devices and uploads to Supabase

Compatible with existing smeshLLM infrastructure and API endpoints.
Can run standalone or integrate with existing rpi_log_script.py
"""

import os
import sys
import json
import time
import requests
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import traceback

try:
    from meshtastic import SerialInterface, TCPInterface
    from meshtastic.telemetry_pb2 import Telemetry
    import pubsub
    MESHTASTIC_AVAILABLE = True
except ImportError:
    print("Warning: meshtastic package not available. Install with: pip install meshtastic")
    MESHTASTIC_AVAILABLE = False

# Configuration - Set these environment variables or modify defaults
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://vanqyqnugswokfchdhpk.supabase.co')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')  # Set this!
SMESH_API_BASE = os.getenv('SMESH_API_BASE', 'http://localhost:3000')  # Your Next.js app
TTY_DEVICE = os.getenv('TTY_DEVICE', '/dev/ttyUSB0')
UPLOAD_INTERVAL = int(os.getenv('UPLOAD_INTERVAL', '60'))  # seconds
BATCH_SIZE = int(os.getenv('BATCH_SIZE', '50'))
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('supabase_upload.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class SensorReading:
    """Standardized sensor reading format for Supabase upload"""
    sensor_id: str
    timestamp: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude_m: Optional[float] = None
    pm25_ugm3: Optional[float] = None
    pm10_ugm3: Optional[float] = None
    temperature_c: Optional[float] = None
    relative_humidity_pct: Optional[float] = None
    voltage: Optional[float] = None
    battery_level: Optional[int] = None
    air_util_tx: Optional[float] = None
    uptime_seconds: Optional[int] = None
    rssi: Optional[float] = None
    snr: Optional[float] = None
    raw_data: Optional[Dict] = None

class SupabaseUploader:
    """Handles uploading sensor data to Supabase via API endpoints"""
    
    def __init__(self, api_base: str = SMESH_API_BASE):
        self.api_base = api_base.rstrip('/')
        self.session = requests.Session()
        self.pending_readings = []
        
        # Set headers if we have service key
        if SUPABASE_SERVICE_KEY:
            self.session.headers.update({
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json'
            })
    
    def add_reading(self, reading: SensorReading):
        """Add a reading to the upload queue"""
        self.pending_readings.append(reading)
        logger.debug(f"Added reading from {reading.sensor_id}, queue size: {len(self.pending_readings)}")
        
        if len(self.pending_readings) >= BATCH_SIZE:
            self.upload_batch()
    
    def upload_batch(self):
        """Upload all pending readings to Supabase"""
        if not self.pending_readings:
            return
            
        logger.info(f"Uploading batch of {len(self.pending_readings)} readings...")
        
        try:
            # Convert to format expected by your API
            payload = []
            for reading in self.pending_readings:
                data = {
                    'sensor_id': reading.sensor_id,
                    'timestamp': reading.timestamp,
                }
                
                # Add location if available
                if reading.latitude is not None and reading.longitude is not None:
                    data['location'] = {
                        'latitude': reading.latitude,
                        'longitude': reading.longitude
                    }
                
                # Add optional fields
                if reading.pm25_ugm3 is not None:
                    data['pm25_ugm3'] = reading.pm25_ugm3
                if reading.pm10_ugm3 is not None:
                    data['pm10_ugm3'] = reading.pm10_ugm3
                if reading.temperature_c is not None:
                    data['temperature_c'] = reading.temperature_c
                if reading.relative_humidity_pct is not None:
                    data['relative_humidity_pct'] = reading.relative_humidity_pct
                if reading.altitude_m is not None:
                    data['altitude_m'] = reading.altitude_m
                
                # Add device metrics
                if reading.voltage is not None:
                    data['voltage'] = reading.voltage
                if reading.battery_level is not None:
                    data['battery_level'] = reading.battery_level
                if reading.air_util_tx is not None:
                    data['air_util_tx'] = reading.air_util_tx
                if reading.uptime_seconds is not None:
                    data['uptime_seconds'] = reading.uptime_seconds
                if reading.rssi is not None:
                    data['rssi'] = reading.rssi
                if reading.snr is not None:
                    data['snr'] = reading.snr
                
                payload.append(data)
            
            # Try to upload via your sensor ingestion API
            response = self.session.post(
                f'{self.api_base}/api/ingest/sensors',
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"✅ Upload successful: {result.get('message', 'OK')}")
                self.pending_readings.clear()
            else:
                logger.error(f"❌ Upload failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            logger.error(f"❌ Upload error: {e}")
            logger.debug(traceback.format_exc())
    
    def upload_single(self, reading: SensorReading) -> bool:
        """Upload a single reading immediately"""
        try:
            data = {
                'sensor_id': reading.sensor_id,
                'timestamp': reading.timestamp,
            }
            
            # Add location if available
            if reading.latitude is not None and reading.longitude is not None:
                data['location'] = {
                    'latitude': reading.latitude,
                    'longitude': reading.longitude
                }
            
            # Add sensor data
            for field in ['pm25_ugm3', 'pm10_ugm3', 'temperature_c', 'relative_humidity_pct']:
                value = getattr(reading, field)
                if value is not None:
                    data[field] = value
            
            response = self.session.post(
                f'{self.api_base}/api/ingest/sensors',
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Single upload successful for {reading.sensor_id}")
                return True
            else:
                logger.error(f"❌ Single upload failed: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Single upload error: {e}")
            return False

class MeshtasticDataReader:
    """Reads data from Meshtastic devices"""
    
    def __init__(self, uploader: SupabaseUploader, device_path: str = TTY_DEVICE):
        self.uploader = uploader
        self.device_path = device_path
        self.interface = None
        self.running = False
        
        # Default location (you should update this for your deployment)
        self.default_lat = 37.4419  # Stanford area
        self.default_lon = -122.1430
    
    def connect(self):
        """Connect to Meshtastic device"""
        if not MESHTASTIC_AVAILABLE:
            logger.error("Meshtastic package not available")
            return False
            
        try:
            if os.path.exists(self.device_path):
                logger.info(f"Connecting to serial device: {self.device_path}")
                self.interface = SerialInterface(self.device_path)
            else:
                logger.warning(f"Device {self.device_path} not found, trying TCP...")
                # Fallback to TCP if serial not available
                self.interface = TCPInterface(hostname='localhost')
            
            # Subscribe to telemetry messages
            pubsub.subscribe(self.on_receive, "meshtastic.receive")
            logger.info("✅ Connected to Meshtastic")
            return True
            
        except Exception as e:
            logger.error(f"❌ Connection failed: {e}")
            return False
    
    def on_receive(self, packet):
        """Handle received Meshtastic packets"""
        try:
            if 'decoded' not in packet:
                return
                
            decoded = packet['decoded']
            
            # Handle telemetry packets
            if decoded.get('portnum') == 'TELEMETRY_APP' and 'telemetry' in decoded:
                self.process_telemetry(packet)
                
            # Handle environment sensors (if you have them)
            elif decoded.get('portnum') == 'ENVIRONMENTAL_MEASUREMENT_APP':
                self.process_environmental(packet)
                
        except Exception as e:
            logger.error(f"Error processing packet: {e}")
            logger.debug(traceback.format_exc())
    
    def process_telemetry(self, packet):
        """Process device telemetry data"""
        try:
            telemetry = packet['decoded']['telemetry']
            from_id = packet.get('fromId', 'unknown')
            node_id = packet.get('from', 0)
            
            # Extract device metrics
            if 'deviceMetrics' in telemetry:
                metrics = telemetry['deviceMetrics']
                
                reading = SensorReading(
                    sensor_id=from_id,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    latitude=self.default_lat,  # You might want to get this from node info
                    longitude=self.default_lon,
                    voltage=metrics.get('voltage'),
                    battery_level=metrics.get('batteryLevel'),
                    air_util_tx=metrics.get('airUtilTx'),
                    uptime_seconds=metrics.get('uptimeSeconds'),
                    rssi=packet.get('rxRssi'),
                    snr=packet.get('rxSnr'),
                    raw_data=metrics
                )
                
                logger.info(f"📊 Device telemetry from {from_id}: "
                          f"Battery={reading.battery_level}%, Voltage={reading.voltage}V")
                
                self.uploader.add_reading(reading)
            
            # Handle environment telemetry
            if 'environmentMetrics' in telemetry:
                env = telemetry['environmentMetrics']
                
                reading = SensorReading(
                    sensor_id=from_id,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    latitude=self.default_lat,
                    longitude=self.default_lon,
                    temperature_c=env.get('temperature'),
                    relative_humidity_pct=env.get('relativeHumidity'),
                    raw_data=env
                )
                
                logger.info(f"🌡️  Environment from {from_id}: "
                          f"Temp={reading.temperature_c}°C, RH={reading.relative_humidity_pct}%")
                
                self.uploader.add_reading(reading)
                
        except Exception as e:
            logger.error(f"Error processing telemetry: {e}")
    
    def process_environmental(self, packet):
        """Process environmental sensor data"""
        # Implement if you have environmental sensors
        pass
    
    def run(self):
        """Main run loop"""
        if not self.connect():
            return False
            
        self.running = True
        logger.info("🚀 Starting data collection...")
        
        try:
            last_upload = time.time()
            
            while self.running:
                time.sleep(1)
                
                # Periodic upload of any pending readings
                if time.time() - last_upload > UPLOAD_INTERVAL:
                    if self.uploader.pending_readings:
                        self.uploader.upload_batch()
                    last_upload = time.time()
                    
        except KeyboardInterrupt:
            logger.info("🛑 Stopping data collection...")
            self.stop()
        except Exception as e:
            logger.error(f"❌ Runtime error: {e}")
            logger.debug(traceback.format_exc())
        finally:
            self.cleanup()
    
    def stop(self):
        """Stop data collection"""
        self.running = False
    
    def cleanup(self):
        """Cleanup resources"""
        # Upload any remaining readings
        if self.uploader.pending_readings:
            logger.info("📤 Uploading final batch...")
            self.uploader.upload_batch()
        
        if self.interface:
            try:
                pubsub.unsubscribe(self.on_receive, "meshtastic.receive")
                self.interface.close()
            except:
                pass

class CSVLogReader:
    """Alternative: Read from existing CSV logs and upload to Supabase"""
    
    def __init__(self, uploader: SupabaseUploader, data_dir: str = "./data"):
        self.uploader = uploader
        self.data_dir = data_dir
    
    def process_csv_files(self):
        """Process existing CSV files and upload to Supabase"""
        import glob
        import csv
        
        # Find CSV files in data directories
        pattern = os.path.join(self.data_dir, "**/*.csv")
        csv_files = glob.glob(pattern, recursive=True)
        
        logger.info(f"Found {len(csv_files)} CSV files to process")
        
        for csv_file in csv_files:
            if 'deviceMetrics' in csv_file:
                self.process_device_metrics_csv(csv_file)
            elif 'airQualityMetrics' in csv_file:
                self.process_air_quality_csv(csv_file)
    
    def process_device_metrics_csv(self, csv_file: str):
        """Process device metrics CSV file"""
        try:
            with open(csv_file, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    reading = SensorReading(
                        sensor_id=row.get('fromId', 'unknown'),
                        timestamp=row.get('timestamp', ''),
                        voltage=float(row['voltage']) if row.get('voltage') else None,
                        battery_level=int(row['batteryLevel']) if row.get('batteryLevel') else None,
                        air_util_tx=float(row['airUtilTx']) if row.get('airUtilTx') else None,
                        uptime_seconds=int(row['uptimeSeconds']) if row.get('uptimeSeconds') else None,
                    )
                    self.uploader.add_reading(reading)
                    
            logger.info(f"✅ Processed {csv_file}")
            
        except Exception as e:
            logger.error(f"❌ Error processing {csv_file}: {e}")

    def process_air_quality_csv(self, csv_file: str):
        """Process air quality CSV file"""
        try:
            with open(csv_file, 'r') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    reading = SensorReading(
                        sensor_id=row.get('fromId', 'unknown'),
                        timestamp=row.get('timestamp', ''),
                        pm25_ugm3=float(row['pm25']) if row.get('pm25') else None,
                        pm10_ugm3=float(row['pm10']) if row.get('pm10') else None,
                        temperature_c=float(row['temperature']) if row.get('temperature') else None,
                        relative_humidity_pct=float(row['humidity']) if row.get('humidity') else None,
                    )
                    self.uploader.add_reading(reading)
                    
            logger.info(f"✅ Processed {csv_file}")
            
        except Exception as e:
            logger.error(f"❌ Error processing {csv_file}: {e}")

def main():
    """Main function"""
    logger.info("🚀 Starting Raspberry Pi Supabase Uploader")
    
    # Check configuration
    if not SUPABASE_SERVICE_KEY:
        logger.warning("⚠️  SUPABASE_SERVICE_KEY not set. Upload may fail.")
    
    # Initialize uploader
    uploader = SupabaseUploader()
    
    # Choose mode based on arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == 'csv':
            # CSV mode: process existing log files
            logger.info("📁 CSV mode: Processing existing log files")
            csv_reader = CSVLogReader(uploader)
            csv_reader.process_csv_files()
            
        elif sys.argv[1] == 'test':
            # Test mode: send a test reading
            logger.info("🧪 Test mode: Sending test reading")
            test_reading = SensorReading(
                sensor_id='test_sensor',
                timestamp=datetime.now(timezone.utc).isoformat(),
                latitude=37.4419,
                longitude=-122.1430,
                temperature_c=22.5,
                relative_humidity_pct=65.0,
                pm25_ugm3=12.3,
                pm10_ugm3=18.7,
                voltage=4.2,
                battery_level=85
            )
            success = uploader.upload_single(test_reading)
            if success:
                logger.info("✅ Test upload successful!")
            else:
                logger.error("❌ Test upload failed!")
            
        else:
            # Live mode with specific device
            device_path = sys.argv[1]
            logger.info(f"📡 Live mode: Reading from {device_path}")
            reader = MeshtasticDataReader(uploader, device_path)
            reader.run()
    else:
        # Default live mode
        logger.info("📡 Live mode: Reading from default device")
        reader = MeshtasticDataReader(uploader)
        reader.run()

if __name__ == "__main__":
    main() 