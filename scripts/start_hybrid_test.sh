#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================================"
echo " ROS Ground Station — Hybrid Test Startup"
echo "============================================================"

# ------------------------------------------------------------------
# 1. 启动 Mosquitto（使用项目 broker/mosquitto.conf）
# ------------------------------------------------------------------
echo "[1/5] Starting Mosquitto with project config..."

# 停止可能占用 1883 端口的系统 mosquitto 服务
if command -v systemctl &>/dev/null; then
    if systemctl is-active --quiet mosquitto 2>/dev/null; then
        echo "       Stopping system mosquitto service..."
        sudo systemctl stop mosquitto
    fi
fi

# 杀掉可能残留的 mosquitto 进程
if pgrep -x mosquitto >/dev/null 2>&1; then
    echo "       Killing stale mosquitto process..."
    sudo pkill mosquitto 2>/dev/null || true
    sleep 1
fi

# 确保 data/ 和 logs/ 目录存在
mkdir -p broker/data broker/logs

# 使用项目自己的配置文件启动 Mosquitto（后台运行）
echo "       Starting: mosquitto -c broker/mosquitto.conf -d"
mosquitto -c broker/mosquitto.conf -d
sleep 1

# 验证启动成功
if pgrep -x mosquitto >/dev/null 2>&1; then
    BIND_ADDR=$(ss -tlnp | grep ':1883 ' | awk '{print $4}' || true)
    echo -e "       ${GREEN}Mosquitto started (PID $(pgrep -x mosquitto), listening on $BIND_ADDR)${NC}"
else
    echo -e "       ${RED}Mosquitto failed to start. Check broker/mosquitto.conf${NC}"
    exit 1
fi

# 快速连通性测试
if command -v mosquitto_sub &>/dev/null; then
    if timeout 3 mosquitto_sub -h localhost -t "test/check" -C 1 -W 2 -i "startup_check" 2>/dev/null; true; then
        echo "       MQTT connectivity: OK"
    fi
fi

# 确认 listener 绑定所有接口（Docker 容器需要）
if echo "$BIND_ADDR" | grep -q '127.0.0.1'; then
    echo -e "       ${RED}WARNING: Only listening on localhost. Docker containers cannot connect!${NC}"
    echo "       Check broker/mosquitto.conf has 'listener 1883' without a bind_address"
else
    echo -e "       ${GREEN}Listener OK (all interfaces) — Docker containers can connect${NC}"
fi

# ------------------------------------------------------------------
# 2. 构建镜像
# ------------------------------------------------------------------
echo "[2/5] Building robot images..."
docker-compose build

# ------------------------------------------------------------------
# 3. 启动容器
# ------------------------------------------------------------------
echo "[3/5] Starting robot containers..."
docker-compose up -d

# ------------------------------------------------------------------
# 4. 验证容器内网络连通性
# ------------------------------------------------------------------
echo "[4/5] Checking container → host MQTT connectivity..."
sleep 5
HOST_GATEWAY=$(docker exec robot-001 getent hosts host-gateway 2>/dev/null | awk '{print $1}' || echo "unknown")
echo "       Docker gateway (host-gateway): $HOST_GATEWAY"

# 从容器内测试 MQTT 连接
if docker exec robot-001 bash -c "python3 -c \"
import socket, sys
s = socket.socket()
s.settimeout(3)
try:
    s.connect(('host-gateway', 1883))
    print('OK')
except Exception as e:
    sys.exit(1)
\"" 2>/dev/null; then
    echo -e "       ${GREEN}Container → host MQTT (host-gateway:1883): reachable${NC}"
else
    echo -e "       ${RED}Container → host MQTT: UNREACHABLE${NC}"
    echo "       Check: Mosquitto listener config, firewall (sudo ufw status)"
fi

# ------------------------------------------------------------------
# 5. 等待 ROS 就绪
# ------------------------------------------------------------------
echo "[5/5] Waiting for ROS to initialize..."
for i in $(seq 1 15); do
    if docker exec robot-001 bash -c "source /opt/ros/noetic/setup.bash && rostopic list" &>/dev/null; then
        echo -e "       ${GREEN}robot-001 ROS ready!${NC}"
        break
    fi
    sleep 2
done

# 显示 ROS 话题
echo "       Active ROS topics:"
docker exec robot-001 bash -c "source /opt/ros/noetic/setup.bash && rostopic list" 2>/dev/null | sed 's/^/         /' || echo "         (waiting...)"

echo ""
echo "============================================================"
echo " Docker services running:"
docker-compose ps
echo ""
echo " Monitor logs:  docker-compose logs -f robot-001"
echo " MQTT monitor:  mosquitto_sub -h localhost -t 'robot/#' -v"
echo " Start Station: python -m station.backend.main"
echo " Verify:        python scripts/test_hybrid.py"
echo "============================================================"
