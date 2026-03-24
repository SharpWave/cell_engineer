// --- Parameterization types ---

export type ResourceType = 'carb' | 'protein' | 'waste';
export type TransportDirection = 'endo' | 'exo';
export type MembraneSide = 'internal' | 'external';
export type SurfaceTarget = 'carb' | 'protein' | 'waste' | 'cell';
export type AdherenceMode = 'adherence' | 'repulsion';
export type GrowthMode = 'grow' | 'reduce';

// --- Module subtypes ---

export type ModuleSubtype =
  | 'membrane_transporter'
  | 'internal_sensor'
  | 'membrane_sensor'
  | 'adherence_module'
  | 'light_sensor'
  | 'mitosis'
  | 'rigidity_mod'
  | 'flexibility_mod'
  | 'shaker'
  | 'growth_mod'
  | 'eye'
  | 'foot'
  | 'membrane_length_sensor';

// --- Config ---

export interface ModuleConfig {
  // Shared sensor fields
  threshold?: number;
  mode?: 'above' | 'below';

  // membrane_transporter
  resourceType?: ResourceType;
  direction?: TransportDirection;

  // internal_sensor
  senseResource?: ResourceType;

  // membrane_sensor
  membraneSide?: MembraneSide;
  senseTarget?: SurfaceTarget;

  // adherence_module
  adherenceSide?: MembraneSide;
  adherenceTarget?: SurfaceTarget;
  adherenceMode?: AdherenceMode;

  // growth_mod
  growthMode?: GrowthMode;

  // eye
  eyeTarget?: SurfaceTarget;
  fovDegrees?: number;
  /** Scales the FOV cone area: 0 = no range, 1 = full range (default 1) */
  eyeScale?: number;
}

export interface CellModule {
  id: string;
  subtype: ModuleSubtype;
  membraneIndex: number;
  active: boolean;
  config: ModuleConfig;
}

export interface SignalCascade {
  id: string;
  fromId: string;
  toId: string;
  mode: 'excitatory' | 'inhibitory';
}

// --- Context & Effects ---

export interface ModuleContext {
  carbCount: number;
  proteinCount: number;
  wasteCount: number;
  externalAdhered: Record<SurfaceTarget, number>;
  internalAdhered: Record<SurfaceTarget, number>;
  lightLevel: number;
  maxCellSimilarity: number;
  /** Current membrane length as growthScale (1.0 = default) */
  membraneLength: number;
  /** Module IDs pre-activated by spatial evaluation (e.g., eye) */
  preActivated: Set<string>;
}

export interface TransportChannel {
  resourceType: ResourceType;
  direction: TransportDirection;
}

export interface AdherenceRule {
  side: MembraneSide;
  target: SurfaceTarget;
  mode: AdherenceMode;
}

export interface ModuleEffects {
  activeTransports: TransportChannel[];
  activeAdherence: AdherenceRule[];
  mitosisTriggered: boolean;
  rigidityActive: boolean;
  flexibilityActive: boolean;
  shakerActive: boolean;
  /** Net growth rate: positive = grow, negative = reduce. Each module contributes +1 or -1. */
  netGrowthRate: number;
}

// --- Effect query helpers ---

export function hasTransport(effects: ModuleEffects, resource: ResourceType, dir: TransportDirection): boolean {
  return effects.activeTransports.some(t => t.resourceType === resource && t.direction === dir);
}

export function hasAdherence(effects: ModuleEffects, side: MembraneSide, target: SurfaceTarget): boolean {
  return effects.activeAdherence.some(a => a.side === side && a.target === target && a.mode === 'adherence');
}

export function hasRepulsion(effects: ModuleEffects, side: MembraneSide, target: SurfaceTarget): boolean {
  return effects.activeAdherence.some(a => a.side === side && a.target === target && a.mode === 'repulsion');
}

// --- Catalog ---

export const MODULE_CATALOG: Record<ModuleSubtype, {
  label: string;
  cost: number;
  color: string;
  activeColor: string;
  category: 'sensor' | 'effector' | 'modulator';
}> = {
  membrane_transporter: { label: 'Membrane Transporter', cost: 5,  color: '#2a5a7a', activeColor: '#4a8aff', category: 'effector' },
  internal_sensor:      { label: 'Internal Sensor',      cost: 5,  color: '#7a6a2a', activeColor: '#ffcc4a', category: 'sensor' },
  membrane_sensor:      { label: 'Membrane Sensor',      cost: 5,  color: '#2a7a5a', activeColor: '#4aff8a', category: 'sensor' },
  adherence_module:     { label: 'Adherence Module',     cost: 5,  color: '#7a2a4a', activeColor: '#ff4a8a', category: 'modulator' },
  light_sensor:         { label: 'Light Sensor',         cost: 3,  color: '#6a6a5a', activeColor: '#eeee88', category: 'sensor' },
  mitosis:              { label: 'Mitosis',              cost: 10, color: '#2a6a7a', activeColor: '#4aeeff', category: 'effector' },
  rigidity_mod:         { label: 'Rigidity',             cost: 3,  color: '#6a6a6a', activeColor: '#cccccc', category: 'modulator' },
  flexibility_mod:      { label: 'Flexibility',          cost: 3,  color: '#4a5a6a', activeColor: '#88aacc', category: 'modulator' },
  shaker:               { label: 'Shaker',               cost: 5,  color: '#7a5a2a', activeColor: '#ffaa44', category: 'effector' },
  growth_mod:           { label: 'Growth/Reduction',     cost: 5,  color: '#2a7a3a', activeColor: '#44ff66', category: 'effector' },
  eye:                  { label: 'Eye',                  cost: 8,  color: '#5a5a7a', activeColor: '#ffffff', category: 'sensor' },
  foot:                 { label: 'Foot',                 cost: 8,  color: '#7a4a2a', activeColor: '#ff8844', category: 'effector' },
  membrane_length_sensor: { label: 'Membrane Length Sensor', cost: 4, color: '#5a7a5a', activeColor: '#88ff88', category: 'sensor' },
};

// --- Display label from config ---

export function getModuleDisplayLabel(mod: CellModule): string {
  switch (mod.subtype) {
    case 'membrane_transporter': {
      const res = mod.config.resourceType ?? 'carb';
      const dir = mod.config.direction === 'exo' ? 'Exo' : 'Endo';
      return `${capitalize(res)} ${dir}cytosis [${mod.membraneIndex}]`;
    }
    case 'internal_sensor': {
      const res = mod.config.senseResource ?? 'waste';
      const op = mod.config.mode === 'below' ? '<' : '>';
      const t = mod.config.threshold ?? 5;
      return `${capitalize(res)} Sensor (int) ${op}${t} [${mod.membraneIndex}]`;
    }
    case 'membrane_sensor': {
      const side = mod.config.membraneSide === 'internal' ? 'int' : 'ext';
      const target = mod.config.senseTarget ?? 'carb';
      const op = mod.config.mode === 'below' ? '<' : '≥';
      const t = mod.config.threshold ?? 1;
      return `${capitalize(target)} Sensor (${side}) ${op}${t} [${mod.membraneIndex}]`;
    }
    case 'adherence_module': {
      const side = mod.config.adherenceSide === 'internal' ? 'int' : 'ext';
      const mode = mod.config.adherenceMode === 'repulsion' ? 'Repel' : 'Adhere';
      return `${capitalize(mod.config.adherenceTarget ?? 'carb')} ${mode} (${side}) [${mod.membraneIndex}]`;
    }
    case 'light_sensor':
      return `Light Sensor ≥${mod.config.threshold ?? 50}% [${mod.membraneIndex}]`;
    case 'growth_mod':
      return `${mod.config.growthMode === 'reduce' ? 'Reduction' : 'Growth'} [${mod.membraneIndex}]`;
    case 'eye': {
      const scale = mod.config.eyeScale ?? 1;
      const scalePct = Math.round(scale * 100);
      return `Eye (${capitalize(mod.config.eyeTarget ?? 'carb')}, ${mod.config.fovDegrees ?? 90}°, ${scalePct}%) [${mod.membraneIndex}]`;
    }
    case 'foot':
      return `Foot [${mod.membraneIndex}]`;
    case 'membrane_length_sensor': {
      const op = mod.config.mode === 'below' ? '<' : '≥';
      return `Membrane ${op}${mod.config.threshold ?? 1} [${mod.membraneIndex}]`;
    }
    case 'mitosis':
      return `Mitosis [${mod.membraneIndex}]`;
    case 'rigidity_mod':
      return `Rigidity [${mod.membraneIndex}]`;
    case 'flexibility_mod':
      return `Flexibility [${mod.membraneIndex}]`;
    case 'shaker':
      return `Shaker [${mod.membraneIndex}]`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Module fingerprint key (for cell identity) ---

export function getModuleFingerprintKey(mod: CellModule): string {
  switch (mod.subtype) {
    case 'membrane_transporter':
      return `transport:${mod.config.resourceType}:${mod.config.direction}`;
    case 'adherence_module':
      return `adhere:${mod.config.adherenceSide}:${mod.config.adherenceTarget}:${mod.config.adherenceMode}`;
    case 'internal_sensor':
      return `isens:${mod.config.senseResource}`;
    case 'membrane_sensor':
      return `msens:${mod.config.membraneSide}:${mod.config.senseTarget}`;
    case 'growth_mod':
      return `growth:${mod.config.growthMode}`;
    case 'eye':
      return `eye:${mod.config.eyeTarget}:${mod.config.fovDegrees}:${mod.config.eyeScale ?? 1}`;
    case 'foot':
      return `foot:${mod.membraneIndex}`;
    case 'membrane_length_sensor':
      return `mlsens:${mod.config.threshold}:${mod.config.mode}`;
    default:
      return mod.subtype;
  }
}

// --- Factory ---

let nextId = 1;

function getDefaultConfig(subtype: ModuleSubtype): ModuleConfig {
  switch (subtype) {
    case 'membrane_transporter':
      return { resourceType: 'carb', direction: 'endo' };
    case 'internal_sensor':
      return { senseResource: 'waste', threshold: 5, mode: 'above' };
    case 'membrane_sensor':
      return { membraneSide: 'external', senseTarget: 'carb', threshold: 1, mode: 'above' };
    case 'adherence_module':
      return { adherenceSide: 'external', adherenceTarget: 'carb', adherenceMode: 'adherence' };
    case 'light_sensor':
      return { threshold: 50 };
    case 'growth_mod':
      return { growthMode: 'grow' as GrowthMode };
    case 'eye':
      return { eyeTarget: 'carb' as SurfaceTarget, fovDegrees: 90, eyeScale: 1 };
    case 'membrane_length_sensor':
      return { threshold: 1, mode: 'above' as const };
    default:
      return {};
  }
}

export function createModule(subtype: ModuleSubtype, membraneIndex: number, config?: Partial<ModuleConfig>): CellModule {
  const defaults = getDefaultConfig(subtype);
  return {
    id: `mod_${nextId++}`,
    subtype,
    membraneIndex,
    active: false,
    config: { ...defaults, ...config },
  };
}

export function createCascade(fromId: string, toId: string, mode: 'excitatory' | 'inhibitory' = 'excitatory'): SignalCascade {
  return { id: `cas_${nextId++}`, fromId, toId, mode };
}

// --- Mutation ---

interface MutableParam {
  key: keyof ModuleConfig;
  min: number;
  max: number;
}

const MUTABLE_PARAMS: Partial<Record<ModuleSubtype, MutableParam[]>> = {
  internal_sensor:        [{ key: 'threshold', min: 0, max: 200 }],
  membrane_sensor:        [{ key: 'threshold', min: 0, max: 200 }],
  light_sensor:           [{ key: 'threshold', min: 0, max: 100 }],
  membrane_length_sensor: [{ key: 'threshold', min: 0.1, max: 10 }],
  eye: [
    { key: 'fovDegrees', min: 1, max: 360 },
    { key: 'eyeScale', min: 0, max: 1 },
  ],
};

/** Randomly alter every numerical module parameter by ±30% of its current value. */
export function mutateModules(modules: CellModule[]): void {
  for (const mod of modules) {
    const params = MUTABLE_PARAMS[mod.subtype];
    if (!params) continue;
    for (const { key, min, max } of params) {
      const current = mod.config[key] as number | undefined;
      if (current === undefined) continue;
      const delta = current * (Math.random() * 0.6 - 0.3);
      (mod.config as any)[key] = Math.max(min, Math.min(max, current + delta));
    }
  }
}

// --- Update logic ---

export function updateModules(
  modules: CellModule[],
  cascades: SignalCascade[],
  ctx: ModuleContext,
): ModuleEffects {
  // Reset all modules to cold
  for (const m of modules) m.active = false;

  // Adherence modules are passive membrane properties — intrinsically active
  for (const m of modules) {
    if (m.subtype === 'adherence_module') m.active = true;
  }

  // Evaluate sensors — their intrinsic condition determines base state
  for (const m of modules) {
    switch (m.subtype) {
      case 'internal_sensor': {
        const res = m.config.senseResource ?? 'waste';
        const count = res === 'carb' ? ctx.carbCount
                    : res === 'protein' ? ctx.proteinCount
                    : ctx.wasteCount;
        const t = m.config.threshold ?? 5;
        m.active = m.config.mode === 'below' ? count < t : count > t;
        break;
      }
      case 'membrane_sensor': {
        const side = m.config.membraneSide ?? 'external';
        const target = m.config.senseTarget ?? 'carb';
        const source = side === 'external' ? ctx.externalAdhered : ctx.internalAdhered;
        const count = source[target];
        const t = m.config.threshold ?? 1;
        m.active = m.config.mode === 'below' ? count < t : count >= t;
        break;
      }
      case 'light_sensor': {
        m.active = ctx.lightLevel * 100 >= (m.config.threshold ?? 50);
        break;
      }
      case 'membrane_length_sensor': {
        const t = m.config.threshold ?? 1;
        m.active = m.config.mode === 'below' ? ctx.membraneLength < t : ctx.membraneLength >= t;
        break;
      }
    }
  }

  // Pre-activated modules (spatially evaluated, e.g. eye)
  for (const id of ctx.preActivated) {
    const m = modules.find(mod => mod.id === id);
    if (m) m.active = true;
  }

  // Effectors and modulators are cold by default — only cascades can activate them.
  // Sensors start from their intrinsic evaluation above.

  // Multi-pass cascade propagation: any hot module can source a cascade.
  // Iterate until stable or max passes reached (handles chains and cycles).
  const MAX_CASCADE_PASSES = 10;
  for (let pass = 0; pass < MAX_CASCADE_PASSES; pass++) {
    let changed = false;

    const excited = new Set<string>();
    const inhibited = new Set<string>();
    for (const c of cascades) {
      const from = modules.find(m => m.id === c.fromId);
      if (!from?.active) continue;
      if (c.mode === 'inhibitory') {
        inhibited.add(c.toId);
      } else {
        excited.add(c.toId);
      }
    }

    // Activate excited targets that aren't inhibited
    for (const id of excited) {
      if (inhibited.has(id)) continue;
      const to = modules.find(m => m.id === id);
      if (to && !to.active) {
        to.active = true;
        changed = true;
      }
    }

    // Force-deactivate inhibited targets (overrides sensor intrinsic state)
    for (const id of inhibited) {
      const to = modules.find(m => m.id === id);
      if (to && to.active) {
        to.active = false;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Collect effects
  const activeTransports: TransportChannel[] = [];
  const activeAdherence: AdherenceRule[] = [];
  let mitosisTriggered = false;
  let rigidityActive = false;
  let flexibilityActive = false;
  let shakerActive = false;
  let netGrowthRate = 0;

  for (const m of modules) {
    if (!m.active) continue;
    switch (m.subtype) {
      case 'membrane_transporter':
        activeTransports.push({
          resourceType: m.config.resourceType!,
          direction: m.config.direction!,
        });
        break;
      case 'adherence_module':
        activeAdherence.push({
          side: m.config.adherenceSide!,
          target: m.config.adherenceTarget!,
          mode: m.config.adherenceMode!,
        });
        break;
      case 'mitosis':
        mitosisTriggered = true;
        break;
      case 'rigidity_mod':
        rigidityActive = true;
        break;
      case 'flexibility_mod':
        flexibilityActive = true;
        break;
      case 'shaker':
        shakerActive = true;
        break;
      case 'growth_mod':
        netGrowthRate += m.config.growthMode === 'reduce' ? -1 : 1;
        break;
    }
  }

  return { activeTransports, activeAdherence, mitosisTriggered, rigidityActive, flexibilityActive, shakerActive, netGrowthRate };
}

/** Find the next unoccupied membrane index for placing a new module */
export function findNextMembraneIndex(modules: CellModule[]): number {
  const used = new Set(modules.map(m => m.membraneIndex));
  for (let i = 8; i < 16; i++) if (!used.has(i)) return i;
  for (let i = 3; i < 8; i++) if (!used.has(i)) return i;
  return 0;
}
