#!/bin/bash
"""
SmeshLLM Python Services Startup Script
Ensures virtual environment is activated to fix SSL/certifi issues
Uses robust weather services with fallbacks
"""

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
VENV_DIR="$SCRIPT_DIR/venv"

echo "🚀 Starting SmeshLLM Python Services with SSL fix..."
echo "Script directory: $SCRIPT_DIR"
echo "Virtual environment: $VENV_DIR"

# Check if virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    echo "❌ Virtual environment not found at $VENV_DIR"
    echo "Please create a virtual environment first:"
    echo "  python3 -m venv $VENV_DIR"
    echo "  source $VENV_DIR/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# Verify certifi is working
echo "🔍 Verifying SSL/certifi fix..."
python3 -c "
import certifi
print(f'✅ certifi version: {certifi.__version__}')
print(f'✅ certifi path: {certifi.where()}')

try:
    import pygridmet
    print(f'✅ pygridmet version: {pygridmet.__version__}')
except Exception as e:
    print(f'⚠️ pygridmet warning: {e}')

try:
    import requests
    response = requests.get('https://httpbin.org/get', timeout=5)
    print(f'✅ HTTPS connectivity: {response.status_code}')
except Exception as e:
    print(f'⚠️ HTTPS warning: {e}')
"

# Set environment variables for robust operation
export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"
export GRID_MET_CACHE_DIR="$SCRIPT_DIR/services/cache"

# Start the main application
echo "🌤️ Starting SmeshLLM services with SSL/certifi fix..."
echo "Press Ctrl+C to stop"

# Use uvicorn to start the FastAPI application
uvicorn main:app --host 127.0.0.1 --port 8000 --reload --reload-dir "$SCRIPT_DIR"