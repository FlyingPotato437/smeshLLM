#!/bin/bash

echo "🔬 COMPLETE DATA PIPELINE TESTING"
echo "=================================="

# Configuration
BASE_URL="http://localhost:3000"
CURRENT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "📅 Test timestamp: $CURRENT_TIME"
echo ""

# Test 1: Database Connection
echo "1️⃣ Testing database connection..."
SETUP_RESULT=$(curl -s -X POST $BASE_URL/api/setup)
echo "Setup result: $SETUP_RESULT"
echo ""

# Test 2: Upload sensor data with current timestamp
echo "2️⃣ Uploading current sensor data..."

SENSOR_DATA_1="{\"sensor_id\": \"0x433b0001\", \"timestamp\": \"$CURRENT_TIME\", \"location\": {\"latitude\": 37.7749, \"longitude\": -122.4194}, \"pm25_ugm3\": 25.5, \"pm10_ugm3\": 35.2, \"temperature_c\": 22.1, \"relative_humidity_pct\": 45.2}"

UPLOAD_1=$(curl -s -X POST $BASE_URL/api/ingest/sensors -H "Content-Type: application/json" -d "$SENSOR_DATA_1")
echo "Sensor 1 upload: $UPLOAD_1"

SENSOR_DATA_2="{\"sensor_id\": \"0x433b0002\", \"timestamp\": \"$CURRENT_TIME\", \"location\": {\"latitude\": 37.7849, \"longitude\": -122.4094}, \"pm25_ugm3\": 44.8, \"pm10_ugm3\": 64.8, \"temperature_c\": 26.8, \"relative_humidity_pct\": 35.7}"

UPLOAD_2=$(curl -s -X POST $BASE_URL/api/ingest/sensors -H "Content-Type: application/json" -d "$SENSOR_DATA_2")
echo "Sensor 2 upload: $UPLOAD_2"
echo ""

# Test 3: Wait for batch processing
echo "3️⃣ Waiting for batch processing (6 seconds)..."
sleep 6
echo ""

# Test 4: Test chat API data retrieval
echo "4️⃣ Testing LLM data access..."
CHAT_QUERY='{"message": "What sensor data is available? Show me PM2.5 readings and sensor locations."}'
CHAT_RESULT=$(curl -s -X POST $BASE_URL/api/chat -H "Content-Type: application/json" -d "$CHAT_QUERY")

echo "Chat API response:"
echo "$CHAT_RESULT" | jq '.'
echo ""

# Test 5: Extract specific data context
echo "5️⃣ Data context analysis:"
SENSOR_COUNT=$(echo "$CHAT_RESULT" | jq -r '.dataContext.sensorCount')
DATA_SOURCES=$(echo "$CHAT_RESULT" | jq -r '.dataContext.dataSources[]' 2>/dev/null | tr '\n' ', ')

echo "Sensor count detected by LLM: $SENSOR_COUNT"
echo "Data sources: $DATA_SOURCES"
echo ""

# Test 6: Upload fire detection data
echo "6️⃣ Testing fire detection upload..."
FIRE_DATA="{\"latitude\": 37.8, \"longitude\": -122.4, \"acq_date\": \"2024-06-23\", \"acq_time\": \"1230\", \"frp\": 45.2, \"confidence\": \"high\", \"bright_ti4\": 320.5, \"scan\": 1.2, \"track\": 1.1, \"satellite\": \"VIIRS\", \"instrument\": \"VIIRS\", \"version\": \"1.0NRT\", \"bright_ti5\": 295.3, \"daynight\": \"D\"}"

FIRE_UPLOAD=$(curl -s -X POST $BASE_URL/api/ingest/fires -H "Content-Type: application/json" -d "$FIRE_DATA")
echo "Fire detection upload: $FIRE_UPLOAD"
echo ""

# Test 7: Final comprehensive LLM test
echo "7️⃣ Final LLM integration test..."
sleep 3
FINAL_QUERY='{"message": "Analyze current conditions: sensor readings, fire detections, and air quality. Provide specific data points."}'
FINAL_RESULT=$(curl -s -X POST $BASE_URL/api/chat -H "Content-Type: application/json" -d "$FINAL_QUERY")

echo "Final LLM response:"
echo "$FINAL_RESULT" | jq '.message.content' -r
echo ""

FINAL_SENSOR_COUNT=$(echo "$FINAL_RESULT" | jq -r '.dataContext.sensorCount')
FINAL_FIRE_COUNT=$(echo "$FINAL_RESULT" | jq -r '.dataContext.fireCount')

echo "📊 FINAL RESULTS:"
echo "=================="
echo "Sensors detected: $FINAL_SENSOR_COUNT"
echo "Fires detected: $FINAL_FIRE_COUNT"
echo "Pipeline status: $([ "$FINAL_SENSOR_COUNT" -gt 0 ] && echo "✅ WORKING" || echo "❌ FAILED")"
echo ""

if [ "$FINAL_SENSOR_COUNT" -gt 0 ]; then
    echo "🎉 SUCCESS: Data is flowing from CSV upload → Supabase → LLM!"
else
    echo "🔍 DEBUGGING: Data upload succeeded but LLM retrieval failed"
    echo "Check batch processing, time filtering, or database queries"
fi 