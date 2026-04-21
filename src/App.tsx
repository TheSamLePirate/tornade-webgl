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
type ControlGroup = 'core' | 'flow' | 'air' | 'look'

type SliderDefinition = {
  key: ControlKey
  label: string
  min: number
  max: number
  step: number
  group: ControlGroup
  format: (value: number) => string
}

type GroupDefinition = {
  id: ControlGroup
  label: string
  caption: string
}

type PresetDefinition = {
  label: string
  caption: string
  config: TornadoControls
}

const groups: GroupDefinition[] = [
  {
    id: 'core',
    label: 'Core',
    caption: 'Column geometry and energy budget.',
  },
  {
    id: 'flow',
    label: 'Flow',
    caption: 'Rotation, lift and storm-motion asymmetry.',
  },
  {
    id: 'air',
    label: 'Air',
    caption: 'Humidity, roughness and tracer richness.',
  },
  {
    id: 'look',
    label: 'Look',
    caption: 'Cloud mass, dust, haze and cinematic lighting.',
  },
]

const sliderDefinitions: SliderDefinition[] = [
  {
    key: 'intensity',
    label: 'Intensity',
    min: 0.35,
    max: 1.5,
    step: 0.01,
    group: 'core',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'radius',
    label: 'Base radius',
    min: 3.2,
    max: 9.8,
    step: 0.1,
    group: 'core',
    format: (value) => `${value.toFixed(1)} m`,
  },
  {
    key: 'height',
    label: 'Column height',
    min: 12,
    max: 40,
    step: 0.5,
    group: 'core',
    format: (value) => `${value.toFixed(1)} m`,
  },
  {
    key: 'coreRadius',
    label: 'Core radius',
    min: 0.7,
    max: 3,
    step: 0.01,
    group: 'core',
    format: (value) => `${value.toFixed(2)} m`,
  },
  {
    key: 'swirlRatio',
    label: 'Swirl ratio',
    min: 0.55,
    max: 2.2,
    step: 0.01,
    group: 'flow',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'updraft',
    label: 'Core updraft',
    min: 8,
    max: 32,
    step: 0.1,
    group: 'flow',
    format: (value) => `${value.toFixed(1)} m/s`,
  },
  {
    key: 'translationSpeed',
    label: 'Storm motion',
    min: 0,
    max: 26,
    step: 0.1,
    group: 'flow',
    format: (value) => `${value.toFixed(1)} m/s`,
  },
  {
    key: 'turbulence',
    label: 'Shear turbulence',
    min: 0.05,
    max: 1.5,
    step: 0.01,
    group: 'flow',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'humidity',
    label: 'Humidity',
    min: 0.25,
    max: 1,
    step: 0.01,
    group: 'air',
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'surfaceRoughness',
    label: 'Surface roughness',
    min: 0.2,
    max: 1.5,
    step: 0.01,
    group: 'air',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'density',
    label: 'Tracer density',
    min: 0.16,
    max: 1,
    step: 0.01,
    group: 'air',
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'cloudDensity',
    label: 'Cloud density',
    min: 0.25,
    max: 1.5,
    step: 0.01,
    group: 'look',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'dustAmount',
    label: 'Dust amount',
    min: 0,
    max: 1.5,
    step: 0.01,
    group: 'look',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'wallCloudStrength',
    label: 'Wall cloud',
    min: 0,
    max: 1.5,
    step: 0.01,
    group: 'look',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'haze',
    label: 'Atmospheric haze',
    min: 0,
    max: 1.5,
    step: 0.01,
    group: 'look',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'sunlight',
    label: 'Sunlight',
    min: 0.2,
    max: 1.8,
    step: 0.01,
    group: 'look',
    format: (value) => value.toFixed(2),
  },
  {
    key: 'exposure',
    label: 'Exposure',
    min: 0.5,
    max: 1.8,
    step: 0.01,
    group: 'look',
    format: (value) => value.toFixed(2),
  },
]

const presets: PresetDefinition[] = [
  {
    label: 'Supercell',
    caption: 'Balanced photogenic funnel with a structured wall cloud.',
    config: defaultControls,
  },
  {
    label: 'Violent',
    caption: 'Tight core, higher swirl, stronger lift and lower pressure.',
    config: {
      intensity: 1.34,
      radius: 5.4,
      height: 33,
      coreRadius: 0.96,
      swirlRatio: 1.82,
      updraft: 27,
      turbulence: 0.9,
      humidity: 0.86,
      translationSpeed: 10.8,
      surfaceRoughness: 0.84,
      density: 0.94,
      cloudDensity: 1.04,
      dustAmount: 0.84,
      wallCloudStrength: 0.78,
      haze: 0.42,
      sunlight: 0.98,
      exposure: 1.04,
    },
  },
  {
    label: 'Wedge',
    caption: 'Broader core with a heavier debris skirt and low cloud base.',
    config: {
      intensity: 1.1,
      radius: 8.8,
      height: 24,
      coreRadius: 2.1,
      swirlRatio: 0.9,
      updraft: 16.6,
      turbulence: 0.7,
      humidity: 0.76,
      translationSpeed: 7.2,
      surfaceRoughness: 1.06,
      density: 0.9,
      cloudDensity: 0.72,
      dustAmount: 1.18,
      wallCloudStrength: 0.56,
      haze: 0.46,
      sunlight: 0.88,
      exposure: 0.98,
    },
  },
  {
    label: 'Ghost Rope',
    caption: 'Slim, humid rope tornado with fast motion and lean.',
    config: {
      intensity: 0.92,
      radius: 4.2,
      height: 36,
      coreRadius: 0.72,
      swirlRatio: 1.58,
      updraft: 19.8,
      turbulence: 0.46,
      humidity: 0.94,
      translationSpeed: 14.5,
      surfaceRoughness: 0.42,
      density: 0.74,
      cloudDensity: 0.92,
      dustAmount: 0.24,
      wallCloudStrength: 0.38,
      haze: 0.2,
      sunlight: 1.06,
      exposure: 1.08,
    },
  },
]

function App() {
  const [config, setConfig] = useState<TornadoControls>(defaultControls)
  const [activeGroup, setActiveGroup] = useState<ControlGroup>('core')
  const [controlsOpen, setControlsOpen] = useState(true)

  const diagnostics = deriveTornadoDiagnostics(config)
  const particles = particleCountFromDensity(config.density)
  const footprint = (config.radius * 2.6).toFixed(1)
  const activeGroupData = groups.find((group) => group.id === activeGroup) ?? groups[0]
  const visibleControls = sliderDefinitions.filter(
    (slider) => slider.group === activeGroup,
  )

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

      <header className="hud-header">
        <section className="glass-panel brand-dock">
          <div className="dock-topline">
            <p className="eyebrow">Tornado Lab V3</p>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setConfig(defaultControls)}
            >
              Reset
            </button>
          </div>
          <h1>Compact controls. Bigger storm.</h1>
          <p className="lede">
            Physical tornado controls plus a dedicated look tab so the storm can be
            tuned cleanly instead of forcing one heavy art direction.
          </p>

          <div className="preset-pills">
            {presets.map((preset) => (
              <button
                key={preset.label}
                className="preset-pill"
                type="button"
                onClick={() => setConfig(preset.config)}
                title={preset.caption}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section className="stats-rack" aria-label="Storm diagnostics">
          <article className="glass-panel stat-chip">
            <span>Peak Wind</span>
            <strong>{diagnostics.peakWindKmh} km/h</strong>
          </article>
          <article className="glass-panel stat-chip">
            <span>Pressure Drop</span>
            <strong>{diagnostics.pressureDropHpa} hPa</strong>
          </article>
          <article className="glass-panel stat-chip">
            <span>Visible Column</span>
            <strong>{diagnostics.visibleColumnMeters} m</strong>
          </article>
          <article className="glass-panel stat-chip">
            <span>Core Diameter</span>
            <strong>{diagnostics.coreDiameterMeters} m</strong>
          </article>
        </section>
      </header>

      <section
        className={`glass-panel control-dock ${controlsOpen ? 'open' : 'closed'}`}
        aria-label="Physical controls"
      >
        <div className="dock-head">
          <div>
            <p className="eyebrow">Physical Variables</p>
            <h2>{activeGroupData.label}</h2>
            <p className="dock-caption">{activeGroupData.caption}</p>
          </div>
          <button
            className="toggle-button"
            type="button"
            onClick={() => setControlsOpen((open) => !open)}
          >
            {controlsOpen ? 'Hide' : 'Tune'}
          </button>
        </div>

        {controlsOpen ? (
          <>
            <div className="tab-row" role="tablist" aria-label="Control groups">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={`tab-button ${group.id === activeGroup ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveGroup(group.id)}
                >
                  {group.label}
                </button>
              ))}
            </div>

            <div className="control-grid">
              {visibleControls.map((slider) => (
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

            <div className="dock-meta">
              <span>{particles.toLocaleString()} tracers</span>
              <span>{footprint} m inflow belt</span>
              <span>{Math.round(config.translationSpeed * 3.6)} km/h motion</span>
            </div>
          </>
        ) : (
          <div className="dock-meta dock-meta-closed">
            <span>{Math.round(config.translationSpeed * 3.6)} km/h motion</span>
            <span>{Math.round(config.humidity * 100)}% humidity</span>
            <span>{particles.toLocaleString()} tracers</span>
          </div>
        )}
      </section>

      <footer className="footer-note">
        Drag to orbit, scroll to zoom, and use the tabs to tune structure, flow and
        atmosphere without covering the storm.
      </footer>
    </main>
  )
}

export default App
