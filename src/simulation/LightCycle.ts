/** Sinusoidal light cycle. Value oscillates 0 (dark) to 1 (bright). */

const DEFAULT_PERIOD_MS = 2 * 60 * 1000; // 2 minutes

export interface LightCycle {
  periodMs: number;
  startTime: number;
}

export function createLightCycle(now: number): LightCycle {
  return {
    periodMs: DEFAULT_PERIOD_MS,
    startTime: now,
  };
}

/** Returns 0–1, where 1 is peak light and 0 is full dark. */
export function getLightLevel(cycle: LightCycle, now: number): number {
  const phase = ((now - cycle.startTime) % cycle.periodMs) / cycle.periodMs;
  // sin goes -1 to 1, remap to 0–1
  return (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
}

/** Returns 0–1 phase position in the cycle (for the indicator). */
export function getLightPhase(cycle: LightCycle, now: number): number {
  return ((now - cycle.startTime) % cycle.periodMs) / cycle.periodMs;
}
