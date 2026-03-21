export interface EnergyState {
  current: number;
}

export function createEnergyState(): EnergyState {
  return { current: 0 };
}

export function addEnergy(state: EnergyState, amount: number): void {
  state.current += Math.floor(amount);
}
