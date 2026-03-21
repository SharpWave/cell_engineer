# Flatland Evolution Game

## Project Overview
A 2D cellular evolution game where players grow a creature from a single cell by consuming food, gaining energy, and evolving new capabilities. The environment is a "flatland" — everything is 2D shapes. Art style is lo-fi, thick lines, simple shapes that look emergent and cool when many parts work together.

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Build:** Vite
- **Physics:** Matter.js (soft body constraints, collision detection, world simulation)
- **Rendering:** HTML5 Canvas 2D (custom renderer on top of Matter.js — do NOT use Matter.Render)
- **Package Manager:** npm

## Project Structure
```
src/
  main.ts              # Entry point, game loop setup
  engine/
    Game.ts            # Top-level game state, loop orchestration
    Physics.ts         # Matter.js world setup, physics config
    Renderer.ts        # Canvas rendering — thick lines, lo-fi style
    Camera.ts          # Viewport/camera (pan, zoom around creature)
  creature/
    Cell.ts            # Single cell body — ovoid soft body, properties
    Creature.ts        # Aggregate of cells — manages multi-cell body
    CellProperties.ts  # Adhesion, wheel, surface markers, etc.
  simulation/
    Food.ts            # Food particles — shapes, nutrients, behavior
    Environment.ts     # World boundaries, obstacles, food spawning
    Energy.ts          # Energy accounting system
  evolution/
    SignalCascade.ts   # Signal cascade logic elements
    EvolutionMenu.ts   # Player-facing evolution/spending UI
  ui/
    HUD.ts             # Energy display, creature stats
    Overlay.ts         # Menus, evolution tree
index.html
```

## Architecture Principles
- **ECS-lite:** Not a full ECS, but think in terms of entities (cells, food, obstacles) with composable properties. Keep data and behavior close but separable.
- **Simulation-first:** Get the physics and behavior feeling right before worrying about UI polish. The game IS the simulation.
- **Incremental complexity:** Start with one cell that passively absorbs food. Layer on mechanics one at a time. Never build two systems at once.
- **Renderer is dumb:** The renderer reads world state and draws. It never mutates game state. All visual style (thick strokes, color, glow) lives in Renderer.ts.

## Art / Rendering Style
- **Thick strokes** (3–5px) on all shapes
- **Soft, rounded ovoids** — use Matter.js soft body constraints or bezier approximations for cell membranes
- **Color palette:** Muted background, cells in warm organic tones, food in bright contrasting colors, obstacles in dark/sharp tones
- **No textures.** All flat fill + stroke. Personality comes from shape, motion, and deformation.
- **Flexy look:** Cell membranes should subtly deform under physics. Use composite Matter.js bodies with soft constraints, then render a smooth curve (catmull-rom or bezier) through the constituent vertices rather than drawing each rigid sub-shape.

## Physics Notes
- Use `Matter.Body.create()` with `chamfer` for rounded shapes
- For soft ovoids: create a ring of small circle bodies connected by `Matter.Constraint` with `stiffness: 0.2–0.4` and render a smooth spline through them
- Food particles: simple small bodies with custom `label` and collision category
- Use collision events (`Events.on(engine, 'collisionStart', ...)`) for food adhesion and endocytosis
- Boundary walls: static rectangle bodies at world edges

## Conventions
- All distances in physics-world units (roughly 1 unit = 1 pixel at default zoom)
- Energy is an integer. Food grants energy. Evolution costs energy.
- Each cell tracks its own properties in a `CellProperties` object
- Signal cascades are stored as a simple rule list: `{ trigger, condition, action }`
- Use `requestAnimationFrame` for the game loop; call `Matter.Engine.update()` each frame
- Keep frame-rate-independent by passing `delta` from the game loop

## Current Phase: Phase 1 — Single Cell + Food
Goal: Get a single flexy ovoid cell on screen in a bounded world with floating food particles. Food drifts around. When food touches the cell, it sticks (adhesion). After a short delay, food is absorbed (endocytosis), the cell grows slightly, and energy is added.

### Phase 1 acceptance criteria
- [ ] Canvas fills browser window, dark muted background
- [ ] One soft-body ovoid cell rendered with thick stroke, centered
- [ ] Food particles (small circles/triangles) spawn at random positions and drift slowly
- [ ] Food that contacts the cell visually sticks to the membrane
- [ ] After ~1 second of sticking, food is absorbed: particle disappears, cell grows slightly, energy counter increments
- [ ] Simple HUD showing current energy
- [ ] World boundaries — cell and food bounce off edges
