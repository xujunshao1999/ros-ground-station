#!/usr/bin/env bash
# Foxglove Ground Station 一键启动脚本
# 用法: ./start.sh [foxglove_studio_path]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_DIR="$(dirname "$SCRIPT_DIR")/bridge"
STUDIO_PATH="${1:-foxglove-studio}"

echo "=== Foxglove Ground Station ==="

# 1. 检查并启动 roscore
if rostopic list &>/dev/null; then
    echo "[OK] roscore already running"
else
    echo "[...] Starting roscore..."
    roscore &
    sleep 2
    echo "[OK] roscore started"
fi

# 2. 启动 MQTT-ROS 桥接
echo "[...] Starting MQTT-ROS bridge..."
cd "$BRIDGE_DIR"
python3 mqtt_ros_bridge.py &
BRIDGE_PID=$!
echo "[OK] Bridge PID: $BRIDGE_PID"

# 3. 启动 foxglove_bridge
echo "[...] Starting foxglove_bridge..."
rosrun foxglove_bridge foxglove_bridge \
    _port:=8765 \
    _max_update_frequency:=30.0 \
    _use_compression:=true &
FOXGLOVE_BRIDGE_PID=$!
echo "[OK] foxglove_bridge PID: $FOXGLOVE_BRIDGE_PID - ws://localhost:8765"

# 4. 启动 Foxglove Studio
echo "[...] Starting Foxglove Studio..."
$STUDIO_PATH &
STUDIO_PID=$!
echo "[OK] Studio PID: $STUDIO_PID"

echo ""
echo "=== All services started ==="
echo "  ROS Master:     http://localhost:11311"
echo "  foxglove_bridge: ws://localhost:8765"
echo "  Bridge PID:     $BRIDGE_PID"
echo "  Studio PID:     $STUDIO_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# 5. 等待 Ctrl+C 后停止所有进程
cleanup() {
    echo ""
    echo "=== Shutting down ==="
    kill $STUDIO_PID 2>/dev/null || true
    kill $FOXGLOVE_BRIDGE_PID 2>/dev/null || true
    kill $BRIDGE_PID 2>/dev/null || true
    wait
    echo "[OK] All services stopped"
}
trap cleanup SIGINT SIGTERM

wait
