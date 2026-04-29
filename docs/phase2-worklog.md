# Phase 2 工作日志

## 项目名称
ROS 地面站控制系统 — 基于 MQTT 的一对多机器人管理，用电脑网页来控制多台机器人

## 阶段目标
做出一个能在浏览器里打开的地面站操作界面，让操作员能看到机器人的实时状态（位置、电量、速度），能发控制指令，能订阅查看机器人的传感器数据。

## 工作量汇总

| 步骤 | 内容 | 工时 | 难度 | 说明 |
|------|------|------|------|------|
| Step 2.1 | 前端项目搭建 | 约 2h | ★☆☆ | 搭框架、装依赖、配代理 |
| Step 2.2 | 实时通信通道 | 约 4h | ★★★ | WebSocket 双向通信，跨线程推送 |
| Step 2.3 | 状态面板 + 图表 | 约 3h | ★★☆ | 状态显示、ECharts 实时曲线 |
| Step 2.4 | 控制面板 + 指令追踪 | 约 3h | ★★☆ | 速度/模式控制，执行结果追踪 |
| Step 2.5 | 话题订阅管理 | 约 3h | ★★☆ | 浏览话题、订阅/取消、看数据 |
| Step 2.6 | 视觉设计与打磨 | 约 2h | ★★☆ | 深色主题、CSS 变量统一 |
| **合计** | **6 个步骤** | **约 17h** | — | — |

---

## 工作步骤

### Step 2.1 — 前端项目搭建 ✅ (工时: 2h, 难度: ★☆☆)

**目标**：搭好前端项目的架子，让浏览器能显示出地面站页面，能跟后端通信。

#### 1. 安装 Node.js 运行环境

前端代码不能直接在浏览器里运行 TypeScript 和 Vue 单文件组件，需要 Node.js 提供编译和打包工具链。

- 安装 Node.js v24.15.0（JavaScript 运行时，类似于 Python 解释器的角色）
- npm 是 Node.js 自带的包管理器（类似于 pip），用来安装前端第三方库
- 配置 npm 国内镜像源 `npmmirror.com`：默认源在国外，国内下载经常超时或中断，切换镜像后下载速度从超时变为秒下

#### 2. 初始化 Vue 3 项目

使用 Vite（前端构建工具，类似于 Python 的 setuptools + uvicorn 的组合）创建项目骨架。

- **Vue 3**：前端框架，用组件化的方式构建界面（一个 `.vue` 文件 = HTML 模板 + JS 逻辑 + CSS 样式，三合一）
- **TypeScript**：JavaScript 的超集，增加类型检查，类似于给 Python 加上 type hints 但强制校验，写错了编译期就报错而不是运行时才崩
- **Vite**：开发和构建工具，开发时提供热更新（改代码浏览器自动刷新），发布时把代码压缩打包成浏览器可执行的最小文件

安装核心依赖（类比 Python 里 `pip install` 的第三方库）：

| 依赖 | 类比 | 作用 |
|------|------|------|
| Element Plus | PyQt 组件库 | 提供按钮、表格、弹窗等现成 UI 组件，不用从零写 |
| ECharts + vue-echarts | matplotlib | 数据可视化图表（折线图、仪表盘等） |
| Pinia | 全局变量管理 | 集中管理应用状态（如机器人列表、当前选中），任何组件都能读写同一份数据 |
| Vue Router 4 | Flask 路由 | 管理页面跳转（如 /dashboard → 仪表盘页面），目前只有一个首页 |
| Axios | requests 库 | 发送 HTTP 请求到后端 API（获取机器人列表、发送指令等） |
| Sass | CSS 增强版 | 支持变量、嵌套、计算等高级写法，编译后输出普通 CSS |

安装开发依赖（只在开发时用，不进最终产物）：

| 依赖 | 作用 |
|------|------|
| unplugin-vue-components | 自动注册 Element Plus 组件，写了 `<el-button>` 就能用，不用手动 import |
| unplugin-auto-import | 自动导入 Vue/Router/Pinia 的 API，不用每个文件都写 `import { ref } from 'vue'` |

#### 3. 配置 Vite 开发代理

前后端分别运行在不同端口（前端 3000，后端 8000），浏览器有同源策略限制跨端口请求。Vite 开发代理的原理是：

```
浏览器请求 /api/robots → Vite 开发服务器转发到 http://localhost:8000/api/robots → 返回结果给浏览器
```

这样前端代码只需写 `/api/robots`，不需要知道后端跑在哪个端口，部署时也无需修改代码。

- `/api` 路径 → 转发到 `http://localhost:8000`（REST API）
- `/ws` 路径 → 转发到 `ws://localhost:8000`（WebSocket 实时通信）

#### 4. 配置路径别名

前端 import 时写 `@/stores/robot` 代替 `../../stores/robot`，`@` 代表 `src/` 目录，避免深层嵌套时写一串 `../`。

#### 5. 创建前端目录结构

```
src/
├── api/          # 后端 API 调用封装（每个函数对应一个后端接口）
├── views/        # 页面级组件（整个页面的内容）
├── stores/       # Pinia 状态管理（全局共享的数据和操作）
├── router/       # 路由配置（URL → 页面映射）
├── types/        # TypeScript 类型定义（接口返回值的类型声明）
├── layouts/      # 布局组件（页面骨架，如顶栏 + 主内容区）
├── styles/       # 全局样式
└── composables/  # 可复用的逻辑函数（Vue 3 的代码复用方式，类似 Python 的工具函数）
```

#### 6. 编写核心模块

**`types/robot.ts`** — TypeScript 类型定义
- 定义后端返回数据的类型（如 RobotStatus 包含 robot_id、battery、position 等字段）
- 作用类似于 API 文档：编辑器会根据类型提示自动补全，字段名写错会报红线，不用等运行时才发现 bug
- 与后端 API 返回的 JSON 字段一一对应

**`api/robot.ts`** — API 请求封装
- 把 Axios HTTP 请求封装成简洁的函数，如 `getRobots()`、`sendCommand(robotId, req)`
- 其他组件只需调用函数，不直接关心 URL 和请求细节

**`stores/robot.ts`** — 状态管理
- 用 Pinia 管理所有机器人相关数据：机器人列表、当前选中哪个、WebSocket 是否连接
- 任何组件都能从这里读取最新状态（比如顶栏显示"3/5 robots online"），也能调用 action 修改状态（比如点击机器人卡片 → 选中该机器人）

**`router/index.ts`** — 路由配置
- 目前只有一个路由：访问 `/` 显示 Dashboard 首页

**`layouts/AppLayout.vue`** — 主布局
- 整个页面的骨架：顶部导航栏 + 下方内容区
- 顶栏显示：标题、WebSocket 连接状态指示灯、发现按钮、在线/总数机器人计数
- 内容区由具体页面填充

**`views/DashboardView.vue`** — 主页
- 左侧：机器人卡片列表（ID、在线状态、电量、模式）
- 右侧：详情区（Step 2.3 会填充具体内容）

**`styles/global.scss`** — 全局样式
- 深色主题配色（参考 Sentry/Linear 风格的数据密集仪表盘）
- CSS 变量定义主色、背景色、边框色，一处修改全局生效
- Element Plus 组件的深色模式覆盖
- 细滚动条样式

#### 7. 构建验证

- `vite build` 命令将所有 TypeScript/Vue/SCSS 编译压缩为浏览器可直接运行的 JS/CSS/HTML，验证无语法错误
- 开发服务器 `localhost:3000` 可正常访问页面

---

### Step 2.2 — 后端 WebSocket API + 前端 WebSocket 客户端 ✅ (工时: 4h, 难度: ★★★)

**目标**：让浏览器和服务器之间建立一条"实时通道"，机器人一有变化，界面立刻就能看到。

> **为什么需要 WebSocket？**
> 传统 HTTP 是"请求-响应"模式：前端发请求 → 后端返回数据。如果前端想知道机器人最新状态，只能每隔几秒请求一次（轮询），既浪费资源又有延迟。
> WebSocket 是"长连接"模式：前后端建立连接后，后端随时可以主动推送数据给前端，延迟低、开销小，适合实时监控场景。

#### 1. 实现 WebSocket 连接管理器（`ws_manager.py`）

管理所有浏览器与后端之间的 WebSocket 连接。

- **连接池**：多个浏览器可以同时连接（比如操作员开多个标签页），所有连接维护在一个列表中
- **广播（broadcast）**：向所有连接的浏览器同时发送同一条消息（如"机器人 A 上线了"）
- **定向推送（send_to）**：只向某一个浏览器发送消息
- **线程安全广播（broadcast_sync）**：这是最关键的难点——
  - MQTT 的消息回调运行在 MQTT 自己的线程中
  - WebSocket 的发送操作必须在 asyncio 的事件循环线程中执行
  - 两个线程不能直接互相调用，否则会崩溃
  - 解决方案：通过 `call_soon_threadsafe` 把 async 任务安全地"投递"到事件循环中执行，相当于跨线程发了一个"请帮我执行这个任务"的通知

#### 2. 改造 WebSocket 端点（`api.py`）

Phase 1 的 `/ws/live` 端点只是把收到的消息原样回显（echo），现在改为真正的双向通信通道。

**服务端 → 前端（推送）**：

| 消息类型 | 含义 | 触发时机 |
|---------|------|---------|
| robot_online | 机器人上线 | 收到机器人状态或发现响应 |
| robot_offline | 机器人离线 | 心跳超时 |
| status_update | 状态更新 | 每次收到机器人上报的最新位置/速度/电量等 |
| event | 告警事件 | 机器人报告异常（如电量低、传感器故障） |
| cmd_ack | 指令确认 | 机器人确认收到并执行了控制指令 |

**前端 → 服务端（请求）**：

| 消息类型 | 含义 |
|---------|------|
| command | 发送控制指令（速度/模式切换等） |
| subscribe | 订阅机器人话题 |
| unsubscribe | 取消订阅 |
| discover | 请求发现在线机器人 |
| ping | 心跳包（前端定期发送，确认连接还活着） |

**连接初始化快照**：浏览器刚连上 WebSocket 时，后端自动推送当前所有机器人的状态，前端无需再发 HTTP 请求获取初始数据，一步到位。

**lifespan 生命周期管理**：FastAPI 启动时，将当前 asyncio 事件循环的引用注入 WsManager，这样 `broadcast_sync` 才知道往哪个事件循环投递任务。

#### 3. 扩展 RobotManager 回调机制（`robot_manager.py`）

RobotManager 原来只有"机器人上线/离线"两个回调。现在新增三个：

| 回调 | 触发时机 | 用途 |
|------|---------|------|
| on_status_update | 每次收到机器人状态上报 | 推送最新位置/速度/电量到前端 |
| on_event | 收到机器人告警事件 | 前端弹出告警通知 |
| on_cmd_ack | 收到指令执行确认 | 前端显示指令执行结果（成功/失败） |

#### 4. 组装回调链路（`main.py`）

在启动入口中把各组件串起来，形成完整的数据通路：

```
机器人 → MQTT → MQTTHandler → RobotManager → push_*() → WsManager.broadcast_sync → WebSocket → 浏览器
```

具体来说：
1. MQTTHandler 收到消息 → 调用 RobotManager 的处理方法
2. RobotManager 处理完 → 触发回调函数
3. 回调函数调用 api.py 的 `push_*()` 辅助函数
4. `push_*()` 调用 `WsManager.broadcast_sync()` 向所有浏览器广播
5. 前端收到消息 → 更新界面

#### 5. 前端 WebSocket 客户端

**`composables/useWebSocket.ts`** — WebSocket 连接管理

封装浏览器原生 WebSocket API，增加生产环境必需的健壮性机制：

- **自动重连**：网络断开后自动尝试重新连接，采用指数退避策略（1s → 2s → 4s → 8s → ... → 最大 30s），避免服务器压力大时所有客户端同时重连造成雪崩
- **心跳保活**：每 30 秒发送 ping 消息，后端回复 pong，确认连接还活着。如果网络设备（如 NAT 网关）长时间看不到数据包会自动断开空闲连接，心跳可以防止这种情况
- **消息分发**：收到消息后根据 type 字段分发到 Pinia store 的 `handleWsMessage` 方法处理
- **自动清理**：Vue 组件卸载时自动断开 WebSocket，避免内存泄漏

**`composables/useGlobalWebSocket.ts`** — 全局初始化

- 自动推算 WebSocket URL：根据当前页面的协议和地址生成连接地址（页面用 https 则用 wss，页面用 http 则用 ws）
- 在 App.vue 根组件挂载，应用启动即自动连接，全局生效

#### 6. 其他前端更新

- `stores/robot.ts`：新增 `setWsConnected()` 方法，WebSocket 连接/断开时更新状态，顶栏的连接指示灯实时反映
- `types/robot.ts`：扩展 WsMessage 类型，增加后端新增的 message 类型（command_sent、subscribe_sent、error、pong 等）
- `App.vue`：挂载 `useGlobalWebSocket`，应用启动即自动连接 WebSocket

#### 7. 验证

- 前端 `vite build` 构建通过，无 TypeScript 类型错误
- 后端 Python 文件语法编译通过，模块导入正常

---

### Step 2.3 — 前端机器人列表与状态面板 ✅ (工时: 3h, 难度: ★★☆)

**目标**：在页面上显示机器人列表和详细信息，让操作员能看到每台机器人的位置、速度、电量，还有趋势图。

#### 1. Store 历史数据记录（`stores/robot.ts`）

之前 Store 只保存机器人"最新状态"（当前电量多少、当前位置在哪），无法看到趋势。这一步加入历史数据追踪。

- **robotHistory**：一个 Map，key 是机器人 ID，value 是该机器人的历史数据（类比：每个机器人一个时序数据库表）
- **HistoryPoint**：单条历史记录，只有 `timestamp` + `value`，轻量设计
- **RobotHistory**：三类历史数据——battery（电量）、velocityLinear（线速度）、velocityAngular（角速度），各是一个 HistoryPoint 数组
- **appendHistory()**：每次收到 WebSocket `status_update` 推送时自动追加一条记录（类比：像采集传感器数据一样，每收到一次就 append 一次）
- **MAX_HISTORY_LENGTH = 120**：每个数组最多保留 120 个点（类比：循环缓冲区，超出就丢弃最旧的数据，防止内存无限增长）
- **selectedHistory computed**：当前选中机器人的历史数据，直接传给图表组件

#### 2. 机器人状态面板（`components/RobotStatusPanel.vue`）

显示单个机器人的详细状态信息，纯展示组件（只读，不发送任何指令）。

布局结构：

```
┌─────────────────────────────────────┐
│ robot_001  [AUTO]          [ONLINE] │  ← 头部：ID + 模式标签 + 在线状态
├─────────────────────────────────────┤
│ ⚡ Battery    ████████████░░ 78%    │  ← 电量进度条（颜色随电量变化）
│ 📍 Position   X: 1.23  Y: 4.56  θ: 90.0° │  ← 位置坐标
│ 🚗 Velocity   Linear: 0.300 m/s   │  ← 速度
│              Angular: 0.100 rad/s  │
│ ⏱ Uptime     1h 23m 45s           │  ← 运行时长
│ 🖥 System    ROS 1  192.168.1.101  │  ← ROS 版本 + IP
└─────────────────────────────────────┘
```

交互细节：
- **模式标签颜色**：AUTO=橙色(warning)、MANUAL=蓝色(primary)、STOP=灰色(info)
- **电量颜色**：>60% 绿色、20%~60% 橙色、≤20% 红色（直观反映电量是否危急）
- **在线状态**：绿色 ONLINE / 红色 OFFLINE
- **数字格式化**：位置/速度保留 2~3 位小数，运行时间格式化为 "1h 23m 45s"
- **缺失数据兼容**：字段为空时显示 "—" 而不是空白或报错

#### 3. 实时数据图表（`components/RobotCharts.vue`）

用 ECharts 渲染两条实时曲线，是整个界面的数据密集核心。

**ECharts 按需加载**：
- ECharts 完整包约 1MB，但本项目只用折线图。按需加载只引入用到的模块（LineChart、GridComponent、TooltipComponent、DataZoomComponent、CanvasRenderer），把包体积从 1MB 压缩到约 200KB
- 类比：Python 里 `from matplotlib import pyplot` 而不是 `import matplotlib`

**图表 1 — Battery（电量曲线）**：
- 绿色折线 + 渐变填充区域（从上方 30% 透明到底部接近透明），视觉效果更丰富
- Y 轴固定 0~100%，直观反映电量比例

**图表 2 — Velocity（速度双线曲线）**：
- 蓝色线 = 线速度（linear），橙色线 = 角速度（angular）
- 双线对比，操作员可以同时看到前进速度和转向速度
- 右上角图例区分两条线

**通用设计**：
- **深色主题**：背景、坐标轴、网格线、tooltip 全部匹配全局深色变量，不突兀
- **dataZoom（数据缩放）**：默认显示最近 30% 的数据（70%~100%），用户可以鼠标滚轮缩放查看更早的历史
- **smooth 平滑曲线**：数据点之间自动平滑，避免锯齿感
- **showSymbol=false**：不显示每个数据点的小圆点（120 个点挤在一起会密密麻麻），只显示趋势线

#### 4. DashboardView 集成

右侧详情区的组件排列（从上到下）：

```
┌─────────────────────────┐
│   RobotStatusPanel      │  ← 基本状态
├─────────────────────────┤
│   RobotCharts           │  ← 实时图表
│   ├ Battery 曲线        │
│   └ Velocity 双线曲线   │
└─────────────────────────┘
```

- 纵向排列，16px 间距
- 未选中机器人时显示 "Select a robot to view details" 空状态

#### 5. 验证

- `vue-tsc` 类型检查通过
- `vite build` 构建通过，无错误

---

### Step 2.4 — 前端控制面板 ✅ (工时: 3h, 难度: ★★☆)

**目标**：让操作员能在网页上操控机器人——调速、切换模式、发自定义指令，还能看到每条指令是执行成功还是失败了。

> **核心链路回顾**：
> ```
> 前端发指令 → WebSocket → 后端 api._ws_handle_command → mqtt_handler → 机器人
>                                                                          ↓
> 前端收到确认 ← WebSocket ← push_cmd_ack ← robot_manager ← 机器人 ack
> ```
> 前端通过 WebSocket 发 `{ type: "command", robot_id, action, params }`，后端处理后返回 `command_sent`（已发出），机器人执行完返回 `cmd_ack`（结果确认）。

#### 1. 新增指令追踪类型（`types/robot.ts`）

为追踪指令从"发送"到"确认"的全过程，定义以下类型：

- **CommandStatus**：指令状态枚举——`pending`（已发未确认）、`ack_ok`（确认成功）、`ack_failed`（确认失败）、`timeout`（30 秒无确认，判定超时）
- **CommandTracking**：单条指令的追踪记录，包含 exec_id、robot_id、action、params、status、result_message、sent_at、ack_at
- **CmdAckData**：后端 `cmd_ack` 推送的数据格式（exec_id + result + message）

类比：这就像一个订单追踪系统——下单后状态是"待确认"，商家确认后变为"已确认"或"确认失败"，超时未确认标记"超时"。

#### 2. Store 指令追踪能力（`stores/robot.ts`）

在 Store 中新增完整的指令生命周期管理：

**新增状态**：
- **pendingCommands**：Map<exec_id, CommandTracking>，所有已发送指令的追踪记录
- **wsSend**：WebSocket 的 send 函数引用（由 useGlobalWebSocket 注入，下文详述）
- **selectedCommands**：computed，当前选中机器人的指令列表（按时间倒序，最多 20 条）

**新增 Actions**：

| Action | 作用 | 类比 |
|--------|------|------|
| `setWsSend(fn)` | 注入 WebSocket send 函数 | 把"发信通道"交给 Store，Store 可以直接发消息 |
| `sendCommand(action, params)` | 发送控制指令 + 创建追踪记录 | 下单：提交订单并记录到追踪系统 |
| `handleCmdAck(msg)` | 处理指令确认，更新追踪状态 | 收到回执：标记订单为已确认/失败 |

**sendCommand 流程**：
1. 生成唯一 exec_id（格式 `ws_{时间戳36进制}_{计数器36进制}`，短且不重复）
2. 调用 `wsSend()` 发送 WebSocket 消息
3. 创建 CommandTracking 记录写入 pendingCommands，状态为 `pending`
4. 清理超量已完结指令

**handleCmdAck 流程**：
1. 从 cmd_ack 消息中取出 exec_id
2. 在 pendingCommands 中找到对应记录
3. result === "ok" → 状态改为 `ack_ok`，否则改为 `ack_failed`
4. 记录 ack_at 时间和 result_message

**超时检测**：每次收到 status_update 时顺带检查——如果有 pending 状态超过 30 秒的指令，自动标记为 `timeout`。类比：订单超时自动取消。

**超量清理**：pendingCommands 最多保留 50 条。超过时优先删除最旧的已完结指令（ack_ok/ack_failed/timeout），pending 状态的指令不会被删除。

#### 3. WebSocket send 注入（`composables/useGlobalWebSocket.ts`）

**问题**：Store 的 `sendCommand` 需要通过 WebSocket 发消息，但 WebSocket 连接由 `useWebSocket` composable 管理，Store 不能直接访问。

**解决方案**：
- Store 新增 `wsSend` ref 和 `setWsSend(fn)` 方法
- `useGlobalWebSocket` 在初始化 WebSocket 时，把 `send` 函数通过 `robotStore.setWsSend(send)` 注入 Store
- Store 调用 `this.wsSend({ type: 'command', ... })` 即可发消息

类比：Store 是业务部门，WebSocket 是通信部门。业务部门不直接打电话，而是通过内部通讯录（wsSend）找到通信部门的发信通道来发消息。

#### 4. 控制面板组件（`components/ControlPanel.vue`）

三个功能区块，纵向排列：

##### 区块 1：速度控制

```
Velocity Control
┌────────────────────────────────────────┐
│ Linear (m/s)   ━━━━━━●━━━  [1.2]     │  ← el-slider，0~2.0，步长 0.1
│ Angular (rad/s) ━━●━━━━━━━  [0.0]     │  ← el-slider，-1.5~1.5，步长 0.1
│                                        │
│ [  Send Velocity  ]                    │  ← 发送按钮
└────────────────────────────────────────┘
```

- 两个 `el-slider`，带数值输入框（`show-input`），操作员可以拖滑块也可以直接输数字
- 点击发送 → `sendCommand('velocity', { linear, angular })`
- 发送后按钮短暂显示 loading 状态（500ms），给操作员操作反馈

##### 区块 2：模式控制

```
Mode Control
┌────────────────────────────────────────┐
│ [AUTO] [MANUAL] [STOP]                 │  ← el-radio-group，点击即发送
│                                        │
│ [EMERGENCY STOP]  [Return Home]        │  ← 紧急停止 + 返航
└────────────────────────────────────────┘
```

- `el-radio-group` 三选一：选中即触发 `sendCommand('mode', { mode })`
- **紧急停止**：红色 danger 按钮，始终醒目，点击 → `sendCommand('stop', {})`
- **返航**：普通按钮，点击 → `sendCommand('return_home', {})`
- 后端会做语义映射：stop → mode(stop)，return_home → nav_goal(target=home)

##### 区块 3：自定义指令

```
▼ Custom Command                        ← 折叠面板，默认收起
┌────────────────────────────────────────┐
│ [Topic name (e.g. /cmd_vel)         ] │
│ ┌────────────────────────────────────┐ │
│ │ JSON payload (e.g. {"linear":0.5})│ │  ← textarea
│ └────────────────────────────────────┘ │
│ [Send Custom]                          │
└────────────────────────────────────────┘
```

- 使用 `el-collapse` 折叠面板，高级功能默认收起，不占常用空间
- 输入 ROS topic 名称 + JSON 格式参数
- **JSON 合法性校验**：`customPayloadValid` computed 实时检查 JSON 是否可解析，不合法时发送按钮禁用
- 发送 → `sendCommand('custom', { topic, payload })`

##### 禁用逻辑

所有控件在以下任一条件成立时禁用（变灰不可点击）：
- 未选中机器人
- 选中机器人已离线
- WebSocket 未连接

这防止了操作员向不存在的机器人或断连状态下发指令。

#### 5. 指令追踪组件（`components/CommandTracker.vue`）

显示当前选中机器人的指令执行历史，让操作员知道每条指令的结果。

```
Command History
┌──────────────────────────────────────────┐
│ ▎Velocity                    [OK]        │  ← 绿色左边框 = 成功
│ ▎  15:30:42                              │
│ ─────────────────────────────────────── │
│ ▎Mode                        [PENDING]   │  ← 黄色左边框 = 等待中
│ ▎  15:31:05  ▓▓▓▓░░░░                  │  ← 动画条
│ ─────────────────────────────────────── │
│ ▎E-Stop                      [FAILED]    │  ← 红色左边框 = 失败
│ ▎  15:31:20  Robot not responding       │
│ ─────────────────────────────────────── │
│ ▎Velocity                    [TIMEOUT]   │  ← 灰色左边框 = 超时
│ ▎  15:29:50  Command timed out (30s)     │
└──────────────────────────────────────────┘
```

设计要点：
- **左侧彩色边框**：不同状态用不同颜色的 3px 左边框，一眼就能区分（pending=黄、ack_ok=绿、ack_failed=红、timeout=灰）
- **状态标签**：el-tag 小标签，颜色与边框一致
- **pending 动画条**：等待中的指令底部有 2px 高的动画条（一个黄色小方块从左滑到右循环），视觉提示"这条还在等"
- **自动滚动**：新指令加入时列表自动滚到底部，确保最新的指令可见
- **最多 20 条**：通过 store 的 `selectedCommands` computed 限制，避免列表过长

#### 6. DashboardView 集成

右侧详情区最终组件排列（从上到下）：

```
┌─────────────────────────┐
│   RobotStatusPanel      │  ← 基本状态（Step 2.3）
├─────────────────────────┤
│   ControlPanel          │  ← 控制面板（Step 2.4 新增）
│   ├ Velocity Control    │
│   ├ Mode Control        │
│   └ Custom Command      │
├─────────────────────────┤
│   RobotCharts           │  ← 实时图表（Step 2.3）
│   ├ Battery 曲线        │
│   └ Velocity 双线曲线   │
├─────────────────────────┤
│   CommandTracker        │  ← 指令追踪（Step 2.4 新增）
└─────────────────────────┘
```

控制面板放在状态面板下方、图表上方——操作员先看状态，再操控，然后看图表确认效果，最后查看指令结果。逻辑顺序与操作流程一致。

#### 7. 验证

- `vue-tsc` 类型检查通过
- `vite build` 构建通过，无错误

---

### Step 2.5 — 前端话题订阅管理 ✅ (工时: 3h, 难度: ★★☆)

**目标**：让操作员可以在界面上看机器人有什么传感器（摄像头、激光雷达等），订阅想看的数据，实时查看内容。

> **核心链路回顾**：
> ```
> 前端发订阅 → WebSocket → 后端 api → mqtt_handler.send_topic_subscribe → MQTT topic/request
>     → Agent 收到 → 创建 ROS subscriber → 转发话题数据 → MQTT sensor topic
>     → 后端 mqtt_handler.handle_sensor_message → robot_manager → push_sensor_data → 前端
> ```
> 操作员发起订阅后，Agent 开始转发该话题的数据，数据通过 MQTT → 后端 → WebSocket 链路持续推送到前端。

#### 1. 后端链路补全（`robot_manager.py`）

Step 2.5 之前后端缺少话题响应和传感器数据的 WebSocket 推送能力，先补齐后端链路：

- **handle_topic_response**：处理 Agent 对话题订阅/取消的确认响应
  - 从消息中解析 action/topic/msg_type/freq_limit/result
  - 成功订阅时更新 `RobotInfo.subscribed_topics` 字典
  - 取消订阅时清除对应记录
  - 触发 `on_topic_response` 回调 → WebSocket 推送到前端

- **handle_sensor_data**：处理 Agent 发来的传感器数据
  - 尝试 JSON 解析（轻量话题的 MQTT + JSON 传输）
  - 二进制 payload（中等话题）暂留存为 debug 日志
  - 写入 `RobotInfo.latest_sensor_data` 字典
  - 触发 `on_sensor_data` 回调 → WebSocket 推送到前端

- **WebSocket 推送回调**：`api.py` 新增 `push_topic_response()` 和 `push_sensor_data()` 函数

#### 2. Store 话题管理能力（`stores/robot.ts`）

**新增状态**：
- **subscribedTopics**：Map<robotId, TopicSubscription[]>，按机器人管理已订阅话题列表
- **sensorData**：Map<robotId, Map<sensorName, SensorData>>，层级 Map 缓存最新传感器数据
- **topicResponseBuffer**：暂存 topic_response 消息（request_id 匹配用）

**新增 Actions**：
| Action | 作用 |
|--------|------|
| `subscribeTopic(topic, msgType, freqLimit)` | 通过 WebSocket 发送话题订阅请求 |
| `unsubscribeTopic(topic)` | 通过 WebSocket 发送取消订阅请求 |
| `handleTopicResponse(msg)` | 处理订阅/取消确认，更新订阅状态表 |
| `handleSensorData(msg)` | 将收到的传感器数据写入 sensorData Map |
| `selectedSubscriptions` computed | 当前选中机器人的话题订阅列表（含 status：active/pending/error） |
| `selectedSensorData` computed | 当前选中机器人的最新传感器数据 Map |

**订阅状态模型**：每条订阅有三个状态：
- **active**：订阅确认成功，话题数据正在传输
- **pending**：已发订阅请求，等待 Agent 确认
- **error**：订阅确认失败或不支持

#### 3. 话题管理组件（`components/TopicManager.vue`）

整个界面三个折叠区域：

##### 区块 1：Available Topics（可用话题列表）

- 从 `selectedRobot.available_topics` 读取机器人上报的话题列表
- `el-table` 表格展示：Topic 名 + 消息类型 + 订阅按钮
- 已订阅的话题显示 "Active" 标签，未订阅的显示 "Subscribe" 文字按钮
- 点击 Subscribe → 弹出频率设置对话框

##### 频率设置对话框

- `el-dialog` 弹窗，展示话题名、消息类型
- `el-slider` 滑块设置频率（0.5~30 Hz，步长 0.5），带数值输入
- 默认频率 10Hz
- 确认后调用 `subscribeTopic(topic, msgType, freqLimit)`

##### 区块 2：Subscribed Topics（已订阅话题）

- 表格展示：Topic 名 + 消息类型 + 频率 + 状态标签 + 取消订阅按钮
- 取消订阅带 `el-popconfirm` 二次确认（防止误操作）
- 状态标签颜色：active=绿色、pending=黄色、error=红色

##### 区块 3：Sensor Data（传感器实时数据）

- 从 `selectedSensorData` Map 读取已订阅话题的最新数据
- `el-collapse` 按传感器名称展开查看
- 三种数据类型渲染：
  - **图像（CompressedImage）**：base64 解码 → `<img>` 标签渲染
  - **LaserScan**：`el-descriptions` 表格展示参数摘要（角度范围、距离范围、最近障碍物等）
  - **通用数据类型（IMU/GPS/Odometry等）**：`flattenData()` 将嵌套对象展平为 key-value 表格
- 内部字段（`_` 开头）过滤不显示

**兼容性处理**：
- 可用话题格式可能为 `{topic, msg_type}` 或 `{name, msg_type}`，做了兼容映射

#### 4. 验证

- `vue-tsc` 类型检查通过
- `vite build` 构建通过

---

### Step 2.6 — 前端视觉设计与打磨 ✅ (工时: 2h, 难度: ★★☆)

**目标**：统一界面风格，让所有页面看起来是一套完整的产品，而不是东拼西凑的组件。整体用深色主题。

#### 1. 设计令牌体系（`styles/global.scss`）

定义 7 大类 CSS 变量覆盖全局样式：

**颜色系统**（Indigo 主色调 `#6366f1`）：
| 变量 | 值 | 用途 |
|------|----|------|
| `--bg-primary` | `#0f1117` | 页面底色 |
| `--bg-secondary` | `#1a1d27` | 卡片/面板背景 |
| `--bg-tertiary` | `#22253a` | 悬浮态/选中态 |
| `--bg-elevated` | `#262940` | 弹出层/对话框 |
| `--accent` | `#6366f1` | 主色（替代 Element Plus 默认蓝） |
| `--success` | `#22c55e` | 语义色：成功/在线 |
| `--warning` | `#f59e0b` | 语义色：警告/等待 |
| `--danger` | `#ef4444` | 语义色：危险/离线 |

**间距系统**：4/8/12/16/20/24px 六级（`--space-xs` 到 `--space-2xl`）

**圆角系统**：4/6/8/12px 四级（`--radius-sm` 到 `--radius-xl`）

**阴影系统**：三级（`--shadow-sm/md/lg`），叠加在卡片和弹窗上

**字体层级**：
| 变量 | 用途 |
|------|------|
| `--font-size-xs: 11px` | 辅助信息/时间戳 |
| `--font-size-sm: 12px` | 标签/图例/标题 |
| `--font-size-md: 13px` | 正文/按钮 |
| `--font-size-lg: 14px` | 副标题 |
| `--font-size-xl: 16px` | 主标题/数值 |
| `--font-size-2xl: 18px` | 页面标题/robot ID |
| `--font-family-mono` | 技术数据等宽字体（ID、时间、数值） |

**Element Plus 深色覆盖**：
- 主色映射到 indigo（`--el-color-primary` → `var(--accent)`）
- 语义色映射（success/warning/danger/info）
- 深色组件覆盖：Table/Collapse/Slider/RadioButton/Progress/Descriptions/Dialog

**共享面板类**：
- `.panel-card`：基准卡片（背景色 + 边框 + 圆角 + 微阴影 + hover 边框高亮）
- `.panel-title`：面板区块标题（大写 + 半粗 + 字间距）
- `.panel-header`：面板头部（flex + 间距 + 底部分割线）
- `.panel-body`：面板内容区域

#### 2. 组件硬编码颜色消除

逐个组件将所有硬编码 hex 值替换为 CSS 变量引用：

| 文件 | 变更范围 |
|------|------|
| `AppLayout.vue` | 背景色、边框色、文字色 → CSS 变量；顶栏高度收紧至 48px |
| `DashboardView.vue` | 侧栏卡片用 `.panel-card` 类；机器人卡片颜色 → CSS 变量 |
| `RobotStatusPanel.vue` | 面板样式，batteryColor 从硬编码 hex → `var(--success/warning/danger)` |
| `RobotCharts.vue` | 图表块样式；ECharts 配置通过 `getChartColor()` 从 CSS 变量读取颜色 |
| `ControlPanel.vue` | 面板区块样式、折叠面板样式 |
| `CommandTracker.vue` | 指令条目样式、状态左边框色 → 语义色变量 |
| `TopicManager.vue` | 全部颜色、折叠面板、传感器展示、表格/对话框深色适配 → CSS 变量 |

#### 3. 卡片层次感

- 所有卡片添加 `box-shadow: var(--shadow-sm)` 微阴影
- 添加 `:hover { border-color: var(--border-color-light) }` 悬浮边框高亮
- 过渡动效统一使用 `--transition-normal: 0.2s ease`

#### 4. 数据密度调优

- 间距收紧：`padding: 20px → 16px`，`gap: 16px → 12px`，卡片间距 `20px → 16px`
- 顶栏高度：`56px → 48px`
- 字体层级下降：标题 `18px → 14px`，正文 `14px → 13px`，标签 `12px → 11px`
- 数字使用 `font-variant-numeric: tabular-nums` 对齐
- 时间戳和 robot_id 使用等宽字体 `--font-family-mono`

#### 5. 构建修复

修复 `vue-tsc` 构建过程中暴露的 3 个预存类型错误：

| 问题 | 文件 | 修复 |
|------|------|------|
| `baseUrl` 在 TS 7.0 弃用 | `tsconfig.app.json` | 添加 `ignoreDeprecations: "6.0"` |
| `el-radio-group @change` 参数含 `undefined` | `ControlPanel.vue` | 参数类型增加 `｜ undefined`，加空值判断 |
| `el-tag type=""` 不是合法值 | `RobotStatusPanel.vue` | `modeTagType` 的 MANUAL 分支返回 `undefined` 代替 `''` |

#### 6. 验证

- `vue-tsc -b` 类型检查通过
- `vite build` 构建成功（CSS 115KB + 359KB，JS 570KB + 1028KB）
- 后端 81 测试全过

---

## 关键成果

1. **前后端实时通道打通**：机器人状态变化经 MQTT → 后端 → WebSocket 链路秒级推送到浏览器界面，无需前端轮询
2. **WebSocket 双向通信**：前端不仅被动接收推送，还能通过 WebSocket 直接发送控制指令和订阅请求，REST API 和 WebSocket 两条路都能操控机器人
3. **连接健壮性**：自动重连 + 心跳保活 + 连接初始化快照，网络波动或页面刷新后前端能自动恢复到最新状态
4. **线程安全设计**：解决了 MQTT 回调线程与 asyncio 事件循环的跨线程通信问题，保证系统稳定运行
5. **实时数据可视化**：电量曲线 + 速度双线曲线，120 点历史数据滚动展示，数据缩放可查历史
6. **全链路指令控制**：速度调节 → 模式切换 → 紧急停止 → 返航 → 自定义指令，覆盖常见操控场景
7. **指令全生命周期追踪**：pending → ack_ok/ack_failed/timeout，操作员对每条指令的状态一目了然，30 秒超时自动标记
8. **话题按需订阅**：可用话题浏览 → 频率设置 → 订阅/取消 → 传感器数据实时展示（图像/激光雷达/通用）
9. **统一设计令牌体系**：7 类 50+ CSS 变量，Indigo 主色调，深色仪表盘风格，所有组件颜色/间距/字体统一走令牌
10. **全组件 0 硬编码颜色**：8 个 Vue 组件 + 布局文件全部改为 CSS 变量引用，一处修改全局生效

## 当前状态

**Phase 2** 全部 6 个 Step（2.1 ~ 2.6）已完成 ✅
**Phase 3** 全部 4 个 Step（3.1 ~ 3.4）已完成 ✅（详见 phase3-worklog.md）
**Phase 4** ROS 2 支持 + 通用化 — 待开始

---

## 工作量小结

| 步骤 | 内容 | 工时 | 难度 | 主要工作 |
|------|------|------|------|---------|
| 2.1 | 前端项目搭建 | 2h | ★☆☆ | 搭框架、装依赖、配代理 |
| 2.2 | 实时通信通道 | 4h | ★★★ | WebSocket 双向通信、跨线程推送 |
| 2.3 | 状态面板 + 图表 | 3h | ★★☆ | 状态信息展示、实时曲线图 |
| 2.4 | 控制面板 + 指令追踪 | 3h | ★★☆ | 速度/模式控制、指令状态跟踪 |
| 2.5 | 话题订阅管理 | 3h | ★★☆ | 浏览话题、订阅/取消、看传感器数据 |
| 2.6 | 视觉设计 | 2h | ★★☆ | 深色主题、统一风格 |
| **合计** | **6 个步骤** | **~17h** | — | — |

## 名词解释（给非技术人员）

| 术语 | 大白话解释 |
|------|-----------|
| Vue 3 | 帮我们把页面拆成组件拼装的框架 |
| Vite | 写完代码自动刷新浏览器，不用手动刷新 |
| WebSocket | 一条"专线"，服务器能主动给浏览器发消息 |
| MQTT | 机器人跟服务器之间的通信协议 |
| Pinia | 全局数据管理中心，所有组件从这里读数据 |
| ECharts | 画折线图的工具 |
| Element Plus | 现成按钮、弹窗、滑块等组件，不用自己写 |
| CSS 变量 | 定义好的颜色和样式，改一处全局自动更新 |
| TypeScript | JavaScript 的加强版，写错会提前报错 |
