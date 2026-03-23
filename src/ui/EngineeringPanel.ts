import { Cell } from '../creature/Cell';
import { spendProtein } from '../simulation/Energy';
import {
  MODULE_CATALOG, ModuleSubtype, ModuleConfig, createModule, createCascade,
  getModuleDisplayLabel,
} from '../creature/Module';
import { updateFingerprint } from '../creature/Cell';
import { SelectionState } from './Selection';

/** Subtypes available for purchase */
const PURCHASABLE: ModuleSubtype[] = [
  'membrane_transporter',
  'internal_sensor',
  'membrane_sensor',
  'adherence_module',
  'light_sensor',
  'mitosis',
  'rigidity_mod',
  'flexibility_mod',
  'shaker',
  'growth_mod',
  'eye',
  'foot',
  'membrane_length_sensor',
];

/** All modules now require membrane click placement */

/** Tracks the pending module being configured before confirmation */
let pendingBuild: { subtype: ModuleSubtype; config: ModuleConfig } | null = null;

/** Whether we're waiting for a membrane click */
let awaitingPlacement = false;

/** Eye-specific: configuring after membrane placement (index already chosen) */
let pendingEyeConfig: { membraneIndex: number; config: ModuleConfig } | null = null;

/**
 * Build (or rebuild) the full engineering panel DOM inside the container.
 */
export function buildEngineeringPanel(
  container: HTMLElement,
  cell: Cell,
  selection?: SelectionState,
): void {
  container.innerHTML = '';

  // -- Cell info --
  const infoSection = document.createElement('div');
  infoSection.innerHTML = `<div class="prop-title">Cell #${cell.id}</div>`;
  const fpText = cell.fingerprint.length > 0
    ? cell.fingerprint.join(', ')
    : 'none';
  infoSection.innerHTML += `<div class="stat-row"><span class="stat-label">Fingerprint</span><span class="stat-value" style="font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis">${fpText}</span></div>`;
  container.appendChild(infoSection);

  // -- Current modules (read-only) --
  const modSection = document.createElement('div');
  modSection.className = 'prop-section';
  modSection.innerHTML = '<div class="prop-title">Modules</div>';

  for (const mod of cell.modules) {
    const info = MODULE_CATALOG[mod.subtype];
    const label = getModuleDisplayLabel(mod);
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.style.alignItems = 'center';
    row.innerHTML = `
      <span class="stat-label" style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
      <span class="stat-value" data-mod-id="${mod.id}"
        style="color:${mod.active ? info.activeColor : info.color};min-width:40px;text-align:right;margin-right:4px">
        ${mod.active ? 'ACTIVE' : 'idle'}
      </span>
    `;

    // Inline red x remove button
    const modIndex = cell.modules.indexOf(mod);
    if (modIndex >= 7) {
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Remove module';
      delBtn.style.cssText = 'padding:0 4px;font-size:11px;background:#3a1a1a;color:#ff4444;border:1px solid #662222;border-radius:3px;cursor:pointer;line-height:16px;flex-shrink:0';
      delBtn.addEventListener('click', () => {
        cell.cascades = cell.cascades.filter(c => c.fromId !== mod.id && c.toId !== mod.id);
        cell.modules.splice(cell.modules.indexOf(mod), 1);
        updateFingerprint(cell);
        buildEngineeringPanel(container, cell, selection);
      });
      row.appendChild(delBtn);
    }

    modSection.appendChild(row);
  }

  container.appendChild(modSection);

  // -- Add module section --
  const addSection = document.createElement('div');
  addSection.className = 'prop-section';
  addSection.innerHTML = '<div class="prop-title">Add Module</div>';

  if (pendingEyeConfig) {
    // Eye-specific: already placed on membrane, now configuring with live preview
    const eyeInfo = MODULE_CATALOG['eye'];
    const config = pendingEyeConfig.config;

    const header = document.createElement('div');
    header.className = 'stat-row';
    header.innerHTML = `<span class="stat-label" style="color:${eyeInfo.color};font-weight:bold">Eye [${pendingEyeConfig.membraneIndex}]</span><span class="stat-value">${eyeInfo.cost}P</span>`;
    addSection.appendChild(header);

    addSection.appendChild(buildConfigSelect('Target', ['carb', 'protein', 'waste', 'cell'], config.eyeTarget ?? 'carb', v => {
      config.eyeTarget = v as any;
      if (selection) selection.pendingEyePreview = { membraneIndex: pendingEyeConfig!.membraneIndex, config };
    }));
    addSection.appendChild(buildConfigNumber('FOV (°)', config.fovDegrees ?? 90, v => {
      config.fovDegrees = v;
      if (selection) selection.pendingEyePreview = { membraneIndex: pendingEyeConfig!.membraneIndex, config };
    }));
    addSection.appendChild(buildConfigSlider('Range', config.eyeScale ?? 1, 0, 1, 0.05, v => {
      config.eyeScale = v;
      if (selection) selection.pendingEyePreview = { membraneIndex: pendingEyeConfig!.membraneIndex, config };
    }));

    // Set initial preview
    if (selection) selection.pendingEyePreview = { membraneIndex: pendingEyeConfig.membraneIndex, config };

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '4px';
    btnRow.style.marginTop = '4px';

    const okBtn = document.createElement('button');
    okBtn.className = 'eng-btn';
    okBtn.style.flex = '1';
    okBtn.style.textAlign = 'center';
    okBtn.style.color = '#4aff8a';
    okBtn.textContent = 'Confirm';
    okBtn.disabled = cell.energy.protein < eyeInfo.cost;
    okBtn.addEventListener('click', () => {
      if (spendProtein(cell.energy, eyeInfo.cost)) {
        const mod = createModule('eye', pendingEyeConfig!.membraneIndex, config);
        cell.modules.push(mod);
        updateFingerprint(cell);
      }
      pendingEyeConfig = null;
      if (selection) selection.pendingEyePreview = null;
      buildEngineeringPanel(container, cell, selection);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'eng-btn';
    cancelBtn.style.flex = '1';
    cancelBtn.style.textAlign = 'center';
    cancelBtn.style.color = '#ff6666';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      pendingEyeConfig = null;
      if (selection) selection.pendingEyePreview = null;
      buildEngineeringPanel(container, cell, selection);
    });

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    addSection.appendChild(btnRow);
  } else if (awaitingPlacement) {
    // Waiting for membrane click
    const msg = document.createElement('div');
    msg.style.color = '#e0c878';
    msg.style.fontSize = '12px';
    msg.style.padding = '8px 0';
    msg.textContent = 'Click on the cell membrane to place the module...';
    addSection.appendChild(msg);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'eng-btn';
    cancelBtn.style.color = '#ff6666';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      awaitingPlacement = false;
      pendingBuild = null;
      if (selection) {
        selection.pendingPlacement = null;
        selection.pendingEyePreview = null;
      }
      buildEngineeringPanel(container, cell, selection);
    });
    addSection.appendChild(cancelBtn);
  } else if (pendingBuild) {
    // Show config UI for the pending module
    const subtype = pendingBuild.subtype;
    const info = MODULE_CATALOG[subtype];
    const config = pendingBuild.config;

    const header = document.createElement('div');
    header.className = 'stat-row';
    header.innerHTML = `<span class="stat-label" style="color:${info.color};font-weight:bold">${info.label}</span><span class="stat-value">${info.cost}P</span>`;
    addSection.appendChild(header);

    if (subtype === 'internal_sensor') {
      addSection.appendChild(buildConfigSelect('Resource', ['carb', 'protein', 'waste'], config.senseResource ?? 'waste', v => { config.senseResource = v as any; }));
      addSection.appendChild(buildConfigNumber('Threshold', config.threshold ?? 5, v => { config.threshold = v; }));
      addSection.appendChild(buildConfigSelect('Mode', ['above', 'below'], config.mode ?? 'above', v => { config.mode = v as any; }));
    }
    if (subtype === 'membrane_sensor') {
      addSection.appendChild(buildConfigSelect('Side', ['external', 'internal'], config.membraneSide ?? 'external', v => { config.membraneSide = v as any; }));
      addSection.appendChild(buildConfigSelect('Target', ['carb', 'protein', 'waste', 'cell'], config.senseTarget ?? 'carb', v => { config.senseTarget = v as any; }));
      addSection.appendChild(buildConfigNumber('Threshold', config.threshold ?? 1, v => { config.threshold = v; }));
      addSection.appendChild(buildConfigSelect('Mode', ['above', 'below'], config.mode ?? 'above', v => { config.mode = v as any; }));
    }
    if (subtype === 'membrane_transporter') {
      addSection.appendChild(buildConfigSelect('Resource', ['carb', 'protein', 'waste'], config.resourceType ?? 'carb', v => { config.resourceType = v as any; }));
      addSection.appendChild(buildConfigSelect('Direction', ['endo', 'exo'], config.direction ?? 'endo', v => { config.direction = v as any; }));
    }
    if (subtype === 'adherence_module') {
      addSection.appendChild(buildConfigSelect('Side', ['external', 'internal'], config.adherenceSide ?? 'external', v => { config.adherenceSide = v as any; }));
      addSection.appendChild(buildConfigSelect('Target', ['carb', 'protein', 'waste', 'cell'], config.adherenceTarget ?? 'carb', v => { config.adherenceTarget = v as any; }));
      addSection.appendChild(buildConfigSelect('Mode', ['adherence', 'repulsion'], config.adherenceMode ?? 'adherence', v => { config.adherenceMode = v as any; }));
    }
    if (subtype === 'light_sensor') {
      addSection.appendChild(buildConfigNumber('Light %', config.threshold ?? 50, v => { config.threshold = v; }));
    }
    if (subtype === 'growth_mod') {
      addSection.appendChild(buildConfigSelect('Mode', ['grow', 'reduce'], config.growthMode ?? 'grow', v => { config.growthMode = v as any; }));
    }
    if (subtype === 'membrane_length_sensor') {
      addSection.appendChild(buildConfigNumber('Threshold', config.threshold ?? 1, v => { config.threshold = v; }));
      addSection.appendChild(buildConfigSelect('Mode', ['above', 'below'], config.mode ?? 'above', v => { config.mode = v as any; }));
    }
    // foot, eye handled separately; other subtypes with no config

    // Confirm / Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '4px';
    btnRow.style.marginTop = '4px';

    const okBtn = document.createElement('button');
    okBtn.className = 'eng-btn';
    okBtn.style.flex = '1';
    okBtn.style.textAlign = 'center';
    okBtn.style.color = '#4aff8a';
    okBtn.textContent = 'Place on membrane';
    okBtn.disabled = cell.energy.protein < info.cost;
    okBtn.addEventListener('click', () => {
      if (!selection) return;
      // Enter placement mode — wait for membrane click
      awaitingPlacement = true;
      selection.pendingPlacement = (membraneIndex: number) => {
        if (spendProtein(cell.energy, info.cost)) {
          const mod = createModule(subtype, membraneIndex, config);
          cell.modules.push(mod);
          updateFingerprint(cell);
        }
        awaitingPlacement = false;
        pendingBuild = null;
        buildEngineeringPanel(container, cell, selection);
      };
      buildEngineeringPanel(container, cell, selection);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'eng-btn';
    cancelBtn.style.flex = '1';
    cancelBtn.style.textAlign = 'center';
    cancelBtn.style.color = '#ff6666';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      pendingBuild = null;
      buildEngineeringPanel(container, cell, selection);
    });

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    addSection.appendChild(btnRow);
  } else {
    // Show purchase buttons
    for (const subtype of PURCHASABLE) {
      const info = MODULE_CATALOG[subtype];
      const btn = document.createElement('button');
      btn.className = 'eng-btn';
      btn.textContent = `${info.label} (${info.cost}P)`;
      btn.disabled = cell.energy.protein < info.cost;
      btn.addEventListener('click', () => {
        if (subtype === 'eye') {
          // Eye: place first, then configure with live preview
          if (!selection) return;
          awaitingPlacement = true;
          selection.pendingPlacement = (membraneIndex: number) => {
            awaitingPlacement = false;
            pendingEyeConfig = { membraneIndex, config: getDefaultBuildConfig('eye') };
            buildEngineeringPanel(container, cell, selection);
          };
          buildEngineeringPanel(container, cell, selection);
        } else {
          pendingBuild = { subtype, config: getDefaultBuildConfig(subtype) };
          buildEngineeringPanel(container, cell, selection);
        }
      });
      addSection.appendChild(btn);
    }
  }

  container.appendChild(addSection);

  // -- Signal cascades --
  const casSection = document.createElement('div');
  casSection.className = 'prop-section';
  casSection.innerHTML = '<div class="prop-title">Signal Cascades</div>';

  for (const cas of cell.cascades) {
    const from = cell.modules.find(m => m.id === cas.fromId);
    const to = cell.modules.find(m => m.id === cas.toId);
    if (!from || !to) continue;
    const row = document.createElement('div');
    row.className = 'stat-row';
    const arrow = cas.mode === 'inhibitory' ? '&#x22A3;' : '&rarr;';
    const color = cas.mode === 'inhibitory' ? '#ff6666' : '#c8c8d4';
    row.innerHTML = `
      <span class="stat-label" style="font-size:11px">${getModuleDisplayLabel(from)}</span>
      <span class="stat-value" style="font-size:11px;color:${color}">${arrow} ${getModuleDisplayLabel(to)}</span>
    `;
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = 'x';
    delBtn.style.cssText = 'margin-left:4px;padding:0 4px;font-size:10px;background:#1e1e3a;color:#ff6666;border:1px solid #3a3a5a;border-radius:3px;cursor:pointer;font-family:monospace';
    delBtn.addEventListener('click', () => {
      cell.cascades = cell.cascades.filter(c => c.id !== cas.id);
      buildEngineeringPanel(container, cell, selection);
    });
    row.appendChild(delBtn);
    casSection.appendChild(row);
  }

  // Connect UI — any module can be a source or target
  if (cell.modules.length >= 2) {
    const connectRow = document.createElement('div');
    connectRow.style.marginTop = '8px';

    const fromSelect = document.createElement('select');
    fromSelect.className = 'eng-select';
    for (const m of cell.modules) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = getModuleDisplayLabel(m);
      fromSelect.appendChild(opt);
    }
    fromSelect.addEventListener('focus', () => { if (selection) selection.highlightedModuleId = fromSelect.value; });
    fromSelect.addEventListener('change', () => { if (selection) selection.highlightedModuleId = fromSelect.value; });
    fromSelect.addEventListener('blur', () => { if (selection) selection.highlightedModuleId = null; });

    const modeSelect = document.createElement('select');
    modeSelect.className = 'eng-select';
    modeSelect.style.maxWidth = '70px';
    const exOpt = document.createElement('option');
    exOpt.value = 'excitatory';
    exOpt.textContent = '→ excite';
    modeSelect.appendChild(exOpt);
    const inhOpt = document.createElement('option');
    inhOpt.value = 'inhibitory';
    inhOpt.textContent = '⊣ inhibit';
    modeSelect.appendChild(inhOpt);

    const toSelect = document.createElement('select');
    toSelect.className = 'eng-select';
    for (const m of cell.modules) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = getModuleDisplayLabel(m);
      toSelect.appendChild(opt);
    }
    toSelect.addEventListener('focus', () => { if (selection) selection.highlightedModuleId = toSelect.value; });
    toSelect.addEventListener('change', () => { if (selection) selection.highlightedModuleId = toSelect.value; });
    toSelect.addEventListener('blur', () => { if (selection) selection.highlightedModuleId = null; });

    const linkBtn = document.createElement('button');
    linkBtn.className = 'eng-btn';
    linkBtn.textContent = 'Link (1P)';
    linkBtn.addEventListener('click', () => {
      const fromId = fromSelect.value;
      const toId = toSelect.value;
      const mode = modeSelect.value as 'excitatory' | 'inhibitory';
      const exists = cell.cascades.some(c => c.fromId === fromId && c.toId === toId && c.mode === mode);
      if (!exists && spendProtein(cell.energy, 1)) {
        cell.cascades.push(createCascade(fromId, toId, mode));
        buildEngineeringPanel(container, cell, selection);
      }
    });

    connectRow.appendChild(fromSelect);
    connectRow.appendChild(modeSelect);
    connectRow.appendChild(toSelect);
    connectRow.appendChild(document.createElement('br'));
    connectRow.appendChild(linkBtn);

    casSection.appendChild(connectRow);
  }

  container.appendChild(casSection);
}

/** Default config values for the build configurator */
function getDefaultBuildConfig(subtype: ModuleSubtype): ModuleConfig {
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
      return { growthMode: 'grow' };
    case 'eye':
      return { eyeTarget: 'carb', fovDegrees: 90, eyeScale: 1 };
    case 'membrane_length_sensor':
      return { threshold: 1, mode: 'above' };
    default:
      return {};
  }
}

function buildConfigSelect(
  label: string,
  options: string[],
  current: string,
  onChange: (value: string) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'stat-row';
  row.style.alignItems = 'center';
  const optionsHtml = options.map(o =>
    `<option value="${o}" ${o === current ? 'selected' : ''}>${capitalize(o)}</option>`
  ).join('');
  row.innerHTML = `
    <span class="stat-label">${label}</span>
    <select class="eng-select">${optionsHtml}</select>
  `;
  const select = row.querySelector('select')!;
  select.addEventListener('change', () => onChange(select.value));
  return row;
}

function buildConfigNumber(
  label: string,
  value: number,
  onChange: (value: number) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'stat-row';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <span class="stat-label">${label}</span>
    <input type="number" step="any" value="${value}" class="eng-number-input"
      style="width:60px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:3px;padding:2px 4px;font-size:12px;text-align:right">
  `;
  const input = row.querySelector('input')!;
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!isNaN(v)) onChange(v);
  });
  return row;
}

function buildConfigSlider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'stat-row';
  row.style.alignItems = 'center';
  const pct = Math.round(value * 100);
  row.innerHTML = `
    <span class="stat-label">${label} <span class="slider-pct">${pct}%</span></span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"
      style="width:80px;accent-color:#4a8aff">
  `;
  const input = row.querySelector('input')!;
  const pctSpan = row.querySelector('.slider-pct')!;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    pctSpan.textContent = `${Math.round(v * 100)}%`;
    if (!isNaN(v)) onChange(v);
  });
  return row;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lightweight update: just refresh module active states without rebuilding */
export function updateModuleStatuses(container: HTMLElement, cell: Cell): void {
  for (const mod of cell.modules) {
    const info = MODULE_CATALOG[mod.subtype];
    const el = container.querySelector(`[data-mod-id="${mod.id}"]`) as HTMLElement;
    if (el) {
      el.style.color = mod.active ? info.activeColor : info.color;
      el.textContent = mod.active ? 'ACTIVE' : 'idle';
    }
  }
}
