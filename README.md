# Flatland Evolution

A 2D cellular evolution game where you grow a creature from a single cell by engineering its internal processes. Design signal cascades, manage resources, and evolve emergent behavior.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## How to Play

Your cell starts in a bounded world with drifting food particles (gold carbs, blue protein). It comes pre-equipped with adhesion and endocytosis modules — food sticks to the membrane and gets absorbed automatically.

**Core loop:** Absorb food → gain resources → spend protein to build modules → connect modules with signal cascades → create emergent behavior.

### Resources
- **Carbs** (gold) — consumed by maintenance. If you run out, modules start dying.
- **Protein** (blue) — spent to build modules, grow the membrane, and replicate during mitosis.
- **Waste** (brown) — byproduct of maintenance. Must be exocytosed or it accumulates.

### Building Modules
Click a cell to open the engineering panel. Spend protein to add modules — each must be placed on a specific membrane node. Available modules include:

- **Sensors:** Internal sensor, membrane sensor, light sensor, membrane length sensor, eye (directional FOV)
- **Effectors:** Membrane transporter (endo/exo), mitosis, growth/reduction, foot (thrust), shaker
- **Modulators:** Adherence module (stick/repel per resource type), rigidity, flexibility

### Signal Cascades
Connect sensors to effectors with excitatory (→) or inhibitory (⊣) links. Examples:
- Membrane sensor (external carbs > 0) → Carb transporter (endo) = auto-absorb food
- Internal sensor (waste > 5) → Waste transporter (exo) = auto-flush waste
- Membrane length sensor (length ≥ 2) ⊣ Growth module = stop growing at size 2
- Eye (sees carb) → Foot = move toward food

Inhibitory links take precedence — if any active inhibitor targets an effector, it stays off regardless of excitatory inputs.

### Mitosis
Build a mitosis module and connect it to a sensor trigger. The cell divides over 3 seconds, cloning all modules and cascades to the daughter cell. Costs protein equal to the total module set.

### Controls
- **Scroll wheel:** Zoom
- **Middle-click drag:** Pan camera
- **Left panel:** Food spawn rates, autofeeder, daily stats, simulation controls
- **Right panel:** Inspector and engineering panel for selected cell

## Tech Stack

- TypeScript (strict mode)
- Vite
- Matter.js (soft body physics, collision detection)
- HTML5 Canvas 2D (custom renderer)

## Project Structure

```
src/
  main.ts                  # Entry point, control wiring
  engine/
    Game.ts                # Game state, loop orchestration, HUD updates
    Physics.ts             # Matter.js world setup
    Renderer.ts            # Canvas rendering (cells, food, modules, cascades)
    Camera.ts              # Viewport pan/zoom
  creature/
    Cell.ts                # Cell body (16-point soft body + edge bodies), mitosis
    CellProperties.ts      # Base cell properties (adhesion, stiffness, radius)
    Module.ts              # Module system, signal cascades, effects
  simulation/
    Food.ts                # Food particles (carb, protein, waste)
    Environment.ts         # World update, spawning, collisions, endocytosis
    Energy.ts              # Internal particle system, membrane interaction
    LightCycle.ts          # Sinusoidal day/night cycle
  ui/
    HUD.ts                 # Energy display, stats
    EngineeringPanel.ts    # Module building and cascade editor UI
    Selection.ts           # Click selection state
index.html
```

## Build

```bash
npm run build    # Production build to dist/
npm run preview  # Preview production build
```
