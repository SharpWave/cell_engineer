import { EnergyState } from '../simulation/Energy';
import { Cell } from '../creature/Cell';
import { SelectionState } from './Selection';

export function updateHUD(energy: EnergyState, cell: Cell): void {
  const energyEl = document.getElementById('energy-display');
  const wasteEl = document.getElementById('waste-display');
  const growthEl = document.getElementById('growth-display');

  if (energyEl) energyEl.textContent = String(energy.current);
  if (wasteEl) wasteEl.textContent = String(energy.waste);
  if (growthEl) growthEl.textContent = cell.properties.growthScale.toFixed(2) + 'x';
}

export function updateInspector(selection: SelectionState, energy?: EnergyState): void {
  const el = document.getElementById('inspector-content');
  if (!el) return;

  if (!selection.current) {
    el.innerHTML = '<span class="inspector-empty">Click a cell or food particle to inspect it.</span>';
    return;
  }

  if (selection.current.type === 'cell') {
    const cell = selection.current.cell;
    const props = cell.properties;
    el.innerHTML = `
      <div class="prop-title">Cell</div>
      <div class="stat-row"><span class="stat-label">Adhesion</span><span class="stat-value">${props.foodAdhesion.toFixed(1)}</span></div>
      <div class="stat-row"><span class="stat-label">Stiffness</span><span class="stat-value">${props.stiffness.toFixed(2)}</span></div>
      <div class="stat-row"><span class="stat-label">Base Radius</span><span class="stat-value">${props.baseRadius}</span></div>
      <div class="stat-row"><span class="stat-label">Growth</span><span class="stat-value">${props.growthScale.toFixed(2)}x</span></div>
      <div class="stat-row"><span class="stat-label">Energy</span><span class="stat-value energy">${energy?.current ?? 0}</span></div>
      <div class="stat-row"><span class="stat-label">Waste</span><span class="stat-value" style="color:#7a5c3a">${energy?.waste ?? 0}</span></div>
      <div class="prop-section">
        <div class="prop-title">Signal Cascades</div>
        <div class="stat-row"><span class="stat-label">food_contact</span><span class="stat-value">→ endocytosis</span></div>
      </div>
    `;
    return;
  }

  if (selection.current.type === 'food') {
    const food = selection.current.food;
    if (food.absorbed) {
      el.innerHTML = '<span class="inspector-empty">This food has been absorbed.</span>';
      return;
    }
    const status = food.stuck ? 'Stuck (absorbing...)' : 'Drifting';
    el.innerHTML = `
      <div class="prop-title">Food Particle</div>
      <div class="stat-row"><span class="stat-label">Energy</span><span class="stat-value energy">${food.energyValue}</span></div>
      <div class="stat-row"><span class="stat-label">Shape</span><span class="stat-value">${food.shape}</span></div>
      <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value">${status}</span></div>
    `;
  }
}
