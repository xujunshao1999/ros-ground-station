#!/bin/bash

echo "Stopping robot containers..."
docker-compose down

echo "Stopping Mosquitto (project instance)..."
if pgrep -f "mosquitto.*broker/mosquitto.conf" >/dev/null; then
    sudo pkill -f "mosquitto.*broker/mosquitto.conf"
    echo "Mosquitto stopped."
else
    echo "Mosquitto not running (or not started by this project)."
fi

echo ""
echo "All services stopped."
