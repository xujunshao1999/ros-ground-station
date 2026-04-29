# Docker 混合测试环境

> **替代 `docs/step-1.5b-guide.md` 的手动验证流程。** 原来需要两台物理机器（Windows + Ubuntu），现在只需一台 Ubuntu，Docker 容器内跑真实 ROS Noetic + ROS1 Agent + 传感器模拟器，无需 MockAgent。

地面站（Station + Mosquitto）在 Ubuntu 原生运行，机器人端（ROS Noetic + ROS1 Agent + 传感器模拟器）在 Docker 容器中运行。

## 架构

```
Ubuntu 原生 (地面站)                      Docker (模拟机器人)
┌────────────────────────────┐     ┌──────────────────────────────┐
│ Mosquitto Broker :1883     │ MQTT│  robot-001                   │
│ (broker/mosquitto.conf)    │◄────│  ├─ roscore (ROS Noetic)     │
│                            │     │  ├─ ROS1 Agent               │
│ Station Backend :8000      │     │  │    → host-gateway:1883   │
│ (FastAPI + WebSocket)      │     │  └─ sensor_simulator         │
│                            │     │     /odom /imu/data /scan    │
│ Vue 前端 :5173             │     │                              │
└────────────────────────────┘     │  robot-002 (同上)             │
                                  └──────────────────────────────┘
```

- Robot 容器通过 `host-gateway`（Docker 网关 IP）连接宿主机 Mosquitto
- Station 通过 `localhost:1883` 连接 Mosquitto
- 每个 Robot 容器独立运行 roscore + Agent + simulator

## 与 step-1.5b 的对应关系

| step-1.5b 步骤 | Docker 版 | 说明 |
|---------------|----------|------|
| 两台机器互相 ping | 容器→宿主机 MQTT 连通性检查 | `start_hybrid_test.sh` 自动完成 |
| Windows 防火墙放行 | 不需要 | 全部本机通信 |
| 手动启动 roscore | supervisord 自动管理 | 容器启动即运行 |
| 手动 `rostopic pub` 模拟传感器 | `sensor_simulator.py` 自动发布 | /odom /imu/data /scan |
| 修改 agent/config.yaml broker_host | docker-compose.yml 环境变量 `BROKER_HOST=host-gateway` | --broker-host 覆盖 |
| `export PYTHONPATH` 解决 rospy 路径 | Dockerfile 内 `source setup.bash` 已处理 | 无 venv 冲突 |
| 手动收发指令 + mosquitto_sub 监控 | `test_hybrid.py` 自动化 | 也可手动 curl |
| 拔网线重连测试 | `docker-compose restart robot-001` | 模拟断线 |

> **前提：所有以下命令均在项目根目录执行。**
> 示例：`cd ~/ros-ground-station` 后执行。

## 快速开始

### 1. 环境准备（一次性）

位置：**任意目录**（系统级安装）

```bash
# 1. 安装系统依赖
sudo apt update
sudo apt install -y mosquitto mosquitto-clients python3-pip python3-venv

# 2. 停用系统 mosquitto 服务（用项目 broker/mosquitto.conf 自己启动）
sudo systemctl stop mosquitto
sudo systemctl disable mosquitto

# 3. 安装 Docker
#    https://docs.docker.com/engine/install/ubuntu/
```

位置：**项目根目录** `cd ~/ros-ground-station`

```bash
# 4. 🔴 注意：不要用 apt 安装 python3-paho-mqtt！
#    Ubuntu 20.04 的 python3-paho-mqtt 是 1.5.x，不兼容本项目（需要 >=2.0）
#    必须用 pip 安装：
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[station,dev]"
```

### 2. 启动全部服务

位置：**项目根目录** `~/ros-ground-station`

```bash
./scripts/start_hybrid_test.sh
```

脚本自动完成 5 步：
1. 用 `mosquitto -c broker/mosquitto.conf -d` 启动 Broker
2. 构建 Docker 镜像
3. 启动 robot-001 + robot-002 容器
4. 验证容器 → 宿主机 MQTT 网络连通（socket 测试）
5. 等待 ROS 就绪并显示话题列表

### 3. 启动 Station

位置：**项目根目录** `~/ros-ground-station`

```bash
python -m station.backend.main
```

应看到 `[MQTTHandler] Connected to broker` 和 `[Station] Robot online: robot_001 / robot_002`。

### 4. 验证

位置：**项目根目录** `~/ros-ground-station`（curl 不限目录）

```bash
# 自动化验证（10 项检查）
python scripts/test_hybrid.py

# 手动快速检查
curl http://localhost:8000/api/robots
```

### 5. 停止

位置：**项目根目录** `~/ros-ground-station`

```bash
./scripts/stop_hybrid_test.sh
```

---

## 下发指令示例

位置：**任意目录**（curl 通过 HTTP 访问 Station）

```bash
# 速度控制
curl -X POST http://localhost:8000/api/robots/robot_001/command \
  -H "Content-Type: application/json" \
  -d '{"action": "velocity", "params": {"linear": 0.5, "angular": 0.3}}'

# 停止
curl -X POST http://localhost:8000/api/robots/robot_001/command \
  -H "Content-Type: application/json" \
  -d '{"action": "stop", "params": {}}'

# 导航目标（目前返回 sent，实际导航未实现）
curl -X POST http://localhost:8000/api/robots/robot_001/command \
  -H "Content-Type: application/json" \
  -d '{"action": "return_home", "params": {}}'

# 订阅 /odom（轻量话题）
curl -X POST http://localhost:8000/api/robots/robot_001/subscribe \
  -H "Content-Type: application/json" \
  -d '{"topic": "/odom", "msg_type": "nav_msgs/Odometry", "freq_limit": 5.0}'

# 订阅 /scan（中等话题，LaserScan）
curl -X POST http://localhost:8000/api/robots/robot_001/subscribe \
  -H "Content-Type: application/json" \
  -d '{"topic": "/scan", "msg_type": "sensor_msgs/LaserScan", "freq_limit": 2.0}'

# 批量停止
curl -X POST http://localhost:8000/api/robots/batch/command \
  -H "Content-Type: application/json" \
  -d '{"robot_ids": ["robot_001", "robot_002"], "action": "stop", "params": {}}'

# 重新发现（如果 robots 列表为空）
curl -X POST http://localhost:8000/api/discover
```

> `return_home` / `nav_goal` 当前是占位实现：Agent 设 `mode=AUTO` 但不会真正导航（日志提示 "move_base not yet integrated"），不影响通信链路验证。

---

## 机器人容器内运行的服务

每个容器由 **supervisord** 管理 3 个进程：

| 进程 | 命令 | 说明 |
|------|------|------|
| roscore | `source setup.bash && roscore` | ROS 主节点 |
| agent | `source setup.bash && python -m agent.main --agent-type ros1` | MQTT 桥接，`--broker-host` 和 `--robot-id` 从环境变量传入 |
| simulator | `source setup.bash && python /app/docker/sensor_simulator.py` | 差速驱动机器人传感器模拟 |

传感器模拟器发布的话题：

| 话题 | 频率 | 消息类型 | tier |
|------|------|---------|------|
| `/odom` | 10 Hz | `nav_msgs/Odometry` | LIGHT |
| `/imu/data` | 10 Hz | `sensor_msgs/Imu` | LIGHT |
| `/scan` | 5 Hz | `sensor_msgs/LaserScan` | MEDIUM |
| `/cmd_vel` (订阅) | — | `geometry_msgs/Twist` | — |

模拟器从 `/cmd_vel` 读取速度指令，积分更新 (x, y, yaw)，发布到 `/odom`。IMU 和 LaserScan 带高斯噪声。

### 已知局限

| 局限 | 说明 | 影响 |
|------|------|------|
| 无图像数据 | `Dockerfile.ros` 未安装 `opencv-python`，topic_handler 中图像压缩退化为 JSON | 不影响当前测试（simulator 不产生图像） |
| HEAVY 话题 HTTP 流不可达 | bridge 网络下容器内 `_get_local_ip()` 返回容器 IP，宿主机无法直接访问 `http://172.x.x.x:8080/stream/...` | 不影响 MQTT 通路的轻量/中等话题 |
| `return_home` / `nav_goal` 占位 | ROS1Agent 的 `NAV_GOAL` 只设 mode=AUTO，不导航 | 指令能 sent 但无实际导航行为 |

---

## 常用调试命令

位置：**项目根目录** `~/ros-ground-station`（docker-compose / docker exec 类）或**任意目录**（curl / mosquitto_sub 类）

```bash
# === docker-compose 类：必须在项目根目录 ===

# 查看容器状态
docker-compose ps

# 查看容器日志（实时）
docker-compose logs -f robot-001

# 进入容器交互式 shell
docker exec -it robot-001 bash

# 容器内 ROS 话题列表
docker exec robot-001 bash -c "source /opt/ros/noetic/setup.bash && rostopic list"

# 容器内查看 /odom 数据（一次）
docker exec robot-001 bash -c "source /opt/ros/noetic/setup.bash && rostopic echo /odom -n 1"

# 容器内查看 /cmd_vel（验证指令送达）
docker exec robot-001 bash -c "source /opt/ros/noetic/setup.bash && rostopic echo /cmd_vel -n 1"

# 容器内查看 Agent 节点信息
docker exec robot-001 bash -c "source /opt/ros/noetic/setup.bash && rosnode info ground_station_agent_robot_001"

# === mosquitto_sub：任意目录 ===
# 监控 MQTT 消息
mosquitto_sub -h localhost -t "robot/+/status" -v
mosquitto_sub -h localhost -t "robot/+/cmd/#" -v
mosquitto_sub -h localhost -t "robot/+/sensor/#" -v

# 从容器内测试 MQTT 连通性
docker exec robot-001 bash -c "python3 -c \"
import paho.mqtt.client as mqtt
c = mqtt.Client()
c.connect('host-gateway', 1883)
print('MQTT OK from container')
c.disconnect()
\""

# 重启单个容器（模拟断线重连）
docker-compose restart robot-001

# 重新构建并启动
docker-compose up -d --build
```

---

## 网络原理

Robot 容器使用 Docker 默认 bridge 网络，通过 `extra_hosts: host-gateway:host-gateway` 将宿主机 Docker 网关地址映射为 `host-gateway`。

```
容器内 → host-gateway:1883 → Docker bridge 网关 (172.17.0.1) → 宿主机 → mosquitto (0.0.0.0:1883)
```

🔴 **关键前提：Mosquitto 必须监听 `0.0.0.0:1883`（所有接口），不能只监听 `127.0.0.1`。**

项目 `broker/mosquitto.conf` 中 `listener 1883`（无 bind_address）已正确配置。`start_hybrid_test.sh` 启动时会自动验证。

---

## 完整验证清单

> 以下 12 项对应 step-1.5b 的验证流程，Docker 版全部在同一台 Ubuntu 上完成。

- [ ] Mosquitto 监听 `0.0.0.0:1883`（`ss -tlnp | grep 1883`）
- [ ] 容器内可连接宿主机 MQTT（`start_hybrid_test.sh` 自动检查）
- [ ] robot-001/002 容器 running（`docker-compose ps`）
- [ ] roscore + agent + simulator 三个进程都运行（`docker-compose logs robot-001`）
- [ ] ROS 话题正常发布：/odom(10Hz) /imu/data(10Hz) /scan(5Hz)
- [ ] Agent 连上 MQTT Broker（日志显示 `Connected to broker`）
- [ ] Station 启动：`[MQTTHandler] Connected to broker`
- [ ] Station 发现两个机器人：`curl localhost:8000/api/robots`
- [ ] velocity 指令全链路：`POST command` → agent 收到 → `/cmd_vel` 有值 → odom 位置变化 → `/api/robots/robot_001` 状态更新
- [ ] 订阅 /scan → MQTT broker 收到 `robot/robot_001/sensor/scan` 消息
- [ ] 两个机器人独立控制互不干扰（发不同指令，各自响应）
- [ ] 断线重连：`docker-compose restart robot-001` 后 Agent 自动重连，Station 恢复在线

全部通过 → `python scripts/test_hybrid.py` 也应全部 PASS。

---

## 踩坑速查表

> 以下对应 step-1.5b 第六章踩坑速查表，调整为 Docker 场景。

| 现象 | 原因 | 解决 |
|------|------|------|
| 容器启动后 Agent 反复 crash/restart | roscore 未就绪，supervisord `autorestart=true` 正常行为 | 等 10-15s 自动恢复，日志可见重试几次后稳定 |
| `docker-compose logs` 反复刷 `Connection failed` | 容器连不上宿主机 Mosquitto | ① `ss -tlnp \| grep 1883` 确认是 `0.0.0.0` 不是 `127.0.0.1` ② `sudo ufw status` 确认 1883 放行 |
| Mosquitto 只监听 `127.0.0.1:1883` | 系统 mosquitto 配置没有 `listener 1883` | 用项目配置启动：`mosquitto -c broker/mosquitto.conf -d`（`start_hybrid_test.sh` 自动处理） |
| `mosquitto -c broker/mosquitto.conf` 报 `Address already in use` | 系统 mosquitto 服务占用了 1883 | `sudo systemctl stop mosquitto && sudo pkill mosquitto` |
| Station `broker_host` 写了 `0.0.0.0` | `0.0.0.0` 是 Server 监听地址，不是 Client 连接地址 | 改为 `localhost`（Broker 在本机） |
| `curl /api/robots` 返回空列表 | Agent 没连上或 Station 还未发 discover | 等 10s 或 `curl -X POST localhost:8000/api/discover` 手动触发 |
| 指令 status=sent 但机器人端无反应 | cmd 消息未送达或 Agent 未订阅 /cmd_vel | `mosquitto_sub -h localhost -t "robot/#" -v` 监控 MQTT 消息流向 |
| 订阅话题后无 sensor data | simulator 未启动或话题名拼写错误 | `rostopic list` 确认话题存在，`rostopic echo /odom` 确认有数据 |
| `rostopic list` 输出空 | roscore 还没启动完 | 等几秒重试，或用 `docker-compose logs robot-001` 看 roscore 进度 |
| Agent 日志 `ImportError: No module named rospy` | ROS 环境未 source | Docker 内 `supervisord.conf` 已 `source setup.bash` 处理，仅裸机手动运行时需要 |
| Agent 日志 `Unknown message type` | msg_type 格式不对，step-1.5b 提到了这个问题 | 确保 `nav_msgs/Odometry` 格式（斜杠分隔），不是 `nav_msgs.msg.Odometry` |
| `docker exec ... rostopic` 报错 | `setup.bash` 未 source | 所有 `docker exec` 内 ROS 命令前必须 `bash -c "source /opt/ros/noetic/setup.bash && ..."` |
| 容器内 Python socket 测试连不上 | host-gateway 未正确解析 | `docker exec robot-001 getent hosts host-gateway` 验证 DNS，应返回 `172.17.0.1` |

---

## 增加机器人数量

在 `docker-compose.yml` 中添加新服务：

```yaml
robot-003:
  build:
    context: .
    dockerfile: docker/Dockerfile.ros
  container_name: robot-003
  environment:
    - ROBOT_ID=robot_003
    - BROKER_HOST=host-gateway
  extra_hosts:
    - "host-gateway:host-gateway"
  restart: unless-stopped
  volumes:
    - ./protocol:/app/protocol:ro
    - ./agent:/app/agent:ro
    - ./docker/sensor_simulator.py:/app/docker/sensor_simulator.py:ro
```
