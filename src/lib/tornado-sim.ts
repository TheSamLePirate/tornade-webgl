import * as THREE from 'three'

export type TornadoControls = {
  intensity: number
  radius: number
  height: number
  coreRadius: number
  swirlRatio: number
  updraft: number
  turbulence: number
  humidity: number
  translationSpeed: number
  surfaceRoughness: number
  density: number
  cloudDensity: number
  dustAmount: number
  wallCloudStrength: number
  haze: number
  sunlight: number
  exposure: number
}

export type TornadoDiagnostics = {
  peakWindKmh: number
  pressureDropHpa: number
  coreDiameterMeters: number
  visibleColumnMeters: number
}

export const PARTICLE_LIMIT = 16500

export const defaultControls: TornadoControls = {
  intensity: 0.96,
  radius: 6.4,
  height: 28,
  coreRadius: 1.2,
  swirlRatio: 1.08,
  updraft: 18.5,
  turbulence: 0.58,
  humidity: 0.8,
  translationSpeed: 8.5,
  surfaceRoughness: 0.72,
  density: 0.82,
  cloudDensity: 0.84,
  dustAmount: 0.7,
  wallCloudStrength: 0.68,
  haze: 0.38,
  sunlight: 0.92,
  exposure: 1.02,
}

const AIR_DENSITY = 1.18
const MIN_PARTICLES = 3400
const TAU = Math.PI * 2
const STORM_HEADING_X = 0.93
const STORM_HEADING_Z = -0.37

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

function createParticleSpriteTexture() {
  const size = 192
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create particle sprite texture')
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
  baseGradient.addColorStop(0, 'rgba(255,255,255,0.18)')
  baseGradient.addColorStop(0.42, 'rgba(255,255,255,0.1)')
  baseGradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = baseGradient
  context.fillRect(0, 0, size, size)

  for (let index = 0; index < 34; index += 1) {
    const x = size * (0.18 + Math.random() * 0.64)
    const y = size * (0.18 + Math.random() * 0.64)
    const radius = size * (0.05 + Math.random() * 0.15)
    const alpha = 0.035 + Math.random() * 0.06
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)

    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
    gradient.addColorStop(0.52, `rgba(255, 255, 255, ${alpha * 0.38})`)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }

  context.globalCompositeOperation = 'destination-out'

  for (let index = 0; index < 14; index += 1) {
    const x = size * (0.22 + Math.random() * 0.56)
    const y = size * (0.22 + Math.random() * 0.56)
    const radius = size * (0.04 + Math.random() * 0.12)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)

    gradient.addColorStop(0, 'rgba(0,0,0,0.06)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')

    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }

  context.globalCompositeOperation = 'source-over'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping

  return texture
}

function getStormMotion(config: TornadoControls) {
  return {
    x: STORM_HEADING_X * config.translationSpeed,
    z: STORM_HEADING_Z * config.translationSpeed,
  }
}

export function getEnvelopeRadiusAtHeight(
  config: TornadoControls,
  height01: number,
) {
  return Math.max(
    config.coreRadius * 2,
    config.radius * (1.1 - 0.64 * Math.pow(clamp(height01, 0, 1), 0.84)),
  )
}

export function getCoreRadiusAtHeight(
  config: TornadoControls,
  height01: number,
) {
  return Math.max(
    0.44,
    config.coreRadius * (0.94 - 0.24 * Math.pow(clamp(height01, 0, 1), 0.9)),
  )
}

export function getAxisOffsetAtHeight(
  config: TornadoControls,
  height01: number,
  time: number,
) {
  const motionLean = config.translationSpeed * height01 * (0.18 + config.turbulence * 0.06)
  const meander = config.radius * (0.045 + config.turbulence * 0.075)
  const shear = config.radius * config.turbulence * height01 * 0.12

  return {
    x:
      STORM_HEADING_X * motionLean +
      Math.sin(time * 0.16) * meander * 0.48 +
      Math.sin(time * 0.43 + height01 * 2.3) * shear,
    z:
      STORM_HEADING_Z * motionLean +
      Math.cos(time * 0.19 + 0.8) * meander * 0.44 +
      Math.cos(time * 0.37 - height01 * 2.1) * shear,
  }
}

function getPeakTangentialSpeedMs(config: TornadoControls, height01: number) {
  const contraction = Math.pow(config.radius / Math.max(config.coreRadius, 0.45), 0.3)
  const structure = 0.84 + config.swirlRatio * 0.5
  const verticalDecay = 1.08 - 0.56 * Math.pow(clamp(height01, 0, 1), 0.88)

  return config.updraft * config.intensity * structure * contraction * verticalDecay
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
  const humidityGain = lerp(0.28, 0.72, config.humidity)
  const visibleColumnMeters =
    config.height *
    clamp(
      0.24 +
        humidityGain +
        clamp(pressureDropHpa / 80, 0, 1) * 0.16 +
        clamp(config.intensity - 0.5, 0, 1.2) * 0.08,
      0.22,
      1.08,
    )

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
  private readonly spriteTexture: THREE.CanvasTexture
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

    this.spriteTexture = createParticleSpriteTexture()

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
      uniforms: {
        uPixelRatio: { value: 1 },
        uSprite: { value: this.spriteTexture },
        uFogColor: { value: new THREE.Color(0x071018) },
        uFogNear: { value: 20 },
        uFogFar: { value: 68 },
        uSunlight: { value: 0.92 },
        uExposure: { value: 1.02 },
        uHaze: { value: 0.38 },
      },
      vertexShader: `
        uniform float uPixelRatio;
        attribute float aAlpha;
        attribute float aSize;
        attribute vec3 color;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;

        void main() {
          vColor = color;
          vAlpha = aAlpha;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          float perspective = 340.0 / max(1.0, -mvPosition.z);
          gl_PointSize = clamp(aSize * perspective * uPixelRatio, 1.0, 96.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uSprite;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uSunlight;
        uniform float uExposure;
        uniform float uHaze;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;

        void main() {
          vec4 sprite = texture2D(uSprite, gl_PointCoord);
          vec2 centered = gl_PointCoord - vec2(0.5);
          float radial = smoothstep(0.32, 0.0, dot(centered, centered));
          float body = sprite.a * radial;
          float hotCore = smoothstep(0.46, 0.9, sprite.a);
          float opacity = body * vAlpha;
          float sunlightMix = clamp((uSunlight - 0.2) / 1.6, 0.0, 1.0);
          float exposureBoost = pow(uExposure, 1.25);
          vec3 litColor = mix(vColor * 0.46, vColor * 1.18, sunlightMix);
          litColor *= mix(0.55, 1.55, clamp(exposureBoost / 2.1, 0.0, 1.0));
          litColor += hotCore * mix(0.02, 0.09, sunlightMix);
          float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);
          vec3 foggedColor = mix(litColor, uFogColor, fogFactor * (0.5 + uHaze * 0.5));

          gl_FragColor = vec4(foggedColor * opacity, opacity);
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

  setLookUniforms(options: {
    fogColor: THREE.ColorRepresentation
    fogNear: number
    fogFar: number
    sunlight: number
    exposure: number
    haze: number
  }) {
    this.material.uniforms.uFogColor.value.set(options.fogColor)
    this.material.uniforms.uFogNear.value = options.fogNear
    this.material.uniforms.uFogFar.value = options.fogFar
    this.material.uniforms.uSunlight.value = options.sunlight
    this.material.uniforms.uExposure.value = options.exposure
    this.material.uniforms.uHaze.value = options.haze
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
      const isCloud = this.kind[index] > 0.5

      vx += (sample.flowX - vx) * response * dt
      vy += (sample.flowY - vy) * response * dt
      vz += (sample.flowZ - vz) * response * dt

      const drag =
        0.12 +
        sample.height01 * 0.08 +
        config.turbulence * 0.08 +
        config.surfaceRoughness * sample.inflowWeight * (isCloud ? 0.06 : 0.14)

      vx *= Math.exp(-dt * drag)
      vz *= Math.exp(-dt * drag)
      vy *= Math.exp(-dt * (0.1 + (isCloud ? 0.02 : 0.06)))
      vy += this.buoyancy[index] * sample.condensation * dt
      vy -= (isCloud ? 1.45 : 2.8) * this.settling[index] * dt

      x += vx * dt
      y += vy * dt
      z += vz * dt

      if (
        age > this.lifetimes[index] ||
        y < -1.8 ||
        y > config.height + 8 ||
        Math.hypot(x, z) > config.radius * 5.2
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
      const fade = smoothstep(0, 0.08, age01) * (1 - smoothstep(0.72, 1, age01))
      const speed = Math.hypot(vx, vy, vz)
      const brightness = clamp(
        speed / (getPeakTangentialSpeedMs(config, sample.height01) + 8),
        0,
        1,
      )

      if (isCloud) {
        const whiteness = clamp(
          sample.condensation * 1.22 + brightness * 0.12 + config.humidity * 0.1,
          0,
          1,
        )

        this.colors[cursor] = lerp(0.66, 0.99, whiteness)
        this.colors[cursor + 1] = lerp(0.7, 0.97, whiteness)
        this.colors[cursor + 2] = lerp(0.76, 1, whiteness)
        this.alpha[index] =
          (0.028 +
            sample.condensation * 0.2 +
            sample.pressureDropHpa / 210 +
            config.humidity * 0.03) *
          (0.45 + config.cloudDensity * 0.8) *
          fade
        this.size[index] =
          (9 +
            sample.condensation * 26 +
            sample.updraftWeight * 5 +
            config.cloudDensity * 4) +
          Math.sin(this.seeds[index] * 50 + time * 1.7) * 1.2
      } else {
        const loftedDust = 1 - smoothstep(config.height * 0.15, config.height * 0.52, y)
        const dustBand = smoothstep(
          sample.coreRadius * 0.9,
          sample.envelopeRadius * 0.95,
          sample.radius,
        )
        const dustHeat =
          loftedDust * 0.42 + config.surfaceRoughness * 0.24 + brightness * 0.2

        this.colors[cursor] = lerp(0.46, 0.86, dustHeat)
        this.colors[cursor + 1] = lerp(0.31, 0.66, loftedDust * 0.48)
        this.colors[cursor + 2] = lerp(0.19, 0.44, sample.condensation * 0.2)
        this.alpha[index] =
          (0.022 +
            sample.inflowWeight * 0.08 +
            loftedDust * 0.09 +
            config.surfaceRoughness * 0.045) *
          (0.35 + config.dustAmount * 0.9) *
          dustBand *
          fade
        this.size[index] =
          (7 +
            sample.inflowWeight * 18 +
            loftedDust * 10 +
            config.surfaceRoughness * 4 +
            config.dustAmount * 5) +
          Math.sin(this.seeds[index] * 44 + time * 1.3) * 0.9
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
    this.spriteTexture.dispose()
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
    const axis = getAxisOffsetAtHeight(config, height01, time)
    const dx = x - axis.x
    const dz = z - axis.z
    const radius = Math.hypot(dx, dz) + 0.0001
    const radialX = dx / radius
    const radialZ = dz / radius
    const tangentX = -radialZ
    const tangentZ = radialX
    const coreRadius = getCoreRadiusAtHeight(config, height01)
    const envelopeRadius = getEnvelopeRadiusAtHeight(config, height01)
    const stormMotion = getStormMotion(config)
    const surfaceFactor = Math.pow(1 - height01, 1.3 + config.surfaceRoughness * 0.22)

    const outsideDecay = Math.exp(-Math.pow(radius / (envelopeRadius * 2.15), 2))
    const peakTangential = getPeakTangentialSpeedMs(config, height01)
    const tangentialSpeed =
      (radius < coreRadius
        ? peakTangential * (radius / coreRadius)
        : peakTangential * Math.pow(coreRadius / radius, 0.82)) * outsideDecay

    const coreWeight = gaussian(radius, coreRadius * 1.05)
    const annulusWeight = gaussian(radius - coreRadius * 1.05, coreRadius * 0.88)
    const inflowWeight =
      surfaceFactor *
      smoothstep(coreRadius * 0.84, envelopeRadius * 0.72, radius) *
      (1 - smoothstep(envelopeRadius * 1.24, envelopeRadius * 2.2, radius))

    const frontAlignment = clamp(
      radialX * -STORM_HEADING_X + radialZ * -STORM_HEADING_Z,
      -1,
      1,
    )
    const motionAsymmetry = 1 + frontAlignment * config.translationSpeed * 0.018
    const inflowSpeed =
      (peakTangential / Math.max(0.54, 2.08 * config.swirlRatio + 0.18)) *
      (0.9 + config.surfaceRoughness * 0.24) *
      motionAsymmetry

    let radialSpeed = -inflowSpeed * inflowWeight
    radialSpeed += inflowSpeed * 0.3 * coreWeight * surfaceFactor
    radialSpeed +=
      inflowSpeed *
      0.2 *
      smoothstep(0.72, 1, height01) *
      smoothstep(coreRadius * 0.95, envelopeRadius * 1.08, radius)

    const updraftWeight = clamp(coreWeight * 0.58 + annulusWeight * 0.96, 0, 1.5)
    const topCap = 1 - 0.78 * Math.pow(height01, 1.45)
    let verticalSpeed =
      config.updraft *
      (0.18 + updraftWeight * 0.98) *
      topCap *
      (0.92 + config.intensity * 0.14)

    verticalSpeed -=
      config.updraft *
      0.08 *
      smoothstep(envelopeRadius * 0.95, envelopeRadius * 2.0, radius) *
      smoothstep(0.7, 1, height01)

    const waveA =
      Math.sin(dz * 0.34 + time * 0.86 + seed * 0.9) -
      Math.cos(y * 0.18 - time * 0.47 + seed * 1.4)
    const waveB =
      Math.sin(dx * 0.27 - time * 0.64 + seed * 1.6) -
      Math.cos(dz * 0.31 + time * 0.38 + seed * 0.7)
    const waveC =
      Math.sin(y * 0.23 + time * 0.58 + seed * 1.1) -
      Math.cos(dx * 0.22 - time * 0.32 + seed * 1.9)
    const turbulenceStrength =
      config.turbulence *
      (0.16 +
        surfaceFactor * 0.54 +
        inflowWeight * 0.32 +
        config.translationSpeed * 0.012) *
      (0.34 + outsideDecay * 0.66)

    const ambientTransport = 0.24 + smoothstep(0.16, 0.92, height01) * 0.56
    const flowX =
      tangentX * tangentialSpeed +
      radialX * radialSpeed +
      stormMotion.x * ambientTransport +
      (waveC - waveB) * turbulenceStrength
    const flowY =
      verticalSpeed + (waveA - waveC) * turbulenceStrength * 0.4
    const flowZ =
      tangentZ * tangentialSpeed +
      radialZ * radialSpeed +
      stormMotion.z * ambientTransport +
      (waveB - waveA) * turbulenceStrength

    const pressureDropHpa =
      (0.5 * AIR_DENSITY * sqr(tangentialSpeed) * (0.56 + coreWeight * 0.44)) /
      100
    const condensationThreshold = lerp(12.5, 3.4, config.humidity)
    const condensation =
      smoothstep(condensationThreshold, condensationThreshold + 16, pressureDropHpa) *
      smoothstep(config.height * 0.03, config.height * 0.22, y) *
      (1 - smoothstep(config.height * 0.84, config.height * 1.02, y)) *
      (0.34 + config.humidity * 0.66) *
      (0.5 + updraftWeight * 0.5)

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
    const condensationChance = clamp(
      0.22 + config.humidity * 0.56 + (airborne ? 0.08 : 0),
      0.18,
      0.92,
    )
    const condensationTracer = Math.random() < condensationChance
    const seed = Math.random() * TAU

    this.seeds[index] = seed
    this.kind[index] = condensationTracer ? 1 : 0

    if (condensationTracer) {
      const height01 = airborne
        ? Math.pow(Math.random(), 0.72) * 0.88 + 0.04
        : 0.08 + Math.random() * 0.14
      const y = height01 * config.height
      const coreRadius = getCoreRadiusAtHeight(config, height01)
      const envelopeRadius = getEnvelopeRadiusAtHeight(config, height01)
      const radius =
        coreRadius * (0.4 + Math.pow(Math.random(), 0.82) * 1.45) +
        Math.random() * envelopeRadius * 0.1
      const angle = Math.random() * TAU
      const axis = getAxisOffsetAtHeight(config, height01, 0)

      this.positions[cursor] = axis.x + Math.cos(angle) * radius
      this.positions[cursor + 1] = y
      this.positions[cursor + 2] = axis.z + Math.sin(angle) * radius
      this.velocities[cursor] = 0
      this.velocities[cursor + 1] = config.updraft * (0.34 + Math.random() * 0.26)
      this.velocities[cursor + 2] = 0
      this.dragResponse[index] = 4.1 + Math.random() * 1.8
      this.settling[index] = 0.32 + Math.random() * 0.18
      this.buoyancy[index] = 1.08 + Math.random() * 0.68
      this.lifetimes[index] = 6.2 + Math.random() * 2.7 + config.humidity * 0.8
    } else {
      const height01 = Math.random() * 0.08
      const y = height01 * config.height
      const envelopeRadius = getEnvelopeRadiusAtHeight(config, height01)
      const radius =
        envelopeRadius * (0.46 + Math.pow(Math.random(), 0.72) * 1.5)
      const angle = Math.random() * TAU
      const axis = getAxisOffsetAtHeight(config, height01, 0)

      this.positions[cursor] = axis.x + Math.cos(angle) * radius
      this.positions[cursor + 1] = y
      this.positions[cursor + 2] = axis.z + Math.sin(angle) * radius
      this.velocities[cursor] = 0
      this.velocities[cursor + 1] = config.updraft * (0.05 + Math.random() * 0.18)
      this.velocities[cursor + 2] = 0
      this.dragResponse[index] = 1.9 + config.surfaceRoughness * 0.9 + Math.random() * 1.1
      this.settling[index] = 0.96 + config.surfaceRoughness * 0.24 + Math.random() * 0.32
      this.buoyancy[index] = 0.1 + Math.random() * 0.16
      this.lifetimes[index] = 4.5 + Math.random() * 1.8 + config.surfaceRoughness * 0.7
    }

    this.colors[cursor] = 0.7
    this.colors[cursor + 1] = 0.7
    this.colors[cursor + 2] = 0.7
    this.alpha[index] = 0
    this.size[index] = 8
    this.ages[index] = airborne ? Math.random() * 1.15 : 0
  }
}
