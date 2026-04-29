<template>
  <div class="history-panel panel-card">
    <div class="panel-header" @click="expanded = !expanded">
      <div class="panel-header-left">
        <span class="panel-title uppercase-label">History</span>
        <el-tag v-if="recordCount > 0" size="small" effect="dark" type="info">
          {{ recordCount }} records
        </el-tag>
      </div>
      <el-icon :class="{ rotated: expanded }" class="chevron">
        <ArrowRight />
      </el-icon>
    </div>

    <template v-if="expanded">
      <!-- 机器人选择 -->
      <div class="section">
        <span class="section-label uppercase-label">Robot</span>
        <el-select
          v-model="selectedRobotId"
          class="sentry-select"
          placeholder="Select robot"
          size="small"
          clearable
          @change="loadHistory"
        >
          <el-option
            v-for="rid in availableRobots"
            :key="rid"
            :label="rid"
            :value="rid"
          />
        </el-select>
      </div>

      <!-- 时间范围快捷选择 -->
      <div class="section">
        <span class="section-label uppercase-label">Time Range</span>
        <div class="range-chips">
          <el-button
            v-for="r in ranges"
            :key="r.value"
            size="small"
            :class="{ active: selectedRange === r.value }"
            class="range-chip"
            @click="selectRange(r.value)"
          >
            {{ r.label }}
          </el-button>
        </div>
      </div>

      <!-- 状态曲线 -->
      <div v-if="loading" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>Loading history...</span>
      </div>

      <template v-else-if="historyRecords.length > 0">
        <div class="chart-section">
          <div class="chart-header">
            <span class="section-label uppercase-label">Battery</span>
          </div>
          <div ref="batteryChartRef" class="chart" />
        </div>

        <div class="chart-section">
          <div class="chart-header">
            <span class="section-label uppercase-label">Velocity</span>
          </div>
          <div ref="velocityChartRef" class="chart" />
        </div>

        <!-- 导出 -->
        <div class="export-bar">
          <el-button size="small" class="sentry-btn sentry-btn-secondary" @click="exportCSV">
            EXPORT CSV
          </el-button>
        </div>
      </template>

      <div v-else-if="selectedRobotId" class="empty-state">
        <span class="empty-text">No historical data found</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ArrowRight, Loading } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { getHistory, getHistoryRobots } from '@/api/robot'
import type { HistoryRecord } from '@/types/robot'

interface TimeRange {
  label: string
  value: number // minutes
}

const ranges: TimeRange[] = [
  { label: '5m', value: 5 },
  { label: '15m', value: 15 },
  { label: '1h', value: 60 },
  { label: '4h', value: 240 },
  { label: '24h', value: 1440 },
]

const expanded = ref(false)
const selectedRobotId = ref('')
const availableRobots = ref<string[]>([])
const selectedRange = ref(5)
const historyRecords = ref<HistoryRecord[]>([])
const recordCount = ref(0)
const loading = ref(false)

const batteryChartRef = ref<HTMLDivElement | null>(null)
const velocityChartRef = ref<HTMLDivElement | null>(null)

let batteryChart: echarts.ECharts | null = null
let velocityChart: echarts.ECharts | null = null

onMounted(async () => {
  try {
    const { data } = await getHistoryRobots()
    availableRobots.value = data.robots
  } catch {
    // 服务端静默处理
  }
})

onUnmounted(() => {
  batteryChart?.dispose()
  velocityChart?.dispose()
})

watch(expanded, async (val) => {
  if (val && historyRecords.value.length > 0) {
    await nextTick()
    initCharts()
  }
})

async function selectRange(minutes: number) {
  selectedRange.value = minutes
  await loadHistory()
}

async function loadHistory() {
  if (!selectedRobotId.value) return

  loading.value = true
  try {
    const until = Date.now() / 1000
    const since = until - selectedRange.value * 60

    const { data } = await getHistory(selectedRobotId.value, since, until, 2000)
    historyRecords.value = data.records
    recordCount.value = data.count

    await nextTick()
    initCharts()
  } catch (e) {
    console.error('[HistoryPanel] load failed:', e)
    historyRecords.value = []
    recordCount.value = 0
  } finally {
    loading.value = false
  }
}

function initCharts() {
  if (historyRecords.value.length === 0) return

  initBatteryChart()
  initVelocityChart()
}

function initBatteryChart() {
  if (!batteryChartRef.value) return
  batteryChart?.dispose()

  const times = historyRecords.value.map((r) => formatTime(r.timestamp))
  const values = historyRecords.value.map((r) => r.battery)

  batteryChart = echarts.init(batteryChartRef.value)
  batteryChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26, 20, 40, 0.95)',
      borderColor: '#362d59',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    grid: { left: 45, right: 10, top: 8, bottom: 20 },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#362d59' } },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1f1933', type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#6a5fc1' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(106, 95, 193, 0.35)' },
            { offset: 1, color: 'rgba(106, 95, 193, 0.02)' },
          ]),
        },
      },
    ],
  })
}

function initVelocityChart() {
  if (!velocityChartRef.value) return
  velocityChart?.dispose()

  const times = historyRecords.value.map((r) => formatTime(r.timestamp))
  const linear = historyRecords.value.map((r) => r.velocity.linear)
  const angular = historyRecords.value.map((r) => r.velocity.angular)

  velocityChart = echarts.init(velocityChartRef.value)
  velocityChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(26, 20, 40, 0.95)',
      borderColor: '#362d59',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    legend: {
      data: ['Linear', 'Angular'],
      textStyle: { color: '#9ca3af', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 10,
    },
    grid: { left: 45, right: 10, top: 20, bottom: 20 },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#362d59' } },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1f1933', type: 'dashed' } },
    },
    series: [
      {
        name: 'Linear',
        type: 'line',
        data: linear,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#c2ef4e' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(194, 239, 78, 0.2)' },
            { offset: 1, color: 'rgba(194, 239, 78, 0.02)' },
          ]),
        },
      },
      {
        name: 'Angular',
        type: 'line',
        data: angular,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#fa7faa' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(250, 127, 170, 0.2)' },
            { offset: 1, color: 'rgba(250, 127, 170, 0.02)' },
          ]),
        },
      },
    ],
  })
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function exportCSV() {
  if (historyRecords.value.length === 0) return

  const headers = ['timestamp', 'battery', 'pos_x', 'pos_y', 'theta', 'linear_vel', 'angular_vel', 'mode']
  const rows = historyRecords.value.map((r) => [
    r.timestamp,
    r.battery,
    r.position.x,
    r.position.y,
    r.position.theta,
    r.velocity.linear,
    r.velocity.angular,
    r.mode,
  ])

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedRobotId.value}_history.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped lang="scss">
.history-panel {
  overflow: hidden;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;

    &:hover {
      opacity: 0.8;
    }
  }

  .panel-header-left {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .chevron {
    transition: transform var(--transition-normal);
    color: var(--text-secondary);

    &.rotated {
      transform: rotate(90deg);
    }
  }

  .section {
    margin-top: var(--space-md);
  }

  .section-label {
    display: block;
    font-size: 10px;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }

  .range-chips {
    display: flex;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .range-chip {
    background: var(--bg-tertiary) !important;
    border: 1px solid var(--border-color) !important;
    color: var(--text-secondary) !important;
    font-size: 11px !important;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    padding: 4px 10px !important;
    border-radius: 6px !important;

    &.active {
      background: #6a5fc1 !important;
      border-color: #6a5fc1 !important;
      color: #fff !important;
    }
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-2xl);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }

  .chart-section {
    margin-top: var(--space-md);
  }

  .chart-header {
    margin-bottom: var(--space-xs);
  }

  .chart {
    width: 100%;
    height: 140px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .export-bar {
    margin-top: var(--space-md);
    display: flex;
    justify-content: flex-end;
  }

  .empty-state {
    display: flex;
    justify-content: center;
    padding: var(--space-xl);
  }

  .empty-text {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }
}

.uppercase-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}
</style>
