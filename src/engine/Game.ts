import { PhysicsWorld, createPhysicsWorld, stepPhysics } from './Physics';
import { Camera, createCamera } from './Camera';
import { render } from './Renderer';
import { Cell, createCell, getCellCenter } from '../creature/Cell';
import { Environment, createEnvironment, setupCollisions, updateEnvironment } from '../simulation/Environment';
import { EnergyState, createEnergyState } from '../simulation/Energy';
import { drawHUD } from '../ui/HUD';
import { createFoodParticle } from '../simulation/Food';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;

export interface GameState {
  physics: PhysicsWorld;
  camera: Camera;
  cell: Cell;
  env: Environment;
  energy: EnergyState;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function initGame(canvas: HTMLCanvasElement): GameState {
  const ctx = canvas.getContext('2d')!;

  resizeCanvas(canvas);

  const physics = createPhysicsWorld(WORLD_WIDTH, WORLD_HEIGHT);
  const camera = createCamera(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const cell = createCell(physics.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const env = createEnvironment(WORLD_WIDTH, WORLD_HEIGHT);
  const energy = createEnergyState();

  setupCollisions(physics.engine, cell, env, physics.world);

  // Spawn some initial food
  for (let i = 0; i < 15; i++) {
    const margin = 60;
    const x = margin + Math.random() * (WORLD_WIDTH - margin * 2);
    const y = margin + Math.random() * (WORLD_HEIGHT - margin * 2);
    env.food.push(createFoodParticle(physics.world, x, y));
  }

  return { physics, camera, cell, env, energy, canvas, ctx };
}

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

export function gameLoop(state: GameState): void {
  let lastTime = performance.now();

  function tick(now: number): void {
    const delta = Math.min(now - lastTime, 32); // cap at ~30fps min
    lastTime = now;

    // Update
    stepPhysics(state.physics, delta);
    updateEnvironment(state.env, state.physics.world, state.cell, state.energy, now);

    // Camera follows cell
    const center = getCellCenter(state.cell);
    state.camera.x += (center.x - state.camera.x) * 0.05;
    state.camera.y += (center.y - state.camera.y) * 0.05;

    // Render
    render(state.ctx, state.canvas, state.camera, state.cell, state.env, state.physics);
    drawHUD(state.ctx, state.energy);

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
