import { Cell, getMembranePoints, getCellCenter } from '../creature/Cell';
import { Environment } from '../simulation/Environment';
import { EnergyState } from '../simulation/Energy';
import { LightCycle, getLightLevel, getLightPhase } from '../simulation/LightCycle';
import { Camera, applyCamera } from './Camera';
import { PhysicsWorld } from './Physics';
import { SelectionState } from '../ui/Selection';

// Background interpolates between these based on light level
const BG_DARK = [16, 16, 30];     // #10101e
const BG_BRIGHT = [30, 32, 58];   // #1e203a

const CELL_FILL = '#d4886b';
const CELL_STROKE = '#e8a888';
const CELL_STROKE_WIDTH = 4;
const SELECTION_COLOR = '#ffffff';

const ENERGY_PARTICLE_COLOR = '#e0c878';
const WASTE_PARTICLE_COLOR = '#7a5c3a';
const PARTICLE_RADIUS = 3;

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  cell: Cell,
  env: Environment,
  physics: PhysicsWorld,
  selection: SelectionState,
  energy: EnergyState,
  lightCycle: LightCycle,
  now: number,
): void {
  const light = getLightLevel(lightCycle, now);

  // Clear with light-tinted background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = Math.round(BG_DARK[0] + (BG_BRIGHT[0] - BG_DARK[0]) * light);
  const g = Math.round(BG_DARK[1] + (BG_BRIGHT[1] - BG_DARK[1]) * light);
  const b = Math.round(BG_DARK[2] + (BG_BRIGHT[2] - BG_DARK[2]) * light);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  applyCamera(ctx, camera, canvas.width, canvas.height);

  // Draw world boundary
  drawBoundary(ctx, physics.width, physics.height);

  // Draw food
  for (const food of env.food) {
    if (food.absorbed) continue;
    const pos = food.body.position;
    const angle = food.body.angle;
    const isSelected = selection.current?.type === 'food' && selection.current.food === food;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    ctx.fillStyle = food.color;
    ctx.strokeStyle = food.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = food.stuck ? 0.7 : 1.0;

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = food.stuck ? 0.7 : 1.0;
    }

    ctx.strokeStyle = food.color;
    ctx.lineWidth = 3;

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
  const cellSelected = selection.current?.type === 'cell';
  drawCell(ctx, cell, cellSelected);

  // Draw internal particles (energy + waste) inside cell
  drawInternalParticles(ctx, cell, energy);

  // Reset transform for overlay UI
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Draw light cycle indicator in lower-left
  drawLightIndicator(ctx, canvas, lightCycle, now);
}

function drawBoundary(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, w, h);
}

function drawCell(ctx: CanvasRenderingContext2D, cell: Cell, selected: boolean): void {
  const points = getMembranePoints(cell);
  if (points.length < 3) return;

  if (selected) {
    const center = getCellCenter(cell);
    let maxR = 0;
    for (const p of points) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy));
    }
    ctx.beginPath();
    ctx.arc(center.x, center.y, maxR + 8, 0, Math.PI * 2);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  ctx.fillStyle = CELL_FILL;
  ctx.strokeStyle = CELL_STROKE;
  ctx.lineWidth = CELL_STROKE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

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

function drawInternalParticles(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  energy: EnergyState,
): void {
  const center = getCellCenter(cell);

  for (const p of energy.particles) {
    ctx.beginPath();
    ctx.arc(center.x + p.x, center.y + p.y, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.type === 'energy' ? ENERGY_PARTICLE_COLOR : WASTE_PARTICLE_COLOR;
    ctx.globalAlpha = 0.85;
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

function drawLightIndicator(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  lightCycle: LightCycle,
  now: number,
): void {
  const size = 80;
  const padding = 16;
  const cx = padding + size / 2;
  const cy = canvas.height - padding - size / 2;
  const radius = size / 2 - 4;

  const light = getLightLevel(lightCycle, now);
  const phase = getLightPhase(lightCycle, now);

  // Background circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 10, 20, 0.7)';
  ctx.fill();
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw sine wave inside the circle
  ctx.beginPath();
  const wavePoints = 60;
  for (let i = 0; i <= wavePoints; i++) {
    const t = i / wavePoints;
    const wx = cx - radius + t * radius * 2;
    const waveVal = Math.sin(t * Math.PI * 2 - Math.PI / 2);
    const wy = cy - waveVal * (radius * 0.5);
    if (i === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.strokeStyle = '#555580';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Current position dot on the wave
  const dotX = cx - radius + phase * radius * 2;
  const dotWave = Math.sin(phase * Math.PI * 2 - Math.PI / 2);
  const dotY = cy - dotWave * (radius * 0.5);

  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  // Color the dot from dark blue to bright yellow based on light level
  const dr = Math.round(40 + light * 200);
  const dg = Math.round(40 + light * 180);
  const db = Math.round(80 + light * (- 40));
  ctx.fillStyle = `rgb(${dr},${dg},${db})`;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Label
  ctx.font = '10px monospace';
  ctx.fillStyle = '#8888a8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('LIGHT', cx, cy + radius + 4);
}
