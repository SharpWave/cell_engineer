/** A single visual particle floating inside the cell */
export interface InternalParticle {
  x: number;       // offset from cell center
  y: number;
  vx: number;
  vy: number;
  type: 'energy' | 'waste';
}

export interface EnergyState {
  current: number;
  waste: number;
  wasteAccumulator: number;
  particles: InternalParticle[];
}

export function createEnergyState(): EnergyState {
  return { current: 0, waste: 0, wasteAccumulator: 0, particles: [] };
}

export function addEnergy(state: EnergyState, amount: number): void {
  const count = Math.floor(amount);
  state.current += count;
  for (let i = 0; i < count; i++) {
    state.particles.push(makeParticle('energy'));
  }
}

export function addWaste(state: EnergyState, amount: number): void {
  const count = Math.floor(amount);
  state.waste += count;
  for (let i = 0; i < count; i++) {
    state.particles.push(makeParticle('waste'));
  }
}

export function spendEnergy(state: EnergyState, amount: number): boolean {
  if (state.current < amount) return false;
  state.current -= amount;
  // Remove energy particles
  let removed = 0;
  for (let i = state.particles.length - 1; i >= 0 && removed < amount; i--) {
    if (state.particles[i].type === 'energy') {
      state.particles.splice(i, 1);
      removed++;
    }
  }
  return true;
}

function makeParticle(type: 'energy' | 'waste'): InternalParticle {
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

const WASTE_RATE = 1 / 5000; // 1 waste per 5 seconds

export function updateWaste(state: EnergyState, delta: number): void {
  state.wasteAccumulator += delta * WASTE_RATE;
  while (state.wasteAccumulator >= 1) {
    state.wasteAccumulator -= 1;
    addWaste(state, 1);
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
  // Find nearest edge
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

    // Project particle onto edge
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

      // Compute inward normal (toward center 0,0)
      let nx = -edgeDy / len;
      let ny = edgeDx / len;
      const midX = (poly[i].x + poly[j].x) / 2;
      const midY = (poly[i].y + poly[j].y) / 2;
      // If normal doesn't point toward center, flip
      if (nx * (-midX) + ny * (-midY) < 0) {
        nx = -nx;
        ny = -ny;
      }
      bestInNx = nx;
      bestInNy = ny;
    }
  }

  // Reflect velocity off the outward normal
  const outNx = -bestInNx;
  const outNy = -bestInNy;
  const dotVN = p.vx * outNx + p.vy * outNy;
  p.vx -= 2 * dotVN * outNx;
  p.vy -= 2 * dotVN * outNy;

  // Energy loss on bounce
  p.vx *= 0.6;
  p.vy *= 0.6;

  // Push back inside
  p.x = bestProjX + bestInNx * 3;
  p.y = bestProjY + bestInNy * 3;
}

/**
 * Update internal particles with polygon-based membrane collision.
 * Returns number of waste particles expelled (when waste is permeable).
 */
export function updateParticles(
  state: EnergyState,
  membranePointsWorld: Vec2[],
  cellCenter: Vec2,
  wastePermeable: boolean,
  wastePush: boolean,
  delta: number,
): number {
  const dt = delta / 16;

  // Convert membrane points to cell-relative coords
  const poly = membranePointsWorld.map(p => ({
    x: p.x - cellCenter.x,
    y: p.y - cellCenter.y,
  }));

  let expelled = 0;

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];

    // Waste push: outward force when exocytosis active
    if (wastePush && p.type === 'waste') {
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);
      if (dist > 1) {
        p.vx += (p.x / dist) * 0.06 * dt;
        p.vy += (p.y / dist) * 0.06 * dt;
      }
    }

    // Random wandering
    p.vx += (Math.random() - 0.5) * 0.06 * dt;
    p.vy += (Math.random() - 0.5) * 0.06 * dt;

    // Damping
    p.vx *= 0.97;
    p.vy *= 0.97;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Membrane collision
    if (!isInsidePolygon(p.x, p.y, poly)) {
      if (p.type === 'waste' && wastePermeable) {
        // Waste escapes the cell
        state.particles.splice(i, 1);
        expelled++;
      } else {
        bounceOffMembrane(p, poly);
      }
    }
  }

  return expelled;
}
