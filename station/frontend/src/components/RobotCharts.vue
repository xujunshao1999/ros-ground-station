<template>
  <div class="charts-panel">
    <div class="chart-block">
      <h3 class="chart-title">Battery</h3>
      <div class="chart-container">
        <v-chart :option="batteryOption" autoresize />
      </div>
    </div>
    <div class="chart-block">
      <h3 class="chart-title">Velocity</h3>
      <div class="chart-container">
        <v-chart :option="velocityOption" autoresize />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { RobotHistory, HistoryPoint } from '@/stores/robot'
import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  TooltipComponentOption,
  LegendComponentOption,
  DataZoomComponentOption,
} from 'echarts/components'

// 注册 ECharts 模块（按需加载，减小包体积）
use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
])

type EChartsOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
>

const props = defineProps<{
  history: RobotHistory | null
}>()

/** 时间轴格式化 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

/** 提取数据 */
function extractData(points: HistoryPoint[]): [string, number][] {
  return points.map((p) => [formatTime(p.timestamp), p.value])
}

// 深色主题通用配置（ECharts 不支持 CSS 变量，从 computed styles 读取）
function getChartColor(varName: string): string {
  const el = document.documentElement
  return getComputedStyle(el).getPropertyValue(varName).trim()
}

const darkAxisStyle = {
  axisLine: { lineStyle: { color: '#3a3d4a' } },
  axisTick: { lineStyle: { color: '#3a3d4a' } },
  axisLabel: { color: '#909399', fontSize: 11 },
  splitLine: { lineStyle: { color: '#2a2d3a', type: 'dashed' as const } },
}

const batteryOption = computed<EChartsOption>(() => {
  const data = props.history ? extractData(props.history.battery) : []
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1d27',
      borderColor: '#2a2d3a',
      textStyle: { color: '#e0e0e0', fontSize: 12 },
      formatter: (params: unknown) => {
        const p = (params as { name: string; value: number }[])[0]
        return p ? `${p.name}<br/>Battery: <b>${p.value}%</b>` : ''
      },
    },
    grid: { left: 45, right: 16, top: 12, bottom: 36 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d[0]),
      ...darkAxisStyle,
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      ...darkAxisStyle,
    },
    dataZoom: [
      {
        type: 'inside',
        start: 70,
        end: 100,
      },
    ],
    series: [
      {
        type: 'line',
        data: data.map((d) => d[1]),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: getChartColor('--chart-battery'), width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(34,197,94,0.25)' },
              { offset: 1, color: 'rgba(34,197,94,0.02)' },
            ],
          },
        },
      },
    ],
  }
})

const velocityOption = computed<EChartsOption>(() => {
  const linearData = props.history ? extractData(props.history.velocityLinear) : []
  const angularData = props.history ? extractData(props.history.velocityAngular) : []
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1d27',
      borderColor: '#2a2d3a',
      textStyle: { color: '#e0e0e0', fontSize: 12 },
    },
    legend: {
      data: ['Linear', 'Angular'],
      textStyle: { color: '#909399', fontSize: 11 },
      top: 0,
      right: 16,
    },
    grid: { left: 55, right: 16, top: 30, bottom: 36 },
    xAxis: {
      type: 'category',
      data: linearData.map((d) => d[0]),
      ...darkAxisStyle,
    },
    yAxis: {
      type: 'value',
      ...darkAxisStyle,
    },
    dataZoom: [
      {
        type: 'inside',
        start: 70,
        end: 100,
      },
    ],
    series: [
      {
        name: 'Linear',
        type: 'line',
        data: linearData.map((d) => d[1]),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: getChartColor('--chart-velocity-linear'), width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99,102,241,0.2)' },
              { offset: 1, color: 'rgba(99,102,241,0.01)' },
            ],
          },
        },
      },
      {
        name: 'Angular',
        type: 'line',
        data: angularData.map((d) => d[1]),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: getChartColor('--chart-velocity-angular'), width: 2 },
      },
    ],
  }
})
</script>

<style scoped lang="scss">
.charts-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.chart-block {
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

.chart-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-sm);
}

.chart-container {
  width: 100%;
  height: 180px;
}
</style>
