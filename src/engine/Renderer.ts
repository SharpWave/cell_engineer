import { Cell, getMembranePoints } from '../creature/Cell';
import { Environment } from '../simulation/Environment';
import { Camera, applyCamera } from './Camera';
import { PhysicsWorld } from './Physics';

const BG_COLOR = '#1a1a2e';
const CELL_FILL = '#d4886b';
const CELL_STROKE = '#e8a888';
const CELL_STROKE_WIDTH = 4;

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  cell: Cell,
  env: Environment,
  physics: PhysicsWorld,
): void {
  // Clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  applyCamera(ctx, camera, canvas.width, canvas.height);

  // Draw world boundary
  drawBoundary(ctx, physics.width, physics.height);

  // Draw food
  for (const food of env.food) {
    if (food.absorbed) continue;
    const pos = food.body.position;
    const angle = food.body.angle;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    ctx.fillStyle = food.color;
    ctx.strokeStyle = food.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = food.stuck ? 0.7 : 1.0;

    if (food.shape === 'circle') {
      const r = (food.body as any).circleRadius || 7;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const r = 8;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  // Draw cell membrane with smooth curve
  drawCell(ctx, cell);
}

function drawBoundary(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, w, h);
}

function drawCell(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const points = getMembranePoints(cell);
  if (points.length < 3) return;

  ctx.fillStyle = CELL_FILL;
  ctx.strokeStyle = CELL_STROKE;
  ctx.lineWidth = CELL_STROKE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Draw smooth closed Catmull-Rom spline through membrane points
  ctx.beginPath();
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    if (i === 0) {
      ctx.moveTo(p1.x, p1.y);
    }

    // Catmull-Rom to cubic bezier conversion
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
