import { Cell, getMembranePoints, getCellCenter } from '../creature/Cell';
import { Environment } from '../simulation/Environment';
import { EnergyState } from '../simulation/Energy';
import { LightCycle, getLightLevel, getLightPhase } from '../simulation/LightCycle';
import { MODULE_CATALOG } from '../creature/Module';
import { Camera, applyCamera } from './Camera';
import { PhysicsWorld } from './Physics';
import { SelectionState } from '../ui/Selection';

const BG_DARK = [16, 16, 30];
const BG_BRIGHT = [30, 32, 58];

const CELL_FILL = '#d4886b';
const CELL_STROKE = '#e8a888';
const CELL_STROKE_WIDTH = 4;
const SELECTION_COLOR = '#ffffff';

const ENERGY_COLOR = '#ffd700';
const ENERGY_GLOW = 'rgba(255, 215, 0, 0.25)';
const WASTE_COLOR = '#e07030';
const WASTE_GLOW = 'rgba(224, 112, 48, 0.2)';
const PARTICLE_RADIUS = 4;
const GLOW_RADIUS = 8;

const MODULE_SIZE = 14;

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

  // Light-tinted background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r = Math.round(BG_DARK[0] + (BG_BRIGHT[0] - BG_DARK[0]) * light);
  const g = Math.round(BG_DARK[1] + (BG_BRIGHT[1] - BG_DARK[1]) * light);
  const b = Math.round(BG_DARK[2] + (BG_BRIGHT[2] - BG_DARK[2]) * light);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  applyCamera(ctx, camera, canvas.width, canvas.height);

  drawBoundary(ctx, physics.width, physics.height);

  // Food
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
      ctx.strokeStyle = food.color;
      ctx.lineWidth = 3;
    }

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

  // Cell membrane
  const cellSelected = selection.current?.type === 'cell';
  drawCell(ctx, cell, cellSelected);

  // Internal particles (energy + waste)
  drawInternalParticles(ctx, cell, energy);

  // Modules on membrane
  drawModules(ctx, cell);

  // Cascade connections
  drawCascades(ctx, cell);

  // -- Overlay UI (screen-space) --
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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

    if (i === 0) ctx.moveTo(p1.x, p1.y);

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
    const wx = center.x + p.x;
    const wy = center.y + p.y;
    const isEnergy = p.type === 'energy';

    // Glow
    ctx.beginPath();
    ctx.arc(wx, wy, GLOW_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isEnergy ? ENERGY_GLOW : WASTE_GLOW;
    ctx.fill();

    // Solid particle
    ctx.beginPath();
    ctx.arc(wx, wy, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isEnergy ? ENERGY_COLOR : WASTE_COLOR;
    ctx.fill();
  }
}

function drawModules(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const center = getCellCenter(cell);
  const memPoints = getMembranePoints(cell);

  for (const mod of cell.modules) {
    const mp = memPoints[mod.membraneIndex];
    if (!mp) continue;

    const dx = mp.x - center.x;
    const dy = mp.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;
    const nx = dx / dist;
    const ny = dy / dist;

    // Position the square just outside the membrane
    const mx = mp.x + nx * 12;
    const my = mp.y + ny * 12;
    const angle = Math.atan2(ny, nx);

    const info = MODULE_CATALOG[mod.subtype];
    const color = mod.active ? info.activeColor : info.color;
    const half = MODULE_SIZE / 2;

    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);

    // Active glow
    if (mod.active) {
      ctx.shadowColor = info.activeColor;
      ctx.shadowBlur = 10;
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.fillRect(-half, -half, MODULE_SIZE, MODULE_SIZE);
    ctx.strokeRect(-half, -half, MODULE_SIZE, MODULE_SIZE);

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawCascades(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const center = getCellCenter(cell);
  const memPoints = getMembranePoints(cell);

  for (const cascade of cell.cascades) {
    const fromMod = cell.modules.find(m => m.id === cascade.fromId);
    const toMod = cell.modules.find(m => m.id === cascade.toId);
    if (!fromMod || !toMod) continue;

    const fp = memPoints[fromMod.membraneIndex];
    const tp = memPoints[toMod.membraneIndex];
    if (!fp || !tp) continue;

    // Draw arc outside the cell connecting the two modules
    const fdx = fp.x - center.x, fdy = fp.y - center.y;
    const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
    const tdx = tp.x - center.x, tdy = tp.y - center.y;
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

    const fx = fp.x + (fdx / fdist) * 20;
    const fy = fp.y + (fdy / fdist) * 20;
    const tx = tp.x + (tdx / tdist) * 20;
    const ty = tp.y + (tdy / tdist) * 20;

    // Control point pushed outward
    const midX = (fx + tx) / 2;
    const midY = (fy + ty) / 2;
    const mDx = midX - center.x;
    const mDy = midY - center.y;
    const mDist = Math.sqrt(mDx * mDx + mDy * mDy);
    const cpX = center.x + (mDx / mDist) * (fdist + 35);
    const cpY = center.y + (mDy / mDist) * (fdist + 35);

    const active = fromMod.active;

    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(cpX, cpY, tx, ty);
    ctx.strokeStyle = active ? '#ffcc4a' : '#444455';
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.setLineDash(active ? [] : [4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow head at target
    const arrowLen = 6;
    const adx = tx - cpX, ady = ty - cpY;
    const aDist = Math.sqrt(adx * adx + ady * ady);
    if (aDist > 0) {
      const anx = adx / aDist, any_ = ady / aDist;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - anx * arrowLen + any_ * arrowLen * 0.5, ty - any_ * arrowLen - anx * arrowLen * 0.5);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - anx * arrowLen - any_ * arrowLen * 0.5, ty - any_ * arrowLen + anx * arrowLen * 0.5);
      ctx.stroke();
    }
  }
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

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 10, 20, 0.7)';
  ctx.fill();
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Sine wave
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const wx = cx - radius + t * radius * 2;
    const waveVal = Math.sin(t * Math.PI * 2 - Math.PI / 2);
    const wy = cy - waveVal * radius * 0.5;
    if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.strokeStyle = '#555580';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Position dot
  const dotX = cx - radius + phase * radius * 2;
  const dotWave = Math.sin(phase * Math.PI * 2 - Math.PI / 2);
  const dotY = cy - dotWave * radius * 0.5;

  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  const dr = Math.round(40 + light * 200);
  const dg = Math.round(40 + light * 180);
  const db = Math.round(80 - light * 40);
  ctx.fillStyle = `rgb(${dr},${dg},${db})`;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '10px monospace';
  ctx.fillStyle = '#8888a8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('LIGHT', cx, cy + radius + 4);
}
