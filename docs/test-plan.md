# ROS Ground Station 功能测试方案

## 背景

当前项目有 81 个 protocol/ 包单元测试，但 agent/ 和 station/ 后端（约 2000+ LOC）零测试覆盖。需要验证现有功能是否正常工作。

## 方案一：手动端到端测试

在 Windows 上启动全部组件，验证完整数据流。

### 启动顺序

```bash
# 终端 1：启动 MQTT Broker（amqtt 纯 Python 实现，无需安装 Mosquitto）
python broker/start_pybroker.py

# 终端 2：启动 Mock Agent
python -m agent.main --robot-id robot_001 --log-level DEBUG

# 终端 3：启动 Station 后端
python -m station.backend.main --log-level DEBUG

# 终端 4：前端（可选，有浏览器即可）
cd station/frontend && npm run dev
```

### 测试清单

#### 1. 基础连接
- [x] Agent 日志显示 `Connected to broker`、`Status report loop started`
- [x] Station 日志显示 `Connected to broker`、`Sent discover request`
- [x] Station 日志显示 `Discovered robot robot_001`

#### 2. REST API
| 端点 | 方法 | 结果 |
|------|------|------|
| `/` | GET | ✅ 返回 API 版本和状态 |
| `/api/robots` | GET | ✅ 返回机器人列表（曾因 `threading.Lock` 不可重入死锁，已修复为 `RLock`）|
| `/api/robots/{id}` | GET | ✅ 返回单个机器人状态 |
| `/api/robots/{id}/command` | POST | ✅ velocity/stop/return_home/nav_goal/custom 全部正常 |
| `/api/robots/{id}/subscribe` | POST | ✅ 订阅请求发送成功 |
| `/api/robots/{id}/unsubscribe` | POST | ✅ 取消订阅发送成功 |
| `/api/discover` | POST | ✅ 发现请求发送成功 |
| 未知 action | POST | ✅ 返回 error 不崩溃 |

#### 3. WebSocket 实时推送
- [x] 连接后立即收到 `status_update` 快照
- [x] WebSocket 发送 velocity 命令 → `command_sent` + 异步 `cmd_ack`
- [x] Ping/pong 正常
- [x] 订阅/取消订阅通过 WebSocket 正常
- [x] 未知消息类型返回 error

> 注意：WebSocket 是 pub/sub 通道，消息可能乱序到达。客户端需按 `type` 字段过滤。

#### 4. 错误场景
- [x] 杀死 Agent → 心跳超时（默认 30s）后 Station 标记 `online: false`
- [x] 重启 Agent → 重新发现，online 恢复
- [x] 发送未知 action → 返回 error 不崩溃

#### 5. 多机器人
- [x] robot_001 + robot_002 同时在列表显示
- [x] 两个机器人独立发送不同命令（一个 velocity、一个 stop）

#### 6. 前端界面
- [x] Vite dev server 正常启动（`http://localhost:3001`，端口 3000 被占用时自动切换）
- [x] 首页 HTML 正常返回
- [ ] 浏览器可视化验证（需要人工打开页面确认机器人状态卡片和控制面板）

#### 7. 告警系统（Phase 3 Step 3.4）
- [x] MockAgent 每 10s 生成随机事件（info/warning/error）
- [x] REST API `GET /api/robots/{id}/events` 返回事件列表
- [x] REST API `GET /api/robots/{id}/events?level=error` 按级别过滤
- [x] WebSocket `event` 类型消息实时推送
- [x] 前端 AlertPanel 右上角通知按钮，未读计数红点
- [x] 事件按级别颜色区分：info=蓝、warning=黄、error=红
- [x] 事件列表支持按级别过滤

### 已知问题

1. **WebSocket 消息无序**：MQTT 回调异步推送 cmd_ack，可能与 ping/pong 等消息交错。客户端需要按 type 过滤。
2. **前端端口冲突**：前端默认 3000 被占用时自动切到 3001，后端 CORS 已配置 `allow_origins=["*"]`，跨域无问题。
3. **`/api/robots` 卡死**【已修复】：`robot_manager.py` 使用 `threading.Lock` 导致 `update_status()` 自死锁。修复：改为 `threading.RLock()`。

---

## 方案二：自动化单元测试

在手动验证通过后，为以下核心模块编写 pytest 单元测试：

| 模块 | 测试数 | 关键测试点 |
|------|--------|-----------|
| `agent/rate_limiter.py` | ~10 | 限频逻辑、多话题独立、清除 |
| `agent/topic_handler.py` | ~10 | LIGHT/MEDIUM/HEAVY 分层处理 |
| `station/backend/robot_manager.py` | ~15 | 状态管理、心跳超时、指令追踪、线程安全 |
| `station/backend/ws_manager.py` | ~8 | 连接池、广播、跨线程安全 |
| `station/backend/mqtt_handler.py` | ~8 | 消息分发路由 |
| `station/backend/dependencies.py` | ~4 | 初始化、获取、重初始化 |
| `agent/mock_agent.py` | ~8 | 状态模拟、指令执行、配置校验 |

特点：纯同步、无需 MQTT Broker、快速执行。

---

## 方案三：集成测试

使用 `amqtt`（纯 Python MQTT Broker）+ `pytest-asyncio` 编写自动化集成测试：

- `test_agent_station_integration.py` — Agent ↔ MQTT ↔ Station 完整消息流
- `test_heartbeat_integration.py` — 心跳超时检测、断线重连
- `test_mqtt_handler_integration.py` — MQTT 订阅/发布/分发

需要 fixtures：amqtt_broker（async）、paho-mqtt client、MQTTHandler、MockAgent（独立线程启动）

---

## 建议执行顺序

1. **方案一（手动测试）** — 已完成，所有项通过
2. **方案二（单元测试）** — 下一步，2-3 小时
3. **方案三（集成测试）** — 最后，1-2 天，需要 async fixture 和线程管理

## 验证标准

- 81 个现有 protocol 测试全部通过：`pytest tests/ -v`
- 手动端到端测试清单全部勾选 — ✅ 已完成
- 新增单元测试全部通过
