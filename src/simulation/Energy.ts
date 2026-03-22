/** A single visual particle floating inside the cell */
export interface InternalParticle {
  x: number;       // offset from cell center
  y: number;
  vx: number;
  vy: number;
  type: 'carb' | 'protein' | 'waste';
}

export interface EnergyState {
  carbs: number;
  protein: number;
  waste: number;
  /** Accumulates fractional maintenance ticks */
  maintenanceAccumulator: number;
  particles: InternalParticle[];
}

export function createEnergyState(): EnergyState {
  return { carbs: 0, protein: 0, waste: 0, maintenanceAccumulator: 0, particles: [] };
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

export function spendCarbs(state: EnergyState, amount: number): boolean {
  if (state.carbs < amount) return false;
  state.carbs -= amount;
  removeParticles(state, 'carb', amount);
  return true;
}

export function spendProtein(state: EnergyState, amount: number): boolean {
  if (state.protein < amount) return false;
  state.protein -= amount;
  removeParticles(state, 'protein', amount);
  return true;
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
  };
}

/** Create a particle at a specific position (relative to cell center) */
export function makeParticleAt(type: InternalParticle['type'], x: number, y: number): InternalParticle {
  return {
    x, y,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    type,
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

function isInsidePolygon(px: number, py: number, poly: Vec2[]): boolean {
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
}

/**
 * Update internal particles with polygon-based membrane collision.
 * Returns counts of expelled particles.
 */
export function updateParticles(
  state: EnergyState,
  membranePointsWorld: Vec2[],
  cellCenter: Vec2,
  wastePermeable: boolean,
  wastePush: boolean,
  carbPush: boolean,
  carbPermeable: boolean,
  proteinPush: boolean,
  proteinPermeable: boolean,
  delta: number,
): ParticleExpulsionResult {
  const dt = delta / 16;

  const poly = membranePointsWorld.map(p => ({
    x: p.x - cellCenter.x,
    y: p.y - cellCenter.y,
  }));

  let expelledWaste = 0;
  let expelledCarbs = 0;
  let expelledProtein = 0;
  const expelledCarbPositions: Vec2[] = [];
  const expelledProteinPositions: Vec2[] = [];

  // Inter-particle forces (O(n^2) but particle counts are small)
  const particles = state.particles;
  const INTERACT_RANGE = 25;
  const INTERACT_FORCE = 0.003;
  const PARTICLE_RADIUS = 3;
  const MIN_SEP = PARTICLE_RADIUS * 2 * 0.95; // 5% overlap means 95% of diameter apart
  const REPEL_FORCE = 0.02;
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > INTERACT_RANGE * INTERACT_RANGE) continue;
      const dist = Math.sqrt(distSq);
      if (dist < 0.1) continue;
      const nx = dx / dist;
      const ny = dy / dist;

      // Hard separation: no more than 40% overlap
      if (dist < MIN_SEP) {
        const push = (MIN_SEP - dist) * REPEL_FORCE;
        a.vx -= nx * push;
        a.vy -= ny * push;
        b.vx += nx * push;
        b.vy += ny * push;
        continue; // skip attraction when overlapping
      }

      // Determine attraction (+) or repulsion (-)
      // protein ↔ protein: attract
      // carb ↔ protein: attract
      // carb ↔ carb: repel
      // waste ↔ protein: attract
      // waste ↔ waste: attract
      // waste ↔ carb: ignore
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

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];

    // Outward push forces
    const shouldPush =
      (wastePush && p.type === 'waste') ||
      (carbPush && p.type === 'carb') ||
      (proteinPush && p.type === 'protein');
    if (shouldPush) {
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
      if (p.type === 'waste' && wastePermeable) {
        state.particles.splice(i, 1);
        expelledWaste++;
      } else if (p.type === 'carb' && carbPermeable) {
        expelledCarbPositions.push({
          x: cellCenter.x + p.x,
          y: cellCenter.y + p.y,
        });
        state.particles.splice(i, 1);
        expelledCarbs++;
      } else if (p.type === 'protein' && proteinPermeable) {
        expelledProteinPositions.push({
          x: cellCenter.x + p.x,
          y: cellCenter.y + p.y,
        });
        state.particles.splice(i, 1);
        expelledProtein++;
      } else {
        bounceOffMembrane(p, poly);
      }
    }
  }

  return { expelledWaste, expelledCarbs, expelledProtein, expelledCarbPositions, expelledProteinPositions };
}
