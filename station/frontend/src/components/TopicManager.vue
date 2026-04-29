<template>
  <div class="topic-manager panel-card">
    <div class="panel-header">
      <span class="panel-title">Topic Manager</span>
      <el-tag size="small" effect="dark" type="info">
        {{ subscribedCount }} subscribed
      </el-tag>
    </div>

    <div v-if="!canOperate" class="topic-disabled">
      <span>Select an online robot to manage topics</span>
    </div>

    <template v-else>
      <!-- 可用话题列表 -->
      <div class="topic-section">
        <div class="section-header" @click="showAvailable = !showAvailable">
          <span class="section-title">Available Topics</span>
          <el-tag size="small" effect="dark">{{ availableTopics.length }}</el-tag>
          <el-icon class="collapse-icon" :class="{ rotated: !showAvailable }">
            <ArrowDown />
          </el-icon>
        </div>
        <div v-show="showAvailable" class="section-body">
          <el-table :data="availableTopics" size="small" max-height="220" stripe>
            <el-table-column prop="name" label="Topic" min-width="160" show-overflow-tooltip />
            <el-table-column prop="msg_type" label="Type" width="180" show-overflow-tooltip />
            <el-table-column label="" width="100" align="center">
              <template #default="{ row }">
                <el-button
                  v-if="!isSubscribed(row.name)"
                  type="primary"
                  size="small"
                  text
                  @click="openFreqDialog(row)"
                >
                  Subscribe
                </el-button>
                <el-tag v-else size="small" type="success" effect="dark">Active</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 已订阅话题 -->
      <div class="topic-section">
        <div class="section-header" @click="showSubscribed = !showSubscribed">
          <span class="section-title">Subscribed Topics</span>
          <el-tag size="small" effect="dark" type="success">{{ subscribedCount }}</el-tag>
          <el-icon class="collapse-icon" :class="{ rotated: !showSubscribed }">
            <ArrowDown />
          </el-icon>
        </div>
        <div v-show="showSubscribed" class="section-body">
          <el-table
            v-if="subscriptions.length > 0"
            :data="subscriptions"
            size="small"
            max-height="200"
            stripe
          >
            <el-table-column prop="topic" label="Topic" min-width="140" show-overflow-tooltip />
            <el-table-column prop="msg_type" label="Type" width="160" show-overflow-tooltip />
            <el-table-column label="Freq" width="80" align="center">
              <template #default="{ row }">
                {{ row.freq_limit ? `${row.freq_limit}Hz` : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="Status" width="90" align="center">
              <template #default="{ row }">
                <el-tag
                  :type="statusTagType(row.status)"
                  size="small"
                  effect="dark"
                >
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="" width="100" align="center">
              <template #default="{ row }">
                <el-popconfirm
                  title="Unsubscribe this topic?"
                  confirm-button-text="Yes"
                  cancel-button-text="No"
                  @confirm="handleUnsubscribe(row.topic)"
                >
                  <template #reference>
                    <el-button
                      type="danger"
                      size="small"
                      text
                      :disabled="row.status === 'pending'"
                    >
                      Unsub
                    </el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="empty-hint">No subscribed topics</div>
        </div>
      </div>

      <!-- 传感器数据实时展示 -->
      <div class="topic-section">
        <div class="section-header" @click="showSensorData = !showSensorData">
          <span class="section-title">Sensor Data</span>
          <el-tag size="small" effect="dark" type="warning">{{ sensorEntries.length }}</el-tag>
          <el-icon class="collapse-icon" :class="{ rotated: !showSensorData }">
            <ArrowDown />
          </el-icon>
        </div>
        <div v-show="showSensorData" class="section-body">
          <template v-if="sensorEntries.length > 0">
            <el-collapse v-model="expandedSensors" class="sensor-collapse">
              <el-collapse-item
                v-for="entry in sensorEntries"
                :key="entry.name"
                :name="entry.name"
              >
                <template #title>
                  <span class="sensor-title">{{ entry.name }}</span>
                  <el-tag size="small" effect="dark" class="sensor-type-tag">
                    {{ entry.msgType }}
                  </el-tag>
                  <span class="sensor-time">{{ formatTime(entry.timestamp) }}</span>
                </template>

                <!-- 图像数据：base64 渲染 -->
                <div v-if="entry.msgType?.includes('CompressedImage') && entry.data?.base64" class="sensor-image">
                  <img :src="`data:image/jpeg;base64,${entry.data.base64}`" alt="camera" />
                </div>

                <!-- LaserScan：摘要展示 -->
                <div v-else-if="entry.msgType?.includes('LaserScan')" class="sensor-summary">
                  <el-descriptions :column="2" size="small" border>
                    <el-descriptions-item label="Angle Min">
                      {{ formatNum(entry.data?.angle_min) }} rad
                    </el-descriptions-item>
                    <el-descriptions-item label="Angle Max">
                      {{ formatNum(entry.data?.angle_max) }} rad
                    </el-descriptions-item>
                    <el-descriptions-item label="Range Min">
                      {{ formatNum(entry.data?.range_min) }} m
                    </el-descriptions-item>
                    <el-descriptions-item label="Range Max">
                      {{ formatNum(entry.data?.range_max) }} m
                    </el-descriptions-item>
                    <el-descriptions-item label="Readings">
                      {{ (entry.data?.ranges as unknown[])?.length ?? 0 }}
                    </el-descriptions-item>
                    <el-descriptions-item label="Nearest">
                      {{ formatNum(nearestRange(entry.data?.ranges)) }} m
                    </el-descriptions-item>
                  </el-descriptions>
                </div>

                <!-- 通用 key-value 展示 -->
                <div v-else class="sensor-kv">
                  <el-descriptions :column="2" size="small" border>
                    <el-descriptions-item
                      v-for="kv in flattenData(entry.data)"
                      :key="kv.key"
                      :label="kv.key"
                    >
                      {{ kv.value }}
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
              </el-collapse-item>
            </el-collapse>
          </template>
          <div v-else class="empty-hint">No sensor data received</div>
        </div>
      </div>
    </template>

    <!-- 频率设置对话框 -->
    <el-dialog v-model="freqDialogVisible" title="Subscribe Topic" width="400px" :append-to-body="true">
      <div class="freq-dialog-content">
        <div class="freq-topic-name">{{ freqDialogTopic?.name }}</div>
        <div class="freq-topic-type">{{ freqDialogTopic?.msg_type }}</div>
        <div class="freq-slider-row">
          <span class="freq-label">Frequency:</span>
          <el-slider
            v-model="freqValue"
            :min="0.5"
            :max="30"
            :step="0.5"
            :show-input="true"
            input-size="small"
            style="flex: 1"
          />
          <span class="freq-unit">Hz</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="freqDialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSubscribe">Subscribe</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { useRobotStore } from '@/stores/robot'
import type { TopicInfo } from '@/types/robot'

const robotStore = useRobotStore()

// 折叠状态
const showAvailable = ref(true)
const showSubscribed = ref(true)
const showSensorData = ref(true)
const expandedSensors = ref<string[]>([])

// 频率设置对话框
const freqDialogVisible = ref(false)
const freqDialogTopic = ref<TopicInfo | null>(null)
const freqValue = ref(10)

// 计算属性
const selectedRobot = computed(() => robotStore.selectedRobot)
const subscriptions = computed(() => robotStore.selectedSubscriptions)
const sensorDataMap = computed(() => robotStore.selectedSensorData)
const canOperate = computed(() =>
  !!selectedRobot.value && selectedRobot.value.online && robotStore.wsConnected
)
const subscribedCount = computed(() =>
  subscriptions.value.filter((s) => s.status === 'active').length
)

// 可用话题（去重已订阅的标记用）
const availableTopics = computed<TopicInfo[]>(() => {
  if (!selectedRobot.value?.available_topics) return []
  // 后端返回的 available_topics 格式可能是 [{topic, msg_type, description}, ...]
  // 或 [{name, msg_type}, ...]，需要兼容
  return selectedRobot.value.available_topics.map((t: any) => ({
    name: t.topic || t.name,
    msg_type: t.msg_type,
    description: t.description,
  }))
})

// 传感器数据条目
const sensorEntries = computed(() => {
  const entries: { name: string; msgType: string; data: Record<string, unknown>; timestamp: number }[] = []
  for (const [name, data] of sensorDataMap.value.entries()) {
    entries.push({
      name,
      msgType: (data._msg_type as string) || '',
      data,
      timestamp: (data.timestamp as number) || 0,
    })
  }
  return entries
})

function isSubscribed(topicName: string): boolean {
  return subscriptions.value.some(
    (s) => s.topic === topicName && s.status === 'active'
  )
}

function statusTagType(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'active') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
}

function openFreqDialog(topic: TopicInfo) {
  freqDialogTopic.value = topic
  freqValue.value = 10
  freqDialogVisible.value = true
}

function handleSubscribe() {
  if (!freqDialogTopic.value) return
  robotStore.subscribeTopic(
    freqDialogTopic.value.name,
    freqDialogTopic.value.msg_type,
    freqValue.value
  )
  freqDialogVisible.value = false
}

function handleUnsubscribe(topic: string) {
  robotStore.unsubscribeTopic(topic)
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString()
}

function formatNum(val: unknown): string {
  if (typeof val !== 'number') return '-'
  return val.toFixed(3)
}

function nearestRange(ranges: unknown): number | null {
  if (!Array.isArray(ranges)) return null
  const valid = ranges.filter((r): r is number => typeof r === 'number' && isFinite(r))
  return valid.length > 0 ? Math.min(...valid) : null
}

/** 将传感器数据展平为 key-value 对 */
function flattenData(data: Record<string, unknown>): { key: string; value: string }[] {
  if (!data) return []
  const result: { key: string; value: string }[] = []
  for (const [key, val] of Object.entries(data)) {
    // 跳过内部字段和嵌套对象
    if (key.startsWith('_')) continue
    if (typeof val === 'object' && val !== null) {
      result.push({ key, value: JSON.stringify(val) })
    } else {
      result.push({ key, value: String(val ?? '-') })
    }
  }
  return result
}
</script>

<style scoped lang="scss">
.topic-manager {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: border-color var(--transition-normal);

  &:hover {
    border-color: var(--border-color-light);
  }
}

.topic-disabled {
  padding: var(--space-2xl);
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--font-size-md);
}

.topic-section {
  border-top: 1px solid var(--border-color);

  &:first-child {
    border-top: none;
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--bg-tertiary);
  }
}

.section-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.collapse-icon {
  margin-left: auto;
  transition: transform var(--transition-fast);

  &.rotated {
    transform: rotate(-90deg);
  }
}

.section-body {
  padding: 0 var(--space-md) var(--space-md);
}

.empty-hint {
  text-align: center;
  padding: var(--space-md);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

// 传感器数据折叠面板
.sensor-collapse {
  :deep(.el-collapse-item__header) {
    background: transparent;
    border-color: var(--border-color);
    color: var(--text-primary);
    height: 36px;
    line-height: 36px;
  }

  :deep(.el-collapse-item__wrap) {
    background: transparent;
    border-color: var(--border-color);
  }

  :deep(.el-collapse-item__content) {
    padding: var(--space-sm) 0;
  }
}

.sensor-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.sensor-type-tag {
  margin-left: var(--space-sm);
}

.sensor-time {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-family: var(--font-family-mono);
}

.sensor-image {
  img {
    max-width: 100%;
    max-height: 200px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
  }
}

.sensor-summary,
.sensor-kv {
  :deep(.el-descriptions__label) {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
  }

  :deep(.el-descriptions__content) {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: var(--font-size-xs);
  }
}

// 频率设置对话框
.freq-dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.freq-topic-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-family: var(--font-family-mono);
}

.freq-topic-type {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.freq-slider-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.freq-label {
  font-size: var(--font-size-md);
  color: var(--text-primary);
  white-space: nowrap;
}

.freq-unit {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
}

:deep(.el-descriptions__cell) {
  font-size: var(--font-size-sm);
}
</style>
