#!/bin/bash

# AIT Companion Setup Script for Raspberry Pi Zero 2 W
# Run this script on a fresh Raspberry Pi OS Lite/Desktop installation.
# Usage: sudo bash setup.sh

# --- Configuration ---
COMPANION_DIR="/opt/ait-companion"
SERVICE_NAME="ait-companion.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

# --- Helper Functions ---
print_status() {
    echo "--- $1 ---"
}

print_error() {
    echo "ERROR: $1" >&2
    exit 1
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root. Use 'sudo bash $0'."
    fi
}

check_internet() {
    print_status "Checking internet connectivity..."
    if ! ping -c 1 google.com &> /dev/null; then
        echo "Warning: Could not reach google.com. Setup might fail if downloads are needed."
        # Allow continuing, as packages might be cached or user might fix later
    else
        echo "Internet connection verified."
    fi
}

backup_file() {
    local file=$1
    if [ -f "$file" ] && [ ! -f "$file.bak" ]; then
        print_status "Backing up $file to $file.bak"
        cp "$file" "$file.bak"
    fi
}

# --- Main Setup ---
check_root
check_internet

# 1. System Update & Dependencies
print_status "Updating system packages..."
apt-get update || print_error "Failed to update package lists."
apt-get upgrade -y || print_error "Failed to upgrade packages."

print_status "Installing dependencies (python3)..."
apt-get install -y python3 || print_error "Failed to install python3."

# 2. Enable USB OTG (dwc2)
print_status "Enabling DWC2 overlay..."
backup_file "/boot/firmware/config.txt" # RPi OS Bookworm uses /boot/firmware/
if ! grep -q "^dtoverlay=dwc2" /boot/firmware/config.txt; then
    echo "dtoverlay=dwc2" >> /boot/firmware/config.txt
    echo "Added 'dtoverlay=dwc2' to /boot/firmware/config.txt"
else
    echo "'dtoverlay=dwc2' already present in /boot/firmware/config.txt"
fi

# 3. Configure USB Gadget Mode (Ethernet)
print_status "Configuring USB Gadget Mode (Ethernet)..."
backup_file "/boot/firmware/cmdline.txt"
# Check if modules-load already contains dwc2, g_ether
if ! grep -q "modules-load=dwc2,g_ether" /boot/firmware/cmdline.txt; then
    # Remove existing modules-load if present
    sed -i 's/ modules-load=[^ ]*//' /boot/firmware/cmdline.txt
    # Add the required modules at the end of the line, before 'quiet' or 'init=' if they exist
    sed -i 's/\(quiet\|init=.*\)?/ modules-load=dwc2,g_ether \1/' /boot/firmware/cmdline.txt
    # If neither quiet nor init= was found, just append
    if ! grep -q "modules-load=dwc2,g_ether" /boot/firmware/cmdline.txt; then
         sed -i '$ s/$/ modules-load=dwc2,g_ether/' /boot/firmware/cmdline.txt
    fi
    echo "Added 'modules-load=dwc2,g_ether' to /boot/firmware/cmdline.txt"
else
    echo "'modules-load=dwc2,g_ether' already present in /boot/firmware/cmdline.txt"
fi

# 4. Create Directory and Copy Scripts
print_status "Creating directory ${COMPANION_DIR}..."
mkdir -p "${COMPANION_DIR}" || print_error "Failed to create directory ${COMPANION_DIR}."

print_status "Copying companion scripts..."
# Assumes this script is run from the Companion directory within the cloned repo
SCRIPT_SOURCE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

cp "${SCRIPT_SOURCE_DIR}/detect_os.py" "${COMPANION_DIR}/detect_os.py" || print_error "Failed to copy detect_os.py."
cp "${SCRIPT_SOURCE_DIR}/launch_app.py" "${COMPANION_DIR}/launch_app.py" || print_error "Failed to copy launch_app.py."
cp "${SCRIPT_SOURCE_DIR}/autorun.sh" "${COMPANION_DIR}/autorun.sh" || print_error "Failed to copy autorun.sh."

# 5. Set Permissions
print_status "Setting script permissions..."
chmod +x "${COMPANION_DIR}/autorun.sh" || print_error "Failed to set permissions for autorun.sh."
# Python scripts don't strictly need +x if called via python3, but it doesn't hurt
chmod +x "${COMPANION_DIR}/detect_os.py"
chmod +x "${COMPANION_DIR}/launch_app.py"

# 6. Configure Autorun Service (systemd)
print_status "Configuring systemd service (${SERVICE_NAME})..."

cat > "${SERVICE_FILE}" << EOF
[Unit]
Description=AIT Companion Autorun Service
After=network.target multi-user.target

[Service]
Type=simple
ExecStart=/bin/bash ${COMPANION_DIR}/autorun.sh
WorkingDirectory=${COMPANION_DIR}
Restart=on-failure
User=root # Or a less privileged user if possible, but needs access to run python/bash

[Install]
WantedBy=multi-user.target
EOF

if [ ! -f "${SERVICE_FILE}" ]; then
    print_error "Failed to create service file ${SERVICE_FILE}."
fi

print_status "Enabling and starting ${SERVICE_NAME}..."
systemctl daemon-reload || print_error "Failed to reload systemd daemon."
systemctl enable "${SERVICE_NAME}" || print_error "Failed to enable ${SERVICE_NAME}."
# Don't start it immediately, let it start on next boot after reboot
# systemctl start "${SERVICE_NAME}" || print_error "Failed to start ${SERVICE_NAME}."

print_status "Setup Complete!"
echo "Reboot the Raspberry Pi for changes to take effect (sudo reboot)."

exit 0