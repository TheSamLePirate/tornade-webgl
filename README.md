# Tornado Lab V3

Real-time WebGL tornado simulator built with Bun, Vite, React, TypeScript, and Three.js.

This app focuses on a physically inspired tornado model with a compact HUD, live diagnostics, orbit camera controls, and a dedicated look pipeline for cloud, dust, haze, sunlight, and exposure tuning.

## Features

- Real-time tornado simulation with swirl, inflow, updraft, turbulence, storm motion, and surface roughness controls
- Compact docked UI designed to keep the storm visible while tuning it
- Four control groups: `Core`, `Flow`, `Air`, and `Look`
- Presets for different storm profiles: `Supercell`, `Violent`, `Wedge`, and `Ghost Rope`
- Live diagnostics for `Peak Wind`, `Pressure Drop`, `Visible Column`, and `Core Diameter`
- Layered visual rendering with particle tracers, condensation, dust skirt, wall cloud, and atmospheric fog
- Orbit and zoom camera navigation for inspecting the funnel from any angle

## Tech Stack

- `bun`
- `vite`
- `react`
- `typescript`
- `three`

## Getting Started

```bash
bun install
bun dev
```

Open the local Vite URL shown in the terminal, typically [http://localhost:5173](http://localhost:5173).

## Available Scripts

```bash
bun dev
bun run build
bun run preview
bun run lint
```

## Control Overview

### Core

Controls the main structure of the tornado:

- `Intensity`
- `Base radius`
- `Column height`
- `Core radius`

### Flow

Controls rotation, lift, and storm motion:

- `Swirl ratio`
- `Core updraft`
- `Storm motion`
- `Shear turbulence`

### Air

Controls the surrounding environment and tracer behavior:

- `Humidity`
- `Surface roughness`
- `Tracer density`

### Look

Controls the visible atmosphere and art direction:

- `Cloud density`
- `Dust amount`
- `Wall cloud`
- `Atmospheric haze`
- `Sunlight`
- `Exposure`

## Interaction

- Drag to orbit around the tornado
- Scroll to zoom
- Use the bottom-right dock to switch control tabs and tune the storm
- Use the top-left preset pills to jump between storm archetypes
- Use `Reset` to return to the default balanced supercell setup

## Project Structure

- [src/App.tsx](/Users/olivierveinand/Documents/DEV/tornade-webgl/src/App.tsx): compact HUD, presets, diagnostics, and control groups
- [src/components/TornadoViewport.tsx](/Users/olivierveinand/Documents/DEV/tornade-webgl/src/components/TornadoViewport.tsx): Three.js scene, lighting, fog, ground, wall cloud, volumetric layers, and camera controls
- [src/lib/tornado-sim.ts](/Users/olivierveinand/Documents/DEV/tornade-webgl/src/lib/tornado-sim.ts): tornado physics, diagnostics, particle simulation, and shader-driven rendering
- [src/App.css](/Users/olivierveinand/Documents/DEV/tornade-webgl/src/App.css): compact HUD styling and responsive layout

## Notes

- This is a real-time browser simulation, not a full CFD solver
- The physics are designed to feel credible and controllable in interactive WebGL
- Visual controls affect both the scene and the particle shader, so extreme values should visibly change the storm

