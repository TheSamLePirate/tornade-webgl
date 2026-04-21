import { type ChangeEvent, useState } from 'react'
import './App.css'
import { TornadoViewport } from './components/TornadoViewport'
import {
  defaultControls,
  particleCountFromDensity,
  type TornadoControls,
} from './lib/tornado-sim'

type ControlKey = keyof TornadoControls

type SliderDefinition = {
  key: ControlKey
  label: string
  min: number
  max: number
  step: number
  format: (value: number) => string
}

type PresetDefinition = {
  label: string
  caption: string
  config: TornadoControls
}

const sliderDefinitions: SliderDefinition[] = [
  {
    key: 'intensity',
    label: 'Intensity',
    min: 0.35,
    max: 1.45,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
  {
    key: 'radius',
    label: 'Base radius',
    min: 3.2,
    max: 9.5,
    step: 0.1,
    format: (value) => `${value.toFixed(1)} m`,
  },
  {
    key: 'height',
    label: 'Column height',
    min: 12,
    max: 36,
    step: 0.5,
    format: (value) => `${value.toFixed(1)} m`,
  },
  {
    key: 'twist',
    label: 'Angular momentum',
    min: 5,
    max: 22,
    step: 0.1,
    format: (value) => `${value.toFixed(1)} rad/s`,
  },
  {
    key: 'updraft',
    label: 'Updraft',
    min: 7,
    max: 24,
    step: 0.1,
    format: (value) => `${value.toFixed(1)} m/s`,
  },
  {
    key: 'turbulence',
    label: 'Turbulence',
    min: 0.05,
    max: 1.4,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
  {
    key: 'density',
    label: 'Particle density',
    min: 0.12,
    max: 1,
    step: 0.01,
    format: (value) => `${Math.round(value * 100)}%`,
  },
]

const presets: PresetDefinition[] = [
  {
    label: 'Cinematic',
    caption: 'Balanced funnel with readable structure.',
    config: defaultControls,
  },
  {
    label: 'Violent',
    caption: 'Fast core, taller plume, harder lift.',
    config: {
      intensity: 1.28,
      radius: 5.2,
      height: 29,
      twist: 17.6,
      updraft: 20.5,
      turbulence: 1.05,
      density: 0.9,
    },
  },
  {
    label: 'Wedge',
    caption: 'Wide base and dusty wall-cloud footprint.',
    config: {
      intensity: 1.05,
      radius: 8.3,
      height: 24,
      twist: 10.4,
      updraft: 14.8,
      turbulence: 0.72,
      density: 0.84,
    },
  },
]

function App() {
  const [config, setConfig] = useState<TornadoControls>(defaultControls)

  const particles = particleCountFromDensity(config.density)
  const footprint = (config.radius * 2.8).toFixed(1)
  const peakFlow = Math.round(config.twist * config.intensity * 12 + config.updraft * 6)
  const shearIndex = Math.round(config.turbulence * config.intensity * 100)

  const handleSliderChange =
    (key: ControlKey) => (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value)
      setConfig((current) => ({
        ...current,
        [key]: nextValue,
      }))
    }

  return (
    <main className="app-shell">
      <TornadoViewport config={config} />
      <div className="atmosphere" aria-hidden="true" />

      <section className="glass-panel hero-panel">
        <p className="eyebrow">Bun + Vite + React + TypeScript + Three.js</p>
        <h1>Physical Particle Tornado</h1>
        <p className="lede">
          A WebGL tornado sandbox driven by a velocity field with angular momentum,
          radial entrainment, updraft and noisy vortex shedding. Orbit the camera,
          tune the funnel, and push the storm from cinematic to violent.
        </p>

        <div className="preset-row">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className="preset-button"
              type="button"
              onClick={() => setConfig(preset.config)}
            >
              <span>{preset.label}</span>
              <small>{preset.caption}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="glass-panel control-panel" aria-label="Simulation controls">
        <div className="panel-head">
          <div>
            <p className="panel-label">Storm controls</p>
            <h2>Shape the funnel</h2>
          </div>
          <p className="panel-copy">
            Parameters act directly on the simulated velocity field and the number
            of active particles.
          </p>
        </div>

        <div className="control-grid">
          {sliderDefinitions.map((slider) => (
            <label className="control" key={slider.key}>
              <span className="control-top">
                <span>{slider.label}</span>
                <output>{slider.format(config[slider.key])}</output>
              </span>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={config[slider.key]}
                onChange={handleSliderChange(slider.key)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="metrics-row" aria-label="Simulation metrics">
        <article className="glass-panel metric-card">
          <p className="metric-label">Active particles</p>
          <strong>{particles.toLocaleString()}</strong>
          <span>Dense additive point cloud with live respawn.</span>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Footprint</p>
          <strong>{footprint} m</strong>
          <span>Approximate ground diameter of the rotating inflow.</span>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Peak flow</p>
          <strong>{peakFlow} km/h</strong>
          <span>Rule-of-thumb composite from twist and vertical lift.</span>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Shear index</p>
          <strong>{shearIndex}</strong>
          <span>Higher values inject more lateral breakup and wobble.</span>
        </article>
      </section>

      <footer className="footer-note">
        Drag to orbit, scroll to zoom, and try the presets before fine-tuning the
        sliders.
      </footer>
    </main>
  )
}

export default App
