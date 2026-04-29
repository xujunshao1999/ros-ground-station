<template>
  <div class="alert-panel">
    <!-- 告警按钮 + 未读计数 -->
    <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="alert-badge">
      <el-button
        :type="unreadCount > 0 ? 'danger' : 'default'"
        size="small"
        circle
        @click="togglePanel"
      >
        <el-icon><WarningFilled /></el-icon>
      </el-button>
    </el-badge>

    <!-- 告警面板弹出 -->
    <Transition name="panel-slide">
      <div v-if="visible" class="alert-dropdown">
        <div class="alert-header">
          <span class="alert-title">Notifications</span>
          <div class="alert-header-actions">
            <el-select
              v-model="filterLevel"
              size="small"
              placeholder="All levels"
              style="width: 120px"
            >
              <el-option label="All" value="" />
              <el-option label="Critical" value="critical" />
              <el-option label="Error" value="error" />
              <el-option label="Warning" value="warning" />
              <el-option label="Info" value="info" />
            </el-select>
            <el-button size="small" text @click="markAllRead">Mark all read</el-button>
          </div>
        </div>
        <div class="alert-list">
          <div v-if="filteredEvents.length === 0" class="alert-empty">
            No notifications
          </div>
          <div
            v-for="(event, idx) in filteredEvents"
            :key="idx"
            class="alert-item"
            :class="[`alert-${event.level}`, { 'alert-unread': isUnread(event) }]"
            @click="markRead(event)"
          >
            <div class="alert-item-icon">
              <el-icon v-if="event.level === 'error' || event.level === 'critical'"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="event.level === 'warning'"><WarningFilled /></el-icon>
              <el-icon v-else><InfoFilled /></el-icon>
            </div>
            <div class="alert-item-body">
              <div class="alert-item-code">{{ event.code }}</div>
              <div class="alert-item-msg">{{ event.message }}</div>
              <div class="alert-item-meta">
                <span class="alert-item-time">{{ formatTime(event.timestamp) }}</span>
                <span v-if="event._robot_id" class="alert-item-robot">{{ event._robot_id }}</span>
                <span v-if="event.details?.battery != null" class="alert-item-detail">
                  bat: {{ event.details.battery }}%
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="alert-footer">
          <el-button size="small" text @click="visible = false">Close</el-button>
          <el-button size="small" text @click="loadHistory" :loading="loading">Load history</el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { WarningFilled, InfoFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import { useRobotStore } from '@/stores/robot'
import type { RobotEvent } from '@/types/robot'
import { getRobotEvents, getHistoryEvents } from '@/api/robot'

const robotStore = useRobotStore()

const visible = ref(false)
const filterLevel = ref('')
const unreadTimestamps = ref<Set<number>>(new Set())
const loading = ref(false)

interface EventWithRobot extends RobotEvent {
  _robot_id?: string
}

/** 所有事件（按时间倒序） */
const allEvents = computed(() => {
  const events: EventWithRobot[] = []
  for (const [rid, evts] of robotStore.robotEvents.entries()) {
    for (const e of evts) {
      events.push({ ...e, _robot_id: rid })
    }
  }
  return events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
})

/** 过滤后的事件 */
const filteredEvents = computed(() => {
  if (!filterLevel.value) return allEvents.value
  return allEvents.value.filter((e) => e.level === filterLevel.value)
})

/** 未读计数 */
const unreadCount = computed(() => unreadTimestamps.value.size)

function isUnread(event: EventWithRobot): boolean {
  return unreadTimestamps.value.has(event.timestamp ?? 0)
}

function markRead(event: EventWithRobot) {
  unreadTimestamps.value.delete(event.timestamp ?? 0)
}

function togglePanel() {
  visible.value = !visible.value
  if (visible.value) {
    unreadTimestamps.value.clear()
  }
}

function markAllRead() {
  unreadTimestamps.value.clear()
}

async function loadHistory() {
  loading.value = true
  try {
    // 尝试加载每个机器人的历史事件（来自 SQLite 持久化存储）
    for (const [rid] of robotStore.robotEvents.entries()) {
      const { data } = await getHistoryEvents(rid)
      if (data.events) {
        const existing = robotStore.robotEvents.get(rid) ?? []
        const existingTimestamps = new Set(existing.map((e) => e.timestamp))
        for (const evt of data.events) {
          if (!existingTimestamps.has(evt.timestamp)) {
            existing.push(evt)
          }
        }
        if (existing.length > 50) {
          existing.splice(0, existing.length - 50)
        }
        robotStore.robotEvents.set(rid, [...existing])
      }
    }
    // 也加载内存中的近期事件
    for (const [rid] of robotStore.robotEvents.entries()) {
      const { data } = await getRobotEvents(rid)
      if (data.events) {
        const existing = robotStore.robotEvents.get(rid) ?? []
        const existingTimestamps = new Set(existing.map((e) => e.timestamp))
        for (const evt of data.events) {
          if (!existingTimestamps.has(evt.timestamp)) {
            existing.push(evt)
          }
        }
        if (existing.length > 50) {
          existing.splice(0, existing.length - 50)
        }
        robotStore.robotEvents.set(rid, [...existing])
      }
    }
  } catch {
    // 静默失败
  } finally {
    loading.value = false
  }
}

function formatTime(ts: number | undefined): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString()
}

/** 监听新事件追加到未读 */
watch(
  () => allEvents.value.length,
  () => {
    if (allEvents.value.length > 0 && !visible.value) {
      unreadTimestamps.value.add(allEvents.value[0].timestamp ?? 0)
    }
  }
)
</script>

<style scoped lang="scss">
.alert-panel {
  position: relative;
}

.alert-badge {
  :deep(.el-badge__content) {
    font-size: 10px;
  }
}

.alert-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 400px;
  max-height: 520px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.alert-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.alert-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.alert-list {
  flex: 1;
  overflow-y: auto;
  max-height: 380px;
}

.alert-item {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  border-bottom: 1px solid var(--border-color);
  transition: background var(--transition-fast);
  cursor: pointer;

  &:hover {
    background: var(--bg-tertiary);
  }

  &.alert-unread {
    background: rgba(var(--primary-rgb), 0.05);
  }

  &.alert-critical .alert-item-icon {
    color: var(--danger);
  }

  &.alert-error .alert-item-icon {
    color: #f56c6c;
  }

  &.alert-warning .alert-item-icon {
    color: #e6a23c;
  }

  &.alert-info .alert-item-icon {
    color: #909399;
  }
}

.alert-item-icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
}

.alert-item-body {
  flex: 1;
  min-width: 0;
}

.alert-item-code {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-family: var(--font-family-mono);
}

.alert-item-msg {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-top: 2px;
  word-break: break-all;
}

.alert-item-meta {
  display: flex;
  gap: var(--space-md);
  margin-top: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.alert-item-robot {
  font-family: var(--font-family-mono);
  color: var(--accent);
}

.alert-empty {
  text-align: center;
  padding: var(--space-2xl);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.alert-footer {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-top: 1px solid var(--border-color);
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.2s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
