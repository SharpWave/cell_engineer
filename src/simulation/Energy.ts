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
  wasteAccumulator: number;  // fractional waste buildup
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

function makeParticle(type: 'energy' | 'waste'): InternalParticle {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * 15;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    type,
  };
}

const WASTE_RATE = 1 / 5000; // 1 waste per 5 seconds

/** Accumulate waste over time from background maintenance */
export function updateWaste(state: EnergyState, delta: number): void {
  state.wasteAccumulator += delta * WASTE_RATE;
  while (state.wasteAccumulator >= 1) {
    state.wasteAccumulator -= 1;
    addWaste(state, 1);
  }
}

/** Update internal particle positions — they drift and bounce inside a radius */
export function updateParticles(state: EnergyState, boundsRadius: number, delta: number): void {
  const dt = delta / 16; // normalize to ~60fps
  const maxR = boundsRadius * 0.7;

  for (const p of state.particles) {
    // Random wandering force
    p.vx += (Math.random() - 0.5) * 0.03 * dt;
    p.vy += (Math.random() - 0.5) * 0.03 * dt;

    // Damping
    p.vx *= 0.98;
    p.vy *= 0.98;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Soft containment — push back toward center if outside bounds
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    if (dist > maxR) {
      const pushback = (dist - maxR) / dist * 0.15;
      p.vx -= p.x * pushback;
      p.vy -= p.y * pushback;
    }
  }
}
