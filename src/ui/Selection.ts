import { Cell, getCellCenter, getMembranePoints } from '../creature/Cell';
import { FoodParticle } from '../simulation/Food';
import { Environment } from '../simulation/Environment';
import { Camera } from '../engine/Camera';

export type SelectionTarget =
  | { type: 'cell'; cell: Cell }
  | { type: 'food'; food: FoodParticle }
  | null;

export interface SelectionState {
  current: SelectionTarget;
}

export function createSelectionState(): SelectionState {
  return { current: null };
}

/** Convert screen coordinates to world coordinates */
function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const x = (screenX - canvas.width / 2) / camera.zoom + camera.x;
  const y = (screenY - canvas.height / 2) / camera.zoom + camera.y;
  return { x, y };
}

/** Check if a world point is inside the cell membrane (rough bounding check) */
function isInsideCell(wx: number, wy: number, cell: Cell): boolean {
  const center = getCellCenter(cell);
  const points = getMembranePoints(cell);
  let maxR = 0;
  for (const p of points) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy));
  }
  const dx = wx - center.x;
  const dy = wy - center.y;
  return Math.sqrt(dx * dx + dy * dy) <= maxR;
}

/** Check if a world point is near a food particle */
function isNearFood(wx: number, wy: number, food: FoodParticle): boolean {
  const pos = food.body.position;
  const dx = wx - pos.x;
  const dy = wy - pos.y;
  return Math.sqrt(dx * dx + dy * dy) <= 15;
}

export function handleClick(
  screenX: number,
  screenY: number,
  camera: Camera,
  canvas: HTMLCanvasElement,
  cells: Cell[],
  env: Environment,
  selection: SelectionState,
): void {
  const { x: wx, y: wy } = screenToWorld(screenX, screenY, camera, canvas);

  // Check food first (smaller targets, prioritize)
  for (const food of env.food) {
    if (!food.absorbed && isNearFood(wx, wy, food)) {
      selection.current = { type: 'food', food };
      return;
    }
  }

  // Check all cells
  for (const cell of cells) {
    if (isInsideCell(wx, wy, cell)) {
      selection.current = { type: 'cell', cell };
      return;
    }
  }

  // Clicked nothing
  selection.current = null;
}
