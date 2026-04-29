/**
 * 全局 WebSocket 初始化
 *
 * 在 App 根组件中调用，自动连接并保持 WebSocket 长连接。
 * 消息分发到 robot store。
 */

import { onMounted, onUnmounted } from 'vue'
import { useWebSocket } from './useWebSocket'
import { useRobotStore } from '@/stores/robot'

/** 根据当前页面协议和 host 推算 WebSocket 地址 */
function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}/ws/live`
}

export function useGlobalWebSocket() {
  const wsUrl = getWsUrl()
  const { status, connect, disconnect, send } = useWebSocket(wsUrl)
  const robotStore = useRobotStore()

  // 将 WS send 函数注入 store，使 sendCommand 可以直接发 WS 消息
  robotStore.setWsSend(send)

  onMounted(() => {
    console.log(`[App] Connecting WebSocket: ${wsUrl}`)
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return { status }
}
