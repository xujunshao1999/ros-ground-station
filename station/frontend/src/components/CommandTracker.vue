<template>
  <div class="command-tracker">
    <h3 class="tracker-title">Command History</h3>
    <div v-if="commands.length === 0" class="tracker-empty">
      No commands sent
    </div>
    <div v-else class="command-list" ref="listRef">
      <div
        v-for="cmd in commands"
        :key="cmd.exec_id"
        class="command-item"
        :class="cmd.status"
      >
        <div class="cmd-main">
          <span class="cmd-action">{{ formatAction(cmd.action) }}</span>
          <el-tag :type="statusTagType(cmd.status)" size="small" effect="dark">
            {{ formatStatus(cmd.status) }}
          </el-tag>
        </div>
        <div class="cmd-meta">
          <span class="cmd-time">{{ formatTime(cmd.sent_at) }}</span>
          <span v-if="cmd.result_message" class="cmd-msg">{{ cmd.result_message }}</span>
        </div>
        <div v-if="cmd.status === 'pending'" class="cmd-pending-bar">
          <div class="pending-indicator" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useRobotStore } from '@/stores/robot'
import type { CommandStatus } from '@/types/robot'

const robotStore = useRobotStore()
const listRef = ref<HTMLElement | null>(null)

const commands = computed(() => robotStore.selectedCommands)

/** 新指令加入时自动滚动到底部 */
watch(
  () => commands.value.length,
  async () => {
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  }
)

/** 状态标签类型 */
function statusTagType(status: CommandStatus) {
  switch (status) {
    case 'pending': return 'warning'
    case 'ack_ok': return 'success'
    case 'ack_failed': return 'danger'
    case 'timeout': return 'info'
  }
}

/** 格式化状态文本 */
function formatStatus(status: CommandStatus) {
  switch (status) {
    case 'pending': return 'PENDING'
    case 'ack_ok': return 'OK'
    case 'ack_failed': return 'FAILED'
    case 'timeout': return 'TIMEOUT'
  }
}

/** 格式化 action 名称 */
function formatAction(action: string): string {
  const map: Record<string, string> = {
    velocity: 'Velocity',
    mode: 'Mode',
    stop: 'E-Stop',
    return_home: 'Return Home',
    nav_goal: 'Nav Goal',
    custom: 'Custom',
  }
  return map[action] || action
}

/** 格式化时间 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}
</script>

<style scoped lang="scss">
.command-tracker {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-lg);
  transition: border-color var(--transition-normal);

  &:hover {
    border-color: var(--border-color-light);
  }
}

.tracker-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-md);
}

.tracker-empty {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  text-align: center;
  padding: var(--space-md) 0;
}

.command-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.command-item {
  padding: var(--space-sm) var(--space-sm);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border-left: 3px solid transparent;
  transition: border-color var(--transition-fast);

  &.pending {
    border-left-color: var(--warning);
  }
  &.ack_ok {
    border-left-color: var(--success);
  }
  &.ack_failed {
    border-left-color: var(--danger);
  }
  &.timeout {
    border-left-color: var(--info);
  }
}

.cmd-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cmd-action {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.cmd-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.cmd-time {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-family: var(--font-family-mono);
}

.cmd-msg {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.cmd-pending-bar {
  margin-top: var(--space-xs);
  height: 2px;
  background: var(--border-color);
  border-radius: 1px;
  overflow: hidden;
}

.pending-indicator {
  height: 100%;
  width: 40%;
  background: var(--warning);
  border-radius: 1px;
  animation: pendingSlide 1.5s ease-in-out infinite;
}

@keyframes pendingSlide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
</style>
