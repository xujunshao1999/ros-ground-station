# Phase 1 工作日志

## 项目名称
ROS 地面站控制系统 — 基于 MQTT 的一对多机器人管理

## 阶段目标
搭建通信链路，实现机器人与地面站之间的消息收发全链路跑通

---

## 工作步骤

### Step 1.1 — 协议层设计 + 项目骨架搭建 ✅

**目标**：定义通信协议和项目结构，为后续开发奠定基础。

**具体工作**：
- 创建项目目录结构，按职责分层：`protocol/`（协议）、`agent/`（机器人端）、`station/`（地面站）、`broker/`（Broker配置）、`docs/`（文档）
- 设计消息通用格式（dataclass），包含版本号、时间戳、源/目标地址、消息类型、序列号、数据体六个字段，保证每条消息可追溯、可校验
- 定义 MQTT Topic 规范，按功能划分：`robot/{id}/status`（状态上报）、`robot/{id}/cmd`（控制指令）、`robot/{id}/cmd/ack`（指令确认）、`station/discover`（发现请求）等，每条 Topic 指定 QoS 等级
- 设计话题分层传输策略，根据数据量差异选择不同通道：
  - 轻量话题（IMU/GPS/里程计，<10KB）：直接 MQTT + JSON 传输
  - 中等话题（压缩图像/LaserScan，10KB-1MB）：MQTT + 二进制 payload + 限频压缩
  - 重量话题（原始图像/PointCloud2，>1MB）：HTTP 独立流通道 + MQTT 仅传元信息
- 编写协议文档 `docs/protocol.md`，记录所有消息格式和 Topic 规范

---

### Step 1.2 — MQTT Broker 部署 ✅

**目标**：搭建消息中间件，作为机器人与地面站之间的通信枢纽。

**具体工作**：
- 安装 Eclipse Mosquitto 2.1.2（Windows 环境），配置 `mosquitto.conf`：监听 1883 端口、允许匿名连接、设置日志级别
- 编写跨平台启动脚本：`broker/start.bat`（Windows）和 `broker/start.sh`（Linux），一份配置文件两个平台通用
- 搭建纯 Python 备用 Broker（基于 amqtt 库），作为无 Mosquitto 环境下的开发替代方案，降低环境依赖

---

### Step 1.3 — Agent 框架 + Mock Agent 开发 ✅

**目标**：实现机器人端软件框架，并在 Windows 上用模拟 Agent 验证通信。

**具体工作**：
- 实现 `BaseAgent` 抽象基类，定义所有 Agent 的统一接口：MQTT 连接管理、心跳状态上报、控制指令接收、话题订阅/取消、HTTP 流服务。所有 ROS 相关逻辑留给子类实现，基类不依赖 ROS
- 实现 `TopicHandler` 话题处理器，根据话题类型注册表自动选择传输通道（轻/中/重），Agent 只需调用统一接口，无需关心底层传输细节
- 实现 `RateLimiter` 限频器，按话题独立控制发送频率。每个话题维护独立的令牌桶，避免高频传感器数据（如 100Hz IMU）占满带宽，地面站可通过订阅请求动态调整频率
- 实现 `MockAgent` 模拟 Agent，在无 ROS 环境下模拟机器人全部行为：
  - 状态上报：生成移动轨迹（圆周运动）、电量缓慢下降、运行时间累计
  - 传感器数据：OpenCV 生成测试图像、numpy 生成随机点云数据
  - 指令响应：接收控制指令后改变运动模式，返回执行确认
  - HTTP 流服务：模拟重量话题的流式数据传输
- 编写 Agent 配置文件 `agent/config.yaml`，支持 broker 地址、robot_id、上报频率、HTTP 流端口等参数配置

---

### Step 1.4 — 地面站后端开发 ✅

**目标**：实现地面站核心逻辑，能发现机器人、接收状态、下发指令。

**具体工作**：
- 实现 `MQTTHandler` 通信处理模块：
  - 连接 Broker 并订阅所有机器人相关 Topic（通配符 `robot/+/status`、`robot/+/cmd/ack`、`robot/+/event`）
  - 发送 `station/discover` 发现在线机器人
  - 发送 `station/topic/request` 请求订阅/取消指定话题
  - 发送 `robot/{id}/cmd` 下发控制指令（速度、模式切换、导航目标等）
- 实现 `RobotManager` 机器人管理模块：
  - 维护已连接机器人列表，处理上线/离线事件
  - 心跳超时检测：超过设定时间未收到状态上报则标记离线
  - 指令执行追踪：每条指令分配唯一 exec_id，匹配 Robot 返回的 ack 确认，追踪执行结果
  - 存储各机器人最新状态，供 API 查询
- 实现 `FastAPI` REST API 层，对外暴露以下接口：
  - `GET /api/robots` — 获取机器人列表及状态
  - `GET /api/robots/{id}` — 获取单个机器人详情
  - `POST /api/robots/{id}/cmd` — 下发控制指令
  - `POST /api/robots/{id}/topic` — 订阅/取消话题
  - `GET /api/robots/{id}/topics` — 获取话题列表
- 实现后端启动入口，MQTT 客户端与 FastAPI 服务联动运行，启动即自动连接 Broker 并开始监听

---

### Step 1.5a — Windows 端到端验证 ✅

**目标**：在 Windows 环境下验证完整通信链路。

**具体工作**：
- 按"Broker → Station Backend → Mock Agent"顺序启动三个组件
- 逐步验证全链路通信：
  1. **发现**：地面站发送 discover → Mock Agent 收到并回复 → 地面站识别新机器人上线
  2. **状态上报**：Mock Agent 持续发送心跳+状态 → 地面站实时更新机器人信息
  3. **指令下发**：通过 API 发送速度/模式指令 → Mock Agent 收到并执行
  4. **指令确认**：Mock Agent 返回 ack → 地面站匹配 exec_id 确认执行结果
  5. **话题订阅**：地面站请求订阅传感器话题 → Mock Agent 开始转发数据
- 修复联调过程中发现的问题：
  - paho-mqtt v2 API 变更：需指定 `callback_api_version=VERSION2`，回调参数从 `rc` 改为 `reason_code`
  - 消息工厂方法参数不匹配、枚举值缺失、数据类型兼容性等多项细节修复
  - BaseAgent 基类空实现补全（`_start_status_loop`、`_store_stream_data`）

---

### Step 1.5b — ROS 1 Agent 开发 + Linux 准备 ✅（实机测试待做）

**目标**：实现真实 ROS Agent，为 Linux 实机测试做好准备。

**具体工作**：
- 实现 `ROS1Agent`（继承 BaseAgent），桥接 ROS 1 话题与 MQTT 通信：
  - **ROS → MQTT**：订阅 ROS 话题，按话题类型自动选择传输通道（轻量直转 JSON、中等压缩后二进制传输、重量走 HTTP 流），支持地面站动态控制频率
  - **MQTT → ROS**：接收地面站控制指令，转换为 ROS 话题发布（如 cmd_vel 速度指令、模式切换、导航目标等）
  - **话题发现**：自动获取当前 ROS 活跃话题列表，上报给地面站供操作员选择订阅
  - **HTTP 流服务**：为 PointCloud2 等大数据量话题提供独立流通道
- 编写 Linux 部署验证指南 `docs/step-1.5b-guide.md`：
  - 两种方案：Windows 地面站 + Ubuntu 机器人端（方案A），或两台 Ubuntu（方案B）
  - 详细的安装、配置、启动步骤，含 Windows 防火墙放行说明
  - 踩坑速查表，覆盖常见问题（Python 版本、防火墙、Mosquitto 配置、.venv 拷贝等）
- 修复 Python 3.8 兼容性，确保在 ROS Noetic（Python 3.8）环境下可运行：
  - `pyproject.toml` 中 `requires-python` 从 `>=3.10` 降为 `>=3.8`
  - 所有 .py 文件添加 `from __future__ import annotations`，使类型注解语法兼容 3.8
- 项目上传 GitHub 公开仓库：https://github.com/xujunshao1999/ros-ground-station

---

## 关键成果

1. **通信协议完整定义**：消息格式 + Topic 规范 + 分层传输策略，与 ROS 版本完全解耦，地面站无需安装 ROS
2. **全链路通信验证通过**：机器人端（Agent）和地面站端（Station）通过 MQTT Broker 可靠通信，发现→上报→控制→确认→订阅完整闭环
3. **Windows 开发模式跑通**：Mock Agent 方案验证了"无 ROS 环境也能开发 80% 代码"的开发策略，大幅降低开发门槛
4. **ROS 1 Agent 已实现**：真实 ROS Agent 代码就绪，待两台 Ubuntu 实机联调测试
5. **项目开源**：代码已上传 GitHub，支持 git clone 一键获取部署

## 当前状态

Phase 1 基本完成，下一步：
- **近期**：两台 Ubuntu 实机测试 ROS1Agent 与地面站的通信
- **后续**：Phase 2 — Vue 3 Web 前端开发（机器人状态面板、控制面板、话题管理）
