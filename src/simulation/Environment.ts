import Matter from 'matter-js';
import {
  Cell, getCellCenter, getMembranePoints,
  startMitosis, updateMitosis, completeMitosis, updateFingerprint,
  fingerprintSimilarity, applyCellStiffness, resizeCell, getCellMass,
} from '../creature/Cell';
import { FoodParticle, createFoodParticle, stickFoodToBody, removeFood, nudgeFood } from './Food';
import {
  addCarbs, addProtein, addWaste, addResourceAt, updateParticles, spendCarbs, spendProtein,
  ResourceEvent, spendLog, currentGameTime, setCurrentGameTime, sumEvents, pruneEvents, reconcileEnergy,
} from './Energy';
import { LightCycle, getLightLevel } from './LightCycle';
import {
  updateModules, ModuleEffects, ModuleContext, SurfaceTarget,
  hasTransport, hasAdherence, hasRepulsion,
} from '../creature/Module';

const ABSORB_DELAY = 1000;
const MAX_STATIONARY_PROTEIN = 10;

/** 1 carb per module per day cycle (120,000 ms) */
export const DAY_CYCLE_MS = 120_000;
const MAINTENANCE_RATE = 1 / DAY_CYCLE_MS; // per module per ms

/** Growth: 5 protein per day cycle per growth module → 5% initial circumference */
const GROWTH_PROTEIN_RATE = 5 / DAY_CYCLE_MS; // protein per ms per growth module
const GROWTH_PER_PROTEIN = 0.01; // growthScale increase per protein spent (5 protein → 0.05)

export interface Environment {
  food: FoodParticle[];
  lastCarbSpawnTime: number;
  lastMovingProteinSpawnTime: number;
  lastStationaryProteinSpawnTime: number;
  worldWidth: number;
  worldHeight: number;
  /** Per-cell effects cached for rendering, keyed by cell id */
  cellEffects: Map<number, ModuleEffects>;
  /** Spawn rates in food per day (DAY_CYCLE_MS). 0 = off. */
  carbSpawnRate: number;
  movingProteinSpawnRate: number;
  stationaryProteinSpawnRate: number;
  /** Rolling window resource event logs */
  rollingStats: {
    carbsSpawned: ResourceEvent[];
    proteinSpawned: ResourceEvent[];
    proteinProduced: ResourceEvent[];
  };
}

export function createEnvironment(width: number, height: number): Environment {
  return {
    food: [],
    lastCarbSpawnTime: 0,
    lastMovingProteinSpawnTime: 0,
    lastStationaryProteinSpawnTime: 0,
    worldWidth: width,
    worldHeight: height,
    cellEffects: new Map(),
    carbSpawnRate: 100,
    movingProteinSpawnRate: 25,
    stationaryProteinSpawnRate: 0,
    rollingStats: {
      carbsSpawned: [],
      proteinSpawned: [],
      proteinProduced: [],
    },
  };
}

/** Spawn a single food particle at a random position */
export function spawnOneFood(
  env: Environment,
  world: Matter.World,
  type: 'carb' | 'protein',
  stationary: boolean = false,
): void {
  const margin = stationary ? 100 : 60;
  const x = margin + Math.random() * (env.worldWidth - margin * 2);
  const y = margin + Math.random() * (env.worldHeight - margin * 2);
  env.food.push(createFoodParticle(world, x, y, type, stationary));
  const log = type === 'carb' ? env.rollingStats.carbsSpawned : env.rollingStats.proteinSpawned;
  log.push({ time: currentGameTime, amount: 1 });
}

export function setupCollisions(
  engine: Matter.Engine,
  cells: Cell[],
  env: Environment,
  world: Matter.World,
): void {
  // Food-membrane collisions — adherence-gated
  Matter.Events.on(engine, 'collisionStart', (event) => {
    const now = performance.now();
    for (const pair of event.pairs) {
      let foodBody: Matter.Body | null = null;
      let membraneBody: Matter.Body | null = null;

      if (pair.bodyA.label === 'food' && pair.bodyB.label === 'cell_membrane') {
        foodBody = pair.bodyA;
        membraneBody = pair.bodyB;
      } else if (pair.bodyB.label === 'food' && pair.bodyA.label === 'cell_membrane') {
        foodBody = pair.bodyB;
        membraneBody = pair.bodyA;
      }

      if (foodBody && membraneBody) {
        const cellId = (membraneBody as any).cellId as number | undefined;
        if (cellId === undefined) continue;

        const effects = env.cellEffects.get(cellId);
        if (!effects) continue;

        // Find the food particle
        const particle = env.food.find(f => f.body === foodBody && !f.stuck && !f.absorbed);
        if (!particle) continue;

        const foodTarget = particle.resourceType as SurfaceTarget;

        // Check if cell has external repulsion for this food type
        if (hasRepulsion(effects, 'external', foodTarget)) continue;

        // Check if cell has external adherence for this food type
        if (!hasAdherence(effects, 'external', foodTarget)) continue;

        stickFoodToBody(world, particle, membraneBody, now);
      }
    }
  });

  // Cell-cell membrane collision tracking
  Matter.Events.on(engine, 'collisionActive', (event) => {
    for (const pair of event.pairs) {
      if (pair.bodyA.label === 'cell_membrane' && pair.bodyB.label === 'cell_membrane') {
        const idA = (pair.bodyA as any).cellId as number | undefined;
        const idB = (pair.bodyB as any).cellId as number | undefined;
        if (idA !== undefined && idB !== undefined && idA !== idB) {
          const cellA = cells.find(c => c.id === idA);
          const cellB = cells.find(c => c.id === idB);
          if (cellA) cellA.touchingCells.add(idB);
          if (cellB) cellB.touchingCells.add(idA);
        }
      }
    }
  });
}

/** Count stuck food particles attached to a given cell, grouped by resource type */
function countAdheredFood(
  cell: Cell,
  food: FoodParticle[],
): Record<SurfaceTarget, number> {
  const counts: Record<SurfaceTarget, number> = { carb: 0, protein: 0, waste: 0, cell: 0 };
  for (const f of food) {
    if (!f.stuck || f.absorbed) continue;
    const isAttached = cell.membraneParticles.some(mp =>
      f.stuckConstraint && (
        (f.stuckConstraint as any).bodyA === mp || (f.stuckConstraint as any).bodyB === mp
      )
    );
    if (isAttached) {
      counts[f.resourceType as SurfaceTarget]++;
    }
  }
  return counts;
}

export function updateEnvironment(
  env: Environment,
  world: Matter.World,
  cells: Cell[],
  now: number,
  delta: number,
  lightCycle: LightCycle,
): void {
  const light = getLightLevel(lightCycle, now);

  // Set game time for spend logging, then prune old events
  setCurrentGameTime(now);
  pruneEvents(env.rollingStats.carbsSpawned, now, DAY_CYCLE_MS);
  pruneEvents(env.rollingStats.proteinSpawned, now, DAY_CYCLE_MS);
  pruneEvents(env.rollingStats.proteinProduced, now, DAY_CYCLE_MS);
  pruneEvents(spendLog.carbs, now, DAY_CYCLE_MS);
  pruneEvents(spendLog.protein, now, DAY_CYCLE_MS);

  // --- Per-cell updates ---
  const newCells: Cell[] = [];

  for (const cell of cells) {
    // Compute max similarity among touching cells
    let maxSimilarity = 0;
    for (const otherId of cell.touchingCells) {
      const other = cells.find(c => c.id === otherId);
      if (other) {
        const sim = fingerprintSimilarity(cell, other);
        maxSimilarity = Math.max(maxSimilarity, sim);
      }
    }

    // Count adhered food on external membrane
    const externalAdhered = countAdheredFood(cell, env.food);
    externalAdhered.cell = cell.touchingCells.size;

    // Count internal resources
    const internalAdhered: Record<SurfaceTarget, number> = {
      carb: cell.energy.carbs,
      protein: cell.energy.protein,
      waste: cell.energy.waste,
      cell: 0,
    };

    // Evaluate eye sensors (spatial — need world positions)
    const preActivated = new Set<string>();
    const center = getCellCenter(cell);
    for (const mod of cell.modules) {
      if (mod.subtype !== 'eye') continue;
      const mp = cell.membraneParticles[mod.membraneIndex];
      if (!mp) continue;

      // Look direction: from center outward through membrane point
      const lookX = mp.position.x - center.x;
      const lookY = mp.position.y - center.y;
      const lookLen = Math.sqrt(lookX * lookX + lookY * lookY);
      if (lookLen < 1) continue;
      const lnx = lookX / lookLen;
      const lny = lookY / lookLen;

      const halfFov = ((mod.config.fovDegrees ?? 90) / 2) * (Math.PI / 180);
      const cosHalfFov = Math.cos(halfFov);
      const target = mod.config.eyeTarget ?? 'carb';
      const EYE_RANGE = 300;

      let seen = false;

      // Check food particles
      if (target === 'carb' || target === 'protein') {
        for (const f of env.food) {
          if (f.absorbed || f.resourceType !== target) continue;
          const dx = f.body.position.x - center.x;
          const dy = f.body.position.y - center.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > EYE_RANGE || dist < 1) continue;
          const dot = (dx / dist) * lnx + (dy / dist) * lny;
          if (dot >= cosHalfFov) { seen = true; break; }
        }
      }

      // Check other cells
      if (!seen && target === 'cell') {
        for (const other of cells) {
          if (other.id === cell.id) continue;
          const oc = getCellCenter(other);
          const dx = oc.x - center.x;
          const dy = oc.y - center.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > EYE_RANGE || dist < 1) continue;
          const dot = (dx / dist) * lnx + (dy / dist) * lny;
          if (dot >= cosHalfFov) { seen = true; break; }
        }
      }

      // Check waste food (waste isn't a food type, so skip unless we add it)

      if (seen) preActivated.add(mod.id);
    }

    // Build module context
    const ctx: ModuleContext = {
      carbCount: cell.energy.carbs,
      proteinCount: cell.energy.protein,
      wasteCount: cell.energy.waste,
      externalAdhered,
      internalAdhered,
      lightLevel: light,
      maxCellSimilarity: maxSimilarity,
      membraneLength: cell.properties.growthScale,
      preActivated,
    };
    const effects = updateModules(cell.modules, cell.cascades, ctx);
    env.cellEffects.set(cell.id, effects);

    // Apply stiffness modulation
    applyCellStiffness(cell, effects.rigidityActive, effects.flexibilityActive);

    // Foot: pull cell toward foot's membrane direction
    for (const mod of cell.modules) {
      if (mod.subtype !== 'foot' || !mod.active) continue;
      const mp = cell.membraneParticles[mod.membraneIndex];
      if (!mp) continue;
      const dx = mp.position.x - center.x;
      const dy = mp.position.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const mass = getCellMass(cell);
      const FOOT_FORCE = 0.0015 / Math.max(1, mass * 0.02);
      const nx = dx / dist;
      const ny = dy / dist;
      for (const p of cell.membraneParticles) {
        Matter.Body.applyForce(p, p.position, { x: nx * FOOT_FORCE, y: ny * FOOT_FORCE });
      }
    }

    // Shaker: oscillate membrane particles for random-walk motion (mass-scaled)
    if (effects.shakerActive) {
      const mass = getCellMass(cell);
      const SHAKE_FORCE = 0.004 / Math.max(1, mass * 0.02);
      for (const p of cell.membraneParticles) {
        Matter.Body.applyForce(p, p.position, {
          x: (Math.random() - 0.5) * SHAKE_FORCE,
          y: (Math.random() - 0.5) * SHAKE_FORCE,
        });
      }
    }

    // --- Module maintenance: 1 carb per module per day (shaker costs 4x) ---
    const maintenanceUnits = cell.modules.reduce((sum, m) =>
      sum + (m.subtype === 'shaker' ? 4 : 1), 0);
    if (maintenanceUnits > 0) {
      cell.energy.maintenanceAccumulator += delta * maintenanceUnits * MAINTENANCE_RATE;
      while (cell.energy.maintenanceAccumulator >= 1) {
        cell.energy.maintenanceAccumulator -= 1;
        if (spendCarbs(cell.energy, 1)) {
          cell.lastMaintenanceTick = now;
          addWaste(cell.energy, 1);
        } else {
          killModule(cell);
        }
      }
    }

    // --- Growth/reduction module: convert protein ↔ membrane ---
    if (effects.netGrowthRate !== 0) {
      const absRate = Math.abs(effects.netGrowthRate);
      cell.growthAccumulator += delta * absRate * GROWTH_PROTEIN_RATE;
      while (cell.growthAccumulator >= 1) {
        cell.growthAccumulator -= 1;
        if (effects.netGrowthRate > 0) {
          // Growth: spend protein → add membrane
          if (spendProtein(cell.energy, 1)) {
            resizeCell(cell, cell.properties.growthScale + GROWTH_PER_PROTEIN);
          }
        } else {
          // Reduction: remove membrane → gain protein
          if (cell.properties.growthScale > 0.3) {
            resizeCell(cell, cell.properties.growthScale - GROWTH_PER_PROTEIN);
            addProtein(cell.energy, 1);
            env.rollingStats.proteinProduced.push({ time: now, amount: 1 });
          }
        }
      }
    }

    // Mitosis handling
    if (effects.mitosisTriggered && !cell.mitosisState) {
      startMitosis(cell, now);
    }

    if (cell.mitosisState) {
      const done = updateMitosis(cell, now);
      if (done) {
        const daughter = completeMitosis(cell, world);
        updateFingerprint(daughter);
        newCells.push(daughter);
      }
    }

    // Internal particles — determine transport flags from effects
    const wasteExo = hasTransport(effects, 'waste', 'exo') && hasAdherence(effects, 'internal', 'waste');
    const carbExo = hasTransport(effects, 'carb', 'exo');
    const proteinExo = hasTransport(effects, 'protein', 'exo');

    const memPoints = getMembranePoints(cell);
    const result = updateParticles(
      cell.energy, memPoints, center,
      wasteExo, wasteExo,       // wastePermeable, wastePush
      carbExo, carbExo,         // carbPush, carbPermeable
      proteinExo, proteinExo,   // proteinPush, proteinPermeable
      delta,
    );
    // Expelled carbs become carb food
    for (const pos of result.expelledCarbPositions) {
      env.food.push(createFoodParticle(world, pos.x, pos.y, 'carb'));
    }
    // Expelled protein becomes protein food
    for (const pos of result.expelledProteinPositions) {
      env.food.push(createFoodParticle(world, pos.x, pos.y, 'protein'));
    }
    // Expelled waste becomes waste food (heavy obstacle)
    for (const pos of result.expelledWastePositions) {
      env.food.push(createFoodParticle(world, pos.x, pos.y, 'waste'));
    }

    // Reconcile counters to match actual particles (prevents drift)
    reconcileEnergy(cell.energy);

    // Cell-cell adherence/repulsion forces
    for (const otherId of cell.touchingCells) {
      const other = cells.find(c => c.id === otherId);
      if (!other) continue;

      const otherCenter = getCellCenter(other);
      const dx = otherCenter.x - center.x;
      const dy = otherCenter.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;
      const nx = dx / dist;
      const ny = dy / dist;

      if (hasAdherence(effects, 'external', 'cell')) {
        const force = 0.0003;
        for (const p of cell.membraneParticles) {
          Matter.Body.applyForce(p, p.position, { x: nx * force, y: ny * force });
        }
      }

      if (hasRepulsion(effects, 'external', 'cell')) {
        const force = 0.0005;
        for (const p of cell.membraneParticles) {
          Matter.Body.applyForce(p, p.position, { x: -nx * force, y: -ny * force });
        }
      }
    }
  }

  // --- Default cell-cell center repulsion ---
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      const ca = getCellCenter(a);
      const cb = getCellCenter(b);
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const rA = a.properties.baseRadius * a.properties.growthScale;
      const rB = b.properties.baseRadius * b.properties.growthScale;
      const minDist = (rA + rB) * 0.9;

      if (dist < minDist && dist > 1) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const force = overlap * 0.00004;
        for (const p of a.membraneParticles) {
          Matter.Body.applyForce(p, p.position, { x: -nx * force, y: -ny * force });
        }
        for (const p of b.membraneParticles) {
          Matter.Body.applyForce(p, p.position, { x: nx * force, y: ny * force });
        }
      }
    }
  }

  // Add daughter cells
  for (const daughter of newCells) {
    cells.push(daughter);
  }

  // Clear touching cells after all usage
  for (const cell of cells) {
    cell.touchingCells.clear();
  }

  // --- Food spawning (rates in food/day → interval = DAY_CYCLE_MS / rate) ---

  // Carbs
  if (env.carbSpawnRate > 0) {
    const carbInterval = DAY_CYCLE_MS / env.carbSpawnRate;
    if (now - env.lastCarbSpawnTime > carbInterval) {
      spawnOneFood(env, world, 'carb');
      env.lastCarbSpawnTime = now;
    }
  }

  // Moving protein
  if (env.movingProteinSpawnRate > 0) {
    const proteinInterval = DAY_CYCLE_MS / env.movingProteinSpawnRate;
    if (now - env.lastMovingProteinSpawnTime > proteinInterval) {
      spawnOneFood(env, world, 'protein');
      env.lastMovingProteinSpawnTime = now;
    }
  }

  // Stationary protein
  const stationaryCount = env.food.filter(f => f.stationary && !f.absorbed).length;
  if (env.stationaryProteinSpawnRate > 0 && stationaryCount < MAX_STATIONARY_PROTEIN) {
    const stationaryInterval = DAY_CYCLE_MS / env.stationaryProteinSpawnRate;
    if (now - env.lastStationaryProteinSpawnTime > stationaryInterval) {
      spawnOneFood(env, world, 'protein', true);
      env.lastStationaryProteinSpawnTime = now;
    }
  }

  // Nudge slow food
  for (const f of env.food) {
    nudgeFood(f);
  }

  // --- Extracellular waste physics: attract each other, enforce overlap limit ---
  const wasteParticles = env.food.filter(f => f.resourceType === 'waste' && !f.absorbed && !f.stuck);
  const WASTE_ATTRACT_RANGE = 80;
  const WASTE_ATTRACT_FORCE = 0.000015;
  const WASTE_MIN_SEP = 10; // roughly 2x particle radius
  const WASTE_REPEL_FORCE = 0.00005;
  for (let i = 0; i < wasteParticles.length; i++) {
    const a = wasteParticles[i].body;
    for (let j = i + 1; j < wasteParticles.length; j++) {
      const b = wasteParticles[j].body;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > WASTE_ATTRACT_RANGE * WASTE_ATTRACT_RANGE) continue;
      const dist = Math.sqrt(distSq);
      if (dist < 0.1) continue;
      const nx = dx / dist;
      const ny = dy / dist;

      if (dist < WASTE_MIN_SEP) {
        // Hard separation — prevent overlap
        const push = (WASTE_MIN_SEP - dist) * WASTE_REPEL_FORCE;
        Matter.Body.applyForce(a, a.position, { x: -nx * push, y: -ny * push });
        Matter.Body.applyForce(b, b.position, { x: nx * push, y: ny * push });
      } else {
        // Attraction
        const f = WASTE_ATTRACT_FORCE * (1 - dist / WASTE_ATTRACT_RANGE);
        Matter.Body.applyForce(a, a.position, { x: nx * f, y: ny * f });
        Matter.Body.applyForce(b, b.position, { x: -nx * f, y: -ny * f });
      }
    }
  }

  // --- Endocytosis (per-cell, adherence-gated transport) ---
  for (let i = env.food.length - 1; i >= 0; i--) {
    const f = env.food[i];
    if (f.absorbed) {
      env.food.splice(i, 1);
      continue;
    }
    if (f.stuck && now - f.stuckTime > ABSORB_DELAY) {
      if (f.resourceType === 'waste') continue; // waste cannot be endocytosed
      const foodTarget = f.resourceType as SurfaceTarget;

      for (const cell of cells) {
        const effects = env.cellEffects.get(cell.id);
        if (!effects) continue;

        // Need an endo transporter for this resource type
        if (!hasTransport(effects, foodTarget as any, 'endo')) continue;

        const isAttached = cell.membraneParticles.some(mp =>
          f.stuckConstraint && (
            (f.stuckConstraint as any).bodyA === mp || (f.stuckConstraint as any).bodyB === mp
          )
        );

        if (isAttached) {
          // Find the membrane particle this food is stuck to
          const center = getCellCenter(cell);
          const attachedMp = cell.membraneParticles.find(mp =>
            f.stuckConstraint && (
              (f.stuckConstraint as any).bodyA === mp || (f.stuckConstraint as any).bodyB === mp
            )
          );
          if (attachedMp) {
            // Place particle on inner side of membrane (reflected across center)
            const mpx = attachedMp.position.x - center.x;
            const mpy = attachedMp.position.y - center.y;
            const dist = Math.sqrt(mpx * mpx + mpy * mpy);
            // Inner side: same direction as membrane point but pushed inward
            const innerDist = Math.max(dist - 10, dist * 0.7);
            const ix = dist > 0 ? (mpx / dist) * innerDist : 0;
            const iy = dist > 0 ? (mpy / dist) * innerDist : 0;
            addResourceAt(cell.energy, f.resourceType, f.resourceValue, ix, iy);
          } else {
            if (f.resourceType === 'carb') addCarbs(cell.energy, f.resourceValue);
            else addProtein(cell.energy, f.resourceValue);
          }
          removeFood(world, f);
          env.food.splice(i, 1);
          break;
        }
      }
    }
  }
}

/** Kill the last non-starter module on a cell due to maintenance failure */
function killModule(cell: Cell): void {
  // Kill from the end — last-added modules die first
  // Protect starter modules (carb chain + protein chain + growth = 7)
  for (let i = cell.modules.length - 1; i >= 7; i--) {
    const mod = cell.modules[i];
    cell.cascades = cell.cascades.filter(c => c.fromId !== mod.id && c.toId !== mod.id);
    cell.modules.splice(i, 1);
    updateFingerprint(cell);
    return;
  }
  // If only starter modules left, kill even those
  if (cell.modules.length > 0) {
    const mod = cell.modules.pop()!;
    cell.cascades = cell.cascades.filter(c => c.fromId !== mod.id && c.toId !== mod.id);
    updateFingerprint(cell);
  }
}
