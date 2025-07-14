#!/bin/bash

# Navigate to the osp-houserules system directory
cd /home/superpcm/narlingtondata/Data/systems/osp-houserules || {
  echo "Directory not found. Exiting."
  exit 1
}

# Run the build
echo "Running npm build..."
if ! npm run build; then
  echo "Build failed. Exiting."
  exit 1
fi

# Restart Foundry using PM2
echo "Restarting Foundry VTT with PM2..."
pm2 restart narlington

echo "Build and restart complete."
