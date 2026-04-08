# Step 1.5b — Linux ROS 1 Agent 验证指南

> 两台 Ubuntu 电脑，一台做地面站，一台做机器人端，通过 MQTT 通信。
>
> ⚠️ 标注了 **🔴 高风险**、**🟡 中风险**、**🟢 注意** 三个等级的坑点，请在对应步骤特别留意。

---

## 网络拓扑

```
┌─────────────────────┐          MQTT (TCP 1883)         ┌─────────────────────┐
│   地面站 (Ubuntu A)  │◄──────────────────────────────►│   机器人端 (Ubuntu B) │
│                     │                                  │                     │
│  Mosquitto Broker   │                                  │  ROS 1 (roscore)    │
│  Station Backend    │          MQTT (TCP 1883)         │  ROS1Agent           │
│  FastAPI :8000      │◄──────────────────────────────►│  HTTP Stream :8080   │
└─────────────────────┘                                  └─────────────────────┘
      IP: 192.168.x.A                                        IP: 192.168.x.B
```

**前提：两台电脑在同一局域网，能互相 ping 通。**

---

## 一、前置准备（两台机器都要做）

### 1.1 系统要求

| 项目 | 要求 |
|------|------|
| OS | Ubuntu 20.04 (ROS Noetic) 或 Ubuntu 18.04 (ROS Melodic) |
| Python | 3.8+（推荐 3.10+） |
| ROS | ROS 1 Noetic 或 Melodic，已安装并可运行 |

> 🔴 **高风险：Python 版本兼容问题**
>
> ROS Noetic 绑定 Python 3.8，但本项目 `pyproject.toml` 写了 `requires-python = ">=3.10"`。
> 在 Noetic 机器上直接 `pip install -e .` 会报版本不兼容错误。
>
> **解决方案（三选一）：**
> 1. **推荐**：修改 `pyproject.toml`，把 `requires-python` 改为 `">=3.8"`
> 2. 使用 `pip install -e . --ignore-requires-python` 跳过检查
> 3. 用 pyenv / deadsnakes PPA 安装 Python 3.10+，但需额外处理 rospy 路径

### 1.2 安装 Python 依赖

```bash
# 确保 pip 可用
sudo apt update
sudo apt install -y python3-pip python3-venv

# 克隆/拷贝项目到两台机器
# 方式 1: git clone <repo_url>
# 方式 2: U盘/SCP 拷贝整个 ROS_Project 目录

# 🔴 高风险：不要拷贝 .venv 目录！
# .venv 里硬编码了原机器的绝对路径（Python 解释器路径、pip 脚本 shebang），
# 拷到别的机器上会报 "bad interpreter" 或引用不存在的路径。
# 如果用 U 盘全量拷贝了，先删除再重建：
#   rm -rf .venv/
# 如果想避免拷贝 .venv，可以在拷贝前先删掉，或者只拷贝必要文件。

cd /path/to/ROS_Project

# 🔴 如果是 Noetic (Python 3.8)，先修改 pyproject.toml：
#    把 requires-python = ">=3.10" 改为 requires-python = ">=3.8"
#    或者用 --ignore-requires-python 跳过

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装项目依赖
pip install -e .

# 安装地面站额外依赖（仅地面站机器需要）
pip install -e ".[station]"
```

### 1.3 验证 ROS 环境（机器人端）

```bash
# 检查 ROS 是否可用
source /opt/ros/noetic/setup.bash   # Noetic
# source /opt/ros/melodic/setup.bash  # Melodic

rosversion roslang   # 应输出 ROS 版本号

# 测试 roscore 能否启动
roscore &
# 看到 "started core service" 表示 OK
# Ctrl+C 关掉，后面正式测试时再启动
```

### 1.4 确认网络互通

```bash
# 在两台机器上互相 ping
# 地面站机器上：
ping 192.168.x.B   # 机器人端 IP

# 机器人端上：
ping 192.168.x.A   # 地面站 IP
```

如果 ping 不通，检查：
- 防火墙：`sudo ufw status`，必要时 `sudo ufw allow 1883/tcp` 和 `sudo ufw allow 8000/tcp`
- 网络是否同网段

---

## 二、地面站端操作（Ubuntu A）

### 2.1 安装 Mosquitto Broker

```bash
sudo apt install -y mosquitto mosquitto-clients

# 停掉系统自带服务（我们自己管理配置）
sudo systemctl stop mosquitto
sudo systemctl disable mosquitto
```

### 2.2 配置 Mosquitto

> 🔴 **高风险：Mosquitto 默认只监听 localhost！**
>
> Mosquitto 2.x 开始，如果配置文件里没有显式写 `listener` 指令，
> 默认只绑定 `localhost`，远程客户端（机器人端）连不上！
> 必须确保配置文件里有 `listener 1883`。

当前项目 `broker/mosquitto.conf` 已经写了 `listener 1883`，没问题。
但需要确认 Mosquitto 用的是我们的配置而不是默认配置：

```bash
cd /path/to/ROS_Project

# 检查配置文件
grep "listener" broker/mosquitto.conf
# 应该输出: listener 1883

# 如果没有这一行，手动添加：
echo "listener 1883" >> broker/mosquitto.conf
```

### 2.3 启动 Mosquitto Broker

```bash
cd /path/to/ROS_Project

# 🔴 确保 start.sh 有执行权限
chmod +x broker/start.sh

# 方式 1：用项目脚本启动
bash broker/start.sh

# 方式 2：手动启动
mosquitto -c broker/mosquitto.conf -v
```

> 🟡 **中风险：端口 1883 可能被系统 Mosquitto 占用**
>
> 如果之前 `sudo systemctl disable mosquitto` 没生效，1883 端口可能被系统服务占着。
> 排查：`sudo lsof -i :1883` 或 `sudo ss -tlnp | grep 1883`
> 解决：`sudo systemctl stop mosquitto` 或 `sudo kill <pid>`

**验证 Broker 运行：**
```bash
# 另开终端，测试 Broker 是否正常
mosquitto_sub -h localhost -t "test/topic" &
mosquitto_pub -h localhost -t "test/topic" -m "hello"
# 应该看到 "hello" 输出

# 🔴 关键：从机器人端测试远程连接
mosquitto_pub -h 192.168.x.A -t "test/topic" -m "remote_hello"
# 地面站端的 mosquitto_sub 应该看到 "remote_hello"
# 如果看不到 → 防火墙或 listener 配置问题
```

### 2.4 修改地面站配置

编辑 `station/backend/config.yaml`：

```yaml
broker_host: "localhost"   # 🟡 注意：这里是 Station 连 Broker 的地址，不是监听地址！
broker_port: 1883          # Broker 在本机，所以用 localhost

api_host: "0.0.0.0"        # 🟢 API 监听地址：0.0.0.0 允许其他机器访问
api_port: 8000

heartbeat_timeout: 30.0
```

> 🔴 **高风险：`broker_host` 不要写 `0.0.0.0`！**
>
> `0.0.0.0` 是"监听所有网卡"的意思，用在 Server 端（如 uvicorn、mosquitto）。
> 但 `broker_host` 是 **Client 连接地址**，应该写 Broker 的实际 IP。
> Broker 在本机就写 `localhost`，Broker 在远端就写远端 IP。
> 写 `0.0.0.0` 会导致 paho-mqtt 连接失败。

### 2.5 启动地面站后端

```bash
cd /path/to/ROS_Project
source .venv/bin/activate

python -m station.backend.main --broker-host localhost --broker-port 1883
```

应看到：
```
[INFO] Broker: localhost:1883
[INFO] API: 0.0.0.0:8000
[INFO] [Station] Starting API server on 0.0.0.0:8000
[INFO] [MQTTHandler] Connected to broker
```

> 🟡 **中风险：如果看不到 "Connected to broker"**
>
> 说明 Station 连不上 Broker。检查：
> 1. Broker 是否在运行：`ps aux | grep mosquitto`
> 2. 端口是否对：`ss -tlnp | grep 1883`
> 3. 用 `mosquitto_sub -h localhost -t test` 验证 Broker 是否响应

**验证 API 可访问：**
```bash
# 本机测试
curl http://localhost:8000/api/robots
# 应返回 {"robots":[]}

# 从机器人端测试（替换 IP）
curl http://192.168.x.A:8000/api/robots
# 🟡 如果本机能访问但机器人端不能 → 防火墙问题
# sudo ufw allow 8000/tcp
```

---

## 三、机器人端操作（Ubuntu B）

### 3.1 启动 ROS 环境

```bash
# 加载 ROS 环境
source /opt/ros/noetic/setup.bash

# 启动 roscore（新终端或后台）
roscore &
# 等待 "started core service" 输出
```

### 3.2 启动测试话题（模拟传感器数据）

```bash
# 如果没有实际机器人/传感器，用 ROS 自带工具发布测试数据：

# 发布虚拟速度
rostopic pub /cmd_vel geometry_msgs/Twist "linear: {x: 0.5}" -r 10 &

# 发布虚拟 IMU
rostopic pub /imu/data sensor_msgs/Imu "orientation: {w: 1.0}" -r 50 &

# 查看活跃话题
rostopic list
```

> 🟢 **注意：`rostopic pub` 的消息格式要合法**
>
> 如果 yaml 解析报错，可以用 `--` 分隔符或简化字段：
> ```bash
> rostopic pub /imu/data sensor_msgs/Imu "{orientation: {w: 1.0}}" -r 10
> ```
> 不需要填所有字段，ROS 会用默认值填充。

### 3.3 修改 Agent 配置

编辑 `agent/config.yaml`：

```yaml
robot_id: "robot_001"
broker_host: "192.168.x.A"   # 🔴 改为地面站 IP！不能是 localhost
broker_port: 1883
status_interval: 2.0
default_freq_limit: 10.0
http_stream_port: 8080
auto_reconnect: true
reconnect_delay: 5.0

# ROS 1 特有（当前代码未使用，可忽略）
# ros_master_uri: "http://localhost:11311"
# ros_namespace: "/"
```

> 🔴 **高风险：`broker_host` 必须是地面站的实际 IP**
>
> 如果是 `localhost`，Agent 会尝试连接本机的 Broker，但机器人端没有运行 Broker。
> 症状：Agent 启动后一直重连，日志刷 `[Agent] Connection failed`。

### 3.4 启动 ROS 1 Agent

> 🔴 **高风险：rospy 与 venv 的 Python 路径冲突**
>
> `rospy` 安装在系统 Python 的 `/opt/ros/noetic/lib/python3/dist-packages/`，
> venv 环境看不到这个路径，直接启动会报 `ImportError: No module named rospy`。
>
> **必须在启动前注入 ROS 的 Python 路径。**

```bash
cd /path/to/ROS_Project

# 🔴 关键：按此顺序 source！
source /opt/ros/noetic/setup.bash    # 1. 先 source ROS
source .venv/bin/activate             # 2. 再激活 venv

# 🔴 关键：注入 ROS 的 Python 路径到 venv
export PYTHONPATH="/opt/ros/noetic/lib/python3/dist-packages:$PYTHONPATH"

# 🔴 关键：Noetic 用 Python 3.8，venv 的 pip 可能装了 Python 3.10+ 的包
# 确认 Python 版本一致：
python --version   # 应该和系统的 python3 一致

# 启动 Agent
python -m agent.main \
    --agent-type ros1 \
    --broker-host 192.168.x.A \
    --robot-id robot_001
```

应看到：
```
[INFO] Robot ID: robot_001
[INFO] Broker: 192.168.x.A:1883
[INFO] Agent type: ros1
[INFO] [ROS1Agent] ROS node initialized: ground_station_agent_robot_001
[INFO] [Agent] Connected to MQTT broker
[INFO] [ROS1Agent] HTTP stream server started on port 8080
```

> 🟡 **中风险：如果 `--agent-type ros1` 报 ImportError**
>
> 即使加了 `PYTHONPATH`，如果 venv 的 Python 版本和系统 Python 版本不一致（比如 venv 用 3.10，rospy 是 3.8 编译的），rospy 的 .so 文件会加载失败。
>
> 解决方案：确保 `python3 -m venv .venv` 用的是系统自带的 python3：
> ```bash
> /usr/bin/python3 -m venv .venv   # 用系统 Python 创建 venv
> ```
> 或者放弃 venv，直接在系统 Python 环境装依赖：
> ```bash
> pip3 install --user paho-mqtt pyyaml numpy opencv-python
> python3 -m agent.main --agent-type ros1 --broker-host 192.168.x.A
> ```

> 🟡 **中风险：rospy.init_node 必须在主线程**
>
> ROS 1 的 `rospy.init_node()` 必须在主线程调用。
> 当前代码中 `ROS1Agent.start()` 在主线程调用 `rospy.init_node()`，
> 然后调用 `super().start()` → `BaseAgent.start()` → `loop_forever()` 阻塞主线程。
> 这在当前实现下是 OK 的（rospy 的回调在 ROS 自己的线程里跑），
> 但如果未来改成异步启动可能会出问题。

> 🟢 **注意：看到 "ROS node initialized" 就说明 rospy 没问题了**
>
> 如果走到这一步还没报错，rospy 相关的坑已经全过了。

---

## 四、端到端验证

### 4.1 发现测试

地面站端：
```bash
curl -X POST http://localhost:8000/api/discover
# 应返回 {"status":"discover_sent"}
```

机器人端日志应显示：
```
[Agent] Received discover request
```

> 🟡 **中风险：如果机器人端没收到 discover**
>
> 可能原因：
> 1. Agent 还没连上 Broker → 检查 Agent 日志是否有 "Connected"
> 2. Station 发的 discover 消息在 Agent 连接之前就发了 → 等 5 秒再试一次
> 3. 重新发送 discover：`curl -X POST http://localhost:8000/api/discover`

### 4.2 查看在线机器人

```bash
curl http://localhost:8000/api/robots
```

应返回：
```json
{
  "robots": [
    {
      "robot_id": "robot_001",
      "online": true,
      "last_status": { ... }
    }
  ]
}
```

> 🔴 **高风险：如果返回空 `{"robots":[]}`**
>
> 按顺序排查：
> 1. Agent 日志是否显示 "Connected to MQTT broker"？
> 2. Agent 日志是否在定期发 status？→ 应该每 2 秒打一次
> 3. Station 日志是否收到 status？→ 用 `mosquitto_sub` 确认：
>    ```bash
>    # 在地面站上监控
>    mosquitto_sub -h localhost -t "robot/#" -v
>    ```
>    应该看到 `robot/robot_001/status` 的消息
> 4. Station 连的 Broker 和 Agent 连的 Broker 是不是同一个？
>    → Station 用 localhost，Agent 用地面站 IP，理论上指向同一台 Broker

### 4.3 发送控制指令

```bash
# 速度控制
curl -X POST http://localhost:8000/api/robots/robot_001/command \
  -H "Content-Type: application/json" \
  -d '{"action": "velocity", "params": {"linear": 0.3, "angular": 0.1}}'

# 停止
curl -X POST http://localhost:8000/api/robots/robot_001/command \
  -H "Content-Type: application/json" \
  -d '{"action": "stop", "params": {}}'

# 返航
curl -X POST http://localhost:8000/api/robots/robot_001/command \
  -H "Content-Type: application/json" \
  -d '{"action": "return_home", "params": {}}'
```

> 🟡 **中风险：指令发送成功但无 ack**
>
> 正常情况下 curl 应返回 `{"exec_id": "...", "status": "sent"}`，
> 然后机器人端应收到指令并回复 ack。
> 如果 `status: sent` 但机器人端没反应：
> 1. 用 `mosquitto_sub -h 192.168.x.A -t "robot/robot_001/cmd" -v` 确认指令是否到达
> 2. 检查 Agent 是否收到 cmd → 看 Agent 日志是否有 "Received command"
> 3. 检查 ack 是否回不来 → `mosquitto_sub -h 192.168.x.A -t "robot/robot_001/cmd/ack" -v`

> 🟢 **注意：`return_home` 当前是占位实现**
>
> ROS1Agent 收到 `return_home` 会设 `mode=AUTO` 但不会真正导航，
> 日志会提示 "move_base not yet integrated"。这不影响通信验证。

### 4.4 Topic 订阅

```bash
curl -X POST http://localhost:8000/api/robots/robot_001/topics/subscribe \
  -H "Content-Type: application/json" \
  -d '{"topic": "/imu/data", "msg_type": "sensor_msgs/Imu", "freq_limit": 10}'
```

> 🔴 **高风险：如果 Agent 订阅 ROS 话题失败**
>
> 可能原因：
> 1. `msg_type` 不对 → 确保 `sensor_msgs/Imu` 这样的格式，不是 `sensor_msgs.msg.Imu`
> 2. ROS 消息模块 import 失败 → `_get_ros_msg_class` 通过 `importlib` 动态加载，
>    如果 ROS 的 msg 包没装全，`sensor_msgs.msg` 可能没有 Imu 类
> 3. 话题不存在但 roscore 在跑 → rospy.Subscriber 不会报错，只是没数据
>
> 排查：`rostopic list | grep imu` 确认话题存在

> 🟡 **中风险：传感器数据太大导致 MQTT 消息超限**
>
> MQTT 默认最大消息大小 256MB，一般够用。但如果原始图像/点云不经压缩直接发，
> 单帧可能几 MB，通过 JSON+base64 编码后会膨胀 ~33%。
> 当前 HEAVY 数据应该走 HTTP 流而不是 MQTT，但代码中 `publish_sensor_data`
> 对 MEDIUM/HEAVY 数据仍走 MQTT（Phase 3 才完善 HTTP 拉流端）。
> 对于 1.5b 验证，先订阅轻量话题（IMU、Odometry）即可，避免大数据问题。

### 4.5 MQTT 消息监控（可选调试）

在任意机器上用 `mosquitto_sub` 监控所有消息：
```bash
mosquitto_sub -h 192.168.x.A -t "robot/#" -v
mosquitto_sub -h 192.168.x.A -t "station/#" -v
```

> 🟢 **注意：如果从机器人端监控，Broker IP 用地面站的**
>
> `mosquitto_sub -h 192.168.x.A`，不是 localhost。

---

## 五、依赖清单

### 地面站端（Ubuntu A）

| 依赖 | 安装方式 | 说明 |
|------|---------|------|
| Python 3.8+ | `sudo apt install python3` | 系统自带通常够用 |
| pip + venv | `sudo apt install python3-pip python3-venv` | |
| Mosquitto | `sudo apt install mosquitto mosquitto-clients` | MQTT Broker |
| paho-mqtt ≥ 2.0 | `pip install -e .` | MQTT 客户端 |
| FastAPI ≥ 0.104 | `pip install -e ".[station]"` | Web 框架 |
| uvicorn ≥ 0.24 | `pip install -e ".[station]"` | ASGI 服务器 |
| pyyaml ≥ 6.0 | `pip install -e .` | 配置文件 |
| websockets ≥ 12.0 | `pip install -e ".[station]"` | WebSocket |

### 机器人端（Ubuntu B）

| 依赖 | 安装方式 | 说明 |
|------|---------|------|
| Python 3.8+ | `sudo apt install python3` | |
| pip + venv | `sudo apt install python3-pip python3-venv` | |
| ROS 1 (Noetic/Melodic) | 按官网教程安装 | 提供 rospy |
| paho-mqtt ≥ 2.0 | `pip install -e .` | MQTT 客户端 |
| pyyaml ≥ 6.0 | `pip install -e .` | 配置文件 |
| numpy ≥ 1.24 | `pip install -e .` | 点云处理 |
| opencv-python ≥ 4.8 | `pip install -e .` | 图像压缩 |

### 一键安装命令

**地面站端：**
```bash
sudo apt install -y python3-pip python3-venv mosquitto mosquitto-clients
cd /path/to/ROS_Project
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[station]"
```

**机器人端：**
```bash
sudo apt install -y python3-pip python3-venv
# 确保 ROS 1 已安装
source /opt/ros/noetic/setup.bash
cd /path/to/ROS_Project
/usr/bin/python3 -m venv .venv && source .venv/bin/activate   # 🔴 用系统 Python 创建
pip install -e .
```

---

## 六、踩坑速查表

| 步骤 | 问题 | 症状 | 解决 |
|------|------|------|------|
| 1.2 | 拷贝了旧的 .venv | `bad interpreter` 或 `No such file or directory` | 删掉 `.venv/` 后重建：`python3 -m venv .venv && pip install -e .` |
| 1.2 | Python 版本不兼容 | `pip install -e .` 报 Requires-Python ≥3.10 | 改 `pyproject.toml` 为 `>=3.8`，或加 `--ignore-requires-python` |
| 2.2 | Mosquitto 只监听 localhost | 机器人端连不上 Broker | 确认 `mosquitto.conf` 里有 `listener 1883` |
| 2.3 | 端口被占用 | `Address already in use` | `sudo systemctl stop mosquitto` 或 `sudo kill <pid>` |
| 2.4 | broker_host 写了 0.0.0.0 | Station 连不上 Broker | 改为 `localhost`（Broker 在本机时） |
| 3.4 | rospy 找不到 | `ImportError: No module named rospy` | `export PYTHONPATH="/opt/ros/noetic/lib/python3/dist-packages:$PYTHONPATH"` |
| 3.4 | venv Python 版本和 rospy 不一致 | `ImportError: ... undefined symbol` | 用 `/usr/bin/python3 -m venv .venv` 创建 venv |
| 3.4 | Agent 连不上 Broker | 日志一直刷 "Connection failed" | 检查 `broker_host` 是否为地面站 IP |
| 4.2 | robots 列表为空 | `{"robots":[]}` | Agent 没连上 / status 没发 / Broker 不通 |
| 4.3 | 指令无 ack | curl 返回 sent 但无响应 | 用 mosquitto_sub 确认消息流转 |
| 4.4 | 订阅 ROS 话题失败 | Agent 日志报 Unknown message type | 确认 msg_type 格式正确，ROS msg 包已安装 |
| 4.4 | 大数据 MQTT 崩溃 | 传图像/点云时断连 | Phase 1 先只订阅轻量话题（IMU/odom） |

---

## 七、验证检查清单

- [ ] 两台机器能互相 ping 通
- [ ] 地面站 Mosquitto Broker 启动成功，**远程客户端能连**
- [ ] 地面站后端 API 可访问 (`/api/robots` 返回 `[]`)
- [ ] **机器人端能远程访问地面站 API** (`curl http://192.168.x.A:8000/api/robots`)
- [ ] 机器人端 roscore 启动成功
- [ ] 机器人端 ROS1Agent 连上 Broker（日志显示 CONNECTED）
- [ ] 地面站 discover 后能看到 robot_001 在线
- [ ] 发送 velocity 指令，机器人端收到并 ack
- [ ] 发送 stop 指令，机器人端停止
- [ ] 订阅轻量 ROS topic（如 /imu/data），地面站能收到传感器数据
- [ ] 拔网线后重连，Agent 自动恢复（auto_reconnect）

全部通过 → **Step 1.5b 验证完成** ✅
