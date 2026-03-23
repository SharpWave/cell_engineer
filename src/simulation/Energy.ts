/** A single visual particle floating inside the cell */
export interface InternalParticle {
  x: number;       // offset from cell center
  y: number;
  vx: number;
  vy: number;
  type: 'carb' | 'protein' | 'waste';
  /** Index of the membrane polygon vertex this particle is sliding toward (null = free) */
  slidingToVertex: number | null;
}

/** Per-type configuration for how internal particles interact with the membrane */
export interface MembraneTypeConfig {
  push: boolean;       // outward force pushing this type toward membrane
  adherent: boolean;   // sticks to membrane edge and slides to vertex
  repulsive: boolean;  // bounces hard off membrane
  permeable: boolean;  // can be expelled at a membrane vertex (exo transport)
}

export interface EnergyState {
  carbs: number;
  protein: number;
  waste: number;
  /** Accumulates fractional maintenance ticks */
  maintenanceAccumulator: number;
  particles: InternalParticle[];
  /** Tracked membrane rotation angle for co-rotating internal particles */
  lastMembraneAngle: number;
}

export function createEnergyState(): EnergyState {
  return { carbs: 0, protein: 0, waste: 0, maintenanceAccumulator: 0, particles: [], lastMembraneAngle: 0 };
}

export function addCarbs(state: EnergyState, amount: number): void {
  const count = Math.floor(amount);
  state.carbs += count;
  for (let i = 0; i < count; i++) {
    state.particles.push(makeParticle('carb'));
  }
}

export function addProtein(state: EnergyState, amount: number): void {
  const count = Math.floor(amount);
  state.protein += count;
  for (let i = 0; i < count; i++) {
    state.particles.push(makeParticle('protein'));
  }
}

export function addWaste(state: EnergyState, amount: number): void {
  const count = Math.floor(amount);
  state.waste += count;
  for (let i = 0; i < count; i++) {
    state.particles.push(makeParticle('waste'));
  }
}

/** Reconcile counters to match actual particle counts (authoritative source of truth) */
export function reconcileEnergy(state: EnergyState): void {
  let carbs = 0, protein = 0, waste = 0;
  for (const p of state.particles) {
    if (p.type === 'carb') carbs++;
    else if (p.type === 'protein') protein++;
    else waste++;
  }
  state.carbs = carbs;
  state.protein = protein;
  state.waste = waste;
}

/** Timestamped event log for rolling window stats */
export interface ResourceEvent { time: number; amount: number; }

/** Global spend logs — tracked automatically by spend functions, pruned by Environment */
export const spendLog = {
  carbs: [] as ResourceEvent[],
  protein: [] as ResourceEvent[],
};

/** Current game time — set each frame by Environment so spend functions can timestamp */
export let currentGameTime = 0;
export function setCurrentGameTime(t: number): void { currentGameTime = t; }

export function spendCarbs(state: EnergyState, amount: number): boolean {
  if (state.carbs < amount) return false;
  state.carbs -= amount;
  removeParticles(state, 'carb', amount);
  spendLog.carbs.push({ time: currentGameTime, amount });
  return true;
}

export function spendProtein(state: EnergyState, amount: number): boolean {
  if (state.protein < amount) return false;
  state.protein -= amount;
  removeParticles(state, 'protein', amount);
  spendLog.protein.push({ time: currentGameTime, amount });
  return true;
}

/** Sum events within the last `window` ms */
export function sumEvents(events: ResourceEvent[], now: number, window: number): number {
  let total = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (now - events[i].time <= window) total += events[i].amount;
    else break; // events are in chronological order
  }
  return total;
}

/** Remove events older than `window` ms */
export function pruneEvents(events: ResourceEvent[], now: number, window: number): void {
  let cutoff = 0;
  while (cutoff < events.length && now - events[cutoff].time > window) cutoff++;
  if (cutoff > 0) events.splice(0, cutoff);
}

function removeParticles(state: EnergyState, type: InternalParticle['type'], count: number): void {
  let removed = 0;
  for (let i = state.particles.length - 1; i >= 0 && removed < count; i--) {
    if (state.particles[i].type === type) {
      state.particles.splice(i, 1);
      removed++;
    }
  }
}

function makeParticle(type: InternalParticle['type']): InternalParticle {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * 10;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    type,
    slidingToVertex: null,
  };
}

/** Create a particle at a specific position (relative to cell center) */
export function makeParticleAt(type: InternalParticle['type'], x: number, y: number): InternalParticle {
  return {
    x, y,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    type,
    slidingToVertex: null,
  };
}

/** Add a resource with particle placed at a specific position (for endocytosis) */
export function addResourceAt(state: EnergyState, type: 'carb' | 'protein', amount: number, x: number, y: number): void {
  const count = Math.floor(amount);
  if (type === 'carb') state.carbs += count;
  else state.protein += count;
  for (let i = 0; i < count; i++) {
    state.particles.push(makeParticleAt(type, x, y));
  }
}


// ---- Polygon collision helpers ----

interface Vec2 { x: number; y: number }

export function isInsidePolygon(px: number, py: number, poly: Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function bounceOffMembrane(p: InternalParticle, poly: Vec2[]): void {
  let minDist = Infinity;
  let bestInNx = 0, bestInNy = 0;
  let bestProjX = 0, bestProjY = 0;

  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edgeDx = poly[j].x - poly[i].x;
    const edgeDy = poly[j].y - poly[i].y;
    const lenSq = edgeDx * edgeDx + edgeDy * edgeDy;
    if (lenSq === 0) continue;
    const len = Math.sqrt(lenSq);

    const t = Math.max(0, Math.min(1,
      ((p.x - poly[i].x) * edgeDx + (p.y - poly[i].y) * edgeDy) / lenSq
    ));
    const projX = poly[i].x + t * edgeDx;
    const projY = poly[i].y + t * edgeDy;
    const dx = p.x - projX;
    const dy = p.y - projY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      bestProjX = projX;
      bestProjY = projY;

      let nx = -edgeDy / len;
      let ny = edgeDx / len;
      const midX = (poly[i].x + poly[j].x) / 2;
      const midY = (poly[i].y + poly[j].y) / 2;
      if (nx * (-midX) + ny * (-midY) < 0) {
        nx = -nx;
        ny = -ny;
      }
      bestInNx = nx;
      bestInNy = ny;
    }
  }

  const outNx = -bestInNx;
  const outNy = -bestInNy;
  const dotVN = p.vx * outNx + p.vy * outNy;
  p.vx -= 2 * dotVN * outNx;
  p.vy -= 2 * dotVN * outNy;

  p.vx *= 0.6;
  p.vy *= 0.6;

  p.x = bestProjX + bestInNx * 3;
  p.y = bestProjY + bestInNy * 3;
}

export interface ParticleExpulsionResult {
  expelledWaste: number;
  expelledCarbs: number;
  expelledProtein: number;
  /** World-space positions of expelled carb particles (for spawning food) */
  expelledCarbPositions: Vec2[];
  /** World-space positions of expelled protein particles (for spawning food) */
  expelledProteinPositions: Vec2[];
  /** World-space positions of expelled waste particles (for spawning waste) */
  expelledWastePositions: Vec2[];
}

/**
 * Update internal particles with polygon-based membrane collision.
 * Returns counts of expelled particles.
 */
export function updateParticles(
  state: EnergyState,
  membranePointsWorld: Vec2[],
  cellCenter: Vec2,
  typeConfigs: Record<InternalParticle['type'], MembraneTypeConfig>,
  delta: number,
): ParticleExpulsionResult {
  const dt = delta / 16;

  const poly = membranePointsWorld.map(p => ({
    x: p.x - cellCenter.x,
    y: p.y - cellCenter.y,
  }));
  const n = poly.length;

  // Co-rotate internal particles with membrane rotation
  if (n > 0) {
    const currentAngle = Math.atan2(poly[0].y, poly[0].x);
    const deltaAngle = currentAngle - state.lastMembraneAngle;
    state.lastMembraneAngle = currentAngle;
    // Only rotate if delta is small (skip large jumps from init or mitosis)
    if (Math.abs(deltaAngle) < 0.5) {
      const cos = Math.cos(deltaAngle);
      const sin = Math.sin(deltaAngle);
      for (const p of state.particles) {
        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;
        p.x = rx;
        p.y = ry;
        const rvx = p.vx * cos - p.vy * sin;
        const rvy = p.vx * sin + p.vy * cos;
        p.vx = rvx;
        p.vy = rvy;
      }
    }
  }

  let expelledWaste = 0;
  let expelledCarbs = 0;
  let expelledProtein = 0;
  const expelledCarbPositions: Vec2[] = [];
  const expelledProteinPositions: Vec2[] = [];
  const expelledWastePositions: Vec2[] = [];

  // Inter-particle forces (O(n^2) but particle counts are small)
  const particles = state.particles;
  const INTERACT_RANGE = 25;
  const INTERACT_FORCE = 0.003;
  const PARTICLE_RADIUS = 3;
  const MIN_SEP = PARTICLE_RADIUS * 2 * 0.95;
  const REPEL_FORCE = 0.02;
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    if (a.slidingToVertex !== null) continue; // sliding particles are exempt
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      if (b.slidingToVertex !== null) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > INTERACT_RANGE * INTERACT_RANGE) continue;
      const dist = Math.sqrt(distSq);
      if (dist < 0.1) continue;
      const nx = dx / dist;
      const ny = dy / dist;

      if (dist < MIN_SEP) {
        const push = (MIN_SEP - dist) * REPEL_FORCE;
        a.vx -= nx * push;
        a.vy -= ny * push;
        b.vx += nx * push;
        b.vy += ny * push;
        continue;
      }

      let sign = 0;
      const types = a.type + ':' + b.type;
      switch (types) {
        case 'protein:protein': sign = 1; break;
        case 'carb:protein': case 'protein:carb': sign = 1; break;
        case 'carb:carb': sign = -1; break;
        case 'waste:protein': case 'protein:waste': sign = -1; break;
        case 'waste:waste': sign = -1; break;
        case 'waste:carb': case 'carb:waste': sign = -1; break;
      }

      if (sign !== 0) {
        const f = sign * INTERACT_FORCE * (1 - dist / INTERACT_RANGE);
        a.vx += nx * f;
        a.vy += ny * f;
        b.vx -= nx * f;
        b.vy -= ny * f;
      }
    }
  }

  const SLIDE_FORCE = 0.12;
  const SLIDE_ARRIVE_DIST = 5;

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    const cfg = typeConfigs[p.type];

    // --- Sliding particles: move directly toward target vertex ---
    if (p.slidingToVertex !== null) {
      // If adherence lost (module went cold), release back into cytoplasm
      if (!cfg.adherent) {
        p.slidingToVertex = null;
        bounceOffMembrane(p, poly);
        continue;
      }
      const tv = poly[p.slidingToVertex];
      const dx = tv.x - p.x;
      const dy = tv.y - p.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < SLIDE_ARRIVE_DIST * SLIDE_ARRIVE_DIST) {
        // Arrived at vertex — expel or release
        if (cfg.permeable) {
          const worldPos = { x: cellCenter.x + tv.x, y: cellCenter.y + tv.y };
          if (p.type === 'waste') { expelledWaste++; expelledWastePositions.push(worldPos); }
          else if (p.type === 'carb') { expelledCarbs++; expelledCarbPositions.push(worldPos); }
          else { expelledProtein++; expelledProteinPositions.push(worldPos); }
          state.particles.splice(i, 1);
        } else {
          p.slidingToVertex = null;
          bounceOffMembrane(p, poly);
        }
      } else {
        // Move directly toward target vertex (no membrane projection)
        const dist = Math.sqrt(distSq);
        const step = Math.min(SLIDE_FORCE * dt, dist); // don't overshoot
        const nx = dx / dist;
        const ny = dy / dist;
        p.x += nx * step;
        p.y += ny * step;
        p.vx = nx * step;
        p.vy = ny * step;
      }
      continue;
    }

    // --- Free particles: normal physics ---
    if (cfg.push) {
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);
      if (dist > 1) {
        p.vx += (p.x / dist) * 0.06 * dt;
        p.vy += (p.y / dist) * 0.06 * dt;
      }
    }

    // Cytoplasm jitter
    p.vx += (Math.random() - 0.5) * 0.06 * dt;
    p.vy += (Math.random() - 0.5) * 0.06 * dt;

    // Damping
    p.vx *= 0.95;
    p.vy *= 0.95;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Membrane collision
    if (!isInsidePolygon(p.x, p.y, poly)) {
      if (cfg.adherent) {
        // Find which edge the particle crossed and slide toward nearest vertex
        const edgeIdx = findNearestEdge(p, poly);
        const v1 = edgeIdx;
        const v2 = (edgeIdx + 1) % n;
        const d1 = (p.x - poly[v1].x) ** 2 + (p.y - poly[v1].y) ** 2;
        const d2 = (p.x - poly[v2].x) ** 2 + (p.y - poly[v2].y) ** 2;
        p.slidingToVertex = d1 <= d2 ? v1 : v2;
        // Place particle back on the edge
        projectOntoMembrane(p, poly);
        p.vx = 0;
        p.vy = 0;
      } else if (cfg.repulsive) {
        // Strong bounce
        bounceOffMembrane(p, poly);
        p.vx *= 1.5;
        p.vy *= 1.5;
      } else {
        bounceOffMembrane(p, poly);
      }
    }
  }

  return { expelledWaste, expelledCarbs, expelledProtein, expelledCarbPositions, expelledProteinPositions, expelledWastePositions };
}

/** Find the index of the nearest edge (segment i→i+1) to a point */
function findNearestEdge(p: { x: number; y: number }, poly: Vec2[]): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edgeDx = poly[j].x - poly[i].x;
    const edgeDy = poly[j].y - poly[i].y;
    const lenSq = edgeDx * edgeDx + edgeDy * edgeDy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1,
      ((p.x - poly[i].x) * edgeDx + (p.y - poly[i].y) * edgeDy) / lenSq
    ));
    const projX = poly[i].x + t * edgeDx;
    const projY = poly[i].y + t * edgeDy;
    const dx = p.x - projX;
    const dy = p.y - projY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Project a particle onto the nearest point on the inside of the membrane polygon */
function projectOntoMembrane(p: InternalParticle, poly: Vec2[]): void {
  let bestDist = Infinity;
  let bestX = p.x;
  let bestY = p.y;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edgeDx = poly[j].x - poly[i].x;
    const edgeDy = poly[j].y - poly[i].y;
    const lenSq = edgeDx * edgeDx + edgeDy * edgeDy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1,
      ((p.x - poly[i].x) * edgeDx + (p.y - poly[i].y) * edgeDy) / lenSq
    ));
    const projX = poly[i].x + t * edgeDx;
    const projY = poly[i].y + t * edgeDy;
    const dx = p.x - projX;
    const dy = p.y - projY;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestX = projX;
      bestY = projY;
    }
  }
  // Place particle just inside the membrane (offset 2px inward)
  const dx = bestX;
  const dy = bestY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1) {
    p.x = bestX - (dx / d) * 2;
    p.y = bestY - (dy / d) * 2;
  } else {
    p.x = bestX;
    p.y = bestY;
  }
}
