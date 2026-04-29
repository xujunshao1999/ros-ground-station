<template>
  <div class="status-panel">
    <!-- 头部：机器人 ID + 模式 -->
    <div class="panel-header">
      <div class="header-left">
        <span class="robot-name">{{ robot.robot_id }}</span>
        <el-tag :type="modeTagType" size="small" effect="dark">
          {{ robot.mode?.toUpperCase() || 'UNKNOWN' }}
        </el-tag>
      </div>
      <el-tag :type="robot.online ? 'success' : 'danger'" size="small" effect="plain">
        {{ robot.online ? 'ONLINE' : 'OFFLINE' }}
      </el-tag>
    </div>

    <!-- 状态网格 -->
    <div class="status-grid">
      <!-- 电量 -->
      <div class="status-item">
        <div class="status-label">
          <el-icon><Lightning /></el-icon>
          Battery
        </div>
        <div class="status-value">
          <el-progress
            :percentage="robot.battery"
            :stroke-width="8"
            :color="batteryColor"
            :show-text="true"
            :format="(p: number) => `${p}%`"
          />
        </div>
      </div>

      <!-- 位置 -->
      <div class="status-item">
        <div class="status-label">
          <el-icon><Location /></el-icon>
          Position
        </div>
        <div class="status-value coords">
          <span>X: {{ formatNum(robot.position?.x) }}</span>
          <span>Y: {{ formatNum(robot.position?.y) }}</span>
          <span>θ: {{ formatNum(robot.position?.theta, 2) }}°</span>
        </div>
      </div>

      <!-- 速度 -->
      <div class="status-item">
        <div class="status-label">
          <el-icon><Van /></el-icon>
          Velocity
        </div>
        <div class="status-value coords">
          <span>Linear: {{ formatNum(robot.velocity?.linear, 3) }} m/s</span>
          <span>Angular: {{ formatNum(robot.velocity?.angular, 3) }} rad/s</span>
        </div>
      </div>

      <!-- 运行时间 -->
      <div class="status-item">
        <div class="status-label">
          <el-icon><Timer /></el-icon>
          Uptime
        </div>
        <div class="status-value">{{ formatUptime(robot.uptime) }}</div>
      </div>

      <!-- ROS 版本 + IP -->
      <div class="status-item">
        <div class="status-label">
          <el-icon><Monitor /></el-icon>
          System
        </div>
        <div class="status-value coords">
          <span>ROS {{ robot.ros_version || '—' }}</span>
          <span>{{ robot.ip || '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Lightning, Location, Van, Timer, Monitor } from '@element-plus/icons-vue'
import type { RobotStatus } from '@/types/robot'

const props = defineProps<{
  robot: RobotStatus
}>()

const modeTagType = computed(() => {
  const m = (props.robot.mode || '').toLowerCase()
  if (m === 'auto') return 'warning'
  if (m === 'manual') return undefined
  if (m === 'stop') return 'info'
  return 'info'
})

const batteryColor = computed(() => {
  const b = props.robot.battery
  if (b > 60) return 'var(--success)'
  if (b > 20) return 'var(--warning)'
  return 'var(--danger)'
})

function formatNum(val: number | undefined, digits = 2): string {
  if (val == null || isNaN(val)) return '—'
  return val.toFixed(digits)
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
</script>

<style scoped lang="scss">
.status-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-xl);
  transition: border-color var(--transition-normal);

  &:hover {
    border-color: var(--border-color-light);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.robot-name {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-family: var(--font-family-mono);
}

.status-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.status-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  padding-left: 22px;
  font-variant-numeric: tabular-nums;

  &.coords {
    display: flex;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }
}

:deep(.el-progress) {
  padding-left: 22px;

  .el-progress-bar {
    padding-right: 50px;
  }
}
</style>
