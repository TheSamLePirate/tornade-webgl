import * as THREE from 'three'

export type TornadoControls = {
  intensity: number
  radius: number
  height: number
  coreRadius: number
  swirlRatio: number
  updraft: number
  turbulence: number
  density: number
}

export type TornadoDiagnostics = {
  peakWindKmh: number
  pressureDropHpa: number
  coreDiameterMeters: number
  visibleColumnMeters: number
}

export const PARTICLE_LIMIT = 14000

export const defaultControls: TornadoControls = {
  intensity: 0.96,
  radius: 6.4,
  height: 28,
  coreRadius: 1.25,
  swirlRatio: 1.1,
  updraft: 18,
  turbulence: 0.56,
  density: 0.8,
}

const AIR_DENSITY = 1.18
const MIN_PARTICLES = 3200
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

function sqr(value: number) {
  return value * value
}

function gaussian(distance: number, width: number) {
  return Math.exp(-sqr(distance / Math.max(width, 0.0001)))
}

function getEnvelopeRadius(config: TornadoControls, height01: number) {
  return Math.max(
    config.coreRadius * 1.9,
    config.radius * (1.08 - 0.62 * Math.pow(clamp(height01, 0, 1), 0.86)),
  )
}

function getCoreRadius(config: TornadoControls, height01: number) {
  return Math.max(
    0.42,
    config.coreRadius * (0.92 - 0.26 * Math.pow(clamp(height01, 0, 1), 0.92)),
  )
}

function getAxisOffset(config: TornadoControls, height01: number, time: number) {
  const meander = config.radius * (0.08 + config.turbulence * 0.08)
  const shear = config.radius * config.turbulence * height01 * 0.14

  return {
    x:
      Math.sin(time * 0.16) * meander * 0.55 +
      Math.sin(time * 0.43 + height01 * 2.3) * shear,
    z:
      Math.cos(time * 0.2 + 0.8) * meander * 0.52 +
      Math.cos(time * 0.37 - height01 * 2.1) * shear,
  }
}

function getPeakTangentialSpeedMs(config: TornadoControls, height01: number) {
  const contraction = Math.pow(config.radius / Math.max(config.coreRadius, 0.45), 0.28)
  const structure = 0.88 + config.swirlRatio * 0.42
  const verticalDecay = 1.06 - 0.54 * Math.pow(clamp(height01, 0, 1), 0.9)

  return (
    config.updraft * config.intensity * structure * contraction * verticalDecay
  )
}

function getPressureDropHpa(config: TornadoControls) {
  const peakWindMs = getPeakTangentialSpeedMs(config, 0)
  return 0.5 * AIR_DENSITY * sqr(peakWindMs) / 100
}

export function particleCountFromDensity(density: number) {
  return Math.round(
    MIN_PARTICLES + clamp(density, 0, 1) * (PARTICLE_LIMIT - MIN_PARTICLES),
  )
}

export function deriveTornadoDiagnostics(
  config: TornadoControls,
): TornadoDiagnostics {
  const peakWindMs = getPeakTangentialSpeedMs(config, 0)
  const pressureDropHpa = getPressureDropHpa(config)
  const visibleColumnMeters =
    config.height *
    (0.76 +
      clamp(config.intensity - 0.6, 0, 1.2) * 0.12 +
      clamp(config.turbulence, 0, 1.4) * 0.05)

  return {
    peakWindKmh: Math.round(peakWindMs * 3.6),
    pressureDropHpa: Number(pressureDropHpa.toFixed(1)),
    coreDiameterMeters: Number((config.coreRadius * 2).toFixed(2)),
    visibleColumnMeters: Number(visibleColumnMeters.toFixed(1)),
  }
}

type FlowSample = {
  flowX: number
  flowY: number
  flowZ: number
  radius: number
  coreRadius: number
  envelopeRadius: number
  pressureDropHpa: number
  condensation: number
  inflowWeight: number
  updraftWeight: number
  height01: number
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
  private readonly kind: Float32Array
  private readonly dragResponse: Float32Array
  private readonly settling: Float32Array
  private readonly buoyancy: Float32Array
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
    this.kind = new Float32Array(limit)
    this.dragResponse = new Float32Array(limit)
    this.settling = new Float32Array(limit)
    this.buoyancy = new Float32Array(limit)

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
          float perspective = 300.0 / max(1.0, -mvPosition.z);
          gl_PointSize = clamp(aSize * perspective * uPixelRatio, 1.0, 72.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float radiusSq = dot(centered, centered);
          float body = smoothstep(0.25, 0.0, radiusSq);
          float core = smoothstep(0.08, 0.0, radiusSq);
          vec3 color = vColor + core * 0.15;

          gl_FragColor = vec4(color, body * vAlpha);
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

      const sample = this.sampleFlow(x, y, z, time, config, this.seeds[index])
      const response = this.dragResponse[index]

      vx += (sample.flowX - vx) * response * dt
      vy += (sample.flowY - vy) * response * dt
      vz += (sample.flowZ - vz) * response * dt

      const turbulenceBoost = config.turbulence * (0.14 + sample.inflowWeight * 0.12)
      const drag = Math.exp(-dt * (0.18 + sample.height01 * 0.08 + turbulenceBoost))
      vx *= drag
      vz *= drag
      vy *= Math.exp(-dt * 0.12)
      vy += this.buoyancy[index] * sample.condensation * dt
      vy -= 2.45 * this.settling[index] * dt

      x += vx * dt
      y += vy * dt
      z += vz * dt

      if (
        age > this.lifetimes[index] ||
        y < -1.5 ||
        y > config.height + 6 ||
        Math.hypot(x, z) > config.radius * 4.8
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
      const fade =
        smoothstep(0, 0.07, age01) * (1 - smoothstep(0.72, 1, age01))
      const speed = Math.hypot(vx, vy, vz)
      const brightness = clamp(
        speed / (getPeakTangentialSpeedMs(config, sample.height01) + 8),
        0,
        1,
      )

      if (this.kind[index] > 0.5) {
        const whiteness = clamp(sample.condensation * 1.18 + brightness * 0.18, 0, 1)
        this.colors[cursor] = lerp(0.66, 0.97, whiteness)
        this.colors[cursor + 1] = lerp(0.7, 0.96, whiteness)
        this.colors[cursor + 2] = lerp(0.76, 1, whiteness)
        this.alpha[index] =
          (0.04 + sample.condensation * 0.18 + sample.updraftWeight * 0.05) *
          fade
        this.size[index] =
          6 +
          sample.condensation * 18 +
          sample.updraftWeight * 4 +
          Math.sin(this.seeds[index] * 50 + time * 1.9) * 0.8
      } else {
        const loftedDust = 1 - smoothstep(config.height * 0.16, config.height * 0.52, y)
        this.colors[cursor] = lerp(0.58, 0.82, brightness * 0.4 + loftedDust * 0.36)
        this.colors[cursor + 1] = lerp(0.42, 0.66, loftedDust * 0.44)
        this.colors[cursor + 2] = lerp(0.28, 0.52, sample.condensation * 0.24)
        this.alpha[index] =
          (0.035 + sample.inflowWeight * 0.08 + loftedDust * 0.1) * fade
        this.size[index] =
          5 +
          sample.inflowWeight * 14 +
          loftedDust * 6 +
          Math.sin(this.seeds[index] * 40 + time * 1.4) * 0.6
      }
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

  private sampleFlow(
    x: number,
    y: number,
    z: number,
    time: number,
    config: TornadoControls,
    seed: number,
  ): FlowSample {
    const height01 = clamp(y / config.height, 0, 1)
    const axis = getAxisOffset(config, height01, time)
    const dx = x - axis.x
    const dz = z - axis.z
    const radius = Math.hypot(dx, dz) + 0.0001
    const radialX = dx / radius
    const radialZ = dz / radius
    const tangentX = -radialZ
    const tangentZ = radialX
    const coreRadius = getCoreRadius(config, height01)
    const envelopeRadius = getEnvelopeRadius(config, height01)

    const outsideDecay = Math.exp(-Math.pow(radius / (envelopeRadius * 2.15), 2.1))
    const peakTangential = getPeakTangentialSpeedMs(config, height01)
    const tangentialSpeed =
      (radius < coreRadius
        ? peakTangential * (radius / coreRadius)
        : peakTangential * Math.pow(coreRadius / radius, 0.84)) * outsideDecay

    const inflowSpeed =
      peakTangential /
      Math.max(0.55, 2.15 * config.swirlRatio + 0.22)
    const surfaceFactor = Math.pow(1 - height01, 1.45)
    const coreWeight = gaussian(radius, coreRadius * 1.08)
    const annulusWeight = gaussian(radius - coreRadius * 0.9, coreRadius * 0.82)
    const inflowWeight =
      surfaceFactor *
      smoothstep(coreRadius * 0.8, envelopeRadius * 0.68, radius) *
      (1 - smoothstep(envelopeRadius * 1.28, envelopeRadius * 2.2, radius))

    let radialSpeed = -inflowSpeed * inflowWeight
    radialSpeed += inflowSpeed * 0.3 * coreWeight * surfaceFactor
    radialSpeed +=
      inflowSpeed *
      0.22 *
      smoothstep(0.72, 1, height01) *
      smoothstep(coreRadius * 0.95, envelopeRadius * 1.1, radius)

    const updraftWeight = clamp(coreWeight * 0.62 + annulusWeight * 0.88, 0, 1.4)
    const topCap = 1 - 0.76 * Math.pow(height01, 1.5)
    let verticalSpeed =
      config.updraft *
      (0.2 + updraftWeight * 0.96) *
      topCap *
      (0.92 + config.intensity * 0.14)

    verticalSpeed -=
      config.updraft *
      0.1 *
      smoothstep(envelopeRadius * 0.95, envelopeRadius * 2.0, radius) *
      smoothstep(0.72, 1, height01)

    const waveA =
      Math.sin(dz * 0.34 + time * 0.82 + seed * 0.9) -
      Math.cos(y * 0.18 - time * 0.47 + seed * 1.4)
    const waveB =
      Math.sin(dx * 0.28 - time * 0.65 + seed * 1.7) -
      Math.cos(dz * 0.31 + time * 0.36 + seed * 0.7)
    const waveC =
      Math.sin(y * 0.24 + time * 0.54 + seed * 1.1) -
      Math.cos(dx * 0.23 - time * 0.31 + seed * 1.9)
    const turbulenceStrength =
      config.turbulence *
      (0.22 + surfaceFactor * 0.58 + inflowWeight * 0.36) *
      (0.3 + outsideDecay * 0.7)

    const flowX =
      tangentX * tangentialSpeed +
      radialX * radialSpeed +
      (waveC - waveB) * turbulenceStrength
    const flowY =
      verticalSpeed + (waveA - waveC) * turbulenceStrength * 0.38
    const flowZ =
      tangentZ * tangentialSpeed +
      radialZ * radialSpeed +
      (waveB - waveA) * turbulenceStrength

    const pressureDropHpa =
      (0.5 * AIR_DENSITY * sqr(tangentialSpeed) * (0.55 + coreWeight * 0.45)) /
      100
    const condensation =
      smoothstep(3.5, 24, pressureDropHpa) *
      smoothstep(config.height * 0.04, config.height * 0.26, y) *
      (0.58 + updraftWeight * 0.42)

    return {
      flowX,
      flowY,
      flowZ,
      radius,
      coreRadius,
      envelopeRadius,
      pressureDropHpa,
      condensation,
      inflowWeight,
      updraftWeight,
      height01,
    }
  }

  private resetParticle(index: number, config: TornadoControls, airborne: boolean) {
    const cursor = index * 3
    const condensationTracer = airborne
      ? Math.random() < 0.68
      : Math.random() < 0.28
    const seed = Math.random() * TAU

    this.seeds[index] = seed
    this.kind[index] = condensationTracer ? 1 : 0

    if (condensationTracer) {
      const height01 = airborne
        ? Math.pow(Math.random(), 0.74) * 0.86 + 0.04
        : 0.06 + Math.random() * 0.14
      const y = height01 * config.height
      const coreRadius = getCoreRadius(config, height01)
      const envelopeRadius = getEnvelopeRadius(config, height01)
      const radius =
        coreRadius * (0.45 + Math.pow(Math.random(), 0.85) * 1.4) +
        Math.random() * envelopeRadius * 0.14
      const angle = Math.random() * TAU
      const axis = getAxisOffset(config, height01, 0)

      this.positions[cursor] = axis.x + Math.cos(angle) * radius
      this.positions[cursor + 1] = y
      this.positions[cursor + 2] = axis.z + Math.sin(angle) * radius
      this.velocities[cursor] = 0
      this.velocities[cursor + 1] = config.updraft * (0.35 + Math.random() * 0.24)
      this.velocities[cursor + 2] = 0
      this.dragResponse[index] = 4.2 + Math.random() * 1.7
      this.settling[index] = 0.38 + Math.random() * 0.18
      this.buoyancy[index] = 1.1 + Math.random() * 0.6
      this.lifetimes[index] = 6.4 + Math.random() * 2.6
    } else {
      const height01 = Math.random() * 0.08
      const y = height01 * config.height
      const envelopeRadius = getEnvelopeRadius(config, height01)
      const radius =
        envelopeRadius * (0.44 + Math.pow(Math.random(), 0.75) * 1.35)
      const angle = Math.random() * TAU
      const axis = getAxisOffset(config, height01, 0)

      this.positions[cursor] = axis.x + Math.cos(angle) * radius
      this.positions[cursor + 1] = y
      this.positions[cursor + 2] = axis.z + Math.sin(angle) * radius
      this.velocities[cursor] = 0
      this.velocities[cursor + 1] = config.updraft * (0.06 + Math.random() * 0.18)
      this.velocities[cursor + 2] = 0
      this.dragResponse[index] = 2 + Math.random() * 1.1
      this.settling[index] = 1 + Math.random() * 0.35
      this.buoyancy[index] = 0.14 + Math.random() * 0.16
      this.lifetimes[index] = 4.8 + Math.random() * 1.8
    }

    this.colors[cursor] = 0.7
    this.colors[cursor + 1] = 0.7
    this.colors[cursor + 2] = 0.7
    this.alpha[index] = 0
    this.size[index] = 7
    this.ages[index] = airborne ? Math.random() * 1.2 : 0
  }
}
