# Flatland Evolution Game

## Project Overview
A 2D cellular evolution game where players grow a creature from a single cell by consuming food, managing resources, and engineering signal cascades. The environment is a "flatland" — everything is 2D shapes. Art style is lo-fi, thick lines, simple shapes that look emergent and cool when many parts work together.

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Build:** Vite
- **Physics:** Matter.js (soft body constraints, collision detection, world simulation)
- **Rendering:** HTML5 Canvas 2D (custom renderer on top of Matter.js — do NOT use Matter.Render)
- **Package Manager:** npm

## Project Structure
```
src/
  main.ts              # Entry point, control button wiring, spawn rate inputs
  engine/
    Game.ts            # GameState interface, initGame(), gameLoop(), HUD updates, autofeeder
    Physics.ts         # Matter.js world setup (zero gravity), wall boundaries
    Renderer.ts        # Canvas rendering — cells, food, modules, cascades, light indicator
    Camera.ts          # Viewport/camera (pan, zoom, follow)
  creature/
    Cell.ts            # Cell soft body (16 membrane particles + 16 edge bodies + center),
                       #   mitosis, resize, fingerprinting, stiffness
    CellProperties.ts  # Base properties: foodAdhesion, stiffness, baseRadius, growthScale
    Module.ts          # Module system: 13 subtypes, signal cascades (excitatory/inhibitory),
                       #   ModuleEffects, evaluation logic
  simulation/
    Food.ts            # FoodParticle: carb, protein, waste types. Sticking, sliding, removal
    Environment.ts     # Central update loop: food spawning, eye evaluation, module effects,
                       #   membrane interaction, endocytosis, cell forces, waste physics
    Energy.ts          # Internal particle system: EnergyState, particle physics, membrane
                       #   collision with adherence/repulsion/permeability, co-rotation
    LightCycle.ts      # Sinusoidal day/night cycle (2-min period)
  ui/
    HUD.ts             # Energy bar, resource displays
    EngineeringPanel.ts # Module purchase, config, signal cascade editor with
                       #   excitatory/inhibitory modes, membrane placement
    Selection.ts       # Click selection state, pending placement callback
index.html             # Layout: left panel (controls), canvas, right panel (inspector)
```

## Architecture Principles
- **ECS-lite:** Entities (cells, food) with composable properties. Data and behavior close but separable.
- **Simulation-first:** Physics and behavior over UI polish. The game IS the simulation.
- **Incremental complexity:** Layer mechanics one at a time.
- **Renderer is dumb:** Reads world state and draws. Never mutates game state.
- **Particles are truth:** Internal resource counters are reconciled from particle arrays each frame via `reconcileEnergy()`.
- **Edge bodies are the membrane:** Static rectangles between membrane particles, repositioned each frame. They handle food collision, cell-cell non-overlap, and food sliding/adherence.

## Physics & Collision System
- **Zero gravity** world (2000x1500 units)
- **Collision categories:** `0x0002` (membrane particles), `0x0004` (food), `0x0008` (edge bodies)
- **Collision groups:** Same-cell parts share negative group (`-cellId`) so they never collide. Cross-cell membrane-vs-edge collisions prevent cell overlap.
- **Edge body lifecycle:** Created in `createCell()`, repositioned in `updateCellEdgeBodies()` (called before `stepPhysics` each frame), cleaned up in `removeCell()`.

## Cell Membrane Mechanics
- 16 circle bodies connected by constraints (adjacent, diameter, radial)
- Edge bodies span between adjacent particles — continuous physical barrier
- Food hitting an edge with adherence slides to the nearest membrane particle node
- Internal particles hitting the membrane from inside follow the same adherence/slide/expel logic
- Internal particles co-rotate with membrane rotation (tracked via `lastMembraneAngle`)

## Module System
13 module subtypes across 3 categories (sensor, effector, modulator). All modules must be placed on a specific membrane node by the player.

### Signal Cascades
- **Excitatory:** sensor active → target activated
- **Inhibitory:** sensor active → target force-deactivated (overrides always-on modules)
- Inhibitory takes precedence over excitatory
- Many-to-one and one-to-many connections supported
- Cascades are cloned during mitosis (preserving mode)

## Key Patterns
- **Rolling window stats:** `ResourceEvent[]` arrays with `sumEvents()`/`pruneEvents()` for daily tracking
- **Spend tracking:** `spendLog` in Energy.ts auto-captures all `spendCarbs`/`spendProtein` calls
- **MembraneTypeConfig:** Per-type `{ push, adherent, repulsive, permeable }` controls internal particle membrane behavior
- **Sliding state:** Both `FoodParticle.slidingToward` (external) and `InternalParticle.slidingToVertex` (internal) track particles moving along membrane toward nodes

## Art / Rendering Style
- **Thick strokes** (3–5px) on all shapes
- **Soft, rounded ovoids** — smooth spline through membrane particle positions
- **No textures.** All flat fill + stroke
- **Black dots** on membrane anchor points
- **Module shapes:** Eye (almond + iris + pupil), foot (rotating circle with cilia), others (colored circles)
- **Cascade arcs:** Yellow arrows (excitatory), red flat bars (inhibitory)

## Conventions
- All distances in physics-world units (~1 unit = 1 pixel at default zoom)
- Resources are integers. Protein is the build currency. Carbs fuel maintenance.
- Use `requestAnimationFrame` for the game loop; pass `delta` for frame-rate independence
- `DAY_CYCLE_MS` (exported from Environment.ts) defines the in-game day length
- Food spawn rates are in food/day units
