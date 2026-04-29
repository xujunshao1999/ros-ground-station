<template>
  <div class="image-viewer panel-card">
    <div class="panel-header">
      <div class="panel-header-left">
        <span class="panel-title uppercase-label">Camera Stream</span>
        <el-tag v-if="activeStream" size="small" effect="dark" type="success">LIVE</el-tag>
        <el-tag v-else size="small" effect="dark" type="info">NO DATA</el-tag>
      </div>
      <div class="panel-header-right">
        <span v-if="resolution" class="resolution mono">{{ resolution }}</span>
        <span v-if="fps > 0" class="fps mono">{{ fps }} fps</span>
      </div>
    </div>

    <div class="panel-body">
      <div ref="imageContainer" class="image-container">
        <img
          v-if="imageSrc"
          :src="imageSrc"
          class="camera-feed"
          :class="{ hidden: !imageLoaded }"
          @load="imageLoaded = true"
        />
        <div v-if="!activeStream" class="empty-overlay">
          <span class="empty-text">No camera stream available</span>
          <span class="empty-hint">Subscribe to a camera topic (e.g. /camera/image_raw/compressed) to begin</span>
        </div>
        <div v-if="activeStream && !imageLoaded" class="loading-overlay">
          <span class="empty-text">Waiting for frame...</span>
        </div>
        <div v-if="activeStream && imageLoaded && activeStream" class="image-info-bar">
          <span class="info-topic mono">{{ activeStream }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { useRobotStore } from '@/stores/robot'

const props = defineProps<{
  robotId: string
}>()

const robotStore = useRobotStore()

const imageContainer = ref<HTMLDivElement | null>(null)
const imageSrc = ref('')
const imageLoaded = ref(false)
const fps = ref(0)
const resolution = ref('')

const activeStream = ref<string | null>(null)

// FPS tracking
let frameCount = 0
let lastFpsTime = 0
let fpsInterval: ReturnType<typeof setInterval> | null = null

// Start FPS counter
fpsInterval = setInterval(() => {
  const now = performance.now()
  if (now - lastFpsTime > 1000) {
    fps.value = Math.round(frameCount * 1000 / (now - lastFpsTime))
    frameCount = 0
    lastFpsTime = now
  }
}, 1000)

watch(() => props.robotId, () => {
  activeStream.value = null
  imageSrc.value = ''
  imageLoaded.value = false
  resolution.value = ''
})

// Watch sensor data for image frames for the current robot
const robotSensorData = computed(() => {
  return robotStore.sensorData.get(props.robotId) ?? new Map<string, Record<string, unknown>>()
})

watch(
  () => robotSensorData.value,
  (sensorMap) => {
    if (!sensorMap || sensorMap.size === 0) return

    // Find first camera stream
    let foundTopic = ''
    let foundData: Record<string, unknown> | null = null

    for (const [topic, data] of sensorMap.entries()) {
      if (data && (data.base64 || data.format === 'jpeg' || (data._msg_type && typeof data._msg_type === 'string' && (data._msg_type as string).includes('Image')))) {
        foundTopic = topic
        foundData = data
        break
      }
    }

    if (!foundData) {
      if (!activeStream.value) return
      // Stream disappeared
      activeStream.value = null
      imageSrc.value = ''
      imageLoaded.value = false
      resolution.value = ''
      return
    }

    activeStream.value = foundTopic

    // Update image
    const b64 = foundData.base64 as string | undefined
    if (b64) {
      imageSrc.value = `data:image/jpeg;base64,${b64}`
      frameCount++
    }

    // Update resolution
    const w = foundData.width as number | undefined
    const h = foundData.height as number | undefined
    if (w && h) {
      resolution.value = `${w}×${h}`
    }
  },
  { deep: true, immediate: true }
)

onUnmounted(() => {
  if (fpsInterval) clearInterval(fpsInterval)
})
</script>

<style scoped lang="scss">
.image-viewer {
  overflow: hidden;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .panel-header-left {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .panel-header-right {
      display: flex;
      align-items: center;
      gap: var(--space-md);
    }
  }

  .resolution {
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .fps {
    font-size: 11px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  .panel-body {
    padding: 0;
    margin-top: var(--space-md);
  }

  .image-container {
    position: relative;
    width: 100%;
    height: 320px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #0f1117;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .camera-feed {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: opacity 0.15s ease;

    &.hidden {
      opacity: 0;
      position: absolute;
    }
  }

  .empty-overlay,
  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    pointer-events: none;
  }

  .empty-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .empty-hint {
    font-size: var(--font-size-xs);
    color: var(--text-tertiary);
  }

  .image-info-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: var(--space-xs) var(--space-sm);
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    display: flex;
    align-items: center;
    pointer-events: none;
  }

  .info-topic {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.7);
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
