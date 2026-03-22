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
  window.location.reload();
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

// --- Food spawn rate sliders ---
function wireSpawnSlider(sliderId: string, valId: string, setter: (v: number) => void): void {
  const slider = document.getElementById(sliderId) as HTMLInputElement;
  const valEl = document.getElementById(valId)!;
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value);
    valEl.textContent = String(v);
    setter(v / 10); // slider 0-50 maps to 0x-5x
  });
}

wireSpawnSlider('slider-carb-rate', 'val-carb-rate', v => { state.env.carbSpawnRate = v; });
wireSpawnSlider('slider-mprotein-rate', 'val-mprotein-rate', v => { state.env.movingProteinSpawnRate = v; });
wireSpawnSlider('slider-sprotein-rate', 'val-sprotein-rate', v => { state.env.stationaryProteinSpawnRate = v; });

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
