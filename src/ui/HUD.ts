import { EnergyState } from '../simulation/Energy';
import { Cell } from '../creature/Cell';
import { SelectionState } from './Selection';
import { buildEngineeringPanel, updateModuleStatuses } from './EngineeringPanel';

export function updateHUD(energy: EnergyState, cell: Cell): void {
  const energyEl = document.getElementById('energy-display');
  const wasteEl = document.getElementById('waste-display');
  const growthEl = document.getElementById('growth-display');

  if (energyEl) energyEl.textContent = String(energy.current);
  if (wasteEl) wasteEl.textContent = String(energy.waste);
  if (growthEl) growthEl.textContent = cell.properties.growthScale.toFixed(2) + 'x';
}

// Track what the panel was last built for so we don't rebuild every frame
let panelBuiltFor: object | null = null;

export function updateInspector(selection: SelectionState, energy?: EnergyState): void {
  const el = document.getElementById('inspector-content');
  if (!el) return;

  if (!selection.current) {
    if (panelBuiltFor !== null) {
      panelBuiltFor = null;
      el.innerHTML = '<span class="inspector-empty">Click a cell or food particle to inspect it.</span>';
    }
    return;
  }

  if (selection.current.type === 'cell') {
    const cell = selection.current.cell;

    if (panelBuiltFor !== cell) {
      // First time selecting this cell — build the full engineering panel
      panelBuiltFor = cell;
      buildEngineeringPanel(el, cell, energy!);
    } else {
      // Just update dynamic statuses
      updateModuleStatuses(el, cell);
    }
    return;
  }

  if (selection.current.type === 'food') {
    const food = selection.current.food;
    if (panelBuiltFor !== food) {
      panelBuiltFor = food;
      if (food.absorbed) {
        el.innerHTML = '<span class="inspector-empty">This food has been absorbed.</span>';
      } else {
        const status = food.stuck ? 'Stuck (absorbing...)' : 'Drifting';
        el.innerHTML = `
          <div class="prop-title">Food Particle</div>
          <div class="stat-row"><span class="stat-label">Energy</span><span class="stat-value energy">${food.energyValue}</span></div>
          <div class="stat-row"><span class="stat-label">Shape</span><span class="stat-value">${food.shape}</span></div>
          <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value">${status}</span></div>
        `;
      }
    }
  }
}
