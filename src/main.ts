import { initGame, gameLoop, resizeCanvas } from './engine/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const state = initGame(canvas);

window.addEventListener('resize', () => {
  resizeCanvas(canvas);
});

gameLoop(state);
