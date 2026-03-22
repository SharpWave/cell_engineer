import { initGame, gameLoop, resizeCanvas } from './engine/Game';
import { spawnOneFood } from './simulation/Environment';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const state = initGame(canvas);

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

gameLoop(state);
