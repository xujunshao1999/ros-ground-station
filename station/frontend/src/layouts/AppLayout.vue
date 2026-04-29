<template>
  <div class="app-layout">
    <!-- 顶栏 -->
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">ROS Ground Station</h1>
        <el-tag :type="wsConnected ? 'success' : 'danger'" size="small" effect="dark">
          {{ wsConnected ? 'Connected' : 'Disconnected' }}
        </el-tag>
      </div>
      <div class="header-right">
        <div v-if="selectedCount > 0" class="batch-header-actions">
          <el-button size="small" type="danger" @click="handleBatchStop">
            Stop All
          </el-button>
          <el-button size="small" @click="handleBatchReturnHome">
            Return Home
          </el-button>
        </div>
        <AlertPanel />
        <RecordingControl />
        <el-button :icon="Refresh" circle size="small" @click="handleDiscover" />
        <span class="robot-count">{{ onlineCount }} / {{ totalCount }} robots</span>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useRobotStore } from '@/stores/robot'
import AlertPanel from '@/components/AlertPanel.vue'
import RecordingControl from '@/components/RecordingControl.vue'

const robotStore = useRobotStore()

const wsConnected = computed(() => robotStore.wsConnected)
const onlineCount = computed(() => robotStore.onlineRobots.length)
const totalCount = computed(() => robotStore.robotList.length)
const selectedCount = computed(() => robotStore.selectedCount)

function handleDiscover() {
  robotStore.discover()
}

function handleBatchStop() {
  robotStore.batchCommand('stop', {})
}

function handleBatchReturnHome() {
  robotStore.batchCommand('return_home', {})
}
</script>

<style scoped lang="scss">
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-2xl);
  height: 48px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.app-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.batch-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.robot-count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.app-main {
  flex: 1;
  overflow: auto;
  padding: var(--space-lg);
}
</style>
