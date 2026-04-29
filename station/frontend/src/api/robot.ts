/**
 * 后端 API 封装
 * 所有请求通过 Vite proxy 转发到后端
 */

import axios from 'axios'
import type {
  RobotListResponse,
  RobotStatus,
  CommandRequest,
  CommandResponse,
  SubscribeRequest,
  UnsubscribeRequest,
  RobotEvent,
  RecordingStatus,
  HistoryRecord,
  HistoryEvent,
  SensorMetaPayload,
} from '@/types/robot'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// ============================================================
// 机器人
// ============================================================

/** 获取机器人列表 */
export function getRobots() {
  return api.get<RobotListResponse>('/robots')
}

/** 获取单个机器人状态 */
export function getRobot(robotId: string) {
  return api.get<RobotStatus>(`/robots/${robotId}`)
}

/** 发现机器人 */
export function discoverRobots() {
  return api.post<{ status: string }>('/discover')
}

// ============================================================
// 控制指令
// ============================================================

/** 发送控制指令 */
export function sendCommand(robotId: string, req: CommandRequest) {
  return api.post<CommandResponse>(`/robots/${robotId}/command`, req)
}

// ============================================================
// 话题订阅
// ============================================================

/** 订阅话题 */
export function subscribeTopic(robotId: string, req: SubscribeRequest) {
  return api.post<{ status: string; topic: string }>(`/robots/${robotId}/subscribe`, req)
}

/** 取消订阅 */
export function unsubscribeTopic(robotId: string, req: UnsubscribeRequest) {
  return api.post<{ status: string; topic: string }>(`/robots/${robotId}/unsubscribe`, req)
}

// ============================================================
// 事件
// ============================================================

/** 获取机器人告警事件 */
export function getRobotEvents(robotId: string, level?: string, since?: number) {
  const params: Record<string, string | number> = {}
  if (level) params.level = level
  if (since) params.since = since
  return api.get<{ robot_id: string; events: RobotEvent[] }>(`/robots/${robotId}/events`, { params })
}

// ============================================================
// 录制控制
// ============================================================

/** 开始录制 */
export function startRecording() {
  return api.post<{ status: string }>('/record/start')
}

/** 停止录制 */
export function stopRecording() {
  return api.post<{ status: string; records?: number; elapsed?: number }>('/record/stop')
}

/** 暂停录制 */
export function pauseRecording() {
  return api.post<{ status: string }>('/record/pause')
}

/** 恢复录制 */
export function resumeRecording() {
  return api.post<{ status: string }>('/record/resume')
}

/** 查询录制状态 */
export function getRecordingStatus() {
  return api.get<RecordingStatus & { status: string }>('/record/status')
}

// ============================================================
// 历史数据
// ============================================================

/** 查询机器人状态历史 */
export function getHistory(robotId: string, since?: number, until?: number, limit?: number) {
  const params: Record<string, string | number> = {}
  if (since !== undefined) params.since = since
  if (until !== undefined) params.until = until
  if (limit !== undefined) params.limit = limit
  return api.get<{ robot_id: string; records: HistoryRecord[]; count: number }>(`/history/${robotId}`, { params })
}

/** 查询机器人事件历史 */
export function getHistoryEvents(robotId: string, level?: string, since?: number, until?: number, limit?: number) {
  const params: Record<string, string | number> = {}
  if (level) params.level = level
  if (since !== undefined) params.since = since
  if (until !== undefined) params.until = until
  if (limit !== undefined) params.limit = limit
  return api.get<{ robot_id: string; events: HistoryEvent[]; count: number }>(`/history/${robotId}/events`, { params })
}

/** 获取有历史数据的机器人列表 */
export function getHistoryRobots() {
  return api.get<{ robots: string[] }>('/history/robots')
}

// ============================================================
// 点云流
// ============================================================

/** 获取机器人点云流数据（二进制） */
export function getStreamData(robotId: string, topic: string) {
  return api.get<ArrayBuffer>(`/robots/${robotId}/stream/${topic}`, {
    responseType: 'arraybuffer',
  })
}

/** 获取机器人活跃流列表 */
export function getRobotStreams(robotId: string) {
  return api.get<{ streams: { topic: string; url: string }[] }>(`/robots/${robotId}/streams`)
}
