import { initGame, gameLoop, resizeCanvas, CellBlueprint } from './engine/Game';
import { spawnOneFood } from './simulation/Environment';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

// Check if we should start with a blueprint
const pendingBlueprint = sessionStorage.getItem('pending_blueprint');
let startBlueprint: CellBlueprint | undefined;
if (pendingBlueprint) {
  sessionStorage.removeItem('pending_blueprint');
  try { startBlueprint = JSON.parse(pendingBlueprint); } catch { /* ignore */ }
}
const state = initGame(canvas, startBlueprint);

window.addEventListener('resize', () => {
  resizeCanvas(canvas);
});

// Wire up control buttons
const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
const restartBtn = document.getElementById('btn-restart') as HTMLButtonElement;
const focusBtn = document.getElementById('btn-focus-next') as HTMLButtonElement;

pauseBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
});

restartBtn.addEventListener('click', () => {
  if (confirm('Restart simulation? All progress will be lost.')) {
    window.location.reload();
  }
});

focusBtn.addEventListener('click', () => {
  if (state.cells.length === 0) return;
  if (state.focusedCellIndex < 0) {
    state.focusedCellIndex = 0;
  } else {
    state.focusedCellIndex = (state.focusedCellIndex + 1) % state.cells.length;
  }
  const cell = state.cells[state.focusedCellIndex];
  state.selection.current = { type: 'cell', cell };
});

// --- Food spawn rate inputs (food/day) ---
function wireSpawnInput(inputId: string, setter: (v: number) => void): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!isNaN(v) && v >= 0) setter(v);
  });
}

wireSpawnInput('input-carb-rate', v => { state.env.carbSpawnRate = v; });
wireSpawnInput('input-mprotein-rate', v => { state.env.movingProteinSpawnRate = v; });
wireSpawnInput('input-sprotein-rate', v => { state.env.stationaryProteinSpawnRate = v; });

// --- Manual spawn buttons ---
document.getElementById('btn-spawn-carb')!.addEventListener('click', () => {
  spawnOneFood(state.env, state.physics.world, 'carb');
});
document.getElementById('btn-spawn-mprotein')!.addEventListener('click', () => {
  spawnOneFood(state.env, state.physics.world, 'protein');
});
document.getElementById('btn-spawn-sprotein')!.addEventListener('click', () => {
  spawnOneFood(state.env, state.physics.world, 'protein', true);
});

// --- Cell Library (file-based) ---
document.getElementById('btn-save-cell')!.addEventListener('click', () => {
  const sel = state.selection.current;
  if (!sel || sel.type !== 'cell') {
    alert('Select a cell first.');
    return;
  }
  const name = prompt('Name for this cell blueprint:');
  if (!name) return;
  const cell = sel.cell;
  const blueprint: CellBlueprint = {
    name,
    modules: cell.modules.map(m => ({
      id: m.id,
      subtype: m.subtype,
      membraneIndex: m.membraneIndex,
      active: false,
      config: { ...m.config },
    })),
    cascades: cell.cascades.map(c => ({ ...c })),
    properties: {
      foodAdhesion: cell.properties.foodAdhesion,
      stiffness: cell.properties.stiffness,
      baseRadius: cell.properties.baseRadius,
    },
  };
  const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.cell.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-load-cell')!.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.cell.json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const blueprint: CellBlueprint = JSON.parse(reader.result as string);
        if (!blueprint.modules || !blueprint.cascades) {
          alert('Invalid cell blueprint file.');
          return;
        }
        if (!confirm(`Restart with "${blueprint.name || file.name}"? Current progress will be lost.`)) return;
        sessionStorage.setItem('pending_blueprint', JSON.stringify(blueprint));
        window.location.reload();
      } catch {
        alert('Failed to parse cell blueprint file.');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

gameLoop(state);
