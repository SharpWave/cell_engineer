import { createPhysicsWorld, stepPhysics, PhysicsWorld } from './Physics';
import { Camera, createCamera } from './Camera';
import { render } from './Renderer';
import { Cell, createCell, getCellCenter } from '../creature/Cell';
import { Environment, createEnvironment, setupCollisions, updateEnvironment, DAY_CYCLE_MS } from '../simulation/Environment';
import { spendLog, sumEvents } from '../simulation/Energy';
import { LightCycle, createLightCycle } from '../simulation/LightCycle';
import { updateHUD, updateInspector } from '../ui/HUD';
import { SelectionState, createSelectionState, handleClick } from '../ui/Selection';
import { createFoodParticle } from '../simulation/Food';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;

export interface GameState {
  physics: PhysicsWorld;
  camera: Camera;
  cells: Cell[];
  env: Environment;
  lightCycle: LightCycle;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  selection: SelectionState;
  paused: boolean;
  /** Index of the cell the camera is focused on (-1 = free camera) */
  focusedCellIndex: number;
}

export function initGame(canvas: HTMLCanvasElement): GameState {
  const ctx = canvas.getContext('2d')!;

  resizeCanvas(canvas);

  const now = performance.now();
  const physics = createPhysicsWorld(WORLD_WIDTH, WORLD_HEIGHT);
  const camera = createCamera(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const cell = createCell(physics.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const env = createEnvironment(WORLD_WIDTH, WORLD_HEIGHT);
  const lightCycle = createLightCycle(now);
  const selection = createSelectionState();

  const cells = [cell];

  setupCollisions(physics.engine, cells, env, physics.world);

  // Spawn some initial food (mostly carbs, some protein)
  for (let i = 0; i < 15; i++) {
    const margin = 60;
    const x = margin + Math.random() * (WORLD_WIDTH - margin * 2);
    const y = margin + Math.random() * (WORLD_HEIGHT - margin * 2);
    const type = Math.random() < 0.75 ? 'carb' as const : 'protein' as const;
    env.food.push(createFoodParticle(physics.world, x, y, type));
  }

  // Spawn a few stationary protein deposits
  for (let i = 0; i < 4; i++) {
    const margin = 150;
    const x = margin + Math.random() * (WORLD_WIDTH - margin * 2);
    const y = margin + Math.random() * (WORLD_HEIGHT - margin * 2);
    env.food.push(createFoodParticle(physics.world, x, y, 'protein', true));
  }

  // Click handler for selection
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    handleClick(screenX, screenY, camera, canvas, cells, env, selection);
  });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    camera.zoom = Math.max(0.3, Math.min(3, camera.zoom * zoomFactor));
  }, { passive: false });

  // Middle-click drag for panning
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle button
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = (e.clientX - panStartX) / camera.zoom;
      const dy = (e.clientY - panStartY) / camera.zoom;
      camera.x -= dx;
      camera.y -= dy;
      panStartX = e.clientX;
      panStartY = e.clientY;
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 1) isPanning = false;
  });

  const state: GameState = {
    physics, camera, cells, env, lightCycle, canvas, ctx, selection,
    paused: false,
    focusedCellIndex: 0,
  };

  return state;
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

    if (!state.paused) {
      // Update
      stepPhysics(state.physics, delta);
      updateEnvironment(
        state.env, state.physics.world, state.cells,
        now, delta, state.lightCycle,
      );
    }

    // Camera follows focused cell
    if (state.focusedCellIndex >= 0 && state.focusedCellIndex < state.cells.length) {
      const focusedCell = state.cells[state.focusedCellIndex];
      const center = getCellCenter(focusedCell);
      state.camera.x += (center.x - state.camera.x) * 0.05;
      state.camera.y += (center.y - state.camera.y) * 0.05;
    }

    // Render (always, even when paused)
    render(
      state.ctx, state.canvas, state.camera, state.cells, state.env,
      state.physics, state.selection, state.lightCycle, now, state.paused,
    );

    // Update DOM panels at ~10fps
    hudTimer += delta;
    if (hudTimer > 100) {
      hudTimer = 0;
      const hudCell = state.selection.current?.type === 'cell'
        ? state.selection.current.cell
        : (state.focusedCellIndex >= 0 && state.focusedCellIndex < state.cells.length)
          ? state.cells[state.focusedCellIndex]
          : (state.cells[0] ?? null);
      if (hudCell) {
        updateHUD(hudCell.energy, hudCell);
      }
      updateInspector(state.selection);

      // Update cell count
      const cellCountEl = document.getElementById('cell-count');
      if (cellCountEl) cellCountEl.textContent = String(state.cells.length);

      // Update rolling daily stats
      const rs = state.env.rollingStats;
      const dcs = document.getElementById('daily-carbs-spawned');
      const dcc = document.getElementById('daily-carbs-consumed');
      const dps = document.getElementById('daily-protein-spawned');
      const dpp = document.getElementById('daily-protein-produced');
      const dpc = document.getElementById('daily-protein-consumed');
      if (dcs) dcs.textContent = String(sumEvents(rs.carbsSpawned, now, DAY_CYCLE_MS));
      if (dcc) dcc.textContent = String(sumEvents(spendLog.carbs, now, DAY_CYCLE_MS));
      if (dps) dps.textContent = String(sumEvents(rs.proteinSpawned, now, DAY_CYCLE_MS));
      if (dpp) dpp.textContent = String(sumEvents(rs.proteinProduced, now, DAY_CYCLE_MS));
      if (dpc) dpc.textContent = String(sumEvents(spendLog.protein, now, DAY_CYCLE_MS));
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
