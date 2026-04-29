<template>
  <AppLayout>
    <div class="dashboard">
      <!-- 左侧：机器人列表 -->
      <aside class="robot-sidebar panel-card">
        <div class="panel-header">
          <span class="panel-title">Robots</span>
          <div class="panel-actions">
            <el-button v-if="robotList.length > 0" text size="small" @click="handleSelectAll">
              {{ allSelected ? 'Clear' : 'Select All' }}
            </el-button>
            <el-button text size="small" @click="handleRefresh">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </div>
        </div>

        <div v-if="robotList.length === 0" class="empty-state">
          <el-empty description="No robots found" :image-size="64" />
          <el-button type="primary" size="small" @click="handleDiscover">
            Discover Robots
          </el-button>
        </div>

        <div v-else class="robot-list">
          <div
            v-for="robot in robotList"
            :key="robot.robot_id"
            class="robot-card"
            :class="{
              active: isSelected(robot.robot_id),
              offline: !robot.online
            }"
          >
            <el-checkbox
              :model-value="isSelected(robot.robot_id)"
              @change="() => toggleRobotSelection(robot.robot_id)"
              size="small"
              class="robot-checkbox"
            />
            <div class="robot-card-content" @click="selectRobot(robot.robot_id)">
              <div class="robot-card-header">
                <span class="robot-id">{{ robot.robot_id }}</span>
                <el-tag :type="robot.online ? 'success' : 'info'" size="small" effect="dark">
                  {{ robot.online ? 'Online' : 'Offline' }}
                </el-tag>
              </div>
              <div class="robot-card-body">
                <div class="stat">
                  <el-icon><Lightning /></el-icon>
                  <span>{{ robot.battery }}%</span>
                </div>
                <div class="stat">
                  <el-icon><VideoPlay /></el-icon>
                  <span>{{ robot.mode }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部选中计数 -->
        <div v-if="selectedCount > 0" class="sidebar-footer">
          <span class="selected-count">{{ selectedCount }} selected</span>
        </div>
      </aside>

      <!-- 右侧：详情区 -->
      <section class="detail-area">
        <!-- 空状态 -->
        <div v-if="selectedCount === 0" class="detail-empty">
          <el-empty description="Select robots to view" :image-size="96" />
        </div>

        <!-- 单机器人详情 -->
        <div v-else-if="selectedCount === 1" class="detail-content">
          <RobotStatusPanel :robot="selectedRobot!" />
          <ControlPanel />
          <TopicManager />
          <ImageViewer :robot-id="selectedRobot?.robot_id ?? ''" />
          <PointCloudViewer :robot-id="selectedRobot?.robot_id ?? ''" />
          <RobotCharts :history="selectedHistory" />
          <CommandTracker />
          <HistoryPanel />
        </div>

        <!-- 多机器人概览 -->
        <div v-else class="multi-view">
          <div class="batch-bar">
            <span class="batch-title">{{ selectedCount }} robots selected</span>
            <div class="batch-actions">
              <el-button
                size="small"
                type="danger"
                :disabled="!allOnline"
                @click="handleBatchStop"
              >
                Stop All
              </el-button>
              <el-button
                size="small"
                :disabled="!allOnline"
                @click="handleBatchReturnHome"
              >
                Return All Home
              </el-button>
              <el-button
                size="small"
                text
                @click="clearSelection"
              >
                Clear
              </el-button>
            </div>
          </div>

          <RobotGridCards
            :robots="selectedRobotsList"
            @select="handleGridSelect"
          />
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Refresh, Lightning, VideoPlay } from '@element-plus/icons-vue'
import { useRobotStore } from '@/stores/robot'
import type { RobotStatus } from '@/types/robot'
import RobotStatusPanel from '@/components/RobotStatusPanel.vue'
import RobotCharts from '@/components/RobotCharts.vue'
import ControlPanel from '@/components/ControlPanel.vue'
import CommandTracker from '@/components/CommandTracker.vue'
import TopicManager from '@/components/TopicManager.vue'
import RobotGridCards from '@/components/RobotGridCards.vue'
import HistoryPanel from '@/components/HistoryPanel.vue'
import PointCloudViewer from '@/components/PointCloudViewer.vue'
import ImageViewer from '@/components/ImageViewer.vue'

const robotStore = useRobotStore()

const robotList = computed(() => robotStore.robotList)
const selectedRobot = computed(() => robotStore.selectedRobot)
const selectedRobots = computed(() => robotStore.selectedRobots)
const selectedHistory = computed(() => robotStore.selectedHistory)
const selectedCount = computed(() => robotStore.selectedCount)

const selectedRobotsList = computed(() => {
  return selectedRobots.value as RobotStatus[]
})

const allSelected = computed(() => {
  return robotList.value.length > 0 && selectedCount.value === robotList.value.length
})

const allOnline = computed(() => {
  return selectedRobotsList.value.every((r) => r.online)
})

function isSelected(robotId: string): boolean {
  if (robotStore.selectedRobotIds.size > 0) {
    return robotStore.selectedRobotIds.has(robotId)
  }
  return robotStore.selectedRobotId === robotId
}

function selectRobot(id: string) {
  robotStore.selectRobot(id)
}

function toggleRobotSelection(id: string) {
  robotStore.toggleRobotSelection(id)
}

function handleSelectAll() {
  if (allSelected.value) {
    robotStore.clearSelection()
  } else {
    robotStore.selectAllRobots()
  }
}

function handleRefresh() {
  robotStore.fetchRobots()
}

function handleDiscover() {
  robotStore.discover()
}

function handleGridSelect(robotId: string) {
  robotStore.selectRobot(robotId)
}

function handleBatchStop() {
  robotStore.batchCommand('stop', {})
}

function handleBatchReturnHome() {
  robotStore.batchCommand('return_home', {})
}

function clearSelection() {
  robotStore.clearSelection()
}

onMounted(() => {
  robotStore.fetchRobots()
})
</script>

<style scoped lang="scss">
.dashboard {
  display: flex;
  gap: var(--space-lg);
  height: 100%;
}

.robot-sidebar {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  gap: var(--space-md);
  flex: 1;
}

.robot-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm);
}

.robot-card {
  display: flex;
  align-items: flex-start;
  padding: var(--space-sm) var(--space-sm);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: default;
  transition: all var(--transition-normal);
  margin-bottom: var(--space-xs);
  gap: var(--space-xs);

  &:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-color-light);
  }

  &.active {
    background: var(--bg-tertiary);
    border-color: var(--accent);
  }

  &.offline {
    opacity: 0.45;
  }
}

.robot-checkbox {
  margin-top: 8px;
  padding-left: 4px;
}

.robot-card-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.robot-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.robot-id {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.robot-card-body {
  display: flex;
  gap: var(--space-lg);
}

.stat {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.sidebar-footer {
  padding: var(--space-sm) var(--space-md);
  border-top: 1px solid var(--border-color);
  text-align: center;
}

.selected-count {
  font-size: var(--font-size-xs);
  color: var(--accent);
  font-family: var(--font-family-mono);
}

.detail-area {
  flex: 1;
  overflow-y: auto;
}

.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.multi-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--space-md) var(--space-lg);
}

.batch-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
