# Phase 3 工作日志

## 项目名称
ROS 地面站控制系统 — 基于 MQTT 的一对多机器人管理

## 阶段目标
支持多台机器人同时管理，加入视频/点云可视化、数据录制回放、告警系统等增强功能。

---

## 工作步骤

### Step 3.1 — 多机器人管理 ✅

**目标**：前端支持同时选择和管理多台机器人，包括批量指令下发、Grid 布局概览。

#### 1. 后端批量指令 API

在 `api.py` 新增批量指令端点 `POST /api/robots/batch/command`，支持向多台机器人同时下发指令。与传统 REST API 逐个发送不同，批量接口接收 `robot_ids` 数组 + `action` + `params`，后端统一处理：

```
请求: POST /api/robots/batch/command
Body: { "robot_ids": ["robot_001", "robot_002"], "action": "stop", "params": {} }
响应: { "results": [{ "robot_id": "robot_001", "exec_id": "...", "status": "sent" }, ...], "count": 2 }
```

关键设计：
- `robot_ids` 为空时自动发送给所有在线机器人（全选操作）
- 每条指令独立生成 `exec_id`，各自追踪执行结果
- 复用单机指令的语义映射（stop → mode(stop), return_home → nav_goal 等）

#### 2. 前端 Store 多机器人支持

原有 Store 设计是"单机器人"模式（`selectedRobotId`）。扩展为多选模式：

**选择模型**：
- `selectedRobotIds: Set<string>` — 多选的机器人 ID 集合（Shift/Ctrl 多选时使用）
- `selectedRobotId: string | null` — 单选时的最后选中项（点击卡片时使用）
- `selectedCount` computed：当 `selectedRobotIds` 有值时返回其大小，否则如果 `selectedRobotId` 有值返回 1，否则返回 0

**新增 Actions**：
| Action | 作用 |
|--------|------|
| `toggleRobotSelection(id)` | 切换某台机器人的选中状态（多选模式） |
| `selectAllRobots()` | 全选当前在线的所有机器人 |
| `clearSelection()` | 清空所有选中 |
| `batchCommand(action, params)` | 批量指令：遍历已选机器人，逐一通过 WebSocket 发送 cmd + 加入 pendingCommands 追踪 |

**选择优先级逻辑**：
- 0 台选中 → 显示空状态 "Select robots to view"
- 1 台选中 → 显示单机器人详情（状态面板 + 控制面板 + 图表等）
- 多台选中 → 显示多机器人 Grid 概览 + 批量操作栏

#### 3. DashboardView 布局重构

```
┌─────────────────┬──────────────────────────────┐
│                 │  ● 1 robot selected           │
│   Robot List    │  ┌──────────────────────────┐ │
│                 │  │  RobotStatusPanel         │ │
│  [x] robot_001  │  ├──────────────────────────┤ │
│  [ ] robot_002  │  │  ControlPanel             │ │
│  [x] robot_003  │  ├──────────────────────────┤ │
│                 │  │  TopicManager             │ │
│  3 selected     │  ├──────────────────────────┤ │
│                 │  │  RobotCharts              │ │
│                 │  └──────────────────────────┘ │
│                 │                               │
│                 │  ● 3 robots selected          │
│                 │  ┌──────────────────────────┐ │
│                 │  │  [Stop All] [Return All] │ │
│                 │  ├──────────────────────────┤ │
│                 │  │  ┌─────┐ ┌─────┐ ┌─────┐│ │
│                 │  │  │ R1  │ │ R2  │ │ R3  ││ │
│                 │  │  │72%  │ │45%  │ │90%  ││ │
│                 │  │  └─────┘ └─────┘ └─────┘│ │
│                 │  └──────────────────────────┘ │
└─────────────────┴──────────────────────────────┘
```

- 左侧机器人列表：每项加 checkbox，支持多选
  - Select All / Clear 按钮控制全选/清空
  - 底部显示计数 "N selected"
- 右侧根据选中数量自动切换视图：
  - 0 → 空状态
  - 1 → 完整详情（所有面板纵向排列）
  - N → Grid 概览 + 批量操作栏

#### 4. RobotGridCards 组件

多机器人概览组件，以卡片网格形式展示选中机器人：

- 每张卡片显示：robot_id、电量进度条、在线状态、运行模式
- 点击卡片 → 切换到单机器人详情
- 布局：CSS Grid 自适应列数（minmax(280px, 1fr)）

#### 5. 验证

- `vue-tsc` 类型检查通过
- `vite build` 构建通过

---

### Step 3.2 — 视频流与点云可视化 ✅

**目标**：在浏览器中显示机器人传感器的大数据量可视化——3D 点云和实时相机画面。

> **核心挑战**：点云和图像的数据量远超 MQTT 的承载能力（一张点云几 MB，MQTT 单帧限制通常在 10MB 以内但会堵塞其他消息）。架构方案在 Phase 1 已设计好——重量话题走 HTTP 流 + MQTT 信令，中等话题走 MQTT + 二进制/压缩。
>
> 点云走 HTTP 流：Agent 在独立端口提供 HTTP 流服务，MQTT 只传 stream_url 元信息。地面站后端作为代理，前端轮询获取二进制帧。
> 图像走 MQTT+base64：Mock Agent 用 OpenCV 生成测试图像 → JPEG 压缩 → base64 编码 → JSON payload → MQTT → 后端 WebSocket 推送 → 前端 `<img>` 渲染。

#### 1. Agent 端（Phase 1 已实现，确认无修改）

Agent 端在 Phase 1 已完整实现：
- `_process_pointcloud`：体素降采样 + float32 二进制编码
- `_process_image`：JPEG 压缩 + base64 编码
- `_start_stream_server`：重量话题 HTTP 流服务（端口 8080）
- Mock Agent `_generate_mock_pointcloud` 生成测试点云（地面 + 箱子 + 柱子）
- Mock Agent `_generate_mock_image` 生成测试图像（渐变色 + 运动圆 + 时间戳文字）

#### 2. 后端 sensor_meta 处理链路

**背景**：Agent 发布重量话题（点云）时，MQTT 只传 SensorMetaData 信令（含 stream_url），实际数据通过 HTTP 流传输。后端需要解析这个信令并存储 URL。

**MQTTHandler 修改**：
- 在 `_handle_sensor_message` 中检测 topic 是否以 `/meta` 结尾
- 如果是 meta 消息，解析 JSON Message，提取 SensorMetaData 中的 `stream_url`
- 调用新回调 `_on_sensor_meta(robot_id, meta_data_dict)`，不继续走普通 sensor_data 流程

**RobotManager 修改**：
- 新增 `_stream_urls: dict[str, dict[str, str]]` 存储流 URL，结构为 `{robot_id: {topic: stream_url}}`
- `handle_sensor_meta(robot_id, meta)`：提取 topic + stream_url，存储并触发 `_on_sensor_meta` 回调
- `get_stream_url(robot_id, topic)`：查询接口，供 API 端点使用

**API 端点**：
```
GET /api/robots/{robot_id}/stream/{topic:path}
```
- 从 RobotManager 查询 stream_url
- 用 `urllib.request.urlopen` 向 Agent HTTP 流发 GET 请求
- 返回原始二进制（`application/octet-stream`）
- 异常时返回空数据

```
GET /api/robots/{robot_id}/streams
```
- 返回该机器人所有活跃流 URL 列表

**回调接线（main.py）**：
```
MQTTHandler._on_sensor_meta → RobotManager.handle_sensor_meta → API.push_sensor_meta → WsManager.broadcast → 前端
```

#### 3. 前端 Three.js 点云渲染组件（`PointCloudViewer.vue`）

**为什么选 Three.js？**
Three.js 是浏览器端最成熟的 3D 引擎，封装了 WebGL 底层 API。直接用 WebGL 需要数百行代码才能画一个点，Three.js 几十行搞定。对比 Potree：Potree 专为十亿级点云优化，场景是"加载离线 LAS 文件"，不适用于 N×3 float32 二进制数组的实时流。

**管线架构**：
```
Mock Agent (HTTP :8080/stream/lidar/points)
  → MQTT sensor_meta (stream_url) → 后端存储
  → 前端 fetch /api/robots/{id}/stream/{topic} (每 500ms)
  → Float32Array 解析 → Three.js BufferGeometry → Points 渲染
```

**场景设置**：
- 背景色 `#0f1117`（匹配全局深色主题）
- `GridHelper(10, 20)` — 10×10 网格，辅助观察点云空间位置
- `AxesHelper(2)` — RGB 三色坐标轴（X=红、Y=绿、Z=蓝），同 RViz 惯例
- `AmbientLight` + `DirectionalLight` — 环境光给点云基础亮度，方向光从右上角打光增加立体感

**相机控制**（OrbitControls）：
```
操作    鼠标/触摸
旋转    左键拖拽
缩放    滚轮 / 双指捏合
平移    右键拖拽 / 三指拖拽
```
- 阻尼效果（`dampingFactor=0.1`）：松手后惯性滑动，操作手感更平滑
- 初始视角 `position(4, 3, 4)`，lookAt(0, 0, 0)，半俯视 45°

**点云渲染**：
- `PointsMaterial({ size: 0.05, vertexColors: true, sizeAttenuation: true })`
  - `vertexColors`：每个点独立颜色，实现 Z 高度渐变
  - `sizeAttenuation`：距离越远点越小，增加空间感

**Z 高度颜色渐变**（同 RViz 默认配色）：
```
蓝(0~25%) → 青(25~50%) → 黄(50~75%) → 橙红(75~100%)
```
用 `Color.lerp()` 在四点间线性插值，过渡平滑。

**性能优化 — BufferAttribute 更新**：
每次收到新帧时不重建 `BufferGeometry`，而是直接修改 `position.attributes.array` 和 `color.attributes.array` 的内容，然后设置 `needsUpdate = true`。这避免了 GPU 内存分配和 VBO 上传的开销。

**关键代码模式**：
```typescript
if (pointsMesh) {
  // 更新已有几何体
  const posAttr = pointsMesh.geometry.attributes.position as THREE.BufferAttribute
  posAttr.array.set(float32Array)
  posAttr.needsUpdate = true
  // 重新计算 Z 高度颜色
  // ...
  geom.computeBoundingSphere()
} else {
  // 首次：创建新几何体 + mesh
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(float32Array, 3))
  // ...
  pointsMesh = new THREE.Points(geometry, material)
  scene.add(pointsMesh)
}
```

**状态显示**：
- 头部：标题 "3D Point Cloud" + LIVE/NO DATA 标签
- 右上角：点数（如 "3,500 pts"）+ FPS（如 "30 fps"）
- 重置视角按钮（Refresh 图标）

**空状态**：无数据时显示 "No point cloud stream available" + 提示文字 "Subscribe to a point cloud topic (e.g. /lidar/points) to begin"

**生命周期**：
- `onMounted` → `initScene()` + `startPolling()`
- `watch(robotId)` → 切换目标机器人，重置点云
- `onUnmounted` → `disposeScene()`（清理所有 GPU 资源）
- `ResizeObserver` → canvas 尺寸自适应

**轮询机制**：每 500ms 调用一次 `fetchFrame()`，从后端代理端点获取最新二进制帧。初次挂载时立即拉取一帧。

#### 4. 前端图像显示组件（`ImageViewer.vue`）

**为什么图像不走 HTTP 流？**
图像的 Phase 1 设计是"中等话题"——数据量在 10KB~1MB 之间，MQTT 加 base64 编码即可承载，不需要单独建 HTTP 流通道。这与点云（几 MB 起步）不同。

**现有图像管线**（Phase 1 + Phase 2 已搭建）：
```
Mock Agent (OpenCV 生成图像)
  → JPEG 压缩 + base64 编码 → JSON payload
  → MQTT robot/{id}/sensor/{name}
  → Backend handle_sensor_data → JSON 解析
  → WebSocket push (type: "sensor_data")
  → Frontend Store sensorData Map
```

**组件设计**：
- 从 `robotStore.sensorData` 中自动检测图像数据（检测 `base64` 字段或 `format === 'jpeg'` 或 `_msg_type` 包含 "Image"）
- 选中第一个匹配的摄像头话题，显示实时画面

**渲染方式**：`<img :src="data:image/jpeg;base64,..." />`

浏览器原生支持 data:image URI，不需要任何额外解码库。base64 编码会增加约 33% 的数据量，但对于 JPEG 压缩后的图像（通常 10-50KB），总大小仍在可接受范围。

**状态显示**：
- 头部：标题 "Camera Stream" + LIVE/NO DATA 标签
- 右上角：分辨率（如 "320×240"）+ FPS
- 底部渐变半透明信息栏：话题名

**容器样式**：`object-fit: contain` 保持图像原始宽高比，居中显示。深色背景填充空白区域。

**FPS 统计**：独立 interval 每秒统计帧更新次数，与点云组件相同模式

#### 5. Store 点云流状态（`stores/robot.ts`）

新增状态管理：

```
pointCloudStreams: Map<robotId, Map<topic, PointCloudStream>>
PointCloudStream {
  topic: string       // ROS 话题名
  streamUrl: string   // HTTP 流地址
  msgType: string     // 消息类型
  points?: number     // 点数量
  active: boolean     // 是否活跃
  frameCount: number  // 接收帧数
  lastFrameTime: number // 最后帧时间戳
}
```

`handleSensorMetaMsg(msg)`：收到 WebSocket `sensor_meta` 消息时，提取 stream URL 信息，按 robot_id + topic 组织存入 `pointCloudStreams`。

`selectedStreams` computed：返回当前选中机器人的所有活跃流。

#### 6. 设计语言统一

两个可视化组件复用 PointCloudViewer 的设计语言：
- 面板卡片结构（panel-card / panel-header / panel-body）
- 深色背景 `#0f1117`
- 大写标签 + 字间距 0.25px
- 等宽字体（`--font-family-mono`）显示技术数据（帧率、点数、分辨率）
- FPS 数值使用 `--accent` 颜色（indigo `#6366f1`）

#### 7. 验证

- `vue-tsc` 类型检查通过
- `vite build` 构建通过
- `pytest` 81/81 测试通过

---

### Step 3.3 — 数据录制与回放 ✅

**目标**：将机器人状态数据和事件记录到 SQLite，支持开始/暂停/停止控制和历史查询。

> **为什么需要录制？**
> 实时监控只能看到"当前"状态，历史数据对于分析问题、复现异常、性能评估至关重要。录制功能将数据持久化，让操作员可以回溯过去任意时间段的状态变化。

#### 1. 数据库层（`database.py`）

SQLite 数据库，两张核心表：

**status_history（状态历史）**：
```sql
CREATE TABLE status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    robot_id TEXT NOT NULL,
    timestamp REAL NOT NULL,
    battery REAL DEFAULT 0,
    pos_x REAL DEFAULT 0, pos_y REAL DEFAULT 0, theta REAL DEFAULT 0,
    linear_vel REAL DEFAULT 0, angular_vel REAL DEFAULT 0,
    mode TEXT DEFAULT ''
);
CREATE INDEX idx_status_robot_time ON status_history(robot_id, timestamp);
```

**event_log（事件日志）**：
```sql
CREATE TABLE event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    robot_id TEXT NOT NULL,
    timestamp REAL NOT NULL,
    level TEXT NOT NULL,
    code TEXT DEFAULT '',
    message TEXT DEFAULT '',
    details TEXT DEFAULT '{}'  -- JSON
);
CREATE INDEX idx_event_robot_time ON event_log(robot_id, timestamp);
```

**性能设计**：
- WAL 模式（`PRAGMA journal_mode=WAL`）：允许并发读写在同一个数据库中，读操作不阻塞写操作
- 自动清理：`clean_old_data()` 根据 `max_age_days`（默认 7 天）删除过期数据
- 线程安全：所有数据库操作通过 `threading.Lock` 保护

#### 2. 录制管理器（`recorder.py`）

`RecordingManager` 封装录制逻辑，通过回调机制接入 RobotManager 的数据流：

**状态机**：
```
off → recording → paused
      ↑______________|
```

**采样间隔控制**：
通过 `_last_write` 字典记录每个机器人上次写入时间戳，`_should_write()` 确保采样间隔不低于 `recording_interval`（默认 1s）。这避免了高频数据（如 10Hz 状态上报）写入过于密集，控制数据库增长速率。

**回调接口**：
- `on_status_update(robot_id, status)`：记录状态到 `status_history` 表
- `on_event(robot_id, event)`：记录事件到 `event_log` 表

**回调接线**：
```
RobotManager._on_status_update → RecordingManager.on_status_update → database.write_status
RobotManager._on_event → RecordingManager.on_event → database.write_event
```

#### 3. 后端录制 API

| 端点 | 方法 | 作用 |
|------|------|------|
| `/api/record/start` | POST | 开始录制 |
| `/api/record/stop` | POST | 停止录制 |
| `/api/record/pause` | POST | 暂停录制 |
| `/api/record/resume` | POST | 恢复录制 |
| `/api/record/status` | GET | 查询录制状态 |
| `/api/history/{robot_id}` | GET | 查询状态历史（since/until/limit） |
| `/api/history/{robot_id}/events` | GET | 查询事件历史 |
| `/api/history/robots` | GET | 列出有历史数据的机器人 |

#### 4. 前端录制控制组件（`RecordingControl.vue`）

```
Recording
┌────────────────────────────────────┐
│ [● Rec] [⏸ Pause] [⏹ Stop]        │  ← 控制按钮
│                                     │
│ Status: ● Recording (12 records)    │  ← 录制状态 + 计数
│ Elapsed: 0:02:35                    │  ← 已录制时长
└────────────────────────────────────┘
```

**交互逻辑**：
- 录制/暂停/停止 三个状态明确区分
- 录制中按钮有红色脉冲动画（CSS animation），视觉提示正在录制
- 状态文字 + 已录制记录数 + 时长实时更新（每 2 秒轮询 `/api/record/status`）

#### 5. 前端历史面板（`HistoryPanel.vue`）

**数据加载**：
- 自动加载当前选中机器人的历史数据（调用 `/api/history/{robot_id}`）
- 时间范围选择器（最近 5 分钟/15 分钟/1 小时/全部）

**可视化**：ECharts 复刻实时图表的样式，展示历史电量曲线和速度曲线，数据源从"store 实时数据"切换为"API 历史数据"。

**CSV 导出**：
将历史数据格式化为 CSV 文本，通过 `Blob` + `URL.createObjectURL` + 临时 `<a>` 标签触发下载。CSV 包含时间戳、电量、位置 (x, y, theta)、速度 (linear, angular)、模式。

**兼容性**：
- 未选中机器人或选中机器人无历史数据时显示空状态
- 历史数据查询支持 since/until 参数，默认最近 1 小时

#### 6. 验证

- `vue-tsc` 类型检查通过
- `vite build` 构建通过

---

### Step 3.4 — 告警系统 ✅

**目标**：实现完整的告警生命周期——自动检测异常、实时推送通知、历史记录可查。

> **告警链路**：
> ```
> RobotManager 状态更新
>   → AlertEngine 规则检测
>   → on_event 回调 → push_event (WebSocket)
>   → RecordingManager.on_event (SQLite 持久化)
>   → 前端 AlertPanel 弹出通知
> ```

#### 1. 告警规则引擎（`alert_engine.py`）

`AlertEngine` 实现三条内置规则：

**规则 1 — 电量阈值**：
- `battery <= 20%` → CRITICAL（error 级别），code `BATTERY_CRITICAL`
- `battery <= 50%` → WARNING（warning 级别），code `BATTERY_LOW`
- 阈值可通过配置自定义

**规则 2 — 通信超时**：
- 心跳超时自动生成离线告警
- 触发时机：RobotManager 的 `_check_heartbeats()` 方法每 5 秒检查一次
- 超时时间由 `heartbeat_timeout` 参数控制（默认 30 秒）
- 告警消息包含 robot_id + "heartbeat timeout"

**规则 3 — 位置越界**：
- 检查 `position.x` 和 `position.y` 是否超出预设边界（默认 ±100）
- 越界时生成 WARNING 级别告警，code `POSITION_OUT_OF_BOUNDS`

**防重复机制（Debounce）**：
每条规则有 `debounce_seconds`（默认 300 秒 = 5 分钟）的冷静期。同一规则在冷静期内不会重复触发，防止"电量 19%"每秒都弹告警。

```python
def _should_fire(self, key: str) -> bool:
    now = time.time()
    last = self._debounce.get(key, 0)
    if now - last >= self._rules["debounce_seconds"]:
        self._debounce[key] = now
        return True
    return False
```

**集成方式**：RobotManager 在每次状态更新时调用 `AlertEngine` 检测，生成的告警通过 `on_event` 回调走标准事件处理链路。

#### 2. 事件持久化

`RecordingDB` 的 `event_log` 表存储事件记录，`RecordingManager.on_event` 在录制状态下将事件写入 SQLite。这确保：
- 重启地面站后历史事件不丢失
- 可通过 `/api/history/{robot_id}/events` API 查询
- 事件自动清理（默认保留 7 天）

#### 3. 前端通知面板（`AlertPanel.vue`）

**位置**：`AppLayout.vue` 右上角，全局可见，与顶栏 WebSocket 连接指示灯并列。

**未读计数**：`el-badge` 组件在按钮右上角显示未读数量圆点。新事件到达时自动增加未读计数，打开面板后自动清零。

**面板内容**：
```
Notifications                          [All ▼] [Mark all read]
┌────────────────────────────────────────────┐
│ ⚠ BATTERY_LOW  robot_001                  │
│   Battery low: 45.2%                       │
│   14:30:22  │  bat: 45.2%                  │
├────────────────────────────────────────────┤
│ ✕ MOTOR_STALL  robot_001                   │
│   Motor stall detected                     │
│   14:29:50  │  bat: 52.1%                  │
├────────────────────────────────────────────┤
│ ℹ MODE_CHANGE  robot_001                   │
│   Operation mode changed                   │
│   14:29:40  │                              │
└────────────────────────────────────────────┘
[Close] [Load history]
```

**交互细节**：
- 按级别过滤：All / Critical / Error / Warning / Info
- 级别颜色区分：error/critical=红、warning=黄、info=灰
- 未读条目有浅色高亮背景
- 点击条目标记为已读
- "Load history" 按钮从 SQLite 历史 API 加载过去的事件

**未读追踪机制**：
使用 `Set<timestamp>` 存储未读事件的 timestamp，打开面板时清空。新的 WebSocket 事件到达时，如果面板未打开则自动加入未读集。

#### 4. Mock Agent 事件模拟

`MockAgent._generate_mock_events()` 每 10 秒按权重随机生成一个事件：

| 事件 | 级别 | 权重 |
|------|------|------|
| battery_normal | info | 3 |
| battery_low | warning | 1 |
| system_ok | info | 4 |
| network_latency | warning | 1 |
| motor_stall | error | 1 |
| mode_change | info | 2 |
| sensor_ok | info | 2 |
| temp_high | warning | 1 |

权重系统使 info 级别事件出现频率最高（约 60%），warning（约 30%），error（约 10%），模拟真实的机器人运行场景。

#### 5. 后端事件 API

```
GET /api/robots/{robot_id}/events?level=...&since=...
```

支持按级别过滤和时间范围查询，返回机器人最近 50 条内存事件。

历史事件通过已有 API 查询：`GET /api/history/{robot_id}/events`

#### 6. 验证

- Mock Agent 按权重模拟多种级别事件
- WebSocket 推送事件到前端 AlertPanel
- AlertPanel 显示/过滤/标记已读/统计未读
- "Load history" 从 SQLite 加载过去事件
- AlertEngine 防重复机制（debounce）有效
- `vue-tsc` 类型检查通过
- `vite build` 构建通过

---

## 设计决策

### 点云传输方案：HTTP 流代理 vs 直接连接

| 方案 | 优点 | 缺点 |
|------|------|------|
| 前端直连 Agent HTTP | 延迟低、架构简单 | CORS、跨网段不可达（Agent 可能在不同内网） |
| 后端代理（选择） | 统一入口、无 CORS、后端可缓存/压缩 | 多一跳延迟、后端带宽压力 |

选择后端代理的原因是：机器人 Agent 通常位于与地面站不同的网络段（如机器人 Wi-Fi 网段），浏览器所在的前端设备可能无法直接访问 Agent IP。后端代理将流媒体入口统一到地面站 API 端口，前端只需连接一个地址。

### 图像传输方案：MQTT + base64 vs MJPEG 流

| 方案 | 优点 | 缺点 |
|------|------|------|
| MQTT + base64（选择） | 复用现有 sensor_data 通道，无需额外 HTTP 流服务端 | base64 增加 33% 体积 |
| MJPEG 流 | 无 base64 损耗、浏览器 `<img>` 原生支持 | 需新建立 HTTP 流通道、CORS 问题 |

选择 MQTT + base64 的原因是：Phase 1 设计已经将 CompressedImage 归类为"中等话题"走 MQTT+二进制通道，且 Agent 端的 `topic_handler._process_image` 已经实现了 JPEG 压缩 + base64 编码。图像在 MJPEG 前已 JPEG 压缩到 10-50KB，base64 增加 33% 后仍远小于 MQTT 极限，不需要额外建立 HTTP 流通道。

### 录制存储：SQLite vs 文件存储

| 方案 | 优点 | 缺点 |
|------|------|------|
| SQLite（选择） | 结构化查询、时间范围过滤、多表关联 | 二进制大对象（BLOB）不擅长 |
| CSV/JSON 文件 | 简单直接、人类可读 | 查询困难、没有索引、并发写入不安全 |

选择 SQLite 是因为状态数据和事件日志是结构化数据，需要按时间/机器/级别的组合条件查询，文件存储无法有效支持这些查询。SQLite 是结构化时序数据最轻量的方案。

---

## 关键成果

1. **多机器人管理**：单选/多选/全选灵活切换，单机详情和批量概览自动切换，批量停止/返航
2. **Three.js 3D 点云可视化**：浏览器中实时渲染数千点云，OrbitControls 旋转/缩放/平移，Z 高度渐变色，FPS 显示
3. **实时相机画面**：MQTT base64 JPEG 通道传输，自动检测图像话题，FPS 计数
4. **后端 HTTP 流代理**：统一的流媒体入口，屏蔽 Agent 网络差异
5. **数据录制与回放**：SQLite 持久化状态历史 + 事件日志，开始/暂停/停止控制，历史面板 + CSV 导出
6. **告警规则引擎**：电量阈值、通信超时、位置越界三条内置规则，防重复 debounce 机制
7. **实时告警推送**：WebSocket 推送 + 前端浮动通知面板，未读计数/级别过滤/Load history
8. **告警持久化**：SQLite 存储事件历史，重启不丢失，历史 API 可查
9. **端到端验证**：Mock Agent 全链路测试通过，81 项 pytest 全通过

## 当前状态

**Phase 1** 通信链路 ✅（2026-04-28）
**Phase 2** 地面站 GUI ✅（2026-04）
**Phase 3** 多机器人 + 增强功能 ✅（2026-04-29）
**Phase 4** ROS 2 支持 + 通用化 — 待开始
**Phase 5** 优化 — 待开始

---

### Step 3.5 — 机器人间通信（Fleet Data）✅

**目标**：实现机器人之间的直接数据传递，不经过地面站中转。支持位置信息、导航目标、自定义数据等轻量消息，以及点云等重量数据共享。

> **设计思路**：复用现有分层传输策略——轻量数据走 MQTT JSON（robot/{src}/to/{dst}），重量数据复用 HTTP 流服务端 + MQTT 信令。Agent 启动时自动订阅 robot/+/to/{self_id}，接收其他机器人的消息。地面站不进入关键路径，可选监控。

#### 1. 协议层新增

**MQTT Topic**（`protocol/topics.py`）：
- `robot/{src}/to/{dst}` — 机器人间轻量数据（QoS 1）
- `robot/{src}/to/{dst}/meta` — 机器人间重量话题元信息（QoS 1）
- `robot/+/to/{self_id}` — Agent 订阅通配符，接收所有发往本机的消息

**消息类型**（`protocol/messages.py`）：
- `MessageType.FLEET_DATA = "fleet_data"` — 新增消息类型
- `FleetData` dataclass：`data_type`（position/nav_goal/custom/pointcloud）+ `payload` + `ttl`

数据分层：

| data_type | 通道 | 说明 |
|-----------|------|------|
| position | MQTT JSON | 位置 x/y/theta |
| nav_goal | MQTT JSON | 导航目标坐标 |
| custom | MQTT JSON | 自定义 key-value |
| pointcloud | HTTP 流 + MQTT 信令 | 复用 Agent HTTP stream server |

#### 2. Agent 变更（`agent/base_agent.py`）

**MQTT 订阅新增**：
连接成功后额外订阅 `robot/+/to/{self_id}` 和 `robot/+/to/{self_id}/meta`，用于接收其他机器人的 fleet 数据。

**公共方法**：
- `send_to_robot(target_id, fleet_data)` — 向指定机器人发送轻量数据（MQTT JSON）
- `share_heavy_data(target_id, topic, data, msg_type)` — 向指定机器人共享重量数据（HTTP 流 + MQTT 信令）

**消息处理**：
- `_handle_message` 新增 `FLEET_DATA` 分发
- `_handle_fleet_message(message)` — 解析消息，轻量数据回调子类，重量数据拉取 HTTP 流

**抽象方法**：
- `_on_fleet_message(src_id, data)` — 子类实现，处理接收到的 fleet 数据

#### 3. Mock Agent 变更（`agent/mock_agent.py`）

实现 `_on_fleet_message`，将收到的 fleet 数据记录日志。

#### 4. ROS1 Agent 变更（`agent/ros1_agent.py`）

实现 `_on_fleet_message`，将接收到的 fleet 数据发布到 ROS 话题 `/fleet/incoming`，供 ROS 节点订阅消费。

#### 5. 验证

- 启动两个 Mock Agent（robot_001, robot_002）+ Broker
- robot_001 调用 `send_to_robot("robot_002", FleetData(...))` → robot_002 日志输出接收确认
- robot_001 调用 `share_heavy_data("robot_002", ...)` → robot_002 通过 HTTP 拉取点云数据
- `pytest` 全通过

---

## 涉及文件清单

### Step 3.1 — 多机器人管理
- `station/backend/api.py` — 批量指令端点
- `station/frontend/src/stores/robot.ts` — 多选状态、batchCommand
- `station/frontend/src/views/DashboardView.vue` — 多视图布局
- `station/frontend/src/components/RobotGridCards.vue` — 多机 Grid 组件

### Step 3.2 — 点云可视化
- `station/backend/mqtt_handler.py` — sensor_meta 检测
- `station/backend/robot_manager.py` — 流 URL 存储
- `station/backend/api.py` — 流代理端点 + sensor_meta WS 推送
- `station/backend/main.py` — 回调接线
- `station/frontend/src/stores/robot.ts` — pointCloudStreams 状态
- `station/frontend/src/api/robot.ts` — getStreamData
- `station/frontend/src/types/robot.ts` — SensorMetaPayload, PointCloudStream
- `station/frontend/src/components/PointCloudViewer.vue` — Three.js 组件
- `station/frontend/src/components/ImageViewer.vue` — 图像显示组件
- `station/frontend/src/views/DashboardView.vue` — 集成可视化组件

### Step 3.3 — 数据录制
- `station/backend/database.py` — SQLite 表结构 + 读写接口
- `station/backend/recorder.py` — 录制管理器
- `station/backend/api.py` — 录制控制 + 历史查询 API
- `station/backend/main.py` — 回调接线
- `station/frontend/src/api/robot.ts` — 录制/历史 API 封装
- `station/frontend/src/stores/robot.ts` — history state
- `station/frontend/src/types/robot.ts` — RecordingStatus, HistoryRecord, HistoryEvent
- `station/frontend/src/components/RecordingControl.vue` — 录制控制组件
- `station/frontend/src/components/HistoryPanel.vue` — 历史面板组件
- `station/frontend/src/views/DashboardView.vue` — 集成录制/历史

### Step 3.4 — 告警系统
- `station/backend/alert_engine.py` — 规则引擎
- `station/backend/robot_manager.py` — 告警检测集成
- `station/backend/main.py` — 回调接线
- `station/frontend/src/stores/robot.ts` — robotEvents 状态
- `station/frontend/src/components/AlertPanel.vue` — 通知面板（已存在，增强持久化加载）

### Step 3.5 — 机器人间通信
- `protocol/topics.py` — 新增 robot_to_robot / robot_to_robot_meta / 通配符函数
- `protocol/messages.py` — 新增 MessageType.FLEET_DATA / FleetData / fleet_data()
- `agent/base_agent.py` — 新增 fleet 订阅 + send_to_robot + share_heavy_data + _handle_fleet_message
- `agent/mock_agent.py` — 实现 _on_fleet_message
- `agent/ros1_agent.py` — 实现 _on_fleet_message → ROS topic 桥接
