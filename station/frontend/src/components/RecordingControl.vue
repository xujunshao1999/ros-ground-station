<template>
  <div class="recording-control">
    <el-popover
      placement="bottom-end"
      :width="280"
      trigger="click"
      popper-class="recording-popover"
    >
      <template #reference>
        <el-button
          class="record-btn"
          :class="{ active: isRecording }"
          size="small"
          circle
          @click="handleToggle"
        >
          <span class="record-dot" :class="{ pulsing: isRecording }" />
        </el-button>
      </template>

      <div class="recording-panel">
        <div class="panel-header">
          <span class="panel-title uppercase-label">Recording</span>
          <el-tag
            :type="isRecording ? 'danger' : recordingState === 'paused' ? 'warning' : 'info'"
            size="small"
            effect="dark"
          >
            {{ recordingState.toUpperCase() }}
          </el-tag>
        </div>

        <div v-if="isRecording || recordingState === 'paused'" class="stats">
          <div class="stat-row">
            <span class="stat-label uppercase-label">Duration</span>
            <span class="stat-value mono">{{ recordingElapsedFormatted }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label uppercase-label">Records</span>
            <span class="stat-value mono">{{ recordingRecords.toLocaleString() }}</span>
          </div>
        </div>

        <div class="actions">
          <el-button
            v-if="!isRecording && recordingState !== 'paused'"
            type="danger"
            size="small"
            class="sentry-btn"
            @click="handleStart"
          >
            START RECORDING
          </el-button>
          <template v-else>
            <el-button
              v-if="isRecording"
              size="small"
              class="sentry-btn sentry-btn-secondary"
              @click="handlePause"
            >
              PAUSE
            </el-button>
            <el-button
              v-if="recordingState === 'paused'"
              size="small"
              class="sentry-btn sentry-btn-secondary"
              @click="handleResume"
            >
              RESUME
            </el-button>
            <el-button
              size="small"
              class="sentry-btn sentry-btn-danger"
              @click="handleStop"
            >
              STOP
            </el-button>
          </template>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRobotStore } from '@/stores/robot'

const robotStore = useRobotStore()

const recordingState = computed(() => robotStore.recordingState)
const isRecording = computed(() => robotStore.isRecording)
const recordingElapsedFormatted = computed(() => robotStore.recordingElapsedFormatted)
const recordingRecords = computed(() => robotStore.recordingRecords)

function handleToggle() {
  // popover handles opening/closing
}

function handleStart() {
  robotStore.handleStartRecording()
}

function handleStop() {
  robotStore.handleStopRecording()
}

function handlePause() {
  robotStore.handlePauseRecording()
}

function handleResume() {
  robotStore.handleResumeRecording()
}
</script>

<style scoped lang="scss">
.recording-control {
  display: flex;
  align-items: center;
}

.record-btn {
  position: relative;
  border-color: var(--border-color) !important;

  &.active {
    border-color: var(--danger) !important;
    background: rgba(245, 108, 108, 0.1) !important;
  }
}

.record-dot {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-tertiary);
  transition: all var(--transition-normal);

  &.pulsing {
    background: var(--danger);
    animation: pulse 1.5s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.recording-panel {
  padding: var(--space-sm) 0;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-md);
  }

  .panel-title {
    color: var(--text-primary);
    font-weight: var(--font-weight-semibold);
  }

  .stats {
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs) 0;

    + .stat-row {
      border-top: 1px solid var(--border-color);
    }
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-secondary);
    letter-spacing: 0.25px;
  }

  .stat-value {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    gap: var(--space-xs);
  }
}

.uppercase-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}

.mono {
  font-family: var(--font-family-mono);
}
</style>

<style>
/* Global popover style — must be un-scoped for element-plus */
.recording-popover {
  background: #1a1428 !important;
  border: 1px solid #362d59 !important;
  border-radius: 10px !important;
  padding: var(--space-md) !important;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 30px !important;
}

.recording-popover .el-popover__title {
  color: #e5e7eb !important;
}
</style>
