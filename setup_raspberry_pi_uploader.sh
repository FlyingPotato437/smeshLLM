#!/bin/bash

# Raspberry Pi Meshtastic to Supabase Uploader Setup Script
# Run this on your Raspberry Pi to set up the uploader

set -e

echo "🚀 Setting up Raspberry Pi Meshtastic to Supabase Uploader"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default installation directory
INSTALL_DIR="/home/pi/Documents/smesh/snode"
SCRIPT_NAME="raspberry_pi_meshtastic_uploader.py"

echo -e "${BLUE}Installation directory: ${INSTALL_DIR}${NC}"

# Check if we're on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    echo -e "${YELLOW}Warning: This doesn't appear to be a Raspberry Pi${NC}"
fi

# Create directories
echo -e "${BLUE}Creating directories...${NC}"
mkdir -p "${INSTALL_DIR}/data"
mkdir -p "${INSTALL_DIR}/scripts"

# Install Python dependencies
echo -e "${BLUE}Installing Python dependencies...${NC}"
pip3 install --user meshtastic pubsub requests

# Copy the uploader script
if [ -f "${SCRIPT_NAME}" ]; then
    echo -e "${BLUE}Copying uploader script...${NC}"
    cp "${SCRIPT_NAME}" "${INSTALL_DIR}/scripts/"
    chmod +x "${INSTALL_DIR}/scripts/${SCRIPT_NAME}"
    echo -e "${GREEN}✅ Script copied to ${INSTALL_DIR}/scripts/${SCRIPT_NAME}${NC}"
else
    echo -e "${RED}❌ ${SCRIPT_NAME} not found in current directory${NC}"
    exit 1
fi

# Create environment configuration file
echo -e "${BLUE}Creating environment configuration...${NC}"
cat > "${INSTALL_DIR}/.env" << EOF
# Supabase Configuration
SUPABASE_URL=https://vanqyqnugswokfchdhpk.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_KEY_HERE

# API Configuration  
API_BASE_URL=https://your-app.vercel.app

# Device Configuration
TTY_DEVICE=/dev/ttyUSB0
DEFAULT_LAT=37.4419
DEFAULT_LON=-122.1430

# Upload Settings
UPLOAD_BATCH_SIZE=10
UPLOAD_INTERVAL_SEC=30
DEBUG=false
EOF

echo -e "${GREEN}✅ Environment file created at ${INSTALL_DIR}/.env${NC}"

# Create systemd service file
echo -e "${BLUE}Creating systemd service...${NC}"
sudo tee /etc/systemd/system/meshtastic-uploader.service > /dev/null << EOF
[Unit]
Description=Meshtastic to Supabase Data Uploader
After=network.target
Wants=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=${INSTALL_DIR}
Environment=PATH=/home/pi/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/scripts/${SCRIPT_NAME} /dev/ttyUSB0
Restart=always
RestartSec=10
StandardOutput=append:${INSTALL_DIR}/data/uploader.log
StandardError=append:${INSTALL_DIR}/data/uploader_error.log

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✅ Systemd service created${NC}"

# Create wrapper script for manual testing
cat > "${INSTALL_DIR}/start_uploader.sh" << EOF
#!/bin/bash
cd "${INSTALL_DIR}"
source .env
export SUPABASE_URL SUPABASE_SERVICE_KEY API_BASE_URL TTY_DEVICE
export DEFAULT_LAT DEFAULT_LON UPLOAD_BATCH_SIZE UPLOAD_INTERVAL_SEC DEBUG
python3 scripts/${SCRIPT_NAME} \${TTY_DEVICE}
EOF

chmod +x "${INSTALL_DIR}/start_uploader.sh"
echo -e "${GREEN}✅ Manual start script created at ${INSTALL_DIR}/start_uploader.sh${NC}"

# Update crontab for alternative deployment (if systemd is not preferred)
echo -e "${BLUE}Creating crontab alternative...${NC}"
CRONTAB_LINE="@reboot source ${INSTALL_DIR}/.env; cd ${INSTALL_DIR}; python3 scripts/${SCRIPT_NAME} \${TTY_DEVICE} >> data/uploader_cron.log 2>&1"

cat > "${INSTALL_DIR}/install_crontab.sh" << EOF
#!/bin/bash
# Alternative installation using crontab (run this if you prefer cron over systemd)
echo "Installing crontab entry..."
(crontab -l 2>/dev/null; echo "${CRONTAB_LINE}") | crontab -
echo "✅ Crontab entry installed"
echo "To remove: crontab -e and delete the line"
EOF

chmod +x "${INSTALL_DIR}/install_crontab.sh"

echo ""
echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo "1. Edit ${INSTALL_DIR}/.env and set your SUPABASE_SERVICE_KEY and API_BASE_URL"
echo "2. Test the TTY device exists: ls -la /dev/ttyUSB*"
echo "3. Choose deployment method:"
echo ""
echo -e "${BLUE}Option A: Systemd Service (Recommended)${NC}"
echo "   sudo systemctl enable meshtastic-uploader.service"
echo "   sudo systemctl start meshtastic-uploader.service"
echo "   sudo systemctl status meshtastic-uploader.service"
echo ""
echo -e "${BLUE}Option B: Crontab (Alternative)${NC}"
echo "   ${INSTALL_DIR}/install_crontab.sh"
echo ""
echo -e "${BLUE}Option C: Manual Testing${NC}"
echo "   ${INSTALL_DIR}/start_uploader.sh"
echo ""
echo -e "${YELLOW}LOGS:${NC}"
echo "   Systemd: journalctl -u meshtastic-uploader.service -f"
echo "   Manual: ${INSTALL_DIR}/data/meshtastic_upload.log"
echo ""
echo -e "${YELLOW}MONITORING:${NC}"
echo "   Check upload status: curl http://localhost:3000/api/ingest/meshtastic"
echo "   View logs: tail -f ${INSTALL_DIR}/data/*.log" 