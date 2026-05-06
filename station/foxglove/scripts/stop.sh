#!/usr/bin/env bash
# Foxglove Ground Station 停止脚本

echo "=== Stopping Foxglove Ground Station ==="

# 停止 mqtt_ros_bridge
pkill -f "mqtt_ros_bridge.py" 2>/dev/null && echo "[OK] Bridge stopped" || echo "[--] Bridge not running"

# 停止 foxglove_bridge
pkill -f "foxglove_bridge" 2>/dev/null && echo "[OK] foxglove_bridge stopped" || echo "[--] foxglove_bridge not running"

# 停止 roscore
pkill -f "rosmaster" 2>/dev/null && echo "[OK] roscore stopped" || echo "[--] roscore not running"

echo "[OK] All services stopped"
