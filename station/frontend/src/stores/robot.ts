/**
 * 机器人状态 Store
 * 管理机器人列表、当前选中、WebSocket 实时更新、历史数据、指令追踪
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RobotStatus, WsMessage, CommandTracking, CmdAckData, TopicResponseData, SensorDataPayload, SubscribedTopicDetail, RobotEvent, SensorMetaPayload, PointCloudStream } from '@/types/robot'
import { getRobots, discoverRobots, getRecordingStatus, startRecording, stopRecording, pauseRecording, resumeRecording } from '@/api/robot'

/** 历史数据点 */
export interface HistoryPoint {
  timestamp: number
  value: number
}

/** 单个机器人的历史数据 */
export interface RobotHistory {
  battery: HistoryPoint[]
  velocityLinear: HistoryPoint[]
  velocityAngular: HistoryPoint[]
}

/** 历史数据最大保留条数 */
const MAX_HISTORY_LENGTH = 120

/** 指令追踪最大保留条数 */
const MAX_PENDING_COMMANDS = 50

/** 指令超时时间（ms） */
const COMMAND_TIMEOUT_MS = 30_000

/** 自增 exec_id 计数器 */
let _execIdCounter = 0
function nextExecId(): string {
  _execIdCounter++
  return `ws_${Date.now().toString(36)}_${_execIdCounter.toString(36)}`
}

export const useRobotStore = defineStore('robot', () => {
  // ============================================================
  // State
  // ============================================================

  /** 所有机器人状态 */
  const robots = ref<Map<string, RobotStatus>>(new Map())

  /** 当前选中机器人 ID（单选用） */
  const selectedRobotId = ref<string>('')

  /** 当前选中多个机器人 ID（多选用） */
  const selectedRobotIds = ref<Set<string>>(new Set())

  /** WebSocket 连接状态 */
  const wsConnected = ref(false)

  /** 各机器人历史数据 */
  const robotHistory = ref<Map<string, RobotHistory>>(new Map())

  /** 指令追踪 Map（key = exec_id） */
  const pendingCommands = ref<Map<string, CommandTracking>>(new Map())

  /** 传感器实时数据 {robot_id → {sensor_name → data_dict}} */
  const sensorData = ref<Map<string, Map<string, Record<string, unknown>>>>(new Map())

  /** 话题订阅追踪 {robot_id → SubscribedTopicDetail[]} */
  const topicSubscriptions = ref<Map<string, SubscribedTopicDetail[]>>(new Map())

  /** 机器人事件 {robot_id → RobotEvent[]} */
  const robotEvents = ref<Map<string, RobotEvent[]>>(new Map())

  // ============================================================
  // 点云流状态
  // ============================================================

  /** 点云流状态 {robot_id → {topic → PointCloudStream}} */
  const pointCloudStreams = ref<Map<string, Map<string, PointCloudStream>>>(new Map())

  /** WebSocket send 函数（由 useGlobalWebSocket 注入） */
  const wsSend = ref<((msg: Record<string, unknown>) => void) | null>(null)

  // ============================================================
  // 录制状态
  // ============================================================

  /** 录制状态 */
  const recordingState = ref<'off' | 'recording' | 'paused'>('off')
  /** 录制已持续秒数 */
  const recordingElapsed = ref(0)
  /** 已记录数据点数 */
  const recordingRecords = ref(0)
  /** 录制状态轮询定时器 */
  let _recordingTimer: ReturnType<typeof setInterval> | null = null

  // ============================================================
  // Getters
  // ============================================================

  /** 机器人列表 */
  const robotList = computed(() => Array.from(robots.value.values()))

  /** 在线机器人列表 */
  const onlineRobots = computed(() => robotList.value.filter((r) => r.online))

  /** 当前选中机器人（兼容单选中） */
  const selectedRobot = computed(() => {
    if (!selectedRobotId.value) return null
    return robots.value.get(selectedRobotId.value) ?? null
  })

  /** 当前选中的多个机器人 */
  const selectedRobots = computed(() => {
    if (selectedRobotIds.value.size > 0) {
      return Array.from(selectedRobotIds.value)
        .map((id) => robots.value.get(id))
        .filter((r): r is RobotStatus => r != null)
    }
    if (selectedRobotId.value) {
      const r = robots.value.get(selectedRobotId.value)
      return r ? [r] : []
    }
    return []
  })

  /** 选中的机器人数量 */
  const selectedCount = computed(() => {
    if (selectedRobotIds.value.size > 0) return selectedRobotIds.value.size
    if (selectedRobotId.value) return 1
    return 0
  })

  /** 当前选中机器人的历史数据 */
  const selectedHistory = computed(() => {
    if (!selectedRobotId.value) return null
    return robotHistory.value.get(selectedRobotId.value) ?? null
  })

  /** 当前选中机器人的指令追踪列表（按时间倒序，最多 20 条） */
  const selectedCommands = computed(() => {
    const ids = selectedRobotIds.value.size > 0
      ? Array.from(selectedRobotIds.value)
      : (selectedRobotId.value ? [selectedRobotId.value] : [])
    if (ids.length === 0) return []
    return Array.from(pendingCommands.value.values())
      .filter((c) => ids.includes(c.robot_id))
      .sort((a, b) => b.sent_at - a.sent_at)
      .slice(0, 20)
  })

  /** 当前选中机器人的传感器数据 */
  const selectedSensorData = computed(() => {
    const id = selectedRobotId.value || Array.from(selectedRobotIds.value)[0] || ''
    if (!id) return new Map<string, Record<string, unknown>>()
    return sensorData.value.get(id) ?? new Map<string, Record<string, unknown>>()
  })

  /** 当前选中机器人的订阅列表 */
  const selectedSubscriptions = computed(() => {
    if (!selectedRobotId.value) return []
    return topicSubscriptions.value.get(selectedRobotId.value) ?? []
  })

  // ============================================================
  // Actions
  // ============================================================

  /** 拉取机器人列表 */
  async function fetchRobots() {
    try {
      const { data } = await getRobots()
      const map = new Map<string, RobotStatus>()
      for (const robot of data.robots) {
        map.set(robot.robot_id, robot)
      }
      robots.value = map
    } catch (e) {
      console.error('[RobotStore] fetchRobots failed:', e)
    }
  }

  /** 发现机器人 */
  async function discover() {
    try {
      await discoverRobots()
    } catch (e) {
      console.error('[RobotStore] discover failed:', e)
    }
  }

  /** 选中机器人（单机点击） */
  function selectRobot(robotId: string) {
    selectedRobotId.value = robotId
    selectedRobotIds.value = new Set()  // 清除多选
  }

  /** 切换多选（checkbox） */
  function toggleRobotSelection(robotId: string) {
    const ids = new Set(selectedRobotIds.value)
    if (ids.has(robotId)) {
      ids.delete(robotId)
    } else {
      ids.add(robotId)
    }
    if (ids.size === 0) {
      // 没有选中时清空多选模式，恢复到未选中状态
      selectedRobotIds.value = new Set()
      selectedRobotId.value = ''
    } else {
      selectedRobotIds.value = ids
      selectedRobotId.value = ''  // 清除单选中
    }
  }

  /** 全选机器人 */
  function selectAllRobots() {
    const ids = new Set<string>()
    for (const robot of robots.value.values()) {
      ids.add(robot.robot_id)
    }
    selectedRobotIds.value = ids
    selectedRobotId.value = ''
  }

  /** 清除所有选中 */
  function clearSelection() {
    selectedRobotIds.value = new Set()
    selectedRobotId.value = ''
  }

  /** 设置 WebSocket 连接状态 */
  function setWsConnected(connected: boolean) {
    wsConnected.value = connected
  }

  /** 设置 WebSocket send 函数（由 useGlobalWebSocket 调用） */
  function setWsSend(fn: (msg: Record<string, unknown>) => void) {
    wsSend.value = fn
  }

  /** 发送控制指令（通过 WebSocket） */
  function sendCommand(action: string, params: Record<string, unknown>): string | null {
    if (!selectedRobotId.value || !wsSend.value) {
      console.warn('[RobotStore] Cannot send command: no robot selected or WS not connected')
      return null
    }

    const robotId = selectedRobotId.value
    const execId = nextExecId()

    // 发送 WebSocket 消息
    wsSend.value({
      type: 'command',
      robot_id: robotId,
      action,
      params,
    })

    // 写入指令追踪
    const tracking: CommandTracking = {
      exec_id: execId,
      robot_id: robotId,
      action,
      params,
      status: 'pending',
      result_message: '',
      sent_at: Date.now(),
    }
    pendingCommands.value.set(execId, tracking)

    // 清理超量已完结指令
    cleanupCommands()

    return execId
  }

  /** 批量发送控制指令（对所有选中机器人） */
  function batchCommand(action: string, params: Record<string, unknown>): number {
    if (!wsSend.value) {
      console.warn('[RobotStore] Cannot batch command: WS not connected')
      return 0
    }

    const targets = selectedRobots.value
    if (targets.length === 0) return 0

    for (const robot of targets) {
      const execId = nextExecId()

      wsSend.value({
        type: 'command',
        robot_id: robot.robot_id,
        action,
        params,
      })

      const tracking: CommandTracking = {
        exec_id: execId,
        robot_id: robot.robot_id,
        action,
        params,
        status: 'pending',
        result_message: '',
        sent_at: Date.now(),
      }
      pendingCommands.value.set(execId, tracking)
    }

    cleanupCommands()
    return targets.length
  }

  /** 订阅话题（通过 WebSocket） */
  function subscribeTopic(topic: string, msgType: string, freqLimit: number = 10.0) {
    if (!selectedRobotId.value || !wsSend.value) {
      console.warn('[RobotStore] Cannot subscribe: no robot selected or WS not connected')
      return
    }

    const robotId = selectedRobotId.value

    // 发送 WebSocket 消息
    wsSend.value({
      type: 'subscribe',
      robot_id: robotId,
      topic,
      msg_type: msgType,
      freq_limit: freqLimit,
    })

    // 在订阅追踪中标记为 pending
    const subs = topicSubscriptions.value.get(robotId) ?? []
    const existing = subs.find((s) => s.topic === topic)
    if (existing) {
      existing.status = 'pending'
      existing.freq_limit = freqLimit
    } else {
      subs.push({ topic, msg_type: msgType, freq_limit: freqLimit, status: 'pending' })
    }
    topicSubscriptions.value.set(robotId, [...subs])
  }

  /** 取消订阅话题（通过 WebSocket） */
  function unsubscribeTopic(topic: string) {
    if (!selectedRobotId.value || !wsSend.value) {
      console.warn('[RobotStore] Cannot unsubscribe: no robot selected or WS not connected')
      return
    }

    const robotId = selectedRobotId.value

    // 发送 WebSocket 消息
    wsSend.value({
      type: 'unsubscribe',
      robot_id: robotId,
      topic,
    })

    // 标记订阅状态（等待 topic_response 确认后移除）
    const subs = topicSubscriptions.value.get(robotId) ?? []
    const existing = subs.find((s) => s.topic === topic)
    if (existing) {
      existing.status = 'pending'
      topicSubscriptions.value.set(robotId, [...subs])
    }
  }

  /** 处理 WebSocket 推送消息 */
  function handleWsMessage(msg: WsMessage) {
    switch (msg.type) {
      case 'status_update':
        if (msg.robot_id && msg.data) {
          const status = msg.data as RobotStatus
          robots.value.set(msg.robot_id, status)
          appendHistory(msg.robot_id, status)
          // 同步订阅详情到 topicSubscriptions
          syncTopicSubscriptions(msg.robot_id, status)
        }
        // 顺带清理超时指令
        checkCommandTimeouts()
        break
      case 'robot_online':
        if (msg.robot_id) {
          const existing = robots.value.get(msg.robot_id)
          if (existing) {
            existing.online = true
            robots.value.set(msg.robot_id, { ...existing })
          }
        }
        break
      case 'robot_offline':
        if (msg.robot_id) {
          const existing = robots.value.get(msg.robot_id)
          if (existing) {
            existing.online = false
            robots.value.set(msg.robot_id, { ...existing })
          }
        }
        break
      case 'event':
        handleRobotEvent(msg)
        break
      case 'cmd_ack':
        handleCmdAck(msg)
        break
      case 'topic_response':
        handleTopicResponse(msg)
        break
      case 'sensor_data':
        handleSensorDataMsg(msg)
        break
      case 'sensor_meta':
        handleSensorMetaMsg(msg)
        break
      case 'subscribe_sent':
        // 服务端已转发订阅请求，无需额外处理（状态已在 subscribeTopic 中标记为 pending）
        console.log('[RobotStore] Subscribe request sent to broker')
        break
      case 'unsubscribe_sent':
        console.log('[RobotStore] Unsubscribe request sent to broker')
        break
    }
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /** 处理机器人事件 */
  function handleRobotEvent(msg: WsMessage) {
    if (!msg.robot_id || !msg.data) return
    const event = msg.data as RobotEvent
    // 后端 timestamp 为秒（time.time()），未设置时用当前时间
    if (!event.timestamp) {
      event.timestamp = Date.now() / 1000
    }

    const events = robotEvents.value.get(msg.robot_id) ?? []
    events.push(event)
    // 最多保留 50 条
    if (events.length > 50) {
      events.shift()
    }
    robotEvents.value.set(msg.robot_id, [...events])
  }

  /** 处理指令确认 */
  function handleCmdAck(msg: WsMessage) {
    if (!msg.robot_id || !msg.data) return
    const ack = msg.data as CmdAckData

    const tracking = pendingCommands.value.get(ack.exec_id)
    if (tracking) {
      tracking.status = ack.result === 'ok' ? 'ack_ok' : 'ack_failed'
      tracking.result_message = ack.message || ''
      tracking.ack_at = Date.now()
      // 触发响应式更新
      pendingCommands.value.set(ack.exec_id, { ...tracking })
    }
  }

  /** 处理话题订阅响应 */
  function handleTopicResponse(msg: WsMessage) {
    if (!msg.robot_id || !msg.data) return
    const resp = msg.data as TopicResponseData
    const robotId = msg.robot_id

    const subs = topicSubscriptions.value.get(robotId) ?? []

    if (resp.result === 'ok') {
      if (resp.action === 'subscribe') {
        // 更新对应条目状态为 active
        const existing = subs.find((s) => s.topic === resp.topic)
        if (existing) {
          existing.status = 'active'
          existing.msg_type = resp.msg_type || existing.msg_type
          existing.freq_limit = resp.freq_limit || existing.freq_limit
        } else {
          subs.push({
            topic: resp.topic,
            msg_type: resp.msg_type,
            freq_limit: resp.freq_limit,
            status: 'active',
          })
        }
      } else if (resp.action === 'unsubscribe') {
        // 移除对应条目
        const idx = subs.findIndex((s) => s.topic === resp.topic)
        if (idx >= 0) subs.splice(idx, 1)

        // 同时清除传感器数据
        const sensorMap = sensorData.value.get(robotId)
        if (sensorMap) {
          sensorMap.delete(resp.topic)
          sensorData.value.set(robotId, new Map(sensorMap))
        }
      }
    } else {
      // 订阅/取消订阅失败
      const existing = subs.find((s) => s.topic === resp.topic)
      if (existing) {
        existing.status = 'failed'
      }
    }

    topicSubscriptions.value.set(robotId, [...subs])

    // 同步更新 robots 中的 subscribed_topics
    const robot = robots.value.get(robotId)
    if (robot) {
      robot.subscribed_topics = subs
        .filter((s) => s.status === 'active')
        .map((s) => s.topic)
      robots.value.set(robotId, { ...robot })
    }
  }

  /** 处理传感器数据推送 */
  function handleSensorDataMsg(msg: WsMessage) {
    if (!msg.robot_id || !msg.data) return
    const payload = msg.data as SensorDataPayload
    const robotId = msg.robot_id
    const sensorName = payload.sensor_name

    if (!sensorName) return

    // 提取纯数据（去掉 sensor_name 等元字段）
    const pureData: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(payload)) {
      if (key !== 'sensor_name') {
        pureData[key] = val
      }
    }

    let robotSensors = sensorData.value.get(robotId)
    if (!robotSensors) {
      robotSensors = new Map<string, Record<string, unknown>>()
      sensorData.value.set(robotId, robotSensors)
    }
    robotSensors.set(sensorName, pureData)
    // 触发响应式
    sensorData.value.set(robotId, new Map(robotSensors))
  }

  /** 处理点云流元信息 */
  function handleSensorMetaMsg(msg: WsMessage) {
    if (!msg.robot_id || !msg.data) return
    const meta = msg.data as SensorMetaPayload
    if (meta.transport !== 'http_stream') return

    const robotId = msg.robot_id
    const streams = new Map(pointCloudStreams.value.get(robotId) ?? new Map())

    const existing = streams.get(meta.topic)
    if (existing) {
      existing.streamUrl = meta.stream_url
      existing.points = meta.points
      existing.lastFrameTime = Date.now()
      existing.frameCount++
      streams.set(meta.topic, { ...existing })
    } else {
      streams.set(meta.topic, {
        topic: meta.topic,
        streamUrl: meta.stream_url,
        msgType: meta.msg_type,
        points: meta.points,
        active: true,
        frameCount: 1,
        lastFrameTime: Date.now(),
      })
    }
    pointCloudStreams.value.set(robotId, new Map(streams))
  }

  /** 获取当前选中机器人的点云流 */
  const selectedStreams = computed(() => {
    const id = selectedRobotId.value || Array.from(selectedRobotIds.value)[0] || ''
    if (!id) return new Map<string, PointCloudStream>()
    return pointCloudStreams.value.get(id) ?? new Map<string, PointCloudStream>()
  })

  /** 从 status_update 同步订阅详情 */
  function syncTopicSubscriptions(robotId: string, status: RobotStatus) {
    const detail = status.subscribed_topics_detail
    if (!detail) return

    const subs: SubscribedTopicDetail[] = []
    for (const [topic, meta] of Object.entries(detail)) {
      subs.push({
        topic,
        msg_type: meta.msg_type,
        freq_limit: meta.freq_limit,
        status: 'active',
      })
    }

    // 只在没有本地追踪数据时用服务端数据覆盖
    const existing = topicSubscriptions.value.get(robotId)
    if (!existing || existing.length === 0) {
      topicSubscriptions.value.set(robotId, subs)
    }
  }

  /** 检查超时指令 */
  function checkCommandTimeouts() {
    const now = Date.now()
    for (const [execId, cmd] of pendingCommands.value.entries()) {
      if (cmd.status === 'pending' && now - cmd.sent_at > COMMAND_TIMEOUT_MS) {
        cmd.status = 'timeout'
        cmd.result_message = 'Command timed out (30s)'
        pendingCommands.value.set(execId, { ...cmd })
      }
    }
  }

  /** 清理超量已完结指令 */
  function cleanupCommands() {
    if (pendingCommands.value.size <= MAX_PENDING_COMMANDS) return

    // 收集已完结指令（按时间升序，优先删最旧的）
    const doneEntries = Array.from(pendingCommands.value.entries())
      .filter(([, cmd]) => cmd.status !== 'pending')
      .sort(([, a], [, b]) => a.sent_at - b.sent_at)

    const removeCount = pendingCommands.value.size - MAX_PENDING_COMMANDS
    for (let i = 0; i < removeCount && i < doneEntries.length; i++) {
      pendingCommands.value.delete(doneEntries[i][0])
    }
  }

  /** 追加历史数据 */
  function appendHistory(robotId: string, status: RobotStatus) {
    let history = robotHistory.value.get(robotId)
    if (!history) {
      history = {
        battery: [],
        velocityLinear: [],
        velocityAngular: [],
      }
      robotHistory.value.set(robotId, history)
    }

    const now = Date.now()

    // 电量
    history.battery.push({ timestamp: now, value: status.battery })
    if (history.battery.length > MAX_HISTORY_LENGTH) {
      history.battery = history.battery.slice(-MAX_HISTORY_LENGTH)
    }

    // 线速度
    const linear = status.velocity?.linear ?? 0
    history.velocityLinear.push({ timestamp: now, value: linear })
    if (history.velocityLinear.length > MAX_HISTORY_LENGTH) {
      history.velocityLinear = history.velocityLinear.slice(-MAX_HISTORY_LENGTH)
    }

    // 角速度
    const angular = status.velocity?.angular ?? 0
    history.velocityAngular.push({ timestamp: now, value: angular })
    if (history.velocityAngular.length > MAX_HISTORY_LENGTH) {
      history.velocityAngular = history.velocityAngular.slice(-MAX_HISTORY_LENGTH)
    }
  }

  /** 当前选中机器人的事件列表 */
  const selectedEvents = computed(() => {
    if (!selectedRobotId.value) return []
    return robotEvents.value.get(selectedRobotId.value) ?? []
  })

  /** 是否正在录制 */
  const isRecording = computed(() => recordingState.value === 'recording')

  /** 格式化录制时长 */
  const recordingElapsedFormatted = computed(() => {
    const s = Math.floor(recordingElapsed.value)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}h ${m}m ${sec}s`
    if (m > 0) return `${m}m ${sec}s`
    return `${sec}s`
  })

  /** 轮询录制状态 */
  async function pollRecordingStatus() {
    try {
      const { data } = await getRecordingStatus()
      recordingState.value = data.state
      recordingElapsed.value = data.elapsed
      recordingRecords.value = data.records
    } catch {
      // 服务端未就绪时静默重试
    }
  }

  /** 开始录制 */
  async function handleStartRecording() {
    try {
      await startRecording()
      recordingState.value = 'recording'
      recordingElapsed.value = 0
      recordingRecords.value = 0
      startRecordingPolling()
    } catch (e) {
      console.error('[RobotStore] startRecording failed:', e)
    }
  }

  /** 停止录制 */
  async function handleStopRecording() {
    try {
      const { data } = await stopRecording()
      recordingState.value = 'off'
      recordingElapsed.value = data.elapsed ?? 0
      recordingRecords.value = data.records ?? 0
      stopRecordingPolling()
    } catch (e) {
      console.error('[RobotStore] stopRecording failed:', e)
    }
  }

  /** 暂停录制 */
  async function handlePauseRecording() {
    try {
      await pauseRecording()
      recordingState.value = 'paused'
    } catch (e) {
      console.error('[RobotStore] pauseRecording failed:', e)
    }
  }

  /** 恢复录制 */
  async function handleResumeRecording() {
    try {
      await resumeRecording()
      recordingState.value = 'recording'
    } catch (e) {
      console.error('[RobotStore] resumeRecording failed:', e)
    }
  }

  /** 启动状态轮询 */
  function startRecordingPolling() {
    stopRecordingPolling()
    _recordingTimer = setInterval(pollRecordingStatus, 2000)
  }

  /** 停止状态轮询 */
  function stopRecordingPolling() {
    if (_recordingTimer !== null) {
      clearInterval(_recordingTimer)
      _recordingTimer = null
    }
  }

  return {
    robots,
    selectedRobotId,
    selectedRobotIds,
    wsConnected,
    robotHistory,
    pendingCommands,
    sensorData,
    topicSubscriptions,
    robotEvents,
    robotList,
    onlineRobots,
    selectedRobot,
    selectedRobots,
    selectedCount,
    selectedHistory,
    selectedCommands,
    selectedSensorData,
    selectedSubscriptions,
    selectedEvents,
    pointCloudStreams,
    selectedStreams,
    recordingState,
    recordingElapsed,
    recordingRecords,
    isRecording,
    recordingElapsedFormatted,
    pollRecordingStatus,
    handleStartRecording,
    handleStopRecording,
    handlePauseRecording,
    handleResumeRecording,
    fetchRobots,
    discover,
    selectRobot,
    toggleRobotSelection,
    selectAllRobots,
    clearSelection,
    setWsConnected,
    setWsSend,
    sendCommand,
    batchCommand,
    subscribeTopic,
    unsubscribeTopic,
    handleWsMessage,
  }
})
