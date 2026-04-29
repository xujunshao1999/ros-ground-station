<template>
  <div class="pointcloud-viewer panel-card">
    <div class="panel-header">
      <div class="panel-header-left">
        <span class="panel-title uppercase-label">3D Point Cloud</span>
        <el-tag v-if="activeStream" size="small" effect="dark" type="success">LIVE</el-tag>
        <el-tag v-else size="small" effect="dark" type="info">NO DATA</el-tag>
      </div>
      <div class="panel-header-right">
        <span v-if="pointCount > 0" class="point-count mono">{{ pointCount.toLocaleString() }} pts</span>
        <span v-if="fps > 0" class="fps mono">{{ fps }} fps</span>
        <el-button size="small" text @click="resetCamera">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="panel-body">
      <div ref="canvasContainer" class="scene-container">
        <div v-if="!activeStream" class="empty-overlay">
          <span class="empty-text">No point cloud stream available</span>
          <span class="empty-hint">Subscribe to a point cloud topic (e.g. /lidar/points) to begin</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useRobotStore } from '@/stores/robot'
import { getStreamData } from '@/api/robot'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps<{
  robotId: string
}>()

const robotStore = useRobotStore()

const canvasContainer = ref<HTMLDivElement | null>(null)

const pointCount = ref(0)
const fps = ref(0)

// Three.js state
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let pointsMesh: THREE.Points | null = null
let animationId: number | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null
let frameCount = 0
let lastFpsTime = 0

// Color gradient for Z-height
const colorMap = (t: number): THREE.Color => {
  // Blue -> Cyan -> Yellow -> Red (0..1)
  if (t < 0.25) return new THREE.Color(0x4444ff).lerp(new THREE.Color(0x44ffff), t / 0.25)
  if (t < 0.5) return new THREE.Color(0x44ffff).lerp(new THREE.Color(0xffff44), (t - 0.25) / 0.25)
  if (t < 0.75) return new THREE.Color(0xffff44).lerp(new THREE.Color(0xff8844), (t - 0.5) / 0.25)
  return new THREE.Color(0xff8844).lerp(new THREE.Color(0xff2222), (t - 0.75) / 0.25)
}

const activeStream = computed(() => {
  const streams = robotStore.selectedStreams
  return streams.size > 0 ? Array.from(streams.values())[0] : null
})

onMounted(async () => {
  await nextTick()
  initScene()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  disposeScene()
})

watch(() => props.robotId, () => {
  // Reset point cloud when switching robots
  clearPoints()
  startPolling()
})

function initScene() {
  if (!canvasContainer.value) return

  const container = canvasContainer.value
  const width = container.clientWidth
  const height = container.clientHeight || 400

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0f1117)

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(4, 3, 4)
  camera.lookAt(0, 0, 0)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
  controls.target.set(0, 0.5, 0)
  controls.update()

  // Grid
  const gridHelper = new THREE.GridHelper(10, 20, 0x2a2d3a, 0x1a1d27)
  scene.add(gridHelper)

  // Axes
  const axesHelper = new THREE.AxesHelper(2)
  scene.add(axesHelper)

  // Ambient light
  const ambient = new THREE.AmbientLight(0x404060)
  scene.add(ambient)

  // Directional light
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(5, 10, 5)
  scene.add(dirLight)

  // Start animation loop
  animate()

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    if (!container || !renderer || !camera) return
    const w = container.clientWidth
    const h = container.clientHeight || 400
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  resizeObserver.observe(container)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }

  // FPS counter
  frameCount++
  const now = performance.now()
  if (now - lastFpsTime > 1000) {
    fps.value = Math.round(frameCount * 1000 / (now - lastFpsTime))
    frameCount = 0
    lastFpsTime = now
  }
}

function startPolling() {
  stopPolling()

  if (!props.robotId) return

  // Poll every 500ms
  pollingTimer = setInterval(fetchFrame, 500)

  // Also fetch immediately
  fetchFrame()
}

function stopPolling() {
  if (pollingTimer !== null) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

async function fetchFrame() {
  if (!props.robotId) return
  if (!activeStream.value) return

  const topic = activeStream.value.topic
  if (!topic) return

  try {
    const response = await getStreamData(props.robotId, topic)
    const arrayBuffer = response.data as unknown as ArrayBuffer
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return

    // Parse float32 binary
    const float32Array = new Float32Array(arrayBuffer)
    if (float32Array.length < 3) return

    const pointCount_ = float32Array.length / 3
    pointCount.value = pointCount_

    if (!scene) return

    // Create or update geometry
    if (pointsMesh) {
      // Update existing geometry
      const geom = pointsMesh.geometry as THREE.BufferGeometry
      const posAttr = geom.attributes.position as THREE.BufferAttribute
      const colorAttr = geom.attributes.color as THREE.BufferAttribute

      // Resize if needed
      if (posAttr.count !== pointCount_) {
        const newPositions = new Float32Array(float32Array)
        const newColors = new Float32Array(pointCount_ * 3)
        geom.setAttribute('position', new THREE.BufferAttribute(newPositions, 3))
        geom.setAttribute('color', new THREE.BufferAttribute(newColors, 3))
      } else {
        posAttr.array.set(float32Array)
      }
      posAttr.needsUpdate = true

      // Update colors by Z height
      const colors = geom.attributes.color.array as Float32Array
      const positions = geom.attributes.position.array as Float32Array
      let minZ = Infinity, maxZ = -Infinity
      for (let i = 2; i < positions.length; i += 3) {
        if (positions[i] < minZ) minZ = positions[i]
        if (positions[i] > maxZ) maxZ = positions[i]
      }
      const zRange = maxZ - minZ || 1
      for (let i = 0; i < pointCount_; i++) {
        const t = (positions[i * 3 + 2] - minZ) / zRange
        const c = colorMap(t)
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true
      geom.computeBoundingSphere()
    } else {
      // Create new geometry
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(float32Array), 3))

      // Colors by Z height
      const positions = geometry.attributes.position.array as Float32Array
      let minZ = Infinity, maxZ = -Infinity
      for (let i = 2; i < positions.length; i += 3) {
        if (positions[i] < minZ) minZ = positions[i]
        if (positions[i] > maxZ) maxZ = positions[i]
      }
      const zRange = maxZ - minZ || 1
      const colors = new Float32Array(pointCount_ * 3)
      for (let i = 0; i < pointCount_; i++) {
        const t = (positions[i * 3 + 2] - minZ) / zRange
        const c = colorMap(t)
        colors[i * 3] = c.r
        colors[i * 3 + 1] = c.g
        colors[i * 3 + 2] = c.b
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const material = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        sizeAttenuation: true,
      })

      pointsMesh = new THREE.Points(geometry, material)
      scene.add(pointsMesh)
    }
  } catch (e) {
    // Silently retry
  }
}

function clearPoints() {
  if (pointsMesh && scene) {
    scene.remove(pointsMesh)
    pointsMesh.geometry.dispose()
    ;(pointsMesh.material as THREE.Material).dispose()
    pointsMesh = null
  }
  pointCount.value = 0
}

function resetCamera() {
  if (camera && controls) {
    camera.position.set(4, 3, 4)
    controls.target.set(0, 0.5, 0)
    controls.update()
  }
}

function disposeScene() {
  stopPolling()
  clearPoints()
  if (animationId) cancelAnimationFrame(animationId)
  controls?.dispose()
  if (renderer && canvasContainer.value) {
    canvasContainer.value.removeChild(renderer.domElement)
    renderer.dispose()
  }
  scene = null
  camera = null
  renderer = null
  controls = null
  pointsMesh = null
}
</script>

<style scoped lang="scss">
.pointcloud-viewer {
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

  .point-count {
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

  .scene-container {
    position: relative;
    width: 100%;
    height: 420px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #0f1117;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  .empty-overlay {
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
