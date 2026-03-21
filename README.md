# Flatland Evolution

A 2D cellular evolution game where you grow a creature from a single cell by engineering its internal processes. Consume food, manage waste, and build signal cascades that give your cell emergent behavior.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## How to Play

Your cell sits in a bounded world full of drifting food particles. It comes pre-equipped with an adhesion sensor and endocytosis module — food sticks to the membrane and gets absorbed automatically, granting energy.

Waste accumulates from background maintenance. Click the cell to open the engineering panel (right side) where you can spend energy to add modules:

- **Waste Sensor** — detects when waste exceeds a threshold you set
- **Waste Exocytosis** — pushes waste particles outward
- **Waste Adherence Modulator** — makes the membrane permeable to waste

Connect them with signal cascades so the cell flushes waste when it builds up.

The environment follows a light cycle (2-minute period) that affects food spawn rates. The indicator in the lower-left corner shows the current phase.

## Tech Stack

- TypeScript (strict mode)
- Vite
- Matter.js (physics)
- HTML5 Canvas 2D (custom renderer)

## Project Structure

```
src/
  main.ts                  # Entry point
  engine/                  # Game loop, physics, rendering, camera
  creature/                # Cell, cell properties, module system
  simulation/              # Food, environment, energy/waste, light cycle
  ui/                      # HUD, inspector, engineering panel, selection
```

## Build

```bash
npm run build    # Production build to dist/
npm run preview  # Preview production build
```
