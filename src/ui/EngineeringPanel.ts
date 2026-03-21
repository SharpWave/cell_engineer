import { Cell } from '../creature/Cell';
import { EnergyState, spendEnergy } from '../simulation/Energy';
import {
  MODULE_CATALOG, ModuleSubtype, createModule, createCascade, findNextMembraneIndex,
} from '../creature/Module';

const PURCHASABLE: ModuleSubtype[] = [
  'waste_sensor', 'waste_exocytosis', 'waste_adherence_mod',
];

/**
 * Build (or rebuild) the full engineering panel DOM inside the container.
 * Called when the cell is first selected or when modules change.
 */
export function buildEngineeringPanel(
  container: HTMLElement,
  cell: Cell,
  energy: EnergyState,
): void {
  container.innerHTML = '';

  // -- Current modules --
  const modSection = document.createElement('div');
  modSection.innerHTML = '<div class="prop-title">Modules</div>';

  for (const mod of cell.modules) {
    const info = MODULE_CATALOG[mod.subtype];
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span class="stat-label">${info.label}</span>
      <span class="stat-value" data-mod-id="${mod.id}"
        style="color:${mod.active ? info.activeColor : info.color}">
        ${mod.active ? 'ACTIVE' : 'idle'}
      </span>
    `;
    modSection.appendChild(row);

    // Threshold config for waste sensor
    if (mod.subtype === 'waste_sensor') {
      const sliderRow = document.createElement('div');
      sliderRow.className = 'stat-row';
      sliderRow.style.alignItems = 'center';
      sliderRow.innerHTML = `
        <span class="stat-label">Threshold</span>
        <span style="display:flex;align-items:center;gap:6px">
          <input type="range" min="1" max="30" value="${mod.config.threshold ?? 5}"
            class="eng-slider" data-threshold-for="${mod.id}">
          <span class="stat-value" data-threshold-val="${mod.id}">${mod.config.threshold ?? 5}</span>
        </span>
      `;
      modSection.appendChild(sliderRow);
    }
  }

  container.appendChild(modSection);

  // -- Add module buttons --
  const remaining = PURCHASABLE.filter(s => !cell.modules.some(m => m.subtype === s));
  if (remaining.length > 0) {
    const addSection = document.createElement('div');
    addSection.className = 'prop-section';
    addSection.innerHTML = '<div class="prop-title">Add Module</div>';

    for (const subtype of remaining) {
      const info = MODULE_CATALOG[subtype];
      const btn = document.createElement('button');
      btn.className = 'eng-btn';
      btn.textContent = `${info.label} (${info.cost})`;
      btn.disabled = energy.current < info.cost;
      btn.addEventListener('click', () => {
        if (spendEnergy(energy, info.cost)) {
          const idx = findNextMembraneIndex(cell.modules);
          cell.modules.push(createModule(subtype, idx));
          buildEngineeringPanel(container, cell, energy);
        }
      });
      addSection.appendChild(btn);
    }

    container.appendChild(addSection);
  }

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
    row.innerHTML = `
      <span class="stat-label">${MODULE_CATALOG[from.subtype].label}</span>
      <span class="stat-value">&rarr; ${MODULE_CATALOG[to.subtype].label}</span>
    `;
    casSection.appendChild(row);
  }

  // Connect UI
  const sensors = cell.modules.filter(m => MODULE_CATALOG[m.subtype].category === 'sensor');
  const targets = cell.modules.filter(m => MODULE_CATALOG[m.subtype].category !== 'sensor');

  if (sensors.length > 0 && targets.length > 0) {
    const connectRow = document.createElement('div');
    connectRow.style.marginTop = '8px';

    const fromSelect = document.createElement('select');
    fromSelect.className = 'eng-select';
    for (const s of sensors) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = MODULE_CATALOG[s.subtype].label;
      fromSelect.appendChild(opt);
    }

    const toSelect = document.createElement('select');
    toSelect.className = 'eng-select';
    for (const t of targets) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = MODULE_CATALOG[t.subtype].label;
      toSelect.appendChild(opt);
    }

    const linkBtn = document.createElement('button');
    linkBtn.className = 'eng-btn';
    linkBtn.textContent = 'Link (1)';
    linkBtn.addEventListener('click', () => {
      const fromId = fromSelect.value;
      const toId = toSelect.value;
      const exists = cell.cascades.some(c => c.fromId === fromId && c.toId === toId);
      if (!exists && spendEnergy(energy, 1)) {
        cell.cascades.push(createCascade(fromId, toId));
        buildEngineeringPanel(container, cell, energy);
      }
    });

    const arrowSpan = document.createElement('span');
    arrowSpan.textContent = ' → ';
    arrowSpan.style.color = '#8888a8';

    connectRow.appendChild(fromSelect);
    connectRow.appendChild(arrowSpan);
    connectRow.appendChild(toSelect);
    connectRow.appendChild(document.createElement('br'));
    connectRow.appendChild(linkBtn);

    casSection.appendChild(connectRow);
  }

  container.appendChild(casSection);

  // -- Wire up threshold sliders after DOM is built --
  const sliders = container.querySelectorAll('.eng-slider[data-threshold-for]');
  sliders.forEach(slider => {
    const input = slider as HTMLInputElement;
    const modId = input.dataset.thresholdFor!;
    const valSpan = container.querySelector(`[data-threshold-val="${modId}"]`);
    input.addEventListener('input', () => {
      const mod = cell.modules.find(m => m.id === modId);
      if (mod) {
        mod.config.threshold = parseInt(input.value);
        if (valSpan) valSpan.textContent = input.value;
      }
    });
  });
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
