<template>
  <div class="robot-grid">
    <div
      v-for="robot in robots"
      :key="robot.robot_id"
      class="grid-card"
      :class="{ offline: !robot.online }"
      @click="$emit('select', robot.robot_id)"
    >
      <div class="card-header">
        <span class="robot-id">{{ robot.robot_id }}</span>
        <el-tag :type="robot.online ? 'success' : 'info'" size="small" effect="dark">
          {{ robot.online ? 'Online' : 'Offline' }}
        </el-tag>
      </div>

      <div class="card-body">
        <!-- 电量 -->
        <div class="card-row">
          <span class="label">Battery</span>
          <el-progress
            :percentage="robot.battery"
            :stroke-width="6"
            :color="batteryColor(robot.battery)"
            :show-text="true"
            :format="(p: number) => `${p}%`"
          />
        </div>

        <!-- 位置 -->
        <div class="card-row">
          <span class="label">Position</span>
          <span class="value mono">
            {{ fmt(robot.position?.x) }}, {{ fmt(robot.position?.y) }}
          </span>
        </div>

        <!-- 速度 -->
        <div class="card-row">
          <span class="label">Velocity</span>
          <span class="value mono">
            {{ fmt3(robot.velocity?.linear) }} m/s
          </span>
        </div>

        <!-- 模式 -->
        <div class="card-row">
          <span class="label">Mode</span>
          <el-tag :type="modeType(robot.mode)" size="small" effect="plain">
            {{ (robot.mode || '—').toUpperCase() }}
          </el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RobotStatus } from '@/types/robot'

defineProps<{
  robots: RobotStatus[]
}>()

defineEmits<{
  select: [robotId: string]
}>()

function batteryColor(val: number): string {
  if (val > 60) return 'var(--success)'
  if (val > 20) return 'var(--warning)'
  return 'var(--danger)'
}

function modeType(mode: string | undefined): 'warning' | 'primary' | 'info' {
  const m = (mode || '').toLowerCase()
  if (m === 'auto') return 'warning'
  if (m === 'manual') return 'primary'
  return 'info'
}

function fmt(val: number | undefined, digits = 2): string {
  if (val == null || isNaN(val)) return '—'
  return val.toFixed(digits)
}

function fmt3(val: number | undefined): string {
  return fmt(val, 3)
}
</script>

<style scoped lang="scss">
.robot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
}

.grid-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-md);
  }

  &.offline {
    opacity: 0.5;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border-color);
}

.robot-id {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-family: var(--font-family-mono);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  min-width: 60px;
}

.value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  text-align: right;

  &.mono {
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
  }
}

:deep(.el-progress) {
  flex: 1;
  max-width: 120px;

  .el-progress-bar {
    padding-right: 0;
    margin-right: 32px;
  }

  .el-progress__text {
    font-size: 11px !important;
    min-width: 28px;
  }
}
</style>
