export interface CellProperties {
  foodAdhesion: number;    // 0–1, how strongly food sticks
  stiffness: number;       // constraint stiffness for soft body
  baseRadius: number;      // base radius before growth
  growthScale: number;     // current growth multiplier (starts at 1)
}

export function defaultCellProperties(): CellProperties {
  return {
    foodAdhesion: 1.0,
    stiffness: 0.3,
    baseRadius: 50,
    growthScale: 1.0,
  };
}
