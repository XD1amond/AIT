#!/bin/bash

# This script is intended to run on the Raspberry Pi Zero 2 W
# when it's connected to a host computer via USB.
# It should be configured to run automatically (e.g., via systemd service
# or rc.local, depending on the RPi OS setup).

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "Companion autorun script started..."
echo "Script directory: $SCRIPT_DIR"

# Ensure Python is available
if ! command -v python3 &> /dev/null
then
    echo "Error: python3 could not be found. Please install Python 3."
    exit 1
fi

# Navigate to the script directory to ensure relative paths work
cd "$SCRIPT_DIR"

# Run the launch script
echo "Attempting to launch the host application..."
python3 launch_app.py

LAUNCH_EXIT_CODE=$?

if [ $LAUNCH_EXIT_CODE -eq 0 ]; then
    echo "Launch script executed successfully."
else
    echo "Launch script failed with exit code $LAUNCH_EXIT_CODE."
    # Add any error handling or logging needed here
fi

echo "Companion autorun script finished."

exit $LAUNCH_EXIT_CODE