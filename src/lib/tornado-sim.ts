import * as THREE from 'three'

export type TornadoControls = {
  intensity: number
  radius: number
  height: number
  twist: number
  updraft: number
  turbulence: number
  density: number
}

export const PARTICLE_LIMIT = 12000

export const defaultControls: TornadoControls = {
  intensity: 0.92,
  radius: 5.8,
  height: 25,
  twist: 12.8,
  updraft: 16.5,
  turbulence: 0.78,
  density: 0.74,
}

const MIN_PARTICLES = 2600
const TAU = Math.PI * 2

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

export function particleCountFromDensity(density: number) {
  return Math.round(MIN_PARTICLES + clamp(density, 0, 1) * (PARTICLE_LIMIT - MIN_PARTICLES))
}

export class TornadoSimulation {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>

  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly positions: Float32Array
  private readonly velocities: Float32Array
  private readonly colors: Float32Array
  private readonly alpha: Float32Array
  private readonly size: Float32Array
  private readonly ages: Float32Array
  private readonly lifetimes: Float32Array
  private readonly seeds: Float32Array
  private readonly positionAttribute: THREE.BufferAttribute
  private readonly colorAttribute: THREE.BufferAttribute
  private readonly alphaAttribute: THREE.BufferAttribute
  private readonly sizeAttribute: THREE.BufferAttribute

  private activeCount = 0

  constructor(limit = PARTICLE_LIMIT) {
    this.positions = new Float32Array(limit * 3)
    this.velocities = new Float32Array(limit * 3)
    this.colors = new Float32Array(limit * 3)
    this.alpha = new Float32Array(limit)
    this.size = new Float32Array(limit)
    this.ages = new Float32Array(limit)
    this.lifetimes = new Float32Array(limit)
    this.seeds = new Float32Array(limit)

    this.geometry = new THREE.BufferGeometry()
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3)
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3)
    this.alphaAttribute = new THREE.BufferAttribute(this.alpha, 1)
    this.sizeAttribute = new THREE.BufferAttribute(this.size, 1)

    this.geometry.setAttribute('position', this.positionAttribute)
    this.geometry.setAttribute('color', this.colorAttribute)
    this.geometry.setAttribute('aAlpha', this.alphaAttribute)
    this.geometry.setAttribute('aSize', this.sizeAttribute)
    this.geometry.setDrawRange(0, 0)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: 1 },
      },
      vertexShader: `
        uniform float uPixelRatio;
        attribute float aAlpha;
        attribute float aSize;
        attribute vec3 color;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          vAlpha = aAlpha;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float perspective = 280.0 / max(1.0, -mvPosition.z);
          gl_PointSize = clamp(aSize * perspective * uPixelRatio, 1.0, 64.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float distanceToCenter = dot(centered, centered);
          float softParticle = smoothstep(0.25, 0.0, distanceToCenter);
          float hotCore = smoothstep(0.05, 0.0, distanceToCenter);
          vec3 finalColor = vColor + hotCore * 0.16;

          gl_FragColor = vec4(finalColor, softParticle * vAlpha);
        }
      `,
    })

    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 2
  }

  setPixelRatio(pixelRatio: number) {
    this.material.uniforms.uPixelRatio.value = pixelRatio
  }

  initialize(config: TornadoControls) {
    this.syncParticleCount(config)

    for (let index = 0; index < this.activeCount; index += 1) {
      this.resetParticle(index, config, true)
    }
  }

  update(dt: number, time: number, config: TornadoControls) {
    this.syncParticleCount(config)

    for (let index = 0; index < this.activeCount; index += 1) {
      const cursor = index * 3

      let x = this.positions[cursor]
      let y = this.positions[cursor + 1]
      let z = this.positions[cursor + 2]
      let vx = this.velocities[cursor]
      let vy = this.velocities[cursor + 1]
      let vz = this.velocities[cursor + 2]

      const age = this.ages[index] + dt
      this.ages[index] = age

      const radius = Math.hypot(x, z) + 0.0001
      const radialX = x / radius
      const radialZ = z / radius
      const tangentX = -radialZ
      const tangentZ = radialX
      const height01 = clamp(y / config.height, 0, 1)

      const envelopeRadius = Math.max(
        0.55,
        config.radius * (0.22 + 0.98 * Math.pow(1 - height01, 1.55)),
      )
      const targetOrbit =
        envelopeRadius *
        (0.34 + 0.1 * Math.sin(this.seeds[index] * 19.7 + height01 * 6.5))
      const envelope = 1 - smoothstep(envelopeRadius * 0.62, envelopeRadius * 2.45, radius)
      const coreLift = Math.exp(-radius / (envelopeRadius * 0.9 + 0.35))

      const desiredTangential =
        config.twist *
        config.intensity *
        (0.72 + 1.85 / (0.8 + radius)) *
        (0.42 + 0.92 * (1 - height01)) *
        (0.25 + envelope * 1.15)

      let desiredRadial = -(radius - targetOrbit) * (1.5 + config.intensity * 1.4)
      desiredRadial += smoothstep(0.72, 1, height01) * config.intensity * 3.1

      const desiredVertical =
        config.updraft *
        (0.16 + coreLift * 1.3) *
        (0.34 + 0.96 * (1 - height01)) *
        (0.55 + envelope * 0.65)

      const tx = x * 0.22 + this.seeds[index] * 13.1
      const ty = y * 0.18 - this.seeds[index] * 7.7
      const tz = z * 0.21 + this.seeds[index] * 5.3
      const waveA = Math.sin(tx + time * 0.67) * Math.cos(tz * 1.21 - time * 0.31)
      const waveB = Math.sin(ty * 1.19 - time * 0.46) * Math.cos(tx * 0.73 + time * 0.27)
      const waveC = Math.sin(tz * 0.93 + time * 0.59) * Math.cos(ty * 0.81 - time * 0.38)
      const turbulenceStrength =
        config.turbulence *
        config.intensity *
        (0.32 + 0.76 * (1 - height01)) *
        (0.25 + envelope) *
        2.4

      const desiredVX =
        tangentX * desiredTangential +
        radialX * desiredRadial +
        (waveC - waveB) * turbulenceStrength
      const desiredVY =
        desiredVertical + (waveA - waveC) * turbulenceStrength * 0.48
      const desiredVZ =
        tangentZ * desiredTangential +
        radialZ * desiredRadial +
        (waveB - waveA) * turbulenceStrength

      const response = 2 + config.intensity * 3
      vx += (desiredVX - vx) * response * dt
      vy += (desiredVY - vy) * response * dt
      vz += (desiredVZ - vz) * response * dt

      const planarDrag = Math.exp(-dt * (0.42 + (1 - envelope) * 1.25))
      vx *= planarDrag
      vz *= planarDrag
      vy *= Math.exp(-dt * 0.18)
      vy -= (0.52 + (1 - envelope) * 1.6) * dt * (0.3 + height01 * 0.45)

      x += vx * dt
      y += vy * dt
      z += vz * dt

      if (
        y < -1 ||
        y > config.height + 4 ||
        radius > config.radius * 5 ||
        age > this.lifetimes[index]
      ) {
        this.resetParticle(index, config, false)
        continue
      }

      this.positions[cursor] = x
      this.positions[cursor + 1] = y
      this.positions[cursor + 2] = z
      this.velocities[cursor] = vx
      this.velocities[cursor + 1] = vy
      this.velocities[cursor + 2] = vz

      const age01 = clamp(age / this.lifetimes[index], 0, 1)
      const fade = smoothstep(0, 0.08, age01) * (1 - smoothstep(0.74, 1, age01))
      const dustMix = 1 - smoothstep(config.height * 0.18, config.height * 0.58, y)
      const coolMix = smoothstep(config.height * 0.24, config.height * 0.92, y)
      const brightness = clamp(
        (Math.abs(vx) + Math.abs(vz) + Math.max(vy, 0)) /
          (config.twist * 2.7 + config.updraft * 0.9 + 0.001),
        0,
        1,
      )

      let red = lerp(0.86, 0.46, coolMix)
      let green = lerp(0.67, 0.62, coolMix)
      let blue = lerp(0.44, 0.74, coolMix)

      red = lerp(red, 0.94, dustMix * 0.14 + coreLift * 0.08)
      green = lerp(green, 0.74, dustMix * 0.11)
      blue = lerp(blue, 0.82, coolMix * 0.18)

      const glow = coreLift * 0.18 + brightness * 0.08
      this.colors[cursor] = Math.min(1, red + glow)
      this.colors[cursor + 1] = Math.min(1, green + glow * 0.55)
      this.colors[cursor + 2] = Math.min(1, blue + glow * 0.65)
      this.alpha[index] =
        (0.05 + envelope * 0.1 + coreLift * 0.08 + dustMix * 0.045) *
        fade *
        (0.72 + config.intensity * 0.42)
      this.size[index] =
        6 +
        envelope * 16 +
        dustMix * 7 +
        Math.sin(this.seeds[index] * 60 + time * 1.7) * 0.75
    }

    this.positionAttribute.needsUpdate = true
    this.colorAttribute.needsUpdate = true
    this.alphaAttribute.needsUpdate = true
    this.sizeAttribute.needsUpdate = true
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }

  private syncParticleCount(config: TornadoControls) {
    const targetCount = particleCountFromDensity(config.density)

    if (targetCount > this.activeCount) {
      for (let index = this.activeCount; index < targetCount; index += 1) {
        this.resetParticle(index, config, true)
      }
    }

    this.activeCount = targetCount
    this.geometry.setDrawRange(0, targetCount)
  }

  private resetParticle(index: number, config: TornadoControls, airborne: boolean) {
    const cursor = index * 3
    const height01 = airborne ? Math.pow(Math.random(), 0.72) * 0.92 : Math.random() * 0.08
    const y = height01 * config.height
    const localRadius = Math.max(
      0.55,
      config.radius * (0.22 + 0.98 * Math.pow(1 - clamp(height01, 0, 1), 1.55)),
    )
    const orbitRadius = localRadius * (0.24 + Math.pow(Math.random(), 0.8) * 1.55)
    const intakeMultiplier = airborne ? 1 : 1.18 + Math.random() * 0.9
    const radius = Math.max(0.18, orbitRadius * intakeMultiplier)
    const angle = Math.random() * TAU
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const spin = config.twist * config.intensity * (0.75 + 1.2 / (0.8 + radius))

    this.positions[cursor] = x
    this.positions[cursor + 1] = y
    this.positions[cursor + 2] = z
    this.velocities[cursor] = -Math.sin(angle) * spin
    this.velocities[cursor + 1] = config.updraft * (0.15 + Math.random() * 0.28)
    this.velocities[cursor + 2] = Math.cos(angle) * spin
    this.colors[cursor] = 0.8
    this.colors[cursor + 1] = 0.7
    this.colors[cursor + 2] = 0.6
    this.alpha[index] = 0
    this.size[index] = 8
    this.ages[index] = airborne ? Math.random() * 1.4 : 0
    this.lifetimes[index] = 4.8 + Math.random() * 3.1 + (1 - config.intensity) * 1.6
    this.seeds[index] = Math.random() * 1000
  }
}
