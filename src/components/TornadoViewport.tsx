import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  deriveTornadoDiagnostics,
  getAxisOffsetAtHeight,
  getEnvelopeRadiusAtHeight,
  PARTICLE_LIMIT,
  TornadoSimulation,
  type TornadoControls,
} from '../lib/tornado-sim'

type TornadoViewportProps = {
  config: TornadoControls
}

type VolumetricCluster = {
  group: THREE.Group
  materials: THREE.MeshBasicMaterial[]
  outer: boolean
  seed: number
  strength: number
  vertical: number
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
  const size = 512
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

  context.strokeStyle = 'rgba(188, 142, 92, 0.05)'
  context.lineWidth = 2
  for (let index = 0; index < 48; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = size * (0.1 + Math.random() * 0.32)
    const x = size * 0.5 + Math.cos(angle) * radius
    const y = size * 0.5 + Math.sin(angle) * radius
    const dx = Math.cos(angle + 0.7) * (10 + Math.random() * 24)
    const dy = Math.sin(angle + 0.7) * (10 + Math.random() * 24)

    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + dx, y + dy)
    context.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
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

export function TornadoViewport({ config }: TornadoViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const configRef = useRef(config)

  useEffect(() => {
    configRef.current = config
  }, [config])

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const fog = new THREE.Fog(0x071018, 20, 68)
    scene.fog = fog

    const camera = new THREE.PerspectiveCamera(
      42,
      host.clientWidth / Math.max(host.clientHeight, 1),
      0.1,
      180,
    )
    camera.position.set(22, 10.5, 26)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 8
    orbit.maxDistance = 58
    orbit.maxPolarAngle = Math.PI * 0.49
    orbit.target.set(0, configRef.current.height * 0.32, 0)

    const ambient = new THREE.HemisphereLight(0xbfd9ff, 0x372418, 0.82)
    scene.add(ambient)

    const fill = new THREE.DirectionalLight(0xecf4ff, 1.16)
    fill.position.set(14, 20, 12)
    scene.add(fill)

    const rim = new THREE.PointLight(0xffca95, 18, 60, 2)
    rim.position.set(0, 3.2, 0)
    scene.add(rim)

    const fogColor = new THREE.Color(0x071018)
    const ambientSkyColor = new THREE.Color(0xbfd9ff)
    const ambientGroundColor = new THREE.Color(0x372418)
    const fillColor = new THREE.Color(0xecf4ff)
    const rimColor = new THREE.Color(0xffca95)

    const groundTexture = createGroundTexture()
    const cloudBandTexture = createCloudBandTexture()
    const smokeTexture = createSmokeTexture()
    const dustTexture = createDustTexture()

    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      opacity: 0.42,
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

    const innerFunnel = Array.from({ length: 9 }, (_, index) =>
      createCluster(planeGeometry, smokeTexture, 0xe5edf6, false, index / 8),
    )
    const outerFunnel = Array.from({ length: 5 }, (_, index) =>
      createCluster(planeGeometry, smokeTexture, 0xd8e3ef, true, index / 4),
    )
    const dustClouds = Array.from({ length: 8 }, (_, index) =>
      createCluster(dustPlaneGeometry, dustTexture, 0xd2a06d, true, index / 7),
    )

    for (const cluster of [...innerFunnel, ...outerFunnel, ...dustClouds]) {
      scene.add(cluster.group)
    }

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

    let animationFrame = 0
    let previous = performance.now()
    const diagnostics = deriveTornadoDiagnostics(configRef.current)
    const orbitTarget = new THREE.Vector3(0, diagnostics.visibleColumnMeters * 0.32, 0)

    const renderFrame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 1 / 30)
      previous = now

      const timeSeconds = now / 1000
      const nextConfig = configRef.current
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
        0.28 + sunlightMix * 1.08 + nextConfig.haze * 0.18,
        0.08,
      )
      fill.intensity = THREE.MathUtils.lerp(
        fill.intensity,
        0.26 + sunlightMix * 2.1 - nextConfig.haze * 0.34,
        0.08,
      )
      rim.intensity = THREE.MathUtils.lerp(
        rim.intensity,
        2 + sunlightMix * 16 + nextConfig.dustAmount * 3 - nextConfig.haze * 2,
        0.08,
      )
      ambientSkyColor.setRGB(
        lerp(0.54, 0.9, sunlightMix + nextConfig.haze * 0.12),
        lerp(0.62, 0.96, sunlightMix * 0.82 + nextConfig.haze * 0.18),
        lerp(0.72, 1, sunlightMix * 0.58 + nextConfig.haze * 0.28),
      )
      ambient.color.lerp(ambientSkyColor, 0.08)
      ambientGroundColor.setRGB(
        lerp(0.12, 0.42, sunlightMix * 0.8),
        lerp(0.07, 0.24, sunlightMix * 0.52),
        lerp(0.04, 0.14, nextConfig.haze * 0.2),
      )
      ambient.groundColor.lerp(ambientGroundColor, 0.08)
      fillColor.setRGB(
        lerp(0.58, 1, sunlightMix),
        lerp(0.66, 0.98, sunlightMix * 0.82),
        lerp(0.78, 0.94, nextConfig.haze * 0.34 + sunlightMix * 0.24),
      )
      fill.color.lerp(fillColor, 0.08)
      rimColor.setRGB(
        lerp(0.86, 1, sunlightMix),
        lerp(0.58, 0.86, sunlightMix * 0.7),
        lerp(0.34, 0.62, sunlightMix * 0.4),
      )
      rim.color.lerp(rimColor, 0.08)

      ground.scale.setScalar(
        nextConfig.radius * (4.2 + nextConfig.dustAmount * 0.5 + nextConfig.surfaceRoughness * 0.35),
      )
      groundMaterial.opacity = THREE.MathUtils.lerp(
        groundMaterial.opacity,
        0.12 + nextConfig.dustAmount * 0.08 + nextConfig.haze * 0.14,
        0.08,
      )

      dustSkirt.scale.setScalar(
        nextConfig.radius * (1.06 + nextConfig.dustAmount * 0.36 + nextConfig.surfaceRoughness * 0.18),
      )
      dustSkirtMaterial.opacity = THREE.MathUtils.lerp(
        dustSkirtMaterial.opacity,
        0.01 +
          nextConfig.dustAmount * 0.04 +
          nextDiagnostics.pressureDropHpa / 700 +
          nextConfig.surfaceRoughness * 0.01,
        0.08,
      )

      coreHalo.scale.setScalar(nextConfig.coreRadius * 2.2)
      coreHaloMaterial.opacity = THREE.MathUtils.lerp(
        coreHaloMaterial.opacity,
        0.008 + nextConfig.cloudDensity * 0.01 + nextDiagnostics.pressureDropHpa / 1500,
        0.08,
      )

      cloudBandTexture.offset.x = timeSeconds * 0.008
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

      orbitTarget.set(0, nextDiagnostics.visibleColumnMeters * 0.32, 0)
      orbit.target.lerp(orbitTarget, 0.06)

      simulation.update(dt, timeSeconds, nextConfig)
      orbit.update()
      renderer.render(scene, camera)

      animationFrame = window.requestAnimationFrame(renderFrame)
    }

    animationFrame = window.requestAnimationFrame(renderFrame)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      orbit.dispose()
      simulation.dispose()

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

      groundTexture.dispose()
      cloudBandTexture.dispose()
      smokeTexture.dispose()
      dustTexture.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="viewport" ref={hostRef} />
}
