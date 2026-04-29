# ROS 地面站项目 — 架构与执行计划

## 一、项目概述

开发一套基于 MQTT 的地面站控制系统，实现一对多机器人管理。ROS 仅在机器人本地运行，跨机器通信走 MQTT + JSON，地面站与 ROS 版本解耦。

**开发环境：** Windows（无 ROS），使用 Mock Agent 模拟机器人进行开发，真实 ROS Agent 在 Linux 环境测试。

**地面站跨平台：** 地面站所有组件（Mosquitto Broker、FastAPI 后端、Vue 前端、SQLite）均为跨平台设计，Windows 和 Linux 均可直接运行，代码无需修改。部署时仅需适配启动方式（Windows: .bat / Linux: systemd / Docker Compose）。

## 二、项目目录结构

```
ROS_Project/
├── protocol/                  # 消息协议定义（最核心，无 ROS 依赖）
│   ├── __init__.py
│   ├── messages.py            # 消息格式定义（dataclass）
│   ├── topics.py              # MQTT topic 常量和生成函数
│   └── topic_registry.py      # 话题类型注册表（轻量/中等/重量分类）
│
├── agent/                     # 机器人端桥接代理
│   ├── __init__.py
│   ├── base_agent.py          # 抽象基类（所有 Agent 的接口）
│   ├── mock_agent.py          # 模拟 Agent（Windows 开发测试用）
│   ├── ros1_agent.py          # ROS 1 实现（Linux 环境）
│   ├── ros2_agent.py          # ROS 2 实现（后续）
│   ├── topic_handler.py       # 话题分层处理（轻量/中等/重量）
│   ├── rate_limiter.py        # 按话题独立限频
│   ├── config.yaml            # Agent 配置
│   └── main.py                # Agent 启动入口
│
├── station/                   # 地面站
│   ├── backend/               # Python 后端
│   │   ├── __init__.py
│   │   ├── main.py            # 启动入口
│   │   ├── mqtt_handler.py    # MQTT 通信处理
│   │   ├── robot_manager.py   # 机器人管理
│   │   ├── api.py             # FastAPI + WebSocket API
│   │   └── config.yaml        # 后端配置
│   ├── frontend/              # Web 前端（Phase 2）
│   │   ├── src/
│   │   └── package.json
│   └── config.yaml
│
├── broker/                    # MQTT Broker 配置
│   ├── mosquitto.conf         # Mosquitto 配置（跨平台通用）
│   ├── start.bat              # Windows 启动脚本
│   └── start.sh               # Linux 启动脚本
│
├── docs/                      # 文档
│   ├── protocol.md            # 通信协议文档
│   └── step-1.5b-guide.md     # Linux ROS Agent 验证指南
│
├── pyproject.toml             # 项目依赖管理
├── project-plan.md            # 本文件
└── README.md
```

## 三、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         地面站 (Station)                         │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────────┐ │
│  │  MQTT    │    │   业务逻辑层  │    │      Web 前端          │ │
│  │  Broker  │◄──►│              │◄──►│                       │ │
│  │(Mosquitto)│   │ - 连接管理    │    │ - 机器人状态面板       │ │
│  └──────────┘    │ - Topic 路由  │    │ - 控制面板            │ │
│                  │ - 指令调度    │    │ - 视频显示            │ │
│                  │ - 数据录制    │    │ - 日志/告警           │ │
│                  └──────────────┘    └───────────────────────┘ │
│                         ▲                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │ MQTT (TCP)
              ┌───────────┼───────────┐
              │           │           │
    ┌─────────┴──┐  ┌────┴─────┐  ┌──┴─────────┐
    │  Robot A   │  │ Robot B  │  │  Robot C    │
    │ ┌───────┐  │  │┌───────┐│  │ ┌───────┐   │
    │ │Agent  │  │  ││Agent  ││  │ │Agent  │   │
    │ │(ROS1) │  │  ││(ROS2) ││  │ │(ROS1) │   │
    │ └───┬───┘  │  │└───┬───┘│  │ └───┬───┘   │
    │  ┌──┴──┐   │  │ ┌──┴──┐ │  │  ┌──┴──┐    │
    │  │ROS  │   │  │ │ROS  │ │  │  │ROS  │    │
    │  │本地 │   │  │ │本地 │ │  │  │本地 │    │
    │  └─────┘   │  │ └─────┘ │  │  └─────┘    │
    └────────────┘  └─────────┘  └─────────────┘
```

## 四、技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 跨机器通信 | MQTT 5.0 (Mosquitto) | 轻量、QoS、断线重连 |
| 序列化 | JSON（开发期）→ MessagePack（优化期） | 可读性优先，后续压缩 |
| Agent | Python 3.8+（兼容 Noetic） | 先 rospy，后 rclpy |
| 地面站后端 | Python + FastAPI + asyncio | MQTT 客户端 + WebSocket 推送 |
| 地面站前端 | Vue 3 + TypeScript + Vite | Dashboard 型界面 |
| 视频 | MJPEG 流（Phase 3）→ WebRTC（Phase 5） | 先跑通再优化 |
| 数据存储 | SQLite（轻量，单机足够） | 状态历史、日志 |

**跨平台编码规范：**
- 文件路径统一使用 `pathlib.Path`，不拼接字符串
- 换行符不硬编码，依赖 Python 默认处理
- 配置文件使用 YAML/JSON，不依赖平台特定路径
- 进程管理通过 Python `subprocess`，不直接调用平台命令

## 五、消息协议设计

### 5.1 消息通用格式

```json
{
  "ver": "1.0",
  "ts": 1712582400,
  "src": "robot_001",
  "dst": "station",
  "type": "status",
  "seq": 42,
  "data": { ... }
}
```

### 5.2 话题分层传输策略

不同类型的话题数据量差异巨大，需要按类型选择不同的传输通道和处理策略：

| 话题类型 | 典型消息 | 单帧大小 | 传输方式 | 说明 |
|---------|---------|---------|---------|------|
| 轻量 | IMU、GPS、里程计、Twist | < 10KB | MQTT + JSON | 直接序列化，频率可控 |
| 中等 | 压缩图像、LaserScan | 10KB - 1MB | MQTT + 二进制 | 限频 + 压缩，二进制 payload |
| 重量 | 原始图像、PointCloud2 | > 1MB | HTTP 流 + MQTT 信令 | 独立流通道，MQTT 只传元信息 |

**Agent 自动识别策略：**
```python
TOPIC_HANDLER_MAP = {
    # 轻量 → MQTT + JSON
    "sensor_msgs/Imu": "light",
    "sensor_msgs/NavSatFix": "light",
    "nav_msgs/Odometry": "light",
    "geometry_msgs/Twist": "light",
    "std_msgs/*": "light",
    
    # 中等 → MQTT + 二进制
    "sensor_msgs/CompressedImage": "medium",
    "sensor_msgs/Image": "medium",
    "sensor_msgs/LaserScan": "medium",
    
    # 重量 → HTTP 流 + MQTT 信令
    "sensor_msgs/PointCloud2": "heavy",
}
```

**频率控制：** 所有类型均支持频率限制，地面站请求订阅时指定 `freq_limit`，Agent 按频率转发。

**压缩/降采样选项：**
- 图像：JPEG 质量控制、分辨率缩放
- 点云：体素降采样（voxel_size）
- LaserScan：角度范围裁剪

### 5.3 MQTT Topic 规范

| Topic | 方向 | QoS | 用途 |
|-------|------|-----|------|
| `robot/{id}/status` | Robot → Station | 1 | 心跳 + 状态上报 |
| `robot/{id}/sensor/{name}` | Robot → Station | 0 | 传感器数据（按需订阅，轻量/中等） |
| `robot/{id}/sensor/{name}/meta` | Robot → Station | 1 | 重量话题元信息（流地址、大小等） |
| `robot/{id}/cmd` | Station → Robot | 1 | 控制指令 |
| `robot/{id}/cmd/ack` | Robot → Station | 1 | 指令确认 |
| `robot/{id}/event` | Robot → Station | 1 | 告警/异常事件 |
| `station/discover` | Station → Robot | 1 | 发现请求（谁在线） |
| `station/topic/request` | Station → Robot | 1 | 请求订阅/取消 topic |
| `station/topic/response` | Robot → Station | 1 | 订阅请求确认 |

### 5.4 核心消息类型

**状态上报 (status)**
```json
{
  "data": {
    "battery": 72,
    "position": {"x": 1.2, "y": 3.4, "theta": 0.5},
    "velocity": {"linear": 0.3, "angular": 0.1},
    "mode": "auto",
    "ros_version": "1",
    "uptime": 3600,
    "ip": "192.168.1.101"
  }
}
```

**控制指令 (cmd)**
```json
{
  "data": {
    "action": "velocity",
    "params": {"linear": 0.5, "angular": 0.0},
    "exec_id": "abc123"
  }
}
```

**指令确认 (cmd/ack)**
```json
{
  "data": {
    "exec_id": "abc123",
    "result": "ok",
    "message": ""
  }
}
```

**发现 (discover)**
```json
{
  "src": "station",
  "data": {
    "request_id": "xyz789"
  }
}
```

**Topic 订阅请求 (topic/request)**
```json
{
  "src": "station",
  "dst": "robot_001",
  "data": {
    "action": "subscribe",
    "topic": "/camera/image_raw/compressed",
    "msg_type": "sensor_msgs/CompressedImage",
    "freq_limit": 10,
    "options": {
      "transport": "auto",
      "compression": {
        "quality": 60,
        "resize": [320, 240],
        "voxel_size": 0.1
      }
    }
  }
}
```

**重量话题元信息 (sensor/{name}/meta)**
```json
{
  "src": "robot_001",
  "dst": "station",
  "type": "sensor_meta",
  "data": {
    "topic": "/lidar/points",
    "msg_type": "sensor_msgs/PointCloud2",
    "transport": "http_stream",
    "stream_url": "http://192.168.1.101:8080/stream/lidar/points",
    "points": 50000,
    "size_bytes": 800000
  }
}
```

## 六、分步执行计划

---

### Phase 1：基础设施 — 通信链路跑通

**目标：** 一个 Agent 能通过 MQTT 连上 Broker，地面站后端能收到消息。

**开发环境说明：** 当前在 Windows 上开发，无 ROS 环境。因此先用 Mock Agent 模拟机器人，验证完整通信链路。ROS Agent 在两台 Ubuntu 实体机上实测（一台地面站 + 一台机器人端）。

```
Windows 开发环境：
  Mock Agent → MQTT Broker → 地面站后端 → (后续前端)

Linux 测试环境（两台 Ubuntu 实体机）：
  机器人端：roscore → ROS 1 Agent ──MQTT──► 地面站端：Mosquitto Broker + Station Backend
```

#### Step 1.1：项目骨架搭建 ✅
- [x] 创建项目目录结构
- [x] 初始化 Python 虚拟环境（venv）
- [x] 创建 `pyproject.toml`（依赖管理）
- [x] 创建 `protocol/messages.py` — 消息格式定义（dataclass）
- [x] 创建 `protocol/topics.py` — MQTT topic 常量和生成函数
- [x] 创建 `protocol/topic_registry.py` — 话题类型注册表（轻量/中等/重量分类）
- [x] 编写协议文档 `docs/protocol.md`

**产出：** 项目骨架 + 消息协议代码 + 协议文档

#### Step 1.2：MQTT Broker 部署 ✅
- [x] 安装 Mosquitto（Windows: 官网安装包 / Linux: `apt install mosquitto`）
- [x] 配置 `mosquitto.conf`（端口、认证、日志，配置项跨平台通用）
- [x] 编写启动脚本（`broker/start.bat` for Windows, `broker/start.sh` for Linux）
- [x] 验证 Broker 运行正常（`mosquitto_sub` / `mosquitto_pub` 测试）
- [x] 纯 Python 备用 Broker（`broker/start_pybroker.py`，amqtt）

**产出：** 可用的 MQTT Broker + 备用 Python Broker

#### Step 1.3：Agent 框架 + Mock Agent（Windows 开发） ✅
- [x] 实现 `agent/base_agent.py` — 抽象基类，定义所有接口
- [x] 实现 `agent/topic_handler.py` — 话题分层处理：
  - 轻量话题：JSON 序列化 + MQTT
  - 中等话题：二进制序列化 + MQTT（压缩图像、LaserScan）
  - 重量话题：HTTP 流 + MQTT 信令（原始图像、点云）
- [x] 实现 `agent/rate_limiter.py` — 按话题独立限频
- [x] 实现 `agent/mock_agent.py` — 模拟 Agent（Windows 开发测试用）：
  - 继承 BaseAgent，实现所有接口
  - 模拟状态上报（生成移动轨迹、电量变化等）
  - 模拟传感器数据（OpenCV 生成测试图像、numpy 生成随机点云）
  - 模拟指令接收和确认
  - 重量话题 HTTP 流服务端（模拟）
- [x] Agent 配置文件 `agent/config.yaml`（broker 地址、robot_id、上报频率、HTTP 流端口等）
- [x] Windows 本地测试：Mock Agent 连上 Broker，手动用 MQTT 客户端模拟地面站收发

**产出：** 能在 Windows 上独立运行的 Mock Agent，验证完整通信链路

#### Step 1.4：地面站后端 — MQTT 通信层（Windows 开发） ✅
- [x] 实现 `station/backend/mqtt_handler.py`：
  - 连接 Broker
  - 订阅所有 `robot/+/status`、`robot/+/cmd/ack`、`robot/+/event`
  - 发送 `station/discover` 发现机器人
  - 发送 `station/topic/request` 请求订阅
  - 发送 `robot/{id}/cmd` 控制指令
- [x] 实现 `station/backend/robot_manager.py`：
  - 管理已连接机器人列表（上线、离线、心跳超时检测）
  - 存储各机器人最新状态
  - 指令执行追踪（exec_id 匹配 ack）
- [x] 实现 `station/backend/api.py`（FastAPI + REST API 框架）
- [x] 实现 `station/backend/main.py` — 启动入口，MQTT + API 联动
- [x] 基本日志输出（终端打印收到的消息）

**产出：** 地面站后端能发现 Mock Agent，能收发消息

#### Step 1.5：端到端验证（Windows 先行 + Linux 后验）

**1.5a — Windows 验证（Mock Agent） ✅**
- [x] 启动 Mosquitto Broker
- [x] 启动 Mock Agent
- [x] 启动地面站后端
- [x] 验证：发现 → 状态上报 → 指令下发 → 确认 → Topic 订阅

**1.5b — Linux 验证（真实 ROS Agent）**
- [x] 实现 `agent/ros1_agent.py`（继承 BaseAgent，桥接 ROS 1 话题和 MQTT）
  - 订阅 ROS 话题 → 转发到 MQTT（限频支持）
  - MQTT 控制指令 → 发布 ROS cmd_vel / 自定义话题
  - HTTP 流服务端（重量话题）
  - 自动获取 ROS 活跃话题列表
- [x] 编写验证指南 `docs/step-1.5b-guide.md`（两台 Ubuntu 电脑部署+踩坑标注）
- [x] 修复 Python 3.8 兼容性（Noetic 用 Python 3.8）：
  - `pyproject.toml` requires-python 从 `>=3.10` 降为 `>=3.8`
  - 所有 .py 文件添加 `from __future__ import annotations`
- [ ] 在两台 Ubuntu 实体机上实际测试：
  - 地面站端：Mosquitto Broker + Station Backend
  - 机器人端：roscore + ROS 1 Agent
  - 验证：发现 → 状态上报 → 指令下发 → 确认 → Topic 订阅

**Phase 1 完成标志：** Mock Agent 在 Windows 上完整跑通 ✅；`ros1_agent.py` 已实现 ✅；Python 3.8 兼容性修复 ✅；真实 ROS Agent 在 Linux 上与地面站通信正常（待两台 Ubuntu 实测）。

---

### Phase 2：地面站 GUI

**目标：** 地面站有可视化界面，能显示机器人状态，能发控制指令。

#### Step 2.1：前端项目搭建 ✅
- [x] 初始化 Vue 3 + TypeScript + Vite 项目
- [x] 安装依赖：Element Plus（UI 组件）、ECharts（图表）、Pinia（状态管理）
- [x] 配置代理，对接后端 WebSocket

**产出：** 前端项目骨架

#### Step 2.2：后端 WebSocket API ✅
- [x] 实现 `station/backend/ws_manager.py` — WebSocket 连接管理器（连接池、广播、线程安全推送）
- [x] 实现 `station/backend/api.py`（FastAPI）：
  - `ws://station/live` — WebSocket 主通道
  - 推送：机器人上线/离线、状态更新、告警事件、指令确认
  - 接收：控制指令、Topic 订阅请求、发现请求、心跳
  - 连接初始化时推送当前所有机器人状态快照
- [x] 实现 `station/backend/main.py` — 启动入口，MQTT + WebSocket 联动
  - RobotManager 回调 → api.push_* → WsManager.broadcast_sync
- [x] 前端 WebSocket 客户端：`useWebSocket` composable + `useGlobalWebSocket`
  - 自动连接/指数退避重连
  - 心跳保活（ping/pong）
  - 消息分发到 Pinia store

**产出：** 后端 WebSocket 接口 + 前端 WebSocket 客户端

#### Step 2.3：前端 — 机器人列表与状态面板 ✅
- [x] 布局：左侧机器人列表 + 右侧详情区
- [x] 机器人列表卡片：ID、在线状态、电量、模式
- [x] 机器人详情面板：
  - 基本状态（位置、速度、电量、运行时间、ROS版本、IP）
  - 实时数据图表（电量曲线、线速度+角速度曲线，ECharts 按需加载）
  - 运行模式显示（Auto/Manual/Stop，颜色区分）
- [x] Store 历史数据记录（每个机器人最多 120 个数据点，WebSocket status_update 自动追加）

**产出：** 能看到机器人状态的界面

#### Step 2.4：前端 — 控制面板 ✅
- [x] 速度控制：线速度/角速度滑块 + 发送按钮
- [x] 模式切换：自动/手动/停止 + 紧急停止 + 返航
- [x] 自定义指令发送（高级模式，折叠面板输入 topic + JSON）
- [x] 指令执行状态追踪（发送 → 等待 ack → 成功/失败/超时）
- [x] Store 指令追踪：pendingCommands Map + sendCommand action + handleCmdAck + 超时检测
- [x] WebSocket send 注入：useGlobalWebSocket 将 send 注册到 store

**产出：** 能操控机器人的界面

#### Step 2.5：前端 — Topic 订阅管理 ✅
- [x] Topic 列表展示（从 Agent 获取）
- [x] 订阅/取消订阅按钮
- [x] 已订阅 Topic 数据实时展示（表格/图表）
- [x] 订阅频率控制
- [x] 后端链路补全：topic_response + sensor_data → RobotManager → WebSocket 推送

**产出：** 能管理 Topic 订阅的界面

#### Step 2.6：前端 — 设计令牌统一 & 视觉打磨 ✅
- [x] 补全 `global.scss` 设计令牌体系（状态色/间距/圆角/阴影/字体层级）
- [x] 主色调调整：Element Plus 默认蓝 → Sentry/PostHog 风格 indigo/purple
- [x] 消灭组件内硬编码颜色，统一走 CSS 变量（DashboardView / AppLayout / RobotStatusPanel / RobotCharts / ControlPanel / CommandTracker / TopicManager）
- [x] 卡片层次感：微阴影 + hover 边框高亮 + 交互反馈
- [x] 字体层级系统化：标题/正文/标签/数字 的 size + weight 规则
- [x] 数据密度调优：行间距/内边距收紧，匹配 Sentry 高密度风格

**产出：** 统一的设计令牌 + 视觉一致的深色仪表盘界面

**Phase 2 完成标志：** 地面站 GUI 能显示机器人状态、发送控制指令、管理 Topic 订阅、视觉风格统一。✅

---

### Phase 3：多机器人 + 增强功能

**目标：** 支持多台机器人同时连接，加入视频流、数据录制等实用功能。

#### Step 3.1：多机器人管理 ✅
- [x] 前端支持多机器人同时展示（Grid 布局 / Tab 切换）✅
- [x] 后端机器人管理器支持并发（异步处理多 Agent 消息）✅
- [x] 批量指令下发（全停、全返航等）✅
- [x] 机器人分组/标签 ✅

#### Step 3.2：视频流与点云可视化 ✅
- [x] Agent 端：点云生成 + 体素降采样 + HTTP 流服务端 ✅
- [x] 后端 MQTT 订阅 `robot/+/sensor/+/meta` ✅
- [x] 后端：分离 sensor_meta 处理，流代理端点 ✅
- [x] 前端：Three.js 点云渲染组件 ✅
- [x] 前端：基于 MQTT + base64 JPEG 的实时相机显示 ✅

#### Step 3.3：数据录制与回放 ✅
- [x] 后端：SQLite 存储历史状态数据 ✅
- [x] 录制控制：开始/暂停/停止 ✅
- [x] 前端录制按钮（红色脉冲圆点）+ 历史面板（ECharts + 时间范围选择 + CSV导出）✅

#### Step 3.4：告警系统 ✅
- [x] Agent 端：MockAgent 模拟事件生成（每 10s 随机 info/warning/error 级别事件）
- [x] 后端：RobotManager 事件存储（每条机器人保留最近 50 条）
- [x] 后端 API：`GET /api/robots/{id}/events?level=...` 查询告警
- [x] WebSocket 推送：事件通过 `event` 类型消息实时推送到前端
- [x] 前端 Store：替换 `case 'event'` 占位符为实际处理逻辑
- [x] 前端 AlertPanel 组件：固定右上角浮动通知面板，未读计数红点
- [x] 前端通知：按级别颜色区分（info=蓝、warning=黄、error=红），支持按级别过滤
- [x] 告警规则引擎（电量阈值、通信超时自动检测、位置越界等）✅
- [x] 告警历史记录（SQLite 持久化 + 前端 Load history 加载）✅

#### Step 3.5：机器人间通信（Fleet Data）✅
- [x] 协议层：新增 `robot/{src}/to/{dst}` topic + `FLEET_DATA` 消息类型 + `FleetData` dataclass ✅
- [x] Agent：`_on_connect` 新增通配符订阅 `robot/+/to/{self_id}` ✅
- [x] Agent：`send_to_robot()`, `share_heavy_data()`, `_handle_fleet_message()`, `_on_fleet_message()` 抽象 ✅
- [x] MockAgent：实现 `_on_fleet_message` 日志输出 ✅
- [x] ROS1Agent：实现 `_on_fleet_message` → ROS `/fleet/incoming` 话题桥接 ✅
- [x] 轻量数据走 MQTT JSON，重量数据（点云）复用 HTTP 流 + MQTT 信令 ✅

**Phase 3 完成标志：** 多机器人完整管理，有视频、录制、告警。

---

### Phase 4：ROS 2 支持 + 通用化

**目标：** 支持 ROS 2，打磨为通用软件。

#### Step 4.1：ROS 2 Agent
- [ ] 实现 `agent/ros2_agent.py`
- [ ] 接口与 ROS 1 Agent 完全一致
- [ ] 处理 ROS 2 特有问题（节点生命周期、QoS 映射等）
- [ ] 测试：ROS 2 Agent 连地面站

#### Step 4.2：混合编队测试
- [ ] 同时连接 ROS 1 和 ROS 2 Agent
- [ ] 验证地面站行为一致

#### Step 4.3：部署打包
- [ ] Agent 打包（pip 包 / Docker 镜像）
- [ ] 地面站打包（Docker Compose：Broker + 后端 + 前端）
- [ ] 安装脚本 / 一键部署

#### Step 4.4：文档与配置
- [ ] 用户手册
- [ ] 配置说明（MQTT 认证、TLS、频率限制等）
- [ ] Agent 接入指南（如何为新的 ROS 版本/非 ROS 设备写 Agent）

**Phase 4 完成标志：** ROS 1 + ROS 2 混合使用，可部署交付。

---

### Phase 5：优化与进阶

- [ ] MessagePack 替换 JSON（带宽压缩 30-50%）
- [ ] WebRTC 视频流替代 MJPEG
- [ ] MQTT over TLS / 认证加固
- [ ] 断线重连优化 + 离线消息缓存
- [ ] 地面站权限管理（多操作员）
- [ ] 3D 地图显示（如有 SLAM 数据）
- [ ] 移动端适配（平板操作）

---

## 七、依赖清单

### Agent (Python)
```
paho-mqtt >= 2.0
pyyaml
opencv-python  # 图像压缩
numpy          # 点云降采样
rospy  (ROS 1 环境)
# rclpy (ROS 2 环境，后续)
```

### 地面站后端 (Python)
```
fastapi
uvicorn
paho-mqtt >= 2.0
websockets
pyyaml
```

### 地面站前端
```
vue 3
typescript
vite
element-plus
echarts
pinia
three  # 3D 点云渲染
```

### 基础设施
```
mosquitto (MQTT Broker)
```

## 八、关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 跨机器通信 | MQTT | QoS、断线重连、中心化架构匹配一对多 |
| ROS 版本解耦 | Agent 翻译层 | 地面站不关心 ROS 版本，只认 MQTT 协议 |
| 开发环境 | Windows + Mock Agent | 无 ROS 也能开发 80% 代码，Mock Agent 验证通信链路 |
| 地面站跨平台 | 代码零差异，仅启动方式不同 | 所有组件跨平台，部署时适配 .bat / systemd / Docker |
| ROS Agent 测试 | 两台 Ubuntu 实体机 | 一台地面站 + 一台机器人端，局域网实测 |
| GUI 技术栈 | Web (Vue) | 跨平台、开发效率高、多终端适配 |
| 序列化 | JSON → MessagePack | 先保证可调试，后续优化带宽 |
| Python 版本 | 3.8+ 兼容 Noetic | Noetic 绑定 Python 3.8，需 `from __future__ import annotations` |
| 话题传输分层 | 轻量→MQTT+JSON / 中等→MQTT+二进制 / 重量→HTTP流+MQTT信令 | 按数据量选通道，带宽可控 |
| 视频方案 | MJPEG → WebRTC | 先简单跑通，再追求低延迟 |
| 点云方案 | 体素降采样 + HTTP 流 | 原始点云太大，必须降采样后传输 |
| 数据存储 | SQLite | 单机够用，零运维 |
