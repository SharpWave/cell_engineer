import { createPhysicsWorld, stepPhysics, PhysicsWorld } from './Physics';
import { Camera, createCamera } from './Camera';
import { render } from './Renderer';
import { Cell, createCell, getCellCenter } from '../creature/Cell';
import { Environment, createEnvironment, setupCollisions, updateEnvironment } from '../simulation/Environment';
import { EnergyState, createEnergyState } from '../simulation/Energy';
import { LightCycle, createLightCycle } from '../simulation/LightCycle';
import { updateHUD, updateInspector } from '../ui/HUD';
import { SelectionState, createSelectionState, handleClick } from '../ui/Selection';
import { createFoodParticle } from '../simulation/Food';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;

export interface GameState {
  physics: PhysicsWorld;
  camera: Camera;
  cell: Cell;
  env: Environment;
  energy: EnergyState;
  lightCycle: LightCycle;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  selection: SelectionState;
}

export function initGame(canvas: HTMLCanvasElement): GameState {
  const ctx = canvas.getContext('2d')!;

  resizeCanvas(canvas);

  const now = performance.now();
  const physics = createPhysicsWorld(WORLD_WIDTH, WORLD_HEIGHT);
  const camera = createCamera(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const cell = createCell(physics.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const env = createEnvironment(WORLD_WIDTH, WORLD_HEIGHT);
  const energy = createEnergyState();
  const lightCycle = createLightCycle(now);
  const selection = createSelectionState();

  setupCollisions(physics.engine, cell, env, physics.world);

  // Spawn some initial food
  for (let i = 0; i < 15; i++) {
    const margin = 60;
    const x = margin + Math.random() * (WORLD_WIDTH - margin * 2);
    const y = margin + Math.random() * (WORLD_HEIGHT - margin * 2);
    env.food.push(createFoodParticle(physics.world, x, y));
  }

  // Click handler for selection
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    handleClick(screenX, screenY, camera, canvas, cell, env, selection);
  });

  return { physics, camera, cell, env, energy, lightCycle, canvas, ctx, selection };
}

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const container = document.getElementById('canvas-container');
  if (container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  } else {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

export function gameLoop(state: GameState): void {
  let lastTime = performance.now();
  let hudTimer = 0;

  function tick(now: number): void {
    const delta = Math.min(now - lastTime, 32);
    lastTime = now;

    // Update
    stepPhysics(state.physics, delta);
    updateEnvironment(
      state.env, state.physics.world, state.cell, state.energy,
      now, delta, state.lightCycle,
    );

    // Camera follows cell
    const center = getCellCenter(state.cell);
    state.camera.x += (center.x - state.camera.x) * 0.05;
    state.camera.y += (center.y - state.camera.y) * 0.05;

    // Render
    render(
      state.ctx, state.canvas, state.camera, state.cell, state.env,
      state.physics, state.selection, state.energy, state.lightCycle, now,
    );

    // Update DOM panels at ~10fps
    hudTimer += delta;
    if (hudTimer > 100) {
      hudTimer = 0;
      updateHUD(state.energy, state.cell);
      updateInspector(state.selection, state.energy);
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
