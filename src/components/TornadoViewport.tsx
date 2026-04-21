import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  deriveTornadoDiagnostics,
  PARTICLE_LIMIT,
  TornadoSimulation,
  type TornadoControls,
} from '../lib/tornado-sim'

type TornadoViewportProps = {
  config: TornadoControls
}

function createGroundTexture() {
  const size = 256
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
    8,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  )

  gradient.addColorStop(0, 'rgba(255, 219, 164, 0.92)')
  gradient.addColorStop(0.14, 'rgba(218, 152, 88, 0.4)')
  gradient.addColorStop(0.48, 'rgba(94, 68, 49, 0.18)')
  gradient.addColorStop(1, 'rgba(4, 7, 12, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)

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

  for (let index = 0; index < 40; index += 1) {
    const x = width * Math.random()
    const y = height * (0.3 + Math.random() * 0.38)
    const radius = 18 + Math.random() * 54
    const alpha = 0.02 + Math.random() * 0.04
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)

    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
    gradient.addColorStop(0.64, `rgba(255,255,255,${alpha * 0.48})`)
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
    renderer.toneMappingExposure = 1.16
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x060c14, 18, 64)

    const camera = new THREE.PerspectiveCamera(
      44,
      host.clientWidth / Math.max(host.clientHeight, 1),
      0.1,
      180,
    )
    camera.position.set(20, 10, 24)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 8
    orbit.maxDistance = 56
    orbit.maxPolarAngle = Math.PI * 0.49
    orbit.target.set(0, configRef.current.height * 0.34, 0)

    const ambient = new THREE.HemisphereLight(0xb6d5ff, 0x43261a, 0.78)
    scene.add(ambient)

    const fill = new THREE.DirectionalLight(0xe5f0ff, 1.15)
    fill.position.set(14, 20, 10)
    scene.add(fill)

    const rim = new THREE.PointLight(0xffcb8f, 22, 64, 2)
    rim.position.set(0, 3, 0)
    scene.add(rim)

    const groundTexture = createGroundTexture()
    const cloudBandTexture = createCloudBandTexture()

    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      groundMaterial,
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.04
    ground.scale.setScalar(configRef.current.radius * 4.6)
    scene.add(ground)

    const dustSkirtMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc98a,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const dustSkirt = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 120),
      dustSkirtMaterial,
    )
    dustSkirt.rotation.x = -Math.PI / 2
    dustSkirt.position.y = -0.01
    scene.add(dustSkirt)

    const coreHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xddeeff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const coreHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1, 96),
      coreHaloMaterial,
    )
    coreHalo.rotation.x = -Math.PI / 2
    coreHalo.position.y = 0.01
    scene.add(coreHalo)

    const wallCloudMaterial = new THREE.MeshBasicMaterial({
      map: cloudBandTexture,
      color: 0xdeebf7,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const wallCloud = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.22, 20, 120),
      wallCloudMaterial,
    )
    wallCloud.rotation.x = Math.PI / 2
    scene.add(wallCloud)

    const upperHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xc1d8ee,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const upperHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1, 120),
      upperHaloMaterial,
    )
    upperHalo.rotation.x = -Math.PI / 2
    scene.add(upperHalo)

    const simulation = new TornadoSimulation(PARTICLE_LIMIT)
    simulation.setPixelRatio(renderer.getPixelRatio())
    simulation.initialize(configRef.current)
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

    let animationFrame = 0
    let previous = performance.now()
    const diagnostics = deriveTornadoDiagnostics(configRef.current)
    const orbitTarget = new THREE.Vector3(0, diagnostics.visibleColumnMeters * 0.32, 0)

    const renderFrame = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 1 / 30)
      previous = now

      const nextConfig = configRef.current
      const nextDiagnostics = deriveTornadoDiagnostics(nextConfig)

      ground.scale.setScalar(nextConfig.radius * (4.5 + nextConfig.surfaceRoughness * 0.55))
      groundMaterial.opacity = THREE.MathUtils.lerp(
        groundMaterial.opacity,
        0.38 +
          nextConfig.surfaceRoughness * 0.18 +
          nextConfig.turbulence * 0.12 +
          nextConfig.intensity * 0.08,
        0.08,
      )

      dustSkirt.scale.setScalar(
        nextConfig.radius * (1.18 + nextConfig.surfaceRoughness * 0.42),
      )
      dustSkirtMaterial.opacity = THREE.MathUtils.lerp(
        dustSkirtMaterial.opacity,
        0.03 +
          nextConfig.surfaceRoughness * 0.08 +
          nextDiagnostics.pressureDropHpa / 360,
        0.08,
      )

      coreHalo.scale.setScalar(nextConfig.coreRadius * 2.2)
      coreHaloMaterial.opacity = THREE.MathUtils.lerp(
        coreHaloMaterial.opacity,
        0.03 + nextDiagnostics.pressureDropHpa / 360 + nextConfig.humidity * 0.03,
        0.08,
      )

      wallCloud.position.set(
        nextConfig.translationSpeed * 0.18,
        nextDiagnostics.visibleColumnMeters * 0.82,
        -nextConfig.translationSpeed * 0.07,
      )
      wallCloud.scale.setScalar(
        nextConfig.radius * (1.26 + nextConfig.humidity * 0.44),
      )
      wallCloud.rotation.z = now / 12000
      wallCloudMaterial.opacity = THREE.MathUtils.lerp(
        wallCloudMaterial.opacity,
        0.04 + nextConfig.humidity * 0.12 + nextConfig.turbulence * 0.04,
        0.08,
      )

      upperHalo.position.set(
        nextConfig.translationSpeed * 0.14,
        nextDiagnostics.visibleColumnMeters * 0.88,
        -nextConfig.translationSpeed * 0.05,
      )
      upperHalo.scale.setScalar(nextConfig.radius * (1.8 + nextConfig.humidity * 0.54))
      upperHaloMaterial.opacity = THREE.MathUtils.lerp(
        upperHaloMaterial.opacity,
        0.018 +
          nextDiagnostics.pressureDropHpa / 520 +
          nextConfig.humidity * 0.032,
        0.08,
      )

      orbitTarget.set(0, nextDiagnostics.visibleColumnMeters * 0.32, 0)
      orbit.target.lerp(orbitTarget, 0.06)

      simulation.update(dt, now / 1000, nextConfig)
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
      ground.geometry.dispose()
      groundMaterial.dispose()
      dustSkirt.geometry.dispose()
      dustSkirtMaterial.dispose()
      coreHalo.geometry.dispose()
      coreHaloMaterial.dispose()
      wallCloud.geometry.dispose()
      wallCloudMaterial.dispose()
      upperHalo.geometry.dispose()
      upperHaloMaterial.dispose()
      groundTexture.dispose()
      cloudBandTexture.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="viewport" ref={hostRef} />
}
