# Flatland Evolution — Game Design Spec

## Concept
A 2D emergence game where the player evolves a creature from a single cell into a complex multicellular organism. The world is flat — everything is shapes on a plane. The player doesn't directly control movement; instead, they invest energy into evolving signal cascades, structural properties, and cell differentiation that cause the creature to *emerge* into something that can move, feed, and survive.

## World
- **Flatland environment:** A bounded 2D arena.
- **Food:** Small shapes (circles, triangles, polygons) that drift through the environment. Food is the sole source of energy.
- **Obstacles:** Sharp or angular shapes that damage cells on contact, disrupting membrane integrity.
- **Boundaries:** Walls at the edges of the world. The creature must navigate within them.

## The Creature

### Cells
The fundamental unit is a **cell** — a soft ovoid shape with a deformable membrane. Cells have properties:

| Property | Description |
|---|---|
| **Food Adhesion** (0–1) | How strongly food particles stick to the cell surface on contact. Default 1.0 for the starter cell. |
| **Signal Cascades** | Ordered rules that fire when conditions are met (e.g., "food attached → begin endocytosis"). |
| **Surface Markers** | Tags that allow cells to recognize "self" vs. "non-self" — required for multicellular adhesion. |
| **Wheel** | A special motility property. Cells with Wheel can convert energy into directional force, propelling the organism. |
| **Structural Stiffness** | How rigidly this cell holds its shape and position relative to neighbors. |

### Starting State
- **1 cell**, centered in the world
- Food Adhesion: 1.0
- One signal cascade: `food_contact → endocytosis`
- No surface markers, no wheel, no neighbors

### Endocytosis (Food Absorption)
When a food particle contacts a cell with Food Adhesion > 0:
1. The particle **sticks** to the cell membrane (visually attached, physically constrained).
2. After a short delay, the particle is **absorbed**: the food shape merges into the cell, the cell's area grows proportionally, and the creature gains **energy points**.

### Energy
- Energy is the universal currency.
- Gained by absorbing food.
- Spent on evolution (adding cascades, properties, new cells).
- Passively spent on locomotion (Wheel costs energy per tick when active).
- If energy reaches 0, the creature becomes inert (no active processes, but adhesion still works passively).

## Evolution System
The player spends energy to evolve the creature. Evolution options (unlocked progressively):

### Tier 1 — Single Cell
- **New Signal Cascade:** Add a new trigger→action rule to the current cell.
- **Mitosis:** The cell divides into two connected cells. Costs significant energy. Both daughter cells inherit base properties.

### Tier 2 — Multicellular
- **Surface Markers:** Express markers so cells can distinguish self from non-self. Required for stable multicellular structures.
- **Cell Differentiation:** Assign a daughter cell a specialized role (e.g., high adhesion feeder, wheel-bearing motor cell, structural scaffold).
- **Inter-cell Signaling:** Connect cascades across cells — one cell's event triggers another cell's action.

### Tier 3 — Locomotion & Behavior
- **Wheel Expression:** Grant a cell the Wheel property for directional thrust.
- **Chemotaxis Cascade:** A signal cascade where cells detect nearby food concentration and bias Wheel direction toward it.
- **Contraction:** Cells can rhythmically contract, pulling neighbors — enabling peristaltic or crawling movement.

*(Tiers are a design guide, not a hard gate. The system should be composable enough that clever cascade combinations produce emergent behavior the designer didn't explicitly program.)*

## Movement Model
The creature does **not** have direct player-controlled movement. Instead, movement emerges from:
1. **Wheel cells** converting energy into force vectors.
2. **Attraction/repulsion** between cells (adjustable via signal cascades).
3. **Contraction** cycles pulling the body forward.
4. **Environmental forces** — food adhesion can drag a cell toward stuck particles, obstacles push cells away.

The player's job is to build a body and signaling network that produces useful locomotion as an emergent property.

## Visual Style
- **Lo-fi, thick lines** (3–5px stroke on all shapes)
- **Flat color fills**, no textures or gradients
- **Soft, blobby shapes** — cell membranes flex and deform subtly under physics
- **Organic palette:** Warm tones (amber, coral, sage) for the creature. Bright contrasts (cyan, magenta, lime) for food. Dark muted tones for obstacles.
- **Satisfying at scale:** A single cell looks simple. A 20-cell organism with differentiated parts, flexing and crawling, should look alive and emergent.

## Phase 1 Scope (MVP)
Build only this much first:
1. A bounded world rendered on Canvas.
2. One soft-body ovoid cell with thick-stroke rendering.
3. Food particles that spawn and drift.
4. Food adhesion: particles stick to the cell on contact.
5. Endocytosis: stuck food is absorbed after a delay, cell grows, energy increments.
6. A simple HUD showing energy count.

No evolution menu, no mitosis, no locomotion. Just the core loop of a cell sitting in a soup, catching food, and growing. Get this feeling good before adding anything else.
