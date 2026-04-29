/**
 * WebSocket composable
 *
 * 管理与后端 /ws/live 的 WebSocket 连接：
 * - 自动连接/重连
 * - 心跳保活
 * - 消息分发到 Pinia store
 */

import { ref, onUnmounted } from 'vue'
import { useRobotStore } from '@/stores/robot'
import type { WsMessage } from '@/types/robot'

/** WebSocket 连接状态 */
export type WsStatus = 'connecting' | 'connected' | 'disconnected'

/** 心跳间隔（ms） */
const PING_INTERVAL = 30000

/** 重连延迟（ms），指数退避上限 30s */
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

export function useWebSocket(url: string) {
  const status = ref<WsStatus>('disconnected')
  const robotStore = useRobotStore()

  let ws: WebSocket | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let intentionalClose = false

  /** 连接 WebSocket */
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    intentionalClose = false
    status.value = 'connecting'

    try {
      ws = new WebSocket(url)
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e)
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      console.log('[WS] Connected')
      status.value = 'connected'
      reconnectAttempts = 0
      robotStore.setWsConnected(true)
      startPing()
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        handleMessage(msg)
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e)
      }
    }

    ws.onclose = (event) => {
      console.log(`[WS] Disconnected (code=${event.code})`)
      status.value = 'disconnected'
      robotStore.setWsConnected(false)
      stopPing()

      if (!intentionalClose) {
        scheduleReconnect()
      }
    }

    ws.onerror = (event) => {
      console.error('[WS] Error:', event)
    }
  }

  /** 断开连接 */
  function disconnect() {
    intentionalClose = true
    stopPing()
    clearReconnect()

    if (ws) {
      ws.close()
      ws = null
    }
    status.value = 'disconnected'
    robotStore.setWsConnected(false)
  }

  /** 发送消息 */
  function send(msg: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      console.warn('[WS] Cannot send: not connected')
    }
  }

  /** 处理收到的消息 */
  function handleMessage(msg: WsMessage) {
    switch (msg.type) {
      case 'robot_online':
      case 'robot_offline':
      case 'status_update':
      case 'event':
      case 'cmd_ack':
      case 'topic_response':
      case 'sensor_data':
      case 'subscribe_sent':
      case 'unsubscribe_sent':
        robotStore.handleWsMessage(msg)
        break

      case 'command_sent':
      case 'discover_sent':
        // 操作确认，暂不特殊处理
        console.log(`[WS] ${msg.type}:`, msg.data)
        break

      case 'pong':
        // 心跳响应，忽略
        break

      case 'error':
        console.error('[WS] Server error:', msg.message)
        break

      default:
        console.warn('[WS] Unknown message type:', msg.type)
    }
  }

  /** 启动心跳 */
  function startPing() {
    stopPing()
    pingTimer = setInterval(() => {
      send({ type: 'ping' })
    }, PING_INTERVAL)
  }

  /** 停止心跳 */
  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  /** 调度重连 */
  function scheduleReconnect() {
    clearReconnect()
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_DELAY
    )
    reconnectAttempts++
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  /** 清除重连定时器 */
  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  // 组件卸载时自动断开
  onUnmounted(() => {
    disconnect()
  })

  return {
    status,
    connect,
    disconnect,
    send,
  }
}
