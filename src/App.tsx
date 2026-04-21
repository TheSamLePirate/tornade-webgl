import { type ChangeEvent, useState } from 'react'
import './App.css'
import { TornadoViewport } from './components/TornadoViewport'
import {
  defaultControls,
  deriveTornadoDiagnostics,
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
    key: 'coreRadius',
    label: 'Core radius',
    min: 0.7,
    max: 2.8,
    step: 0.01,
    format: (value) => `${value.toFixed(2)} m`,
  },
  {
    key: 'swirlRatio',
    label: 'Swirl ratio',
    min: 0.55,
    max: 2.1,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
  {
    key: 'updraft',
    label: 'Core updraft',
    min: 8,
    max: 30,
    step: 0.1,
    format: (value) => `${value.toFixed(1)} m/s`,
  },
  {
    key: 'turbulence',
    label: 'Shear turbulence',
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
    caption: 'Balanced condensation funnel and visible debris skirt.',
    config: defaultControls,
  },
  {
    label: 'Violent',
    caption: 'Tighter core, higher swirl ratio, stronger pressure drop.',
    config: {
      intensity: 1.34,
      radius: 5.5,
      height: 31,
      coreRadius: 1.02,
      swirlRatio: 1.72,
      updraft: 25.5,
      turbulence: 0.92,
      density: 0.92,
    },
  },
  {
    label: 'Wedge',
    caption: 'Wide inflow skirt with a broader, lower visible column.',
    config: {
      intensity: 1.08,
      radius: 8.6,
      height: 23,
      coreRadius: 1.95,
      swirlRatio: 0.86,
      updraft: 15.2,
      turbulence: 0.64,
      density: 0.88,
    },
  },
]

function App() {
  const [config, setConfig] = useState<TornadoControls>(defaultControls)

  const particles = particleCountFromDensity(config.density)
  const diagnostics = deriveTornadoDiagnostics(config)
  const footprint = (config.radius * 2.5).toFixed(1)

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
          A real-time tornado sandbox driven by a height-varying Rankine-style
          vortex, surface inflow, pressure-drop condensation and separate dust
          versus cloud tracer inertia. Orbit the camera, tune the core, and push
          the storm from photogenic to violent.
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
            Controls feed a structured vortex model: core radius shapes the solid
            body region, swirl ratio governs inflow versus rotation, and tracer
            visibility follows the local pressure deficit.
          </p>
          <p className="panel-copy panel-meta">
            Live tracers: {particles.toLocaleString()} | inflow belt: {footprint} m
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
          <p className="metric-label">Peak wind</p>
          <strong>{diagnostics.peakWindKmh} km/h</strong>
          <span>Estimated maximum tangential speed near the surface core.</span>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Pressure drop</p>
          <strong>{diagnostics.pressureDropHpa} hPa</strong>
          <span>Static pressure deficit used to reveal condensation in the funnel.</span>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Core diameter</p>
          <strong>{diagnostics.coreDiameterMeters} m</strong>
          <span>Width of the solid-body rotation zone before the decay region.</span>
        </article>
        <article className="glass-panel metric-card">
          <p className="metric-label">Visible column</p>
          <strong>{diagnostics.visibleColumnMeters} m</strong>
          <span>Approximate condensation height under the current pressure field.</span>
        </article>
      </section>

      <footer className="footer-note">
        Drag to orbit, scroll to zoom, and compare how core radius and swirl ratio
        reshape the funnel before fine-tuning turbulence.
      </footer>
    </main>
  )
}

export default App
