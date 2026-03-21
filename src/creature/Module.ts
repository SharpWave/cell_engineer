export type ModuleSubtype =
  | 'adhesion_sensor'
  | 'endocytosis'
  | 'waste_sensor'
  | 'waste_exocytosis'
  | 'waste_adherence_mod';

export interface CellModule {
  id: string;
  subtype: ModuleSubtype;
  membraneIndex: number;
  active: boolean;
  config: { threshold?: number };
}

export interface SignalCascade {
  id: string;
  fromId: string;
  toId: string;
}

/** What the module system produces each frame for the simulation to act on */
export interface ModuleEffects {
  endocytosisActive: boolean;
  wastePermeable: boolean;
  wastePushActive: boolean;
}

export const MODULE_CATALOG: Record<ModuleSubtype, {
  label: string;
  cost: number;
  color: string;
  activeColor: string;
  category: 'sensor' | 'effector' | 'modulator';
}> = {
  adhesion_sensor:    { label: 'Adhesion Sensor',  cost: 0, color: '#2a7a5a', activeColor: '#4aff8a', category: 'sensor' },
  endocytosis:        { label: 'Endocytosis',      cost: 0, color: '#2a5a7a', activeColor: '#4a8aff', category: 'effector' },
  waste_sensor:       { label: 'Waste Sensor',     cost: 5, color: '#7a6a2a', activeColor: '#ffcc4a', category: 'sensor' },
  waste_exocytosis:   { label: 'Waste Exocytosis', cost: 5, color: '#5a2a7a', activeColor: '#aa4aff', category: 'effector' },
  waste_adherence_mod:{ label: 'Waste Adherence',  cost: 5, color: '#7a2a4a', activeColor: '#ff4a8a', category: 'modulator' },
};

let nextId = 1;

export function createModule(subtype: ModuleSubtype, membraneIndex: number): CellModule {
  return {
    id: `mod_${nextId++}`,
    subtype,
    membraneIndex,
    active: false,
    config: subtype === 'waste_sensor' ? { threshold: 5 } : {},
  };
}

export function createCascade(fromId: string, toId: string): SignalCascade {
  return { id: `cas_${nextId++}`, fromId, toId };
}

export function updateModules(
  modules: CellModule[],
  cascades: SignalCascade[],
  hasStuckFood: boolean,
  wasteCount: number,
): ModuleEffects {
  // Reset all
  for (const m of modules) m.active = false;

  // Sensors read conditions
  for (const m of modules) {
    if (m.subtype === 'adhesion_sensor') {
      m.active = hasStuckFood;
    } else if (m.subtype === 'waste_sensor') {
      m.active = wasteCount > (m.config.threshold ?? 5);
    }
  }

  // Propagate cascades (single pass — no long chains yet)
  for (const c of cascades) {
    const from = modules.find(m => m.id === c.fromId);
    const to = modules.find(m => m.id === c.toId);
    if (from?.active && to) {
      to.active = true;
    }
  }

  return {
    endocytosisActive: modules.some(m => m.subtype === 'endocytosis' && m.active),
    wastePermeable: modules.some(m => m.subtype === 'waste_adherence_mod' && m.active),
    wastePushActive: modules.some(m => m.subtype === 'waste_exocytosis' && m.active),
  };
}

/** Find the next unoccupied membrane index for placing a new module */
export function findNextMembraneIndex(modules: CellModule[]): number {
  const used = new Set(modules.map(m => m.membraneIndex));
  // Start opposite side from starting modules (0, 1)
  for (let i = 8; i < 16; i++) if (!used.has(i)) return i;
  for (let i = 2; i < 8; i++) if (!used.has(i)) return i;
  return 0;
}
