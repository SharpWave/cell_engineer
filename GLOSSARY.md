# Game Glossary

## World & Environment

- **Environment / World**: The 4000x3000 unit 2D space where everything exists
- **Extracellular**: Outside any cell membrane, in the open environment
- **Intracellular / Internal**: Inside a cell's membrane

## Cell Structure

- **Cell**: A soft-body organism made of 16 membrane particles, edge bodies, a center body, and internal particles
- **Membrane**: The outer boundary of a cell — 16 circle bodies connected by constraints forming an ovoid spline
- **Membrane particle / Membrane node**: One of the 16 physics bodies that make up the membrane ring (indexed 0–15)
- **Edge body**: Static rectangle between two adjacent membrane particles — forms the continuous collision barrier
- **Center body**: Invisible physics body at the cell's center, connected to all membrane particles by radial constraints
- **Membrane index**: The integer 0–15 identifying a position on the membrane where modules are placed

## Internal Particles (Intracellular)

- **Internal particle**: A simulated particle inside the cell representing one unit of a resource (carb, protein, or waste)
- **Carb (internal)**: Green internal particle — fuel for maintenance and locomotion
- **Protein (internal)**: Blue internal particle — build currency for modules, growth, and mitosis
- **Waste (internal)**: Brown internal particle — metabolic byproduct, generally unwanted inside the cell

## Extracellular Food

- **Food particle**: Any resource floating in the environment (carb, protein, or waste)
- **Carb food**: Green extracellular food — spawned by the autofeeder/spawner, sticks to membrane, gets endocytosed
- **Protein food**: Blue extracellular food — can be moving or stationary
- **Stationary protein**: Protein food that doesn't drift — cells must navigate to it
- **Waste particle (extracellular)**: Brown heavy particle expelled from cells — attracts other waste, merges over time into larger clumps
- **Stuck / Adhered**: A food particle attached to a cell's membrane via a constraint
- **Sliding**: A food particle moving along a membrane edge toward the nearest membrane node
- **Absorbed / Endocytosed**: A food particle that has been taken inside the cell

## Modules (13 subtypes)

- **Module**: A functional unit placed on a specific membrane node — has a subtype, config, and active/idle state

### Sensors (detect conditions, can trigger cascades)
- **Internal sensor**: Detects internal resource levels (carb/protein/waste above/below threshold)
- **Membrane sensor**: Detects what's adhered to the membrane (carb/protein/waste/cell, internal or external side)
- **Light sensor**: Detects ambient light level (day/night cycle)
- **Eye**: Directional sensor — detects food/cells within a field of view from its membrane position
- **Membrane length sensor**: Detects cell size (growthScale above/below threshold)

### Effectors (do things when active)
- **Membrane transporter**: Moves resources across the membrane (endo = in, exo = out) for a specific resource type
- **Mitosis module**: When active, initiates cell division (gradual protein spending to build module copies, then divides)
- **Foot**: Propels the cell in the direction of its membrane node — costs carbs to run (1 per 4 seconds)

### Modulators (modify cell properties when active)
- **Adherence module**: Controls membrane stickiness for a specific target (carb/protein/waste/cell, internal/external, adherence/repulsion)
- **Rigidity mod**: Increases membrane stiffness when active
- **Flexibility mod**: Decreases membrane stiffness when active
- **Shaker**: Randomly jiggles all membrane particles for random-walk movement — costs carbs to run (1 per 4 seconds)
- **Growth mod**: Spends protein to increase cell size (grow mode) or shrinks cell to release protein (reduce mode)

## Signal Cascades

- **Cascade / Signal cascade**: A connection from a sensor module to a target module
- **Excitatory cascade**: Sensor active → target activated
- **Inhibitory cascade**: Sensor active → target force-deactivated (overrides excitatory)

## Mitosis

- **Mitosis**: Cell division — the cell gradually builds copies of all its modules (spending protein), then physically splits into two half-size daughter cells
- **Module building phase**: The period during mitosis where protein is spent one at a time to replicate each module
- **Division animation**: The 3-second pinch-and-split visual that plays after all modules are built
- **Cooldown**: 30-second period after mitosis during which neither parent nor daughter can divide again
- **Daughter cell**: The newly created cell from mitosis — gets cloned modules, cascades, and half the parent's resources

## Cell Properties

- **growthScale**: Multiplier on the cell's base radius (starts at 1.0, grows/shrinks with growth modules, halved on mitosis)
- **baseRadius**: Base membrane radius before growth scaling (default 50)
- **stiffness**: How rigid the membrane constraints are (default 0.3)
- **foodAdhesion**: How strongly food sticks to the membrane (0–1, default 1.0)
- **Fingerprint**: Sorted list of module identity keys — used for matching/comparing cells

## Economy

- **Maintenance**: Ongoing carb cost — 1 carb per module per day cycle (120s). Failure to pay does NOT destroy modules.
- **Locomotion fuel**: Carb cost for active feet and shakers — 1 carb per 4 seconds per active locomotor. No carbs = no movement.
- **Module cost**: Protein cost to purchase/build a module (defined in MODULE_CATALOG per subtype)

## UI

- **Left panel**: Controls, resource displays, food spawning, autofeeders, active stats, daily stats, simulation controls, cell library
- **Right panel / Inspector**: Shows details of the selected cell or food particle, engineering panel for module management
- **Engineering panel**: Module list, cascade editor, module purchase UI — appears in the inspector when a cell is selected
- **Cell library**: Save/load cell blueprints as .cell.json files

## Light Cycle

- **Day/night cycle**: Sinusoidal light level oscillation with a 2-minute period (DAY_CYCLE_MS = 120,000ms)
- **Light level**: 0–1 value representing current brightness — detected by light sensors
