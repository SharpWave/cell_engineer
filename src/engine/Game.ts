import { createPhysicsWorld, stepPhysics, PhysicsWorld } from './Physics';
import { Camera, createCamera } from './Camera';
import { render } from './Renderer';
import { Cell, createCell, getCellCenter, updateCellEdgeBodies } from '../creature/Cell';
import { Environment, createEnvironment, setupCollisions, updateEnvironment, DAY_CYCLE_MS } from '../simulation/Environment';
import { spendLog, sumEvents } from '../simulation/Energy';
import { LightCycle, createLightCycle } from '../simulation/LightCycle';
import { updateHUD, updateInspector } from '../ui/HUD';
import { SelectionState, createSelectionState, handleClick } from '../ui/Selection';
import { createFoodParticle } from '../simulation/Food';
import { CellModule, SignalCascade } from '../creature/Module';
import { CellProperties } from '../creature/CellProperties';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;

export interface CellBlueprint {
  name: string;
  modules: CellModule[];
  cascades: SignalCascade[];
  properties: Partial<CellProperties>;
}

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

export function initGame(canvas: HTMLCanvasElement, blueprint?: CellBlueprint): GameState {
  const ctx = canvas.getContext('2d')!;

  resizeCanvas(canvas);

  const now = performance.now();
  const physics = createPhysicsWorld(WORLD_WIDTH, WORLD_HEIGHT);
  const camera = createCamera(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
  const cell = blueprint
    ? createCell(physics.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2,
        blueprint.properties, blueprint.modules, blueprint.cascades)
    : createCell(physics.world, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
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
      // Update edge bodies to match membrane positions before physics step
      for (const cell of state.cells) updateCellEdgeBodies(cell);
      stepPhysics(state.physics, delta);
      updateEnvironment(
        state.env, state.physics.world, state.cells,
        now, delta, state.lightCycle,
      );
    }

    // Camera follows selected cell only when one is actively selected
    if (state.selection.current?.type === 'cell') {
      const center = getCellCenter(state.selection.current.cell);
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

      // Update active stats
      const acEl = document.getElementById('active-cells');
      if (acEl) acEl.textContent = String(state.cells.length);
      let extCarbs = 0, extProtein = 0, extWaste = 0;
      for (const f of state.env.food) {
        if (f.resourceType === 'carb') extCarbs++;
        else if (f.resourceType === 'protein') extProtein++;
        else if (f.resourceType === 'waste') extWaste++;
      }
      const ecEl = document.getElementById('active-ext-carbs');
      const epEl = document.getElementById('active-ext-protein');
      const ewEl = document.getElementById('active-ext-waste');
      if (ecEl) ecEl.textContent = String(extCarbs);
      if (epEl) epEl.textContent = String(extProtein);
      if (ewEl) ewEl.textContent = String(extWaste);

      // Update rolling daily stats
      const rs = state.env.rollingStats;
      const dcs = document.getElementById('daily-carbs-spawned');
      const dcc = document.getElementById('daily-carbs-consumed');
      const dps = document.getElementById('daily-protein-spawned');
      const dpp = document.getElementById('daily-protein-produced');
      const dpc = document.getElementById('daily-protein-consumed');
      const carbsConsumed = sumEvents(spendLog.carbs, now, DAY_CYCLE_MS);
      const proteinConsumed = sumEvents(spendLog.protein, now, DAY_CYCLE_MS);
      if (dcs) dcs.textContent = String(sumEvents(rs.carbsSpawned, now, DAY_CYCLE_MS));
      if (dcc) dcc.textContent = String(carbsConsumed);
      if (dps) dps.textContent = String(sumEvents(rs.proteinSpawned, now, DAY_CYCLE_MS));
      if (dpp) dpp.textContent = String(sumEvents(rs.proteinProduced, now, DAY_CYCLE_MS));
      if (dpc) dpc.textContent = String(proteinConsumed);

      // Autofeeder: set spawn rates to match consumption rates * multiplier (independent carb/protein)
      const autoCarb = document.getElementById('chk-autofeeder-carb') as HTMLInputElement | null;
      if (autoCarb?.checked) {
        const multInput = document.getElementById('input-autofeeder-carb-mult') as HTMLInputElement | null;
        const mult = Math.max(0, parseFloat(multInput?.value ?? '1') || 1);
        const carbRate = Math.round(carbsConsumed * mult);
        state.env.carbSpawnRate = carbRate;
        const carbInput = document.getElementById('input-carb-rate') as HTMLInputElement | null;
        if (carbInput) carbInput.value = String(carbRate);
      }
      const autoProtein = document.getElementById('chk-autofeeder-protein') as HTMLInputElement | null;
      if (autoProtein?.checked) {
        const multInput = document.getElementById('input-autofeeder-protein-mult') as HTMLInputElement | null;
        const mult = Math.max(0, parseFloat(multInput?.value ?? '1') || 1);
        const proteinRate = Math.round(proteinConsumed * mult);
        state.env.movingProteinSpawnRate = proteinRate;
        const proteinInput = document.getElementById('input-mprotein-rate') as HTMLInputElement | null;
        if (proteinInput) proteinInput.value = String(proteinRate);
      }
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
