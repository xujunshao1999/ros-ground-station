/**
 * 机器人状态相关类型定义
 * 与后端 API 返回格式对齐
 */

/** 位置信息 */
export interface Position {
  x: number
  y: number
  theta: number
}

/** 速度信息 */
export interface Velocity {
  linear: number
  angular: number
}

/** 机器人状态（对应 GET /api/robots/{id}） */
export interface RobotStatus {
  robot_id: string
  online: boolean
  battery: number
  position: Position
  velocity: Velocity
  mode: string
  ros_version: string
  uptime: number
  ip: string
  available_topics: TopicInfo[]
  subscribed_topics: string[]
  subscribed_topics_detail?: Record<string, SubscribedTopicMeta>
}

/** 已订阅话题的元信息 */
export interface SubscribedTopicMeta {
  msg_type: string
  freq_limit: number
}

/** 订阅话题的详细信息（前端追踪用） */
export interface SubscribedTopicDetail {
  topic: string
  msg_type: string
  freq_limit?: number
  status: 'active' | 'pending' | 'failed'
}

/** 话题信息 */
export interface TopicInfo {
  name: string
  msg_type: string
  description?: string
}

/** 机器人列表响应 */
export interface RobotListResponse {
  robots: RobotStatus[]
}

/** 控制指令请求 */
export interface CommandRequest {
  action: 'velocity' | 'mode' | 'stop' | 'return_home' | 'nav_goal' | 'custom'
  params: Record<string, unknown>
}

/** 控制指令响应 */
export interface CommandResponse {
  exec_id: string
  action: string
  status: string
}

/** 话题订阅请求 */
export interface SubscribeRequest {
  topic: string
  msg_type: string
  freq_limit: number
  options?: Record<string, unknown>
}

/** 话题取消订阅请求 */
export interface UnsubscribeRequest {
  topic: string
}

/** WebSocket 推送消息 */
export interface WsMessage {
  type:
    | 'robot_online'
    | 'robot_offline'
    | 'status_update'
    | 'event'
    | 'cmd_ack'
    | 'command_sent'
    | 'subscribe_sent'
    | 'unsubscribe_sent'
    | 'discover_sent'
    | 'topic_response'
    | 'sensor_data'
    | 'sensor_meta'
    | 'error'
    | 'pong'
  robot_id?: string
  data?: unknown
  message?: string
}

/** 告警事件 */
export interface RobotEvent {
  level: 'info' | 'warning' | 'error' | 'critical'
  code: string
  message: string
  timestamp: number
  details?: Record<string, unknown>
}

/** 指令追踪状态 */
export type CommandStatus = 'pending' | 'ack_ok' | 'ack_failed' | 'timeout'

/** 指令追踪记录 */
export interface CommandTracking {
  exec_id: string
  robot_id: string
  action: string
  params: Record<string, unknown>
  status: CommandStatus
  result_message: string
  sent_at: number
  ack_at?: number
}

/** cmd_ack 推送数据格式 */
export interface CmdAckData {
  exec_id: string
  result: string
  message: string
}

/** WS 推送的 topic_response 数据格式 */
export interface TopicResponseData {
  result: string        // ok / failed / not_found / unsupported
  action: string        // subscribe / unsubscribe
  topic: string
  msg_type: string
  freq_limit: number
  message: string
}

/** WS 推送的 sensor_data 数据格式 */
export interface SensorDataPayload {
  sensor_name: string
  _msg_type?: string
  timestamp?: number
  [key: string]: unknown
}

/** WS 推送的 sensor_meta 数据格式（重量话题流媒体元信息） */
export interface SensorMetaPayload {
  topic: string
  msg_type: string
  transport: string
  stream_url: string
  size_bytes: number
  points?: number
}

/** 点云流状态 */
export interface PointCloudStream {
  topic: string
  streamUrl: string
  msgType: string
  points?: number
  active: boolean
  frameCount: number
  lastFrameTime: number
}

// ============================================================
// 录制 & 历史
// ============================================================

/** 录制状态 */
export interface RecordingStatus {
  state: 'off' | 'recording' | 'paused'
  elapsed: number
  records: number
}

/** 历史状态记录点 */
export interface HistoryRecord {
  timestamp: number
  battery: number
  position: { x: number; y: number; theta: number }
  velocity: { linear: number; angular: number }
  mode: string
}

/** 历史事件记录 */
export interface HistoryEvent {
  timestamp: number
  level: string
  code: string
  message: string
  details: Record<string, unknown>
}
