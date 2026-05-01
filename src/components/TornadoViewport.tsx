import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  deriveTornadoDiagnostics,
  getAxisOffsetAtHeight,
  getCoreRadiusAtHeight,
  getEnvelopeRadiusAtHeight,
  PARTICLE_LIMIT,
  TornadoSimulation,
  type TornadoControls,
} from '../lib/tornado-sim'

type TornadoViewportProps = {
  config: TornadoControls
  hideSceneOverlays?: boolean
}

type VolumetricCluster = {
  group: THREE.Group
  materials: THREE.MeshBasicMaterial[]
  outer: boolean
  seed: number
  strength: number
  vertical: number
}

type VortexVeil = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  positions: Float32Array
  alpha: Float32Array
  phase: number
  twist: number
  radialBias: number
  width: number
}

type RainField = {
  points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  positions: Float32Array
  alpha: Float32Array
  speed: Float32Array
  drift: Float32Array
}

type DebrisField = {
  mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
  seeds: Float32Array
  orbit: Float32Array
  height: Float32Array
  scale: Float32Array
  matrix: THREE.Matrix4
  color: THREE.Color
}

type LightningRig = {
  lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  geometry: THREE.BufferGeometry
  material: THREE.LineBasicMaterial
  light: THREE.PointLight
  positions: Float32Array
  nextStrike: number
  strikeAge: number
  strikeDuration: number
  seed: number
}

type EnvironmentRig = {
  group: THREE.Group
  roadMaterial: THREE.MeshStandardMaterial
  shoulderMaterial: THREE.MeshStandardMaterial
  stripeMaterial: THREE.MeshBasicMaterial
  puddleMaterial: THREE.MeshBasicMaterial
  grassMaterial: THREE.MeshBasicMaterial
  poleMaterial: THREE.MeshStandardMaterial
  cableMaterial: THREE.LineBasicMaterial
  treeMaterial: THREE.MeshStandardMaterial
  geometries: THREE.BufferGeometry[]
  stripeMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  grassMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  treeMesh: THREE.InstancedMesh<THREE.ConeGeometry, THREE.MeshStandardMaterial>
  cableLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  puddles: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[]
  grassSeeds: Float32Array
  grassBaseMatrices: THREE.Matrix4[]
  matrix: THREE.Matrix4
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function createGroundTexture() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create 2D context for ground texture')
  }

  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    10,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  )
  gradient.addColorStop(0, 'rgba(255, 221, 182, 0.72)')
  gradient.addColorStop(0.16, 'rgba(204, 150, 96, 0.22)')
  gradient.addColorStop(0.4, 'rgba(102, 72, 51, 0.08)')
  gradient.addColorStop(1, 'rgba(8, 12, 19, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)

  context.strokeStyle = 'rgba(202, 160, 106, 0.08)'
  context.lineWidth = 1.4
  for (let index = 0; index < 160; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = size * (0.08 + Math.random() * 0.42)
    const x = size * 0.5 + Math.cos(angle) * radius
    const y = size * 0.5 + Math.sin(angle) * radius
    const dx = Math.cos(angle + 0.7) * (18 + Math.random() * 56)
    const dy = Math.sin(angle + 0.7) * (18 + Math.random() * 56)

    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + dx, y + dy)
    context.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  return texture
}

function createStormDeckTexture() {
  const width = 1024
  const height = 512
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create storm deck texture')
  }

  const base = context.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, 'rgba(13, 22, 32, 0.0)')
  base.addColorStop(0.28, 'rgba(35, 50, 65, 0.34)')
  base.addColorStop(0.58, 'rgba(16, 24, 34, 0.5)')
  base.addColorStop(1, 'rgba(5, 8, 13, 0.0)')
  context.fillStyle = base
  context.fillRect(0, 0, width, height)

  for (let index = 0; index < 150; index += 1) {
    const x = Math.random() * width
    const y = height * (0.18 + Math.random() * 0.56)
    const radius = 28 + Math.random() * 115
    const alpha = 0.025 + Math.random() * 0.075
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(235,245,255,${alpha})`)
    gradient.addColorStop(0.42, `rgba(180,200,218,${alpha * 0.4})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping

  return texture
}

function createSkyboxTexture() {
  const size = 1024
  const faces = Array.from({ length: 6 }, (_, faceIndex) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Unable to create skybox texture')
    }

    const isTop = faceIndex === 2
    const isBottom = faceIndex === 3
    const stormSide = faceIndex === 1 || faceIndex === 5
    const horizon = context.createLinearGradient(0, 0, 0, size)

    if (isTop) {
      horizon.addColorStop(0, '#070d16')
      horizon.addColorStop(0.45, '#14283c')
      horizon.addColorStop(1, '#2f4656')
    } else if (isBottom) {
      horizon.addColorStop(0, '#171810')
      horizon.addColorStop(0.55, '#252315')
      horizon.addColorStop(1, '#080909')
    } else {
      horizon.addColorStop(0, stormSide ? '#070c15' : '#102032')
      horizon.addColorStop(0.32, stormSide ? '#18293c' : '#314b5c')
      horizon.addColorStop(0.62, stormSide ? '#657274' : '#829092')
      horizon.addColorStop(0.77, stormSide ? '#b79d6b' : '#c8ad79')
      horizon.addColorStop(1, '#16120c')
    }

    context.fillStyle = horizon
    context.fillRect(0, 0, size, size)

    if (!isBottom) {
      for (let index = 0; index < 180; index += 1) {
        const x = Math.random() * size
        const y = isTop
          ? size * (0.08 + Math.random() * 0.8)
          : size * (0.12 + Math.random() * 0.5)
        const radiusX = 44 + Math.random() * (isTop ? 190 : 150)
        const radiusY = 18 + Math.random() * (isTop ? 86 : 62)
        const alpha =
          (stormSide ? 0.03 : 0.022) +
          Math.random() * (stormSide ? 0.09 : 0.06)

        context.save()
        context.translate(x, y)
        context.rotate((Math.random() - 0.5) * 0.22)
        context.scale(1, radiusY / radiusX)
        const cloud = context.createRadialGradient(0, 0, 0, 0, 0, radiusX)
        cloud.addColorStop(0, `rgba(224, 238, 244, ${alpha})`)
        cloud.addColorStop(0.42, `rgba(120, 144, 153, ${alpha * 0.74})`)
        cloud.addColorStop(1, 'rgba(12, 18, 25, 0)')
        context.fillStyle = cloud
        context.beginPath()
        context.arc(0, 0, radiusX, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }

      const shelf = context.createLinearGradient(0, size * 0.38, 0, size * 0.78)
      shelf.addColorStop(0, 'rgba(7, 12, 18, 0)')
      shelf.addColorStop(0.36, stormSide ? 'rgba(5, 9, 15, 0.48)' : 'rgba(14, 23, 30, 0.24)')
      shelf.addColorStop(0.7, 'rgba(234, 198, 128, 0.18)')
      shelf.addColorStop(1, 'rgba(5, 5, 6, 0.2)')
      context.fillStyle = shelf
      context.fillRect(0, 0, size, size)

      for (let index = 0; index < 44; index += 1) {
        const y = size * (0.48 + Math.random() * 0.22)
        const x = Math.random() * size
        const length = size * (0.08 + Math.random() * 0.24)
        context.strokeStyle = `rgba(226, 211, 178, ${0.012 + Math.random() * 0.025})`
        context.lineWidth = 1 + Math.random() * 3
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x + length, y + (Math.random() - 0.5) * 18)
        context.stroke()
      }
    }

    if (isBottom) {
      for (let index = 0; index < 180; index += 1) {
        const x = Math.random() * size
        const y = Math.random() * size
        const radius = 8 + Math.random() * 46
        const patch = context.createRadialGradient(x, y, 0, x, y, radius)
        patch.addColorStop(0, 'rgba(95, 86, 53, 0.12)')
        patch.addColorStop(1, 'rgba(0,0,0,0)')
        context.fillStyle = patch
        context.fillRect(0, 0, size, size)
      }
    }

    return canvas
  })

  const texture = new THREE.CubeTexture(faces as unknown as HTMLImageElement[])
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return texture
}

function createLightRayTexture() {
  const width = 1024
  const height = 512
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create light ray texture')
  }

  context.clearRect(0, 0, width, height)

  const warmth = context.createLinearGradient(0, 0, width, height)
  warmth.addColorStop(0, 'rgba(255, 222, 163, 0.0)')
  warmth.addColorStop(0.42, 'rgba(255, 210, 142, 0.09)')
  warmth.addColorStop(1, 'rgba(255, 176, 98, 0.0)')
  context.fillStyle = warmth
  context.fillRect(0, 0, width, height)

  for (let index = 0; index < 9; index += 1) {
    const startX = width * (0.08 + Math.random() * 0.22)
    const endX = width * (0.58 + Math.random() * 0.32)
    const centerY = height * (0.16 + Math.random() * 0.36)
    const ray = context.createLinearGradient(startX, centerY, endX, height)
    ray.addColorStop(0, 'rgba(255, 236, 191, 0)')
    ray.addColorStop(0.28, `rgba(255, 220, 154, ${0.035 + Math.random() * 0.05})`)
    ray.addColorStop(1, 'rgba(255, 174, 94, 0)')

    context.save()
    context.translate(startX, centerY)
    context.rotate(-0.1 + Math.random() * 0.18)
    context.fillStyle = ray
    context.beginPath()
    context.moveTo(0, -12)
    context.lineTo(width * (0.65 + Math.random() * 0.25), height * (0.46 + Math.random() * 0.22))
    context.lineTo(width * (0.62 + Math.random() * 0.25), height * (0.54 + Math.random() * 0.25))
    context.lineTo(0, 12)
    context.closePath()
    context.fill()
    context.restore()
  }

  const vignette = context.createRadialGradient(
    width * 0.42,
    height * 0.34,
    0,
    width * 0.42,
    height * 0.34,
    width * 0.72,
  )
  vignette.addColorStop(0, 'rgba(255,255,255,0.04)')
  vignette.addColorStop(0.45, 'rgba(255,255,255,0.015)')
  vignette.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = vignette
  context.fillRect(0, 0, width, height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

function createTerrainTexture() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create terrain texture')
  }

  const base = context.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, '#20251e')
  base.addColorStop(0.45, '#39402e')
  base.addColorStop(1, '#15120d')
  context.fillStyle = base
  context.fillRect(0, 0, size, size)

  for (let index = 0; index < 520; index += 1) {
    const x = Math.random() * size
    const y = Math.random() * size
    const length = 18 + Math.random() * 96
    const angle = -0.32 + Math.random() * 0.18
    const alpha = 0.018 + Math.random() * 0.05

    context.strokeStyle =
      index % 5 === 0
        ? `rgba(199, 169, 105, ${alpha})`
        : `rgba(79, 99, 63, ${alpha})`
    context.lineWidth = 1 + Math.random() * 2.4
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
    context.stroke()
  }

  for (let index = 0; index < 70; index += 1) {
    const x = Math.random() * size
    const y = Math.random() * size
    const radius = 16 + Math.random() * 74
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(15, 12, 8, 0.12)')
    gradient.addColorStop(1, 'rgba(15, 12, 8, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(5, 5)
  texture.anisotropy = 8

  return texture
}

function createRainField(count = 1500) {
  const positions = new Float32Array(count * 3)
  const alpha = new Float32Array(count)
  const speed = new Float32Array(count)
  const drift = new Float32Array(count)

  for (let index = 0; index < count; index += 1) {
    const cursor = index * 3
    positions[cursor] = (Math.random() - 0.5) * 92
    positions[cursor + 1] = 2 + Math.random() * 44
    positions[cursor + 2] = -38 + Math.random() * 86
    alpha[index] = 0.08 + Math.random() * 0.34
    speed[index] = 18 + Math.random() * 34
    drift[index] = -7 + Math.random() * 5
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uPixelRatio: { value: 1 },
      uRainAmount: { value: 1 },
      uExposure: { value: 1 },
    },
    vertexShader: `
      uniform float uPixelRatio;
      attribute float aAlpha;
      attribute float aSpeed;
      varying float vAlpha;
      varying float vSpeed;

      void main() {
        vAlpha = aAlpha;
        vSpeed = aSpeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp((8.0 + aSpeed * 0.18) * (180.0 / max(1.0, -mvPosition.z)) * uPixelRatio, 1.0, 14.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uRainAmount;
      uniform float uExposure;
      varying float vAlpha;
      varying float vSpeed;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float shaft = smoothstep(0.12, 0.0, abs(uv.x + uv.y * 0.28));
        float lengthFade = smoothstep(0.5, 0.12, abs(uv.y));
        float opacity = shaft * lengthFade * vAlpha * uRainAmount;
        vec3 color = vec3(0.62, 0.78, 0.92) * mix(0.45, 1.0, clamp(uExposure, 0.0, 1.4));
        gl_FragColor = vec4(color * opacity, opacity);
      }
    `,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 4

  return {
    points,
    geometry,
    material,
    positions,
    alpha,
    speed,
    drift,
  } satisfies RainField
}

function createDebrisField(count = 78) {
  const geometry = new THREE.BoxGeometry(1, 0.12, 0.45)
  const material = new THREE.MeshStandardMaterial({
    color: 0x6d4d32,
    roughness: 0.86,
    metalness: 0.04,
    transparent: true,
    opacity: 0.82,
    fog: true,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const seeds = new Float32Array(count)
  const orbit = new Float32Array(count)
  const height = new Float32Array(count)
  const scale = new Float32Array(count)
  const matrix = new THREE.Matrix4()
  const color = new THREE.Color()

  for (let index = 0; index < count; index += 1) {
    seeds[index] = Math.random() * Math.PI * 2
    orbit[index] = 0.45 + Math.random() * 1.42
    height[index] = Math.pow(Math.random(), 1.7)
    scale[index] = 0.24 + Math.random() * 0.82
    color.setHSL(0.09 + Math.random() * 0.05, 0.28, 0.18 + Math.random() * 0.18)
    mesh.setColorAt(index, color)
  }

  mesh.frustumCulled = false
  mesh.renderOrder = 3

  return { mesh, seeds, orbit, height, scale, matrix, color } satisfies DebrisField
}

function createLightningRig() {
  const maxSegments = 34
  const positions = new Float32Array(maxSegments * 2 * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)

  const material = new THREE.LineBasicMaterial({
    color: 0xddefff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const lines = new THREE.LineSegments(geometry, material)
  lines.frustumCulled = false
  lines.renderOrder = 5

  const light = new THREE.PointLight(0xcbe9ff, 0, 120, 2)
  light.position.set(-18, 25, -22)

  return {
    lines,
    geometry,
    material,
    light,
    positions,
    nextStrike: 1.8,
    strikeAge: 10,
    strikeDuration: 0.22,
    seed: Math.random() * 100,
  } satisfies LightningRig
}

function createEnvironmentRig() {
  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const position = new THREE.Vector3()
  const color = new THREE.Color()

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x171a19,
    roughness: 0.72,
    metalness: 0.02,
    fog: true,
  })
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: 0x4c412f,
    roughness: 0.92,
    metalness: 0,
    fog: true,
  })
  const stripeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8d0a9,
    transparent: true,
    opacity: 0.62,
    fog: true,
  })
  const puddleMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fb7c6,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const grassMaterial = new THREE.MeshBasicMaterial({
    color: 0x59613e,
    transparent: true,
    opacity: 0.74,
    side: THREE.DoubleSide,
    fog: true,
  })
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b2a1d,
    roughness: 0.88,
    metalness: 0,
    fog: true,
  })
  const cableMaterial = new THREE.LineBasicMaterial({
    color: 0x161b1f,
    transparent: true,
    opacity: 0.72,
    fog: true,
  })
  const treeMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e2b20,
    roughness: 0.96,
    metalness: 0,
    fog: true,
  })

  const roadGeometry = new THREE.PlaneGeometry(7.2, 150)
  const shoulderGeometry = new THREE.PlaneGeometry(4.2, 150)
  const stripeGeometry = new THREE.PlaneGeometry(0.22, 3.4)
  const puddleGeometry = new THREE.CircleGeometry(1, 24)
  const grassGeometry = new THREE.PlaneGeometry(0.16, 1.2)
  const poleGeometry = new THREE.CylinderGeometry(0.12, 0.18, 6.4, 8)
  const crossArmGeometry = new THREE.BoxGeometry(3.2, 0.14, 0.18)
  const treeGeometry = new THREE.ConeGeometry(1, 3, 6)
  geometries.push(
    roadGeometry,
    shoulderGeometry,
    stripeGeometry,
    puddleGeometry,
    grassGeometry,
    poleGeometry,
    crossArmGeometry,
    treeGeometry,
  )

  const road = new THREE.Mesh(roadGeometry, roadMaterial)
  road.rotation.x = -Math.PI / 2
  road.rotation.z = -0.045
  road.position.set(-18, -0.055, -4)
  group.add(road)

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial)
    shoulder.rotation.x = -Math.PI / 2
    shoulder.rotation.z = -0.045
    shoulder.position.set(-18 + side * 5.7, -0.06, -4)
    group.add(shoulder)
  }

  const stripeMesh = new THREE.InstancedMesh(stripeGeometry, stripeMaterial, 20)
  rotation.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -0.045))
  for (let index = 0; index < 20; index += 1) {
    position.set(-18, -0.035, -69 + index * 7.2)
    scale.setScalar(index < 4 ? 1.25 : 1)
    matrix.compose(position, rotation, scale)
    stripeMesh.setMatrixAt(index, matrix)
  }
  stripeMesh.instanceMatrix.needsUpdate = true
  group.add(stripeMesh)

  const puddles: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = []
  for (let index = 0; index < 14; index += 1) {
    const puddle = new THREE.Mesh(puddleGeometry, puddleMaterial)
    puddle.rotation.x = -Math.PI / 2
    puddle.rotation.z = Math.random() * Math.PI
    puddle.position.set(
      -26 + Math.random() * 24,
      -0.032,
      -58 + Math.random() * 108,
    )
    puddle.scale.set(0.5 + Math.random() * 2.8, 0.16 + Math.random() * 0.58, 1)
    puddles.push(puddle)
    group.add(puddle)
  }

  const treeMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, 52)
  for (let index = 0; index < 52; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    const row = Math.floor(index / 2)
    position.set(
      side * (34 + Math.random() * 14) + Math.sin(row * 0.8) * 4,
      0.8 + Math.random() * 0.5,
      -62 + row * 4.8 + Math.random() * 2.2,
    )
    rotation.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0))
    scale.set(1.8 + Math.random() * 2.4, 0.8 + Math.random() * 0.85, 1.8 + Math.random() * 2.4)
    matrix.compose(position, rotation, scale)
    treeMesh.setMatrixAt(index, matrix)
    color.setHSL(0.28 + Math.random() * 0.06, 0.22, 0.12 + Math.random() * 0.08)
    treeMesh.setColorAt(index, color)
  }
  treeMesh.instanceMatrix.needsUpdate = true
  if (treeMesh.instanceColor) {
    treeMesh.instanceColor.needsUpdate = true
  }
  group.add(treeMesh)

  const grassCount = 240
  const grassMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, grassCount)
  const grassSeeds = new Float32Array(grassCount)
  const grassBaseMatrices: THREE.Matrix4[] = []
  for (let index = 0; index < grassCount; index += 1) {
    grassSeeds[index] = Math.random() * Math.PI * 2
    const roadside = Math.random() < 0.55
    const side = Math.random() < 0.5 ? -1 : 1
    const x = roadside
      ? -18 + side * (6.2 + Math.random() * 7)
      : -48 + Math.random() * 96
    const z = -66 + Math.random() * 128
    position.set(x, 0.34, z)
    rotation.setFromEuler(
      new THREE.Euler(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25),
    )
    const blade = 0.46 + Math.random() * 1.05
    scale.set(0.7 + Math.random() * 0.7, blade, 1)
    matrix.compose(position, rotation, scale)
    grassBaseMatrices.push(matrix.clone())
    grassMesh.setMatrixAt(index, matrix)
  }
  grassMesh.instanceMatrix.needsUpdate = true
  group.add(grassMesh)

  const cablePoints: number[] = []
  const poleCount = 9
  const polePositions: THREE.Vector3[] = []
  for (let index = 0; index < poleCount; index += 1) {
    const z = -58 + index * 15.5
    const x = -10.5 + Math.sin(index * 0.4) * 0.6
    polePositions.push(new THREE.Vector3(x, 0, z))

    const pole = new THREE.Mesh(poleGeometry, poleMaterial)
    pole.position.set(x, 3.1, z)
    pole.rotation.z = -0.04
    group.add(pole)

    const crossArm = new THREE.Mesh(crossArmGeometry, poleMaterial)
    crossArm.position.set(x, 5.7, z)
    crossArm.rotation.y = 0.04
    group.add(crossArm)
  }

  for (let index = 0; index < polePositions.length - 1; index += 1) {
    const a = polePositions[index]
    const b = polePositions[index + 1]
    for (const wireY of [5.86, 5.56]) {
      const sag = 0.42 + Math.random() * 0.08
      const mid = new THREE.Vector3((a.x + b.x) * 0.5, wireY - sag, (a.z + b.z) * 0.5)
      cablePoints.push(a.x - 1.35, wireY, a.z, mid.x - 1.35, mid.y, mid.z)
      cablePoints.push(mid.x - 1.35, mid.y, mid.z, b.x - 1.35, wireY, b.z)
      cablePoints.push(a.x + 1.35, wireY, a.z, mid.x + 1.35, mid.y, mid.z)
      cablePoints.push(mid.x + 1.35, mid.y, mid.z, b.x + 1.35, wireY, b.z)
    }
  }

  const cableGeometry = new THREE.BufferGeometry()
  cableGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(cablePoints), 3),
  )
  geometries.push(cableGeometry)
  const cableLines = new THREE.LineSegments(cableGeometry, cableMaterial)
  group.add(cableLines)

  return {
    group,
    roadMaterial,
    shoulderMaterial,
    stripeMaterial,
    puddleMaterial,
    grassMaterial,
    poleMaterial,
    cableMaterial,
    treeMaterial,
    geometries,
    stripeMesh,
    grassMesh,
    treeMesh,
    cableLines,
    puddles,
    grassSeeds,
    grassBaseMatrices,
    matrix: new THREE.Matrix4(),
  } satisfies EnvironmentRig
}

function createCloudBandTexture() {
  const width = 512
  const height = 96
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create cloud band texture')
  }

  context.clearRect(0, 0, width, height)

  for (let index = 0; index < 34; index += 1) {
    const x = width * Math.random()
    const y = height * (0.3 + Math.random() * 0.38)
    const radius = 18 + Math.random() * 54
    const alpha = 0.016 + Math.random() * 0.03
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)

    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(0.64, `rgba(255,255,255,${alpha * 0.45})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')

    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping

  return texture
}

function createSmokeTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create smoke texture')
  }

  context.clearRect(0, 0, size, size)

  const baseGradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  )
  baseGradient.addColorStop(0, 'rgba(255,255,255,0.15)')
  baseGradient.addColorStop(0.4, 'rgba(255,255,255,0.08)')
  baseGradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = baseGradient
  context.fillRect(0, 0, size, size)

  for (let index = 0; index < 44; index += 1) {
    const x = size * (0.16 + Math.random() * 0.68)
    const y = size * (0.16 + Math.random() * 0.68)
    const radius = size * (0.05 + Math.random() * 0.16)
    const alpha = 0.018 + Math.random() * 0.045
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)

    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(0.56, `rgba(255,255,255,${alpha * 0.42})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')

    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }

  context.globalCompositeOperation = 'destination-out'
  for (let index = 0; index < 14; index += 1) {
    const x = size * (0.2 + Math.random() * 0.6)
    const y = size * (0.2 + Math.random() * 0.6)
    const radius = size * (0.04 + Math.random() * 0.09)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(0,0,0,0.06)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  context.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

function createDustTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create dust texture')
  }

  context.clearRect(0, 0, size, size)

  for (let index = 0; index < 32; index += 1) {
    const x = size * (0.18 + Math.random() * 0.64)
    const y = size * (0.18 + Math.random() * 0.64)
    const rx = size * (0.04 + Math.random() * 0.12)
    const ry = size * (0.02 + Math.random() * 0.07)
    const alpha = 0.025 + Math.random() * 0.05

    context.save()
    context.translate(x, y)
    context.rotate(Math.random() * Math.PI)
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx)
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.scale(1, ry / rx)
    context.beginPath()
    context.arc(0, 0, rx, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

function createVortexVeil(options: {
  phase: number
  twist: number
  radialBias: number
  width: number
  color: THREE.ColorRepresentation
}) {
  const rings = 76
  const columns = 5
  const vertexCount = rings * columns
  const positions = new Float32Array(vertexCount * 3)
  const alpha = new Float32Array(vertexCount)
  const ridge = new Float32Array(vertexCount)
  const indices: number[] = []

  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = ring * columns + column
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  for (let ring = 0; ring < rings; ring += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cursor = ring * columns + column
      const column01 = column / (columns - 1)
      ridge[cursor] = 1 - Math.abs(column01 - 0.5) * 2
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1))
  geometry.setAttribute('aRidge', new THREE.BufferAttribute(ridge, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(options.color) },
      uTime: { value: 0 },
      uSunlight: { value: 1 },
    },
    vertexShader: `
      attribute float aAlpha;
      attribute float aRidge;
      varying float vAlpha;
      varying float vRidge;
      varying float vHeight;

      void main() {
        vAlpha = aAlpha;
        vRidge = aRidge;
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uSunlight;
      varying float vAlpha;
      varying float vRidge;
      varying float vHeight;

      void main() {
        float cellular = sin(vHeight * 1.7 + uTime * 1.15) * 0.5 + 0.5;
        float ragged = mix(0.68, 1.22, cellular) * mix(0.48, 1.0, vRidge);
        float opacity = vAlpha * ragged;
        vec3 stormShade = uColor * mix(0.58, 1.18, clamp(uSunlight, 0.0, 1.0));
        gl_FragColor = vec4(stormShade * opacity, opacity);
      }
    `,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  return {
    mesh,
    geometry,
    material,
    positions,
    alpha,
    phase: options.phase,
    twist: options.twist,
    radialBias: options.radialBias,
    width: options.width,
  } satisfies VortexVeil
}

function createCluster(
  geometry: THREE.PlaneGeometry,
  texture: THREE.Texture,
  color: number,
  outer: boolean,
  vertical: number,
) {
  const group = new THREE.Group()
  const materials: THREE.MeshBasicMaterial[] = []

  for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.y = angle
    group.add(mesh)
    materials.push(material)
  }

  return {
    group,
    materials,
    outer,
    seed: Math.random() * Math.PI * 2,
    strength: Math.random(),
    vertical,
  } satisfies VolumetricCluster
}

export function TornadoViewport({
  config,
  hideSceneOverlays = false,
}: TornadoViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const configRef = useRef(config)
  const hideSceneOverlaysRef = useRef(hideSceneOverlays)

  useEffect(() => {
    configRef.current = config
    hideSceneOverlaysRef.current = hideSceneOverlays
  }, [config, hideSceneOverlays])

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const skyboxTexture = createSkyboxTexture()
    scene.background = skyboxTexture
    const fog = new THREE.Fog(0x071018, 16, 78)
    scene.fog = fog

    const camera = new THREE.PerspectiveCamera(
      46,
      host.clientWidth / Math.max(host.clientHeight, 1),
      0.1,
      180,
    )
    camera.position.set(23, 11.8, 29)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 8
    orbit.maxDistance = 58
    orbit.maxPolarAngle = Math.PI * 0.49
    orbit.target.set(0, configRef.current.height * 0.32, 0)

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(118, 36, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(0x1b2d3d) },
          uHorizon: { value: new THREE.Color(0x667a86) },
          uGround: { value: new THREE.Color(0x090b0f) },
        },
        vertexShader: `
          varying vec3 vWorldPosition;

          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uGround;
          varying vec3 vWorldPosition;

          void main() {
            float h = normalize(vWorldPosition).y * 0.5 + 0.5;
            vec3 low = mix(uGround, uHorizon, smoothstep(0.28, 0.52, h));
            vec3 color = mix(low, uTop, smoothstep(0.48, 1.0, h));
            float alpha = mix(0.52, 0.24, smoothstep(0.42, 0.9, h));
            gl_FragColor = vec4(color, alpha);
          }
        `,
      }),
    )
    scene.add(sky)

    const ambient = new THREE.HemisphereLight(0xd9edff, 0x47301c, 0.9)
    scene.add(ambient)

    const fill = new THREE.DirectionalLight(0xf7fbff, 1.35)
    fill.position.set(19, 28, 18)
    scene.add(fill)

    const rim = new THREE.PointLight(0xffbd73, 32, 86, 2)
    rim.position.set(-4.4, 4.8, 3.4)
    scene.add(rim)

    const horizonGlow = new THREE.PointLight(0xffd18a, 0, 130, 2.2)
    horizonGlow.position.set(-28, 8, -22)
    scene.add(horizonGlow)

    const fogColor = new THREE.Color(0x071018)
    const ambientSkyColor = new THREE.Color(0xbfd9ff)
    const ambientGroundColor = new THREE.Color(0x372418)
    const fillColor = new THREE.Color(0xecf4ff)
    const rimColor = new THREE.Color(0xffca95)

    const terrainTexture = createTerrainTexture()
    const lightRayTexture = createLightRayTexture()
    const groundTexture = createGroundTexture()
    const stormDeckTexture = createStormDeckTexture()
    const cloudBandTexture = createCloudBandTexture()
    const smokeTexture = createSmokeTexture()
    const dustTexture = createDustTexture()

    const terrainMaterial = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      color: 0xb9a574,
      roughness: 0.94,
      metalness: 0,
      transparent: true,
      opacity: 0.84,
      fog: true,
    })
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(190, 190, 1, 1), terrainMaterial)
    terrain.rotation.x = -Math.PI / 2
    terrain.position.y = -0.08
    terrain.position.z = -7
    terrain.receiveShadow = false
    scene.add(terrain)

    const environmentRig = createEnvironmentRig()
    scene.add(environmentRig.group)

    const lightRayMaterial = new THREE.MeshBasicMaterial({
      map: lightRayTexture,
      color: 0xffd89a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
    })
    const lightRays = new THREE.Mesh(new THREE.PlaneGeometry(94, 48), lightRayMaterial)
    lightRays.position.set(-18, 19, -32)
    lightRays.rotation.set(-0.1, 0.18, -0.08)
    lightRays.renderOrder = 1
    scene.add(lightRays)

    const horizonGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc878,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const horizonGlowDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      horizonGlowMaterial,
    )
    horizonGlowDisk.position.set(-30, 5.8, -34)
    horizonGlowDisk.scale.set(22, 8, 1)
    horizonGlowDisk.rotation.y = 0.28
    horizonGlowDisk.renderOrder = 0
    scene.add(horizonGlowDisk)

    const stormDeckMaterial = new THREE.MeshBasicMaterial({
      map: stormDeckTexture,
      color: 0xd8e4ee,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
    })
    const stormDeck = new THREE.Mesh(
      new THREE.PlaneGeometry(128, 88, 1, 1),
      stormDeckMaterial,
    )
    stormDeck.rotation.x = -Math.PI / 2
    stormDeck.position.set(0, configRef.current.height * 0.92, -7)
    stormDeck.renderOrder = 0
    scene.add(stormDeck)

    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      opacity: 0.54,
      depthWrite: false,
    })
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 96), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.04
    scene.add(ground)

    const dustSkirtMaterial = new THREE.MeshBasicMaterial({
      color: 0xe0ae78,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const dustSkirt = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 128),
      dustSkirtMaterial,
    )
    dustSkirt.rotation.x = -Math.PI / 2
    dustSkirt.position.y = -0.01
    scene.add(dustSkirt)

    const coreHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfedf9,
      transparent: true,
      opacity: 0.025,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const coreHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1, 96),
      coreHaloMaterial,
    )
    coreHalo.rotation.x = -Math.PI / 2
    coreHalo.position.y = 0.02
    scene.add(coreHalo)

    const wallCloudMaterial = new THREE.MeshBasicMaterial({
      map: cloudBandTexture,
      color: 0xdbe6f0,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
    })
    const wallCloud = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.2, 18, 120),
      wallCloudMaterial,
    )
    wallCloud.rotation.x = Math.PI / 2
    scene.add(wallCloud)

    const planeGeometry = new THREE.PlaneGeometry(1, 1)
    const dustPlaneGeometry = new THREE.PlaneGeometry(1, 1)

    const innerFunnel = Array.from({ length: 11 }, (_, index) =>
      createCluster(planeGeometry, smokeTexture, 0xe5edf6, false, index / 10),
    )
    const outerFunnel = Array.from({ length: 7 }, (_, index) =>
      createCluster(planeGeometry, smokeTexture, 0xd8e3ef, true, index / 6),
    )
    const dustClouds = Array.from({ length: 9 }, (_, index) =>
      createCluster(dustPlaneGeometry, dustTexture, 0xd2a06d, true, index / 8),
    )

    const vortexVeils = Array.from({ length: 6 }, (_, index) =>
      createVortexVeil({
        phase: (Math.PI * 2 * index) / 6 + Math.random() * 0.5,
        twist: 9.4 + Math.random() * 4.2,
        radialBias: 0.18 + Math.random() * 0.28,
        width: 0.34 + Math.random() * 0.34,
        color: index % 3 === 0 ? 0xb7c8d6 : 0xdce8f1,
      }),
    )
    const rainField = createRainField()
    const debrisField = createDebrisField()
    const lightningRig = createLightningRig()

    for (const cluster of [...innerFunnel, ...outerFunnel, ...dustClouds]) {
      scene.add(cluster.group)
    }

    for (const veil of vortexVeils) {
      scene.add(veil.mesh)
    }

    scene.add(rainField.points)
    scene.add(debrisField.mesh)
    scene.add(lightningRig.lines)
    scene.add(lightningRig.light)

    const simulation = new TornadoSimulation(PARTICLE_LIMIT)
    simulation.setPixelRatio(renderer.getPixelRatio())
    simulation.initialize(configRef.current)
    simulation.setLookUniforms({
      fogColor,
      fogNear: fog.near,
      fogFar: fog.far,
      sunlight: configRef.current.sunlight,
      exposure: configRef.current.exposure,
      haze: configRef.current.haze,
    })
    scene.add(simulation.points)

    const resize = () => {
      const width = host.clientWidth
      const height = Math.max(host.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      simulation.setPixelRatio(renderer.getPixelRatio())
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)

    const updateFunnelClusters = (
      clusters: VolumetricCluster[],
      timeSeconds: number,
      nextConfig: TornadoControls,
      visibleFraction: number,
      nextDiagnostics: ReturnType<typeof deriveTornadoDiagnostics>,
    ) => {
      const sunlightMix = clamp((nextConfig.sunlight - 0.2) / 1.6, 0, 1)
      const cloudTone = clamp(
        0.24 +
          nextConfig.humidity * 0.46 +
          nextConfig.cloudDensity * 0.28 +
          sunlightMix * 0.24 -
          nextConfig.haze * 0.18,
        0,
        1,
      )

      for (const cluster of clusters) {
        const height01 = clamp(
          (cluster.outer ? 0.08 : 0.04) + cluster.vertical * visibleFraction,
          0.04,
          0.98,
        )
        const axis = getAxisOffsetAtHeight(nextConfig, height01, timeSeconds)
        const envelope = getEnvelopeRadiusAtHeight(nextConfig, height01)
        const radiusOffset =
          envelope *
          (cluster.outer
            ? 0.3 + cluster.strength * 0.18
            : 0.08 + cluster.strength * 0.1)
        const angle =
          cluster.seed +
          timeSeconds *
            (cluster.outer ? 0.22 + (1 - height01) * 0.18 : 0.44 + (1 - height01) * 0.3)
        const y = height01 * nextConfig.height

        cluster.group.position.set(
          axis.x + Math.cos(angle) * radiusOffset,
          y,
          axis.z + Math.sin(angle) * radiusOffset,
        )
        cluster.group.rotation.y = angle

        const width =
          envelope *
          (cluster.outer
            ? 3.8 + nextConfig.cloudDensity * 0.9 + cluster.strength * 0.6
            : 2.6 + nextConfig.cloudDensity * 0.65 + cluster.strength * 0.42)
        const height =
          envelope *
          (cluster.outer
            ? 5 + cluster.strength * 1.2
            : 3.4 + cluster.strength * 0.9)
        cluster.group.scale.set(width, height, 1)

        const fadeIn = smoothstep(0.03, 0.16, height01)
        const fadeOut = 1 - smoothstep(0.84, 1, height01)
        const density =
          cluster.outer
            ? nextConfig.cloudDensity * 0.028 +
              nextConfig.wallCloudStrength * 0.026 +
              nextConfig.haze * 0.012
            : nextConfig.cloudDensity * 0.05 +
              nextDiagnostics.pressureDropHpa / 1300 +
              nextConfig.haze * 0.008
        const opacity = density * fadeIn * fadeOut * (0.7 + cluster.strength * 0.44)

        for (const material of cluster.materials) {
          material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, 0.08)
          material.color.setRGB(
            lerp(0.54, 0.96, cloudTone),
            lerp(0.58, 0.98, cloudTone),
            lerp(0.64, 1, cloudTone),
          )
        }
      }
    }

    const updateDustClusters = (
      clusters: VolumetricCluster[],
      timeSeconds: number,
      nextConfig: TornadoControls,
      nextDiagnostics: ReturnType<typeof deriveTornadoDiagnostics>,
    ) => {
      const sunlightMix = clamp((nextConfig.sunlight - 0.2) / 1.6, 0, 1)
      for (const cluster of clusters) {
        const height01 = cluster.vertical * 0.06
        const axis = getAxisOffsetAtHeight(nextConfig, height01, timeSeconds)
        const orbitRadius =
          nextConfig.radius *
          (0.62 + cluster.strength * 0.9 + nextConfig.surfaceRoughness * 0.26)
        const angle =
          cluster.seed +
          timeSeconds * (0.58 + cluster.strength * 0.62) +
          nextConfig.translationSpeed * 0.03
        const y =
          0.12 +
          cluster.vertical * nextConfig.height * 0.12 +
          Math.sin(timeSeconds * 1.3 + cluster.seed) * 0.06

        cluster.group.position.set(
          axis.x + Math.cos(angle) * orbitRadius,
          y,
          axis.z + Math.sin(angle) * orbitRadius,
        )
        cluster.group.rotation.y = angle
        cluster.group.scale.set(
          nextConfig.radius * (2 + cluster.strength * 0.8 + nextConfig.dustAmount * 0.5),
          1.4 + cluster.strength * 1.6 + nextConfig.dustAmount * 0.8,
          1,
        )

        const opacity =
          (0.01 +
            nextConfig.dustAmount * 0.04 +
            nextConfig.surfaceRoughness * 0.018 +
            nextDiagnostics.pressureDropHpa / 2000) *
          (0.6 + cluster.strength * 0.56)

        for (const material of cluster.materials) {
          material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, 0.08)
          material.color.setRGB(
            lerp(
              0.38,
              0.88,
              nextConfig.dustAmount * 0.34 + cluster.strength * 0.14 + sunlightMix * 0.24,
            ),
            lerp(0.24, 0.66, cluster.strength * 0.34 + sunlightMix * 0.12),
            lerp(0.12, 0.46, nextConfig.haze * 0.4),
          )
        }
      }
    }

    const updateVortexVeils = (
      veils: VortexVeil[],
      timeSeconds: number,
      nextConfig: TornadoControls,
      visibleFraction: number,
      nextDiagnostics: ReturnType<typeof deriveTornadoDiagnostics>,
    ) => {
      const sunlightMix = clamp((nextConfig.sunlight - 0.2) / 1.6, 0, 1)
      const columnHeight = nextConfig.height * visibleFraction
      const rings = 76
      const columns = 5

      for (const veil of veils) {
        veil.material.uniforms.uTime.value = timeSeconds
        veil.material.uniforms.uSunlight.value = sunlightMix

        for (let ring = 0; ring < rings; ring += 1) {
          const ring01 = ring / (rings - 1)
          const height01 = clamp(ring01 * visibleFraction, 0.02, 0.98)
          const axis = getAxisOffsetAtHeight(nextConfig, height01, timeSeconds)
          const core = getCoreRadiusAtHeight(nextConfig, height01)
          const envelope = getEnvelopeRadiusAtHeight(nextConfig, height01)
          const y = ring01 * columnHeight
          const taper = smoothstep(0.02, 0.92, height01)
          const ropePulse =
            1 +
            Math.sin(timeSeconds * 1.4 + ring01 * 18 + veil.phase * 1.7) *
              nextConfig.turbulence *
              0.08
          const baseRadius = lerp(core * 0.9, envelope * (0.54 + veil.radialBias), taper)
          const centerAngle =
            veil.phase +
            timeSeconds * (0.42 + nextConfig.swirlRatio * 0.12) +
            ring01 * veil.twist +
            Math.sin(timeSeconds * 0.72 + ring01 * 9.5 + veil.phase) * 0.18
          const localWidth =
            veil.width *
            envelope *
            (0.32 + taper * 0.72) *
            (1 + nextConfig.cloudDensity * 0.16)
          const heightFade =
            smoothstep(0.02, 0.12, height01) * (1 - smoothstep(0.88, 1.02, height01))
          const pressureFade = clamp(nextDiagnostics.pressureDropHpa / 58, 0.22, 1.35)
          const baseAlpha =
            (0.018 +
              nextConfig.cloudDensity * 0.026 +
              nextConfig.humidity * 0.012 +
              pressureFade * 0.012) *
            heightFade

          for (let column = 0; column < columns; column += 1) {
            const column01 = column / (columns - 1)
            const across = (column01 - 0.5) * 2
            const angle = centerAngle + across * 0.1
            const radius = Math.max(0.2, (baseRadius + across * localWidth) * ropePulse)
            const cursor = (ring * columns + column) * 3
            const alphaCursor = ring * columns + column

            veil.positions[cursor] = axis.x + Math.cos(angle) * radius
            veil.positions[cursor + 1] = y
            veil.positions[cursor + 2] = axis.z + Math.sin(angle) * radius
            veil.alpha[alphaCursor] =
              baseAlpha *
              (0.34 + (1 - Math.abs(across)) * 0.66) *
              (0.74 + Math.sin(veil.phase + ring01 * 24 + timeSeconds * 1.1) * 0.18)
          }
        }

        const positionAttribute = veil.geometry.getAttribute(
          'position',
        ) as THREE.BufferAttribute
        const alphaAttribute = veil.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
        positionAttribute.needsUpdate = true
        alphaAttribute.needsUpdate = true
      }
    }

    const updateRainField = (
      rain: RainField,
      dtSeconds: number,
      timeSeconds: number,
      nextConfig: TornadoControls,
    ) => {
      const rainAmount = clamp(
        nextConfig.humidity * 0.78 + nextConfig.haze * 0.32 + nextConfig.wallCloudStrength * 0.18,
        0.18,
        1.25,
      )
      const windLean = nextConfig.translationSpeed * 0.28 + nextConfig.turbulence * 2.4

      for (let index = 0; index < rain.speed.length; index += 1) {
        const cursor = index * 3
        rain.positions[cursor] +=
          (rain.drift[index] - windLean) * dtSeconds +
          Math.sin(timeSeconds * 1.7 + index * 0.17) * 0.012
        rain.positions[cursor + 1] -= rain.speed[index] * dtSeconds
        rain.positions[cursor + 2] +=
          nextConfig.translationSpeed * 0.1 * dtSeconds +
          Math.cos(timeSeconds * 1.2 + index * 0.09) * 0.01

        if (rain.positions[cursor + 1] < 0.2) {
          rain.positions[cursor] = (Math.random() - 0.5) * 96
          rain.positions[cursor + 1] = 30 + Math.random() * 28
          rain.positions[cursor + 2] = -42 + Math.random() * 92
        }

        if (rain.positions[cursor] < -58) {
          rain.positions[cursor] += 116
        } else if (rain.positions[cursor] > 58) {
          rain.positions[cursor] -= 116
        }

        if (rain.positions[cursor + 2] > 54) {
          rain.positions[cursor + 2] -= 96
        }
      }

      rain.material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
      rain.material.uniforms.uRainAmount.value = rainAmount
      rain.material.uniforms.uExposure.value = nextConfig.exposure
      rain.geometry.getAttribute('position').needsUpdate = true
    }

    const updateDebrisField = (
      debris: DebrisField,
      timeSeconds: number,
      nextConfig: TornadoControls,
    ) => {
      const count = debris.seeds.length
      const baseLift = clamp(
        nextConfig.intensity * 0.5 + nextConfig.surfaceRoughness * 0.28 + nextConfig.dustAmount * 0.34,
        0,
        1.7,
      )

      for (let index = 0; index < count; index += 1) {
        const seed = debris.seeds[index]
        const height01 = clamp(debris.height[index] * 0.36 * baseLift, 0.01, 0.52)
        const axis = getAxisOffsetAtHeight(nextConfig, height01, timeSeconds)
        const envelope = getEnvelopeRadiusAtHeight(nextConfig, height01)
        const angle =
          seed +
          timeSeconds * (1.2 + nextConfig.swirlRatio * 0.38 + debris.height[index] * 1.8)
        const radius = envelope * debris.orbit[index] * (0.38 + height01 * 0.9)
        const y =
          0.18 +
          height01 * nextConfig.height +
          Math.sin(timeSeconds * 2.3 + seed) * (0.12 + height01 * 0.5)
        const wobble = Math.sin(timeSeconds * 5.7 + seed * 2.4) * 0.22
        const size = debris.scale[index] * (0.48 + nextConfig.dustAmount * 0.42)

        debris.matrix.compose(
          new THREE.Vector3(
            axis.x + Math.cos(angle) * radius,
            y,
            axis.z + Math.sin(angle) * radius,
          ),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              timeSeconds * (0.9 + debris.height[index] * 2) + seed,
              angle + wobble,
              timeSeconds * (1.7 + debris.scale[index]) + seed * 0.7,
            ),
          ),
          new THREE.Vector3(size * (1.1 + debris.scale[index]), size * 0.28, size * 0.55),
        )
        debris.mesh.setMatrixAt(index, debris.matrix)
      }

      debris.mesh.material.opacity = THREE.MathUtils.lerp(
        debris.mesh.material.opacity,
        clamp(0.12 + nextConfig.dustAmount * 0.48 + nextConfig.surfaceRoughness * 0.12, 0.08, 0.86),
        0.08,
      )
      debris.mesh.instanceMatrix.needsUpdate = true
      if (debris.mesh.instanceColor) {
        debris.mesh.instanceColor.needsUpdate = true
      }
    }

    const rebuildLightning = (
      rig: LightningRig,
      timeSeconds: number,
      nextConfig: TornadoControls,
    ) => {
      const startX = -26 + Math.sin(timeSeconds * 0.37 + rig.seed) * 12
      const startZ = -28 + Math.cos(timeSeconds * 0.31 + rig.seed) * 10
      const startY = nextConfig.height * (0.86 + Math.random() * 0.18)
      const endY = nextConfig.height * (0.28 + Math.random() * 0.3)
      const segments = 18 + Math.floor(Math.random() * 10)
      let write = 0
      let previous = new THREE.Vector3(startX, startY, startZ)

      for (let index = 1; index <= segments; index += 1) {
        const t = index / segments
        const bend = Math.sin(t * Math.PI) * (2.6 + Math.random() * 3.6)
        const next = new THREE.Vector3(
          startX + Math.sin(t * 8 + rig.seed) * bend + (Math.random() - 0.5) * 2.4,
          lerp(startY, endY, t),
          startZ + Math.cos(t * 7 + rig.seed) * bend + (Math.random() - 0.5) * 2.4,
        )
        rig.positions[write] = previous.x
        rig.positions[write + 1] = previous.y
        rig.positions[write + 2] = previous.z
        rig.positions[write + 3] = next.x
        rig.positions[write + 4] = next.y
        rig.positions[write + 5] = next.z
        write += 6

        if (index > 5 && index % 5 === 0 && write < rig.positions.length - 6) {
          const branch = next
            .clone()
            .add(new THREE.Vector3((Math.random() - 0.5) * 8, -3 - Math.random() * 6, (Math.random() - 0.5) * 8))
          rig.positions[write] = next.x
          rig.positions[write + 1] = next.y
          rig.positions[write + 2] = next.z
          rig.positions[write + 3] = branch.x
          rig.positions[write + 4] = branch.y
          rig.positions[write + 5] = branch.z
          write += 6
        }

        previous = next
      }

      rig.geometry.setDrawRange(0, write / 3)
      rig.geometry.getAttribute('position').needsUpdate = true
      rig.light.position.set(startX, startY, startZ)
    }

    const updateLightning = (
      rig: LightningRig,
      dtSeconds: number,
      timeSeconds: number,
      nextConfig: TornadoControls,
    ) => {
      rig.nextStrike -= dtSeconds
      rig.strikeAge += dtSeconds

      if (rig.nextStrike <= 0) {
        rig.seed = Math.random() * 100
        rig.strikeAge = 0
        rig.strikeDuration = 0.12 + Math.random() * 0.16
        rig.nextStrike = 2.6 + Math.random() * 5.8 - nextConfig.intensity * 0.6
        rebuildLightning(rig, timeSeconds, nextConfig)
      }

      const flash =
        rig.strikeAge < rig.strikeDuration
          ? Math.pow(1 - rig.strikeAge / rig.strikeDuration, 2.4)
          : 0

      rig.material.opacity = flash * (0.45 + nextConfig.exposure * 0.38)
      rig.light.intensity = flash * (36 + nextConfig.sunlight * 12)
      if (flash <= 0.001) {
        rig.geometry.setDrawRange(0, 0)
      }
    }

    const updateEnvironment = (
      environment: EnvironmentRig,
      timeSeconds: number,
      nextConfig: TornadoControls,
    ) => {
      const sunlightMix = clamp((nextConfig.sunlight - 0.2) / 1.6, 0, 1)
      const wetness = clamp(
        nextConfig.humidity * 0.55 + nextConfig.haze * 0.28 + nextConfig.wallCloudStrength * 0.2,
        0,
        1.25,
      )

      environment.roadMaterial.color.setRGB(
        lerp(0.035, 0.12, sunlightMix * 0.6),
        lerp(0.04, 0.12, sunlightMix * 0.48),
        lerp(0.04, 0.11, sunlightMix * 0.42 + wetness * 0.18),
      )
      environment.roadMaterial.roughness = lerp(0.88, 0.48, wetness)
      environment.shoulderMaterial.color.setRGB(
        lerp(0.19, 0.34, sunlightMix),
        lerp(0.16, 0.28, sunlightMix * 0.7),
        lerp(0.11, 0.18, nextConfig.haze * 0.35),
      )
      environment.stripeMaterial.opacity = lerp(0.34, 0.68, sunlightMix) * (1 - wetness * 0.18)
      environment.puddleMaterial.opacity = THREE.MathUtils.lerp(
        environment.puddleMaterial.opacity,
        0.08 + wetness * 0.18,
        0.06,
      )
      environment.puddleMaterial.color.setRGB(
        lerp(0.42, 0.76, sunlightMix),
        lerp(0.5, 0.82, sunlightMix),
        lerp(0.54, 0.9, sunlightMix),
      )
      environment.treeMaterial.color.setRGB(
        lerp(0.055, 0.12, sunlightMix),
        lerp(0.08, 0.18, sunlightMix),
        lerp(0.06, 0.1, nextConfig.haze * 0.3),
      )
      environment.cableMaterial.opacity = lerp(0.42, 0.76, 1 - nextConfig.haze / 1.5)
      environment.grassMaterial.color.setRGB(
        lerp(0.18, 0.38, sunlightMix),
        lerp(0.23, 0.42, sunlightMix * 0.68),
        lerp(0.14, 0.23, nextConfig.haze * 0.34),
      )

      for (const puddle of environment.puddles) {
        puddle.rotation.z += 0.0005 + nextConfig.translationSpeed * 0.00005
      }

      const swayStrength = 0.08 + nextConfig.turbulence * 0.08 + nextConfig.translationSpeed * 0.004
      const decomposedPosition = new THREE.Vector3()
      const decomposedRotation = new THREE.Quaternion()
      const decomposedScale = new THREE.Vector3()
      const swayRotation = new THREE.Quaternion()

      for (let index = 0; index < environment.grassSeeds.length; index += 1) {
        environment.grassBaseMatrices[index].decompose(
          decomposedPosition,
          decomposedRotation,
          decomposedScale,
        )
        const sway =
          Math.sin(timeSeconds * 2.8 + environment.grassSeeds[index]) * swayStrength -
          nextConfig.translationSpeed * 0.008
        swayRotation.setFromEuler(new THREE.Euler(0, 0, sway))
        decomposedRotation.multiply(swayRotation)
        environment.matrix.compose(decomposedPosition, decomposedRotation, decomposedScale)
        environment.grassMesh.setMatrixAt(index, environment.matrix)
      }

      environment.grassMesh.instanceMatrix.needsUpdate = true
    }

    let animationFrame = 0
    let previous = performance.now()
    let lastInteraction = performance.now()
    const diagnostics = deriveTornadoDiagnostics(configRef.current)
    const orbitTarget = new THREE.Vector3(0, diagnostics.visibleColumnMeters * 0.32, 0)
    const cinematicCamera = new THREE.Vector3()
    const cinematicTarget = new THREE.Vector3()

    const markInteraction = () => {
      lastInteraction = performance.now()
    }

    renderer.domElement.addEventListener('pointerdown', markInteraction)
    renderer.domElement.addEventListener('wheel', markInteraction, { passive: true })
    renderer.domElement.addEventListener('touchstart', markInteraction, { passive: true })

    const renderFrame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 1 / 30)
      previous = now

      const timeSeconds = now / 1000
      const nextConfig = configRef.current
      const showSceneOverlays = !hideSceneOverlaysRef.current
      const nextDiagnostics = deriveTornadoDiagnostics(nextConfig)
      const visibleFraction = clamp(
        nextDiagnostics.visibleColumnMeters / Math.max(nextConfig.height, 1),
        0.28,
        1,
      )
      const sunlightMix = clamp((nextConfig.sunlight - 0.2) / 1.6, 0, 1)
      const exposureTarget = Math.pow(nextConfig.exposure, 1.8)
      const hazeNearTarget = lerp(24, 8, nextConfig.haze / 1.5)
      const hazeFarTarget = lerp(86, 24, nextConfig.haze / 1.5)

      renderer.toneMappingExposure = THREE.MathUtils.lerp(
        renderer.toneMappingExposure,
        exposureTarget,
        0.05,
      )
      fog.near = THREE.MathUtils.lerp(fog.near, hazeNearTarget, 0.08)
      fog.far = THREE.MathUtils.lerp(fog.far, hazeFarTarget, 0.08)
      fogColor.setRGB(
        lerp(0.03, 0.2, nextConfig.haze / 1.5),
        lerp(0.06, 0.2, nextConfig.haze / 1.5 + sunlightMix * 0.08),
        lerp(0.1, 0.24, nextConfig.haze / 1.5),
      )
      fog.color.lerp(fogColor, 0.08)
      simulation.setLookUniforms({
        fogColor,
        fogNear: fog.near,
        fogFar: fog.far,
        sunlight: nextConfig.sunlight,
        exposure: nextConfig.exposure,
        haze: nextConfig.haze,
      })

      ambient.intensity = THREE.MathUtils.lerp(
        ambient.intensity,
        0.22 + sunlightMix * 0.98 + nextConfig.haze * 0.22,
        0.08,
      )
      fill.intensity = THREE.MathUtils.lerp(
        fill.intensity,
        0.36 + sunlightMix * 2.34 - nextConfig.haze * 0.28,
        0.08,
      )
      rim.intensity = THREE.MathUtils.lerp(
        rim.intensity,
        4 + sunlightMix * 19 + nextConfig.dustAmount * 4 - nextConfig.haze * 1.6,
        0.08,
      )
      horizonGlow.intensity = THREE.MathUtils.lerp(
        horizonGlow.intensity,
        (3 + sunlightMix * 24 + nextConfig.dustAmount * 3) * (1 - nextConfig.haze * 0.18),
        0.06,
      )
      ambientSkyColor.setRGB(
        lerp(0.48, 0.92, sunlightMix + nextConfig.haze * 0.08),
        lerp(0.58, 0.98, sunlightMix * 0.78 + nextConfig.haze * 0.16),
        lerp(0.7, 1, sunlightMix * 0.56 + nextConfig.haze * 0.24),
      )
      ambient.color.lerp(ambientSkyColor, 0.08)
      ambientGroundColor.setRGB(
        lerp(0.12, 0.42, sunlightMix * 0.8),
        lerp(0.07, 0.24, sunlightMix * 0.52),
        lerp(0.04, 0.14, nextConfig.haze * 0.2),
      )
      ambient.groundColor.lerp(ambientGroundColor, 0.08)
      fillColor.setRGB(
        lerp(0.62, 1, sunlightMix),
        lerp(0.72, 0.99, sunlightMix * 0.82),
        lerp(0.84, 0.98, nextConfig.haze * 0.3 + sunlightMix * 0.24),
      )
      fill.color.lerp(fillColor, 0.08)
      rimColor.setRGB(
        lerp(0.9, 1, sunlightMix),
        lerp(0.52, 0.82, sunlightMix * 0.68),
        lerp(0.26, 0.54, sunlightMix * 0.36),
      )
      rim.color.lerp(rimColor, 0.08)

      lightRayTexture.offset.x = Math.sin(timeSeconds * 0.035) * 0.012
      lightRayMaterial.opacity = THREE.MathUtils.lerp(
        lightRayMaterial.opacity,
        clamp(0.06 + sunlightMix * 0.22 + nextConfig.dustAmount * 0.045 - nextConfig.haze * 0.045, 0.04, 0.28),
        0.04,
      )
      lightRays.position.y = 18.5 + Math.sin(timeSeconds * 0.11) * 0.6
      lightRays.rotation.z = -0.08 + Math.sin(timeSeconds * 0.05) * 0.025
      horizonGlowMaterial.opacity = THREE.MathUtils.lerp(
        horizonGlowMaterial.opacity,
        clamp(0.045 + sunlightMix * 0.16 + nextConfig.dustAmount * 0.025, 0.04, 0.2),
        0.05,
      )

      terrainTexture.offset.x = timeSeconds * 0.002
      terrainTexture.offset.y = timeSeconds * -0.0008
      terrainMaterial.color.setRGB(
        lerp(0.34, 0.78, sunlightMix * 0.72),
        lerp(0.34, 0.58, sunlightMix * 0.48),
        lerp(0.22, 0.38, nextConfig.haze * 0.26),
      )
      terrainMaterial.opacity = THREE.MathUtils.lerp(
        terrainMaterial.opacity,
        clamp(0.58 + sunlightMix * 0.22 - nextConfig.haze * 0.08, 0.46, 0.88),
        0.06,
      )

      ground.scale.setScalar(
        nextConfig.radius * (4.2 + nextConfig.dustAmount * 0.5 + nextConfig.surfaceRoughness * 0.35),
      )
      ground.visible = showSceneOverlays
      groundMaterial.opacity = THREE.MathUtils.lerp(
        groundMaterial.opacity,
        0.12 + nextConfig.dustAmount * 0.08 + nextConfig.haze * 0.14,
        0.08,
      )

      dustSkirt.scale.setScalar(
        nextConfig.radius * (1.06 + nextConfig.dustAmount * 0.36 + nextConfig.surfaceRoughness * 0.18),
      )
      dustSkirt.visible = showSceneOverlays
      dustSkirtMaterial.opacity = THREE.MathUtils.lerp(
        dustSkirtMaterial.opacity,
        0.01 +
          nextConfig.dustAmount * 0.04 +
          nextDiagnostics.pressureDropHpa / 700 +
          nextConfig.surfaceRoughness * 0.01,
        0.08,
      )

      coreHalo.scale.setScalar(nextConfig.coreRadius * 2.2)
      coreHalo.visible = showSceneOverlays
      coreHaloMaterial.opacity = THREE.MathUtils.lerp(
        coreHaloMaterial.opacity,
        0.008 + nextConfig.cloudDensity * 0.01 + nextDiagnostics.pressureDropHpa / 1500,
        0.08,
      )

      cloudBandTexture.offset.x = timeSeconds * 0.008
      stormDeckTexture.offset.x = timeSeconds * 0.003
      stormDeck.position.y = THREE.MathUtils.lerp(
        stormDeck.position.y,
        nextConfig.height * (0.82 + nextConfig.wallCloudStrength * 0.12),
        0.04,
      )
      stormDeck.rotation.z = Math.sin(timeSeconds * 0.055) * 0.03
      stormDeck.scale.setScalar(0.96 + nextConfig.radius * 0.008)
      stormDeckMaterial.opacity = THREE.MathUtils.lerp(
        stormDeckMaterial.opacity,
        0.2 +
          nextConfig.wallCloudStrength * 0.18 +
          nextConfig.haze * 0.08 +
          nextConfig.cloudDensity * 0.05,
        0.06,
      )

      const wallHeight01 = clamp(visibleFraction * 0.86, 0.36, 0.92)
      const wallAxis = getAxisOffsetAtHeight(nextConfig, wallHeight01, timeSeconds)
      wallCloud.position.set(
        wallAxis.x,
        wallHeight01 * nextConfig.height,
        wallAxis.z,
      )
      wallCloud.scale.setScalar(
        nextConfig.radius * (1.12 + nextConfig.wallCloudStrength * 0.38 + nextConfig.humidity * 0.22),
      )
      wallCloud.rotation.z = timeSeconds * 0.04
      wallCloudMaterial.opacity = THREE.MathUtils.lerp(
        wallCloudMaterial.opacity,
        nextConfig.wallCloudStrength *
          (0.008 +
            nextConfig.humidity * 0.06 +
            nextConfig.cloudDensity * 0.024 +
            nextConfig.haze * 0.018),
        0.08,
      )

      updateFunnelClusters(innerFunnel, timeSeconds, nextConfig, visibleFraction, nextDiagnostics)
      updateFunnelClusters(outerFunnel, timeSeconds, nextConfig, visibleFraction, nextDiagnostics)
      updateDustClusters(dustClouds, timeSeconds, nextConfig, nextDiagnostics)
      updateVortexVeils(vortexVeils, timeSeconds, nextConfig, visibleFraction, nextDiagnostics)
      updateRainField(rainField, dt, timeSeconds, nextConfig)
      updateDebrisField(debrisField, timeSeconds, nextConfig)
      updateLightning(lightningRig, dt, timeSeconds, nextConfig)
      updateEnvironment(environmentRig, timeSeconds, nextConfig)

      orbitTarget.set(0, nextDiagnostics.visibleColumnMeters * 0.34, 0)
      orbit.target.lerp(orbitTarget, 0.06)

      simulation.update(dt, timeSeconds, nextConfig)

      if (now - lastInteraction > 4500) {
        const orbitAngle = timeSeconds * 0.035
        const distance = 33 + Math.sin(timeSeconds * 0.09) * 2.2
        cinematicCamera.set(
          Math.cos(orbitAngle) * distance + nextConfig.translationSpeed * 0.18,
          nextDiagnostics.visibleColumnMeters * 0.28 + 4.2 + Math.sin(timeSeconds * 0.12) * 1.2,
          Math.sin(orbitAngle) * distance + 16,
        )
        cinematicTarget.set(
          Math.sin(timeSeconds * 0.08) * 1.3,
          nextDiagnostics.visibleColumnMeters * 0.36,
          Math.cos(timeSeconds * 0.07) * 1.1,
        )
        camera.position.lerp(cinematicCamera, 0.008)
        orbit.target.lerp(cinematicTarget, 0.012)
      }

      orbit.update()
      renderer.render(scene, camera)

      animationFrame = window.requestAnimationFrame(renderFrame)
    }

    animationFrame = window.requestAnimationFrame(renderFrame)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', markInteraction)
      renderer.domElement.removeEventListener('wheel', markInteraction)
      renderer.domElement.removeEventListener('touchstart', markInteraction)
      orbit.dispose()
      simulation.dispose()

      sky.geometry.dispose()
      sky.material.dispose()
      skyboxTexture.dispose()
      terrain.geometry.dispose()
      terrainMaterial.dispose()
      lightRays.geometry.dispose()
      lightRayMaterial.dispose()
      horizonGlowDisk.geometry.dispose()
      horizonGlowMaterial.dispose()
      environmentRig.group.clear()
      environmentRig.roadMaterial.dispose()
      environmentRig.shoulderMaterial.dispose()
      environmentRig.stripeMaterial.dispose()
      environmentRig.puddleMaterial.dispose()
      environmentRig.grassMaterial.dispose()
      environmentRig.poleMaterial.dispose()
      environmentRig.cableMaterial.dispose()
      environmentRig.treeMaterial.dispose()
      for (const geometry of environmentRig.geometries) {
        geometry.dispose()
      }
      stormDeck.geometry.dispose()
      stormDeckMaterial.dispose()
      planeGeometry.dispose()
      dustPlaneGeometry.dispose()
      ground.geometry.dispose()
      groundMaterial.dispose()
      dustSkirt.geometry.dispose()
      dustSkirtMaterial.dispose()
      coreHalo.geometry.dispose()
      coreHaloMaterial.dispose()
      wallCloud.geometry.dispose()
      wallCloudMaterial.dispose()

      for (const cluster of [...innerFunnel, ...outerFunnel, ...dustClouds]) {
        for (const material of cluster.materials) {
          material.dispose()
        }
      }

      for (const veil of vortexVeils) {
        veil.geometry.dispose()
        veil.material.dispose()
      }

      rainField.geometry.dispose()
      rainField.material.dispose()
      debrisField.mesh.geometry.dispose()
      debrisField.mesh.material.dispose()
      lightningRig.geometry.dispose()
      lightningRig.material.dispose()

      terrainTexture.dispose()
      lightRayTexture.dispose()
      groundTexture.dispose()
      stormDeckTexture.dispose()
      cloudBandTexture.dispose()
      smokeTexture.dispose()
      dustTexture.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="viewport" ref={hostRef} />
}
