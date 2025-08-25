#!/bin/bash
# Environment setup for SmeshLLM Python services
export NASA_FIRMS_API_KEY="c5bc2ce397a15b377717388a09836f57"
export OPENAQ_API_KEY="${OPENAQ_API_KEY:-}"
export HYSPLIT_DIR="${HYSPLIT_DIR:-/opt/hysplit}"
export METEO_DATA_DIR="${METEO_DATA_DIR:-/tmp/meteo_data}"

echo "✅ Environment variables set for SmeshLLM services"
echo "🔥 NASA FIRMS API key: ${NASA_FIRMS_API_KEY:0:8}..."
echo "🌪️ HYSPLIT directory: $HYSPLIT_DIR"
echo "📊 Meteorological data: $METEO_DATA_DIR"
