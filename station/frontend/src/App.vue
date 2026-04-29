<template>
  <router-view />
</template>

<script setup lang="ts">
import { useGlobalWebSocket } from '@/composables/useGlobalWebSocket'

// 启动全局 WebSocket 连接
useGlobalWebSocket()
</script>
