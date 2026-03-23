import Matter from 'matter-js';
import { CellProperties, defaultCellProperties } from './CellProperties';
import { CellModule, SignalCascade, MODULE_CATALOG, createModule, createCascade, getModuleFingerprintKey } from './Module';
import { EnergyState, InternalParticle, createEnergyState, addCarbs, addProtein, spendProtein, reconcileEnergy } from '../simulation/Energy';

const MEMBRANE_POINTS = 16;
const COLLISION_CATEGORY = 0x0002;
/** Edge bodies between membrane particles — only collide with food */
const EDGE_COLLISION_CATEGORY = 0x0008;
const FOOD_COLLISION_CATEGORY = 0x0004;
const EDGE_THICKNESS = 6;

export interface Cell {
  id: number;
  properties: CellProperties;
  membraneParticles: Matter.Body[];
  edgeBodies: Matter.Body[];
  constraints: Matter.Constraint[];
  center: Matter.Body;
  modules: CellModule[];
  cascades: SignalCascade[];
  energy: EnergyState;
  /** Sugar fingerprint — sorted list of module identity keys for matching */
  fingerprint: string[];
  /** IDs of cells currently touching this cell's membrane */
  touchingCells: Set<number>;
  /** Mitosis state: null = idle, object = in progress */
  mitosisState: MitosisState | null;
  /** Timestamp after which mitosis is allowed again (cooldown) */
  mitosisCooldownUntil: number;
  /** Timestamp of last maintenance carb consumption (for membrane flash) */
  lastMaintenanceTick: number;
  /** Accumulates fractional growth ticks (protein → membrane) */
  growthAccumulator: number;
}

export interface MitosisState {
  startTime: number;
  progress: number;
  duration: number;
  axis: number;
}

const MITOSIS_DURATION = 3000;
/** Cooldown after mitosis: quarter day cycle (day = light cycle period, default 2 min) */
const MITOSIS_COOLDOWN_MS = 30_000;

let nextCellId = 1;

export function createCell(
  world: Matter.World,
  x: number,
  y: number,
  props?: Partial<CellProperties>,
  cloneModules?: CellModule[],
  cloneCascades?: SignalCascade[],
  cloneEnergy?: EnergyState,
): Cell {
  const id = nextCellId++;
  const properties: CellProperties = { ...defaultCellProperties(), ...props };
  const r = properties.baseRadius * properties.growthScale;
  const particleRadius = 6;

  const membraneParticles: Matter.Body[] = [];
  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    const angle = (i / MEMBRANE_POINTS) * Math.PI * 2;
    const px = x + Math.cos(angle) * r * 1.2;
    const py = y + Math.sin(angle) * r * 0.85;

    const particle = Matter.Bodies.circle(px, py, particleRadius, {
      label: 'cell_membrane',
      collisionFilter: { category: COLLISION_CATEGORY, mask: 0xFFFF, group: -id },
      frictionAir: 0.04,
      restitution: 0.6,
      friction: 0.1,
    });
    // Tag body with cell ID for collision detection
    (particle as any).cellId = id;
    membraneParticles.push(particle);
  }

  const center = Matter.Bodies.circle(x, y, 3, {
    label: 'cell_center',
    collisionFilter: { category: COLLISION_CATEGORY, mask: 0x0000 },
    frictionAir: 0.06,
  });
  (center as any).cellId = id;

  const constraints: Matter.Constraint[] = [];

  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    const next = (i + 1) % MEMBRANE_POINTS;
    constraints.push(
      Matter.Constraint.create({
        bodyA: membraneParticles[i],
        bodyB: membraneParticles[next],
        stiffness: properties.stiffness,
        damping: 0.1,
        render: { visible: false },
      }),
    );
  }

  for (let i = 0; i < MEMBRANE_POINTS / 2; i++) {
    const opposite = i + MEMBRANE_POINTS / 2;
    constraints.push(
      Matter.Constraint.create({
        bodyA: membraneParticles[i],
        bodyB: membraneParticles[opposite],
        stiffness: properties.stiffness * 0.3,
        damping: 0.1,
        render: { visible: false },
      }),
    );
  }

  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    constraints.push(
      Matter.Constraint.create({
        bodyA: center,
        bodyB: membraneParticles[i],
        stiffness: properties.stiffness * 0.5,
        damping: 0.1,
        render: { visible: false },
      }),
    );
  }

  // Create edge bodies between adjacent membrane particles (continuous barrier for food)
  const edgeBodies: Matter.Body[] = [];
  for (let i = 0; i < MEMBRANE_POINTS; i++) {
    const next = (i + 1) % MEMBRANE_POINTS;
    const p1 = membraneParticles[i];
    const p2 = membraneParticles[next];
    const mx = (p1.position.x + p2.position.x) / 2;
    const my = (p1.position.y + p2.position.y) / 2;
    const dx = p2.position.x - p1.position.x;
    const dy = p2.position.y - p1.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const edge = Matter.Bodies.rectangle(mx, my, Math.max(len, 1), EDGE_THICKNESS, {
      isStatic: true,
      angle,
      label: 'membrane_edge',
      collisionFilter: {
        category: EDGE_COLLISION_CATEGORY,
        mask: FOOD_COLLISION_CATEGORY | COLLISION_CATEGORY, // collide with food + other cells' membranes
        group: -id, // same-cell parts never collide with each other
      },
      restitution: 0.6,
      friction: 0.1,
    });
    (edge as any).cellId = id;
    (edge as any).edgeIndex = i;
    edgeBodies.push(edge);
  }

  Matter.Composite.add(world, [...membraneParticles, ...edgeBodies, center, ...constraints]);

  let modules: CellModule[];
  let cascades: SignalCascade[];

  if (cloneModules && cloneCascades) {
    const idMap = new Map<string, string>();
    modules = cloneModules.map(m => {
      const newMod = createModule(m.subtype, m.membraneIndex);
      newMod.config = { ...m.config };
      idMap.set(m.id, newMod.id);
      return newMod;
    });
    cascades = cloneCascades.map(c => {
      const fromId = idMap.get(c.fromId) ?? c.fromId;
      const toId = idMap.get(c.toId) ?? c.toId;
      return createCascade(fromId, toId);
    });
  } else {
    // Starter: carb intake chain + protein intake chain + growth
    const carbAdhere = createModule('adherence_module', 0, {
      adherenceSide: 'external', adherenceTarget: 'carb', adherenceMode: 'adherence',
    });
    const carbSensor = createModule('membrane_sensor', 1, {
      membraneSide: 'external', senseTarget: 'carb', threshold: 1, mode: 'above',
    });
    const carbTransport = createModule('membrane_transporter', 2, {
      resourceType: 'carb', direction: 'endo',
    });
    const proteinAdhere = createModule('adherence_module', 8, {
      adherenceSide: 'external', adherenceTarget: 'protein', adherenceMode: 'adherence',
    });
    const proteinSensor = createModule('membrane_sensor', 9, {
      membraneSide: 'external', senseTarget: 'protein', threshold: 1, mode: 'above',
    });
    const proteinTransport = createModule('membrane_transporter', 10, {
      resourceType: 'protein', direction: 'endo',
    });
    const growth = createModule('growth_mod', 3, { growthMode: 'grow' });
    const carbCascade = createCascade(carbSensor.id, carbTransport.id);
    const proteinCascade = createCascade(proteinSensor.id, proteinTransport.id);
    modules = [carbAdhere, carbSensor, carbTransport, proteinAdhere, proteinSensor, proteinTransport, growth];
    cascades = [carbCascade, proteinCascade];
  }

  let energy: EnergyState;
  if (cloneEnergy) {
    energy = { ...cloneEnergy, particles: [...cloneEnergy.particles] };
  } else {
    energy = createEnergyState();
    addCarbs(energy, 20);
    addProtein(energy, 50);
  }

  const cell: Cell = {
    id,
    properties,
    membraneParticles,
    edgeBodies,
    constraints,
    center,
    modules,
    cascades,
    energy,
    fingerprint: [],
    touchingCells: new Set(),
    mitosisState: null,
    mitosisCooldownUntil: 0,
    lastMaintenanceTick: 0,
    growthAccumulator: 0,
  };

  updateFingerprint(cell);

  return cell;
}

/** Update the sugar fingerprint based on current modules */
export function updateFingerprint(cell: Cell): void {
  cell.fingerprint = cell.modules.map(m => getModuleFingerprintKey(m)).sort();
}

/** Compare fingerprints — intersection length / self fingerprint length (0..1) */
export function fingerprintSimilarity(self: Cell, other: Cell): number {
  if (self.fingerprint.length === 0) return 0;
  const otherSet = new Set(other.fingerprint);
  let overlap = 0;
  for (const s of self.fingerprint) {
    if (otherSet.has(s)) overlap++;
  }
  return overlap / self.fingerprint.length;
}

/** Protein cost to replicate a cell's full module set */
export function mitosisProteinCost(cell: Cell): number {
  return cell.modules.reduce((sum, m) => sum + MODULE_CATALOG[m.subtype].cost, 0);
}

/** Begin the mitosis process on a cell (checks cooldown + protein) */
export function startMitosis(cell: Cell, now: number): void {
  if (cell.mitosisState) return;
  if (now < cell.mitosisCooldownUntil) return;
  const cost = mitosisProteinCost(cell);
  if (cell.energy.protein < cost) return; // Not enough protein to replicate modules
  cell.mitosisState = {
    startTime: now,
    progress: 0,
    duration: MITOSIS_DURATION,
    axis: Math.random() * Math.PI,
  };
}

/** Update mitosis animation. Returns true when division is complete. */
export function updateMitosis(cell: Cell, now: number): boolean {
  if (!cell.mitosisState) return false;
  cell.mitosisState.progress = Math.min(1, (now - cell.mitosisState.startTime) / cell.mitosisState.duration);
  return cell.mitosisState.progress >= 1;
}

/** Complete mitosis — creates a daughter cell and returns it */
export function completeMitosis(cell: Cell, world: Matter.World): Cell {
  const center = getCellCenter(cell);
  const offset = 80;
  const axis = cell.mitosisState?.axis ?? 0;

  const dx = Math.cos(axis) * offset;
  const dy = Math.sin(axis) * offset;

  // Consume protein to replicate modules
  const replicationCost = mitosisProteinCost(cell);
  spendProtein(cell.energy, replicationCost);

  // Split remaining resources between parent and daughter (by type)
  const daughterEnergy = createEnergyState();
  const parentKeep: InternalParticle[] = [];
  const daughterGet: InternalParticle[] = [];
  const counts = { carb: 0, protein: 0, waste: 0 };

  // Count particles by type
  for (const p of cell.energy.particles) counts[p.type]++;

  // Determine how many of each type the daughter gets
  const halfCarbs = Math.floor(counts.carb / 2);
  const halfProtein = Math.floor(counts.protein / 2);
  const halfWaste = Math.floor(counts.waste / 2);
  const targetDaughter = { carb: halfCarbs, protein: halfProtein, waste: halfWaste };
  const given = { carb: 0, protein: 0, waste: 0 };

  for (const p of cell.energy.particles) {
    if (given[p.type] < targetDaughter[p.type]) {
      daughterGet.push(p);
      given[p.type]++;
    } else {
      parentKeep.push(p);
    }
  }

  // Clear sliding state — both cells have new membrane geometry
  for (const p of parentKeep) p.slidingToVertex = null;
  for (const p of daughterGet) p.slidingToVertex = null;

  cell.energy.particles = parentKeep;
  daughterEnergy.particles = daughterGet;
  reconcileEnergy(cell.energy);
  reconcileEnergy(daughterEnergy);

  // Each daughter gets half the parent's membrane length
  const halfScale = cell.properties.growthScale / 2;

  const daughter = createCell(
    world,
    center.x + dx,
    center.y + dy,
    { ...cell.properties, growthScale: halfScale },
    cell.modules,
    cell.cascades,
    daughterEnergy,
  );

  // Shrink parent to half membrane
  resizeCell(cell, halfScale);

  cell.mitosisState = null;

  // Both parent and daughter go on cooldown
  const cooldownEnd = performance.now() + MITOSIS_COOLDOWN_MS;
  cell.mitosisCooldownUntil = cooldownEnd;
  daughter.mitosisCooldownUntil = cooldownEnd;

  const nudgeForce = 0.002;
  for (const p of cell.membraneParticles) {
    Matter.Body.applyForce(p, p.position, {
      x: -Math.cos(axis) * nudgeForce,
      y: -Math.sin(axis) * nudgeForce,
    });
  }

  return daughter;
}

export function getCellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.center.position.x, y: cell.center.position.y };
}

/** Resize cell to a new growthScale by adjusting all constraint lengths proportionally */
export function resizeCell(cell: Cell, newScale: number): void {
  const ratio = newScale / cell.properties.growthScale;
  cell.properties.growthScale = newScale;
  for (const constraint of cell.constraints) {
    if (constraint.length !== undefined && constraint.length > 0) {
      constraint.length *= ratio;
    }
  }
}

export function getMembranePoints(cell: Cell): { x: number; y: number }[] {
  return cell.membraneParticles.map(p => ({
    x: p.position.x,
    y: p.position.y,
  }));
}

/** Adjust constraint stiffness based on active rigidity/flexibility modules */
export function applyCellStiffness(cell: Cell, rigidity: boolean, flexibility: boolean): void {
  const base = cell.properties.stiffness;
  let factor = 1.0;
  if (rigidity) factor = 2.5;       // Much stiffer — holds shape firmly
  else if (flexibility) factor = 0.3; // Much looser — ragdoll-like

  // Adjacent constraints
  for (let i = 0; i < 16; i++) {
    if (cell.constraints[i]) cell.constraints[i].stiffness = base * factor;
  }
  // Diameter constraints (16..23)
  for (let i = 16; i < 24; i++) {
    if (cell.constraints[i]) cell.constraints[i].stiffness = base * 0.3 * factor;
  }
  // Radial constraints (24..39)
  for (let i = 24; i < 40; i++) {
    if (cell.constraints[i]) cell.constraints[i].stiffness = base * 0.5 * factor;
  }
}

/** Reposition edge bodies to span between current membrane particle positions.
 *  Call once per frame before the physics step. */
export function updateCellEdgeBodies(cell: Cell): void {
  for (let i = 0; i < cell.edgeBodies.length; i++) {
    const next = (i + 1) % cell.membraneParticles.length;
    const p1 = cell.membraneParticles[i];
    const p2 = cell.membraneParticles[next];
    const dx = p2.position.x - p1.position.x;
    const dy = p2.position.y - p1.position.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const mx = (p1.position.x + p2.position.x) / 2;
    const my = (p1.position.y + p2.position.y) / 2;

    const edge = cell.edgeBodies[i];

    // Recompute vertices for a rectangle of the correct length
    const hl = Math.max(len, 1) / 2;
    const ht = EDGE_THICKNESS / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vertices = [
      { x: mx - cos * hl - sin * ht, y: my - sin * hl + cos * ht },
      { x: mx + cos * hl - sin * ht, y: my + sin * hl + cos * ht },
      { x: mx + cos * hl + sin * ht, y: my + sin * hl - cos * ht },
      { x: mx - cos * hl + sin * ht, y: my - sin * hl - cos * ht },
    ];

    Matter.Body.setPosition(edge, { x: mx, y: my });
    Matter.Body.setAngle(edge, angle);
    Matter.Body.setVertices(edge, vertices);
  }
}

/** Remove all physics bodies for a cell from the world */
export function removeCell(cell: Cell, world: Matter.World): void {
  for (const c of cell.constraints) {
    Matter.Composite.remove(world, c);
  }
  for (const p of cell.membraneParticles) {
    Matter.Composite.remove(world, p);
  }
  for (const e of cell.edgeBodies) {
    Matter.Composite.remove(world, e);
  }
  Matter.Composite.remove(world, cell.center);
}

/** Compute cell effective mass: internal particles + area-based intracellular mass */
export function getCellMass(cell: Cell): number {
  const particleCount = cell.energy.particles.length;
  const r = cell.properties.baseRadius * cell.properties.growthScale;
  const area = Math.PI * r * r;
  // Area contributes mass at 0.01 per unit area (fluid interior)
  return particleCount + area * 0.01;
}
