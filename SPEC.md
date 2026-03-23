# Flatland Evolution — Game Design Spec

## Concept
A 2D emergence game where the player evolves a creature from a single cell into a complex multicellular organism. The world is flat — everything is shapes on a plane. The player doesn't directly control movement; instead, they invest energy into evolving signal cascades, structural properties, and cell differentiation that cause the creature to *emerge* into something that can move, feed, and survive.

## World
- **Flatland environment:** A bounded 2D arena (2000x1500 units).
- **Food:** Small shapes (circles, triangles) that drift through the environment. Two resource types: carbs (gold) and protein (blue).
- **Waste:** Heavy brown particles expelled by cells. 10x mass of normal food. Waste particles attract each other, forming obstacle clusters.
- **Boundaries:** Static rectangle bodies at world edges. Cells and food bounce off them.
- **Light cycle:** Sinusoidal day/night cycle (2-minute period) affecting food spawn rates.

## The Cell

### Physical Structure
A cell is a **soft-body ovoid** made of 16 circle bodies (membrane particles) connected by Matter.js constraints. Between each pair of adjacent particles, a static **edge body** forms a continuous physical barrier — the membrane.

| Component | Description |
|---|---|
| **Membrane particles** (16) | Dynamic circle bodies forming the cell boundary. Serve as anchor points for modules and endocytosis sites. |
| **Edge bodies** (16) | Thin static rectangles between adjacent membrane particles. Repositioned each frame. Provide continuous collision barrier for food and other cells. |
| **Center body** | Tracks the cell's center of mass. Connected to all membrane particles by radial constraints. |
| **Internal particles** | Visual particles representing carbs, protein, and waste inside the cell. Move in cell-local coordinates and co-rotate with the membrane. |

### Collision System
Uses Matter.js collision categories with negative group IDs for same-cell exclusion:
- `0x0002` — Membrane particles (dynamic)
- `0x0004` — Food particles (dynamic)
- `0x0008` — Edge bodies (static, repositioned per frame)

Same-cell bodies share a negative group (`-cellId`) so they never collide with each other. Cross-cell membrane particles and edge bodies collide, preventing membrane overlap.

### Starting State
- 1 cell, centered in the world
- 20 carbs, 50 protein
- Pre-built modules: carb intake chain (node 12), protein intake chain (node 4), growth module (node 8)
- Pre-built cascades: carb sensor → carb transporter, protein sensor → protein transporter

## Resource System

### Internal Particles
Resources exist as discrete particles inside the cell, tracked in cell-local coordinates:
- **Carbs** (gold) — primary energy source, consumed by maintenance
- **Protein** (blue) — used for building modules and membrane growth
- **Waste** (brown) — byproduct of maintenance, must be exocytosed

The `EnergyState` counters are reconciled from particle counts each frame (particles are the source of truth).

### Membrane Interaction
Internal particles interact with the membrane based on module-driven configuration per type:
- **Adherent:** Particle sticks to the internal membrane edge and slides along it toward the nearest membrane node (vertex).
- **Permeable:** At a node, the particle is expelled (exocytosed) and spawns as an external food/waste particle.
- **Repulsive:** Strong bounce off the membrane.
- **Neutral:** Normal bounce (default).

This system is general — it works identically for waste, carb, and protein exocytosis.

### External Food Interaction
When food hits the cell membrane (edge body or particle node):
- **Adherence module active:** Food sticks to the edge and slides toward the nearest membrane node. At the node, it enters the endocytosis flow (absorbed after a delay if an endo transporter is active).
- **Repulsion module active:** Food bounces off.
- **No module:** Food bounces off normally.

## Module System

### Module Types
All modules are placed on specific membrane nodes by the player.

| Module | Category | Cost | Description |
|---|---|---|---|
| **Membrane Transporter** | Effector | 5P | Moves resources across the membrane (endo or exo, per resource type) |
| **Internal Sensor** | Sensor | 5P | Fires when internal resource count crosses a threshold |
| **Membrane Sensor** | Sensor | 5P | Fires when adhered particle count (internal or external) crosses a threshold |
| **Adherence Module** | Modulator | 5P | Controls whether a resource type sticks to or is repelled by a membrane side |
| **Light Sensor** | Sensor | 3P | Fires when ambient light exceeds a threshold |
| **Membrane Length Sensor** | Sensor | 4P | Fires when membrane growthScale crosses a threshold |
| **Mitosis** | Effector | 10P | Triggers cell division when activated |
| **Rigidity** | Modulator | 3P | Increases membrane constraint stiffness |
| **Flexibility** | Modulator | 3P | Decreases membrane constraint stiffness |
| **Shaker** | Effector | 5P | Applies random forces to membrane particles |
| **Growth/Reduction** | Effector | 5P | Grows or shrinks the cell membrane |
| **Eye** | Sensor | 8P | Detects food/cells within a directional FOV cone (300 unit range) |
| **Foot** | Effector | 8P | Applies directional thrust from the membrane point |

### Signal Cascades
Cascades connect sensors to effectors/modulators with two link types:
- **Excitatory** (→): If the source sensor is active, the target is activated.
- **Inhibitory** (⊣): If the source sensor is active, the target is force-deactivated. Inhibitory links take precedence over excitatory ones.

Multiple sensors can drive the same effector (OR logic for excitation). One sensor can drive multiple effectors. This allows designs like multiple eyes driving one foot, or a length sensor inhibiting growth.

### Sugar Fingerprints
Each cell has a fingerprint derived from its module set. Cells compare fingerprints to determine self/non-self similarity, which gates cell-cell adhesion behavior.

## Mitosis
When triggered, a cell divides over 3 seconds:
1. Protein cost = sum of all module costs (to replicate the module set)
2. Internal particles are split by type (half each)
3. Both cells get half the membrane scale
4. Modules and cascades (including inhibitory/excitatory modes) are cloned to the daughter
5. Both cells enter a 30-second cooldown

## Visual Style
- **Thick strokes** (3–5px) on all shapes
- **Flat color fills**, no textures or gradients
- **Soft, blobby shapes** — cell membranes deform under physics, rendered as smooth splines
- **Black dots** on all 16 membrane anchor points
- **Module shapes:** Eyes drawn as almond shapes with iris/pupil. Feet drawn as rotating circles with cilia spokes. Other modules as colored circles.
- **Stacking:** Multiple modules on the same node stack outward from the membrane
- **FOV cones** drawn for active eye modules
- **Cascade arcs** drawn outside the cell: yellow arrows for excitatory, red bars for inhibitory
- **Toggleable:** "Hide Modules" checkbox hides all module graphics and cascade arcs

## Controls

### Left Panel
- Resource counts (carbs, protein, waste, cells, growth)
- Food spawn rate inputs (carbs/day, protein/day, stationary protein/day)
- Manual spawn buttons (+1 each)
- Autofeeder toggle with multiplier (matches spawn rates to consumption)
- Daily rolling stats (spawned, consumed, produced over last in-game day)
- Pause, Restart (with confirmation), Focus Next Cell
- Hide Modules toggle

### Right Panel
- Inspector: shows details of selected cell or food particle
- Engineering Panel (when cell selected): module list, add module UI, signal cascade editor

### Camera
- Scroll wheel to zoom (0.3x–3x)
- Middle-click drag to pan
- Auto-follows focused cell with smooth lerp
