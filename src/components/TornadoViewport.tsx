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

  gradient.addColorStop(0, 'rgba(255, 219, 164, 0.95)')
  gradient.addColorStop(0.18, 'rgba(218, 152, 88, 0.45)')
  gradient.addColorStop(0.48, 'rgba(94, 68, 49, 0.22)')
  gradient.addColorStop(1, 'rgba(4, 7, 12, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

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
    renderer.toneMappingExposure = 1.12
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x060c14, 22, 58)

    const camera = new THREE.PerspectiveCamera(
      44,
      host.clientWidth / Math.max(host.clientHeight, 1),
      0.1,
      160,
    )
    camera.position.set(22, 11, 28)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.05
    orbit.minDistance = 9
    orbit.maxDistance = 52
    orbit.maxPolarAngle = Math.PI * 0.49
    orbit.target.set(0, configRef.current.height * 0.35, 0)

    const ambient = new THREE.HemisphereLight(0xa8c9ff, 0x3a2418, 0.7)
    scene.add(ambient)

    const fill = new THREE.DirectionalLight(0xd9e8ff, 1.1)
    fill.position.set(10, 18, 8)
    scene.add(fill)

    const rim = new THREE.PointLight(0xffc17a, 18, 55, 2.2)
    rim.position.set(0, 3, 0)
    scene.add(rim)

    const groundTexture = createGroundTexture()
    const groundMaterial = new THREE.MeshBasicMaterial({
      map: groundTexture,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    })
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 96),
      groundMaterial,
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.04
    ground.scale.setScalar(configRef.current.radius * 4.4)
    scene.add(ground)

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcf95,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1, 96),
      ringMaterial,
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.01
    ring.scale.setScalar(configRef.current.radius * 2.6)
    scene.add(ring)

    const coreHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9e8ff,
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

      ground.scale.setScalar(nextConfig.radius * 4.7)
      groundMaterial.opacity = THREE.MathUtils.lerp(
        groundMaterial.opacity,
        0.48 + nextConfig.turbulence * 0.2 + nextConfig.intensity * 0.1,
        0.08,
      )
      ring.scale.setScalar(nextConfig.radius * 1.4)
      ringMaterial.opacity = THREE.MathUtils.lerp(
        ringMaterial.opacity,
        0.04 + nextDiagnostics.pressureDropHpa / 320,
        0.08,
      )
      coreHalo.scale.setScalar(nextConfig.coreRadius * 2.1)
      coreHaloMaterial.opacity = THREE.MathUtils.lerp(
        coreHaloMaterial.opacity,
        0.05 + nextDiagnostics.pressureDropHpa / 420,
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
      ring.geometry.dispose()
      ringMaterial.dispose()
      coreHalo.geometry.dispose()
      coreHaloMaterial.dispose()
      groundTexture.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [])

  return <div className="viewport" ref={hostRef} />
}
