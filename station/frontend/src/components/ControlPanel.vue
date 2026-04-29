<template>
  <div class="control-panel">
    <!-- 区块1: 速度控制 -->
    <div class="panel-section">
      <h3 class="section-title">Velocity Control</h3>
      <div class="control-row">
        <label class="control-label">Linear (m/s)</label>
        <el-slider
          v-model="linearVelocity"
          :min="0"
          :max="2.0"
          :step="0.1"
          :disabled="disabled"
          show-input
          input-size="small"
          :show-input-controls="false"
        />
      </div>
      <div class="control-row">
        <label class="control-label">Angular (rad/s)</label>
        <el-slider
          v-model="angularVelocity"
          :min="-1.5"
          :max="1.5"
          :step="0.1"
          :disabled="disabled"
          show-input
          input-size="small"
          :show-input-controls="false"
        />
      </div>
      <el-button
        type="primary"
        :disabled="disabled"
        :loading="velocitySending"
        @click="handleSendVelocity"
      >
        Send Velocity
      </el-button>
    </div>

    <!-- 区块2: 模式切换 -->
    <div class="panel-section">
      <h3 class="section-title">Mode Control</h3>
      <div class="mode-row">
        <el-radio-group v-model="selectedMode" :disabled="disabled" @change="handleModeChange">
          <el-radio-button value="auto">AUTO</el-radio-button>
          <el-radio-button value="manual">MANUAL</el-radio-button>
          <el-radio-button value="stop">STOP</el-radio-button>
        </el-radio-group>
      </div>
      <div class="action-buttons">
        <el-button
          type="danger"
          :disabled="disabled"
          @click="handleEmergencyStop"
        >
          EMERGENCY STOP
        </el-button>
        <el-button
          :disabled="disabled"
          @click="handleReturnHome"
        >
          Return Home
        </el-button>
      </div>
    </div>

    <!-- 区块3: 自定义指令 -->
    <el-collapse class="custom-section">
      <el-collapse-item title="Custom Command" name="custom">
        <div class="custom-form">
          <el-input
            v-model="customTopic"
            placeholder="Topic name (e.g. /cmd_vel)"
            :disabled="disabled"
            size="small"
          />
          <el-input
            v-model="customPayload"
            type="textarea"
            placeholder='JSON payload (e.g. {"linear": 0.5})'
            :disabled="disabled"
            :rows="3"
            size="small"
          />
          <el-button
            type="primary"
            size="small"
            :disabled="disabled || !customPayloadValid"
            @click="handleSendCustom"
          >
            Send Custom
          </el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRobotStore } from '@/stores/robot'

const robotStore = useRobotStore()

// 速度控制
const linearVelocity = ref(0)
const angularVelocity = ref(0)
const velocitySending = ref(false)

// 模式控制
const selectedMode = ref('stop')

// 自定义指令
const customTopic = ref('')
const customPayload = ref('')

/** 是否禁用控件（未选中机器人 / 机器人离线 / WS 断开） */
const disabled = computed(() => {
  const robot = robotStore.selectedRobot
  return !robot || !robot.online || !robotStore.wsConnected
})

/** 自定义 JSON 是否合法 */
const customPayloadValid = computed(() => {
  if (!customPayload.value.trim()) return false
  try {
    JSON.parse(customPayload.value)
    return true
  } catch {
    return false
  }
})

/** 发送速度指令 */
function handleSendVelocity() {
  velocitySending.value = true
  robotStore.sendCommand('velocity', {
    linear: linearVelocity.value,
    angular: angularVelocity.value,
  })
  // 短暂显示 loading 状态
  setTimeout(() => {
    velocitySending.value = false
  }, 500)
}

/** 模式切换 */
function handleModeChange(mode: string | number | boolean | undefined) {
  if (mode != null) {
    robotStore.sendCommand('mode', { mode: String(mode) })
  }
}

/** 紧急停止 */
function handleEmergencyStop() {
  robotStore.sendCommand('stop', {})
}

/** 返航 */
function handleReturnHome() {
  robotStore.sendCommand('return_home', {})
}

/** 发送自定义指令 */
function handleSendCustom() {
  try {
    const payload = JSON.parse(customPayload.value)
    robotStore.sendCommand('custom', {
      topic: customTopic.value,
      payload,
    })
  } catch {
    // customPayloadValid 已校验，理论上不会走到这里
  }
}
</script>

<style scoped lang="scss">
.control-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.panel-section {
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

.section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-md);
}

.control-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.control-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 100px;
}

:deep(.el-slider) {
  flex: 1;
}

:deep(.el-slider__input) {
  width: 72px;
}

.mode-row {
  margin-bottom: var(--space-md);
}

.action-buttons {
  display: flex;
  gap: var(--space-sm);
}

.custom-section {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);

  :deep(.el-collapse-item__header) {
    background: var(--bg-secondary);
    border-bottom-color: var(--border-color);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 var(--space-lg);
    height: 40px;
  }

  :deep(.el-collapse-item__wrap) {
    background: var(--bg-secondary);
    border-bottom: none;
  }

  :deep(.el-collapse-item__content) {
    padding: var(--space-md) var(--space-lg);
  }
}

.custom-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
</style>
