import { Cell, getMembranePoints, getCellCenter } from '../creature/Cell';
import { FoodParticle } from '../simulation/Food';
import { Environment } from '../simulation/Environment';
import { LightCycle, getLightLevel, getLightPhase } from '../simulation/LightCycle';
import { MODULE_CATALOG } from '../creature/Module';
import { Camera, applyCamera } from './Camera';
import { PhysicsWorld } from './Physics';
import { SelectionState } from '../ui/Selection';

const BG_DARK = [16, 16, 30];
const BG_BRIGHT = [30, 32, 58];

const CELL_FILL = '#0a0a0a';
const CELL_STROKE = '#ffffff';
const CELL_OUTLINE = '#000000';
const CELL_STROKE_WIDTH = 3;
const CELL_OUTLINE_WIDTH = 7;
const SELECTION_COLOR = '#ffffff';

const CARB_COLOR = '#44ff66';
const CARB_GLOW = 'rgba(68, 255, 102, 0.25)';
const PROTEIN_COLOR = '#4a8aff';
const PROTEIN_GLOW = 'rgba(74, 138, 255, 0.25)';
const WASTE_COLOR = '#e07030';
const WASTE_GLOW = 'rgba(224, 112, 48, 0.2)';
const PARTICLE_RADIUS = 4;
const GLOW_RADIUS = 8;

const MODULE_SIZE = 14;

// Grid texture settings
const GRID_SPACING = 80;
const GRID_COLOR_DARK = 'rgba(40, 40, 70, 0.3)';
const GRID_COLOR_BRIGHT = 'rgba(60, 60, 100, 0.3)';
const GRID_DOT_RADIUS = 1.5;

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  cells: Cell[],
  env: Environment,
  physics: PhysicsWorld,
  selection: SelectionState,
  lightCycle: LightCycle,
  now: number,
  paused: boolean,
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

  // Environment grid texture (dot grid for seeing relative motion)
  drawGrid(ctx, camera, canvas, physics.width, physics.height, light);

  drawBoundary(ctx, physics.width, physics.height);

  // Food (drawn as dumb cells — dark blobs with energy particles inside)
  for (const food of env.food) {
    if (food.absorbed) continue;
    drawFoodCell(ctx, food, now, selection);
  }

  // All cells
  for (const cell of cells) {
    const cellSelected = selection.current?.type === 'cell' && selection.current.cell === cell;

    // Mitosis animation: draw pinching effect
    if (cell.mitosisState) {
      drawMitosisCell(ctx, cell, cellSelected);
    } else {
      drawCell(ctx, cell, cellSelected, now);
    }

    // Internal particles (energy + waste)
    drawInternalParticles(ctx, cell);

    // Modules on membrane (togglable)
    const hideModules = (document.getElementById('chk-hide-modules') as HTMLInputElement | null)?.checked;
    if (!hideModules) {
      drawModules(ctx, cell, now, selection);
      // Cascade arrows removed — too noisy when modules are far apart
    }

    // Eye preview cone (while configuring a new eye module)
    if (cellSelected && selection.pendingEyePreview) {
      const preview = selection.pendingEyePreview;
      const mp = cell.membraneParticles[preview.membraneIndex];
      if (mp) {
        const center = getCellCenter(cell);
        const dx = mp.position.x - center.x;
        const dy = mp.position.y - center.y;
        const lookAngle = Math.atan2(dy, dx);
        drawFovCone(ctx, mp.position.x, mp.position.y, lookAngle,
          preview.config.fovDegrees ?? 90, preview.config.eyeScale ?? 1,
          'rgba(255, 255, 100, 0.12)', 'rgba(255, 255, 100, 0.4)');
      }
    }
  }

  // -- Overlay UI (screen-space) --
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawLightIndicator(ctx, canvas, lightCycle, now);

  if (paused) {
    drawPausedOverlay(ctx, canvas);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  canvas: HTMLCanvasElement,
  worldW: number,
  worldH: number,
  light: number,
): void {
  const gridColor = light > 0.5 ? GRID_COLOR_BRIGHT : GRID_COLOR_DARK;
  ctx.fillStyle = gridColor;

  // Calculate visible area in world space
  const halfW = (canvas.width / 2) / camera.zoom;
  const halfH = (canvas.height / 2) / camera.zoom;
  const startX = Math.max(0, Math.floor((camera.x - halfW) / GRID_SPACING) * GRID_SPACING);
  const startY = Math.max(0, Math.floor((camera.y - halfH) / GRID_SPACING) * GRID_SPACING);
  const endX = Math.min(worldW, camera.x + halfW + GRID_SPACING);
  const endY = Math.min(worldH, camera.y + halfH + GRID_SPACING);

  for (let gx = startX; gx <= endX; gx += GRID_SPACING) {
    for (let gy = startY; gy <= endY; gy += GRID_SPACING) {
      ctx.beginPath();
      ctx.arc(gx, gy, GRID_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBoundary(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, w, h);
}

function drawFoodCell(
  ctx: CanvasRenderingContext2D,
  food: FoodParticle,
  now: number,
  selection: SelectionState,
): void {
  const pos = food.body.position;
  const isSelected = selection.current?.type === 'food' && selection.current.food === food;
  const radius = (food.body as any).circleRadius || 7;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.globalAlpha = food.stuck ? 0.7 : 1.0;

  // Selection ring
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = food.stuck ? 0.7 : 1.0;
  }

  // Dark cell body
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();
  ctx.strokeStyle = food.color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Resource particles inside (wobbling dots)
  const dotGlow = food.resourceType === 'protein' ? PROTEIN_GLOW
    : food.resourceType === 'waste' ? WASTE_GLOW : CARB_GLOW;
  const dotColor = food.resourceType === 'protein' ? PROTEIN_COLOR
    : food.resourceType === 'waste' ? WASTE_COLOR : CARB_COLOR;
  const particleCount = food.resourceValue;
  for (let i = 0; i < particleCount; i++) {
    const phase = now * 0.002 + i * 2.09 + food.body.id;
    const innerR = radius * 0.45;
    const px = Math.cos(phase) * innerR;
    const py = Math.sin(phase * 0.7 + i) * innerR;

    // Glow
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotGlow;
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
  }

  // Stationary anchor indicator
  if (food.stationary) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74, 138, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = 1.0;
  ctx.restore();
}

function drawCell(ctx: CanvasRenderingContext2D, cell: Cell, selected: boolean, now: number): void {
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

  // Maintenance flash — membrane goes red briefly when carbs are consumed
  const FLASH_DURATION = 200;
  const flashAge = now - cell.lastMaintenanceTick;
  let strokeColor = CELL_STROKE;
  if (cell.lastMaintenanceTick > 0 && flashAge < FLASH_DURATION) {
    const t = 1 - flashAge / FLASH_DURATION;
    const r = 255;
    const g = Math.round(255 - 255 * t);
    const b = Math.round(255 - 255 * t);
    strokeColor = `rgb(${r},${g},${b})`;
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Build the spline path once
  const n = points.length;
  function traceSpline() {
    ctx.beginPath();
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
  }

  // Black outline (wider)
  traceSpline();
  ctx.fillStyle = CELL_FILL;
  ctx.strokeStyle = CELL_OUTLINE;
  ctx.lineWidth = CELL_OUTLINE_WIDTH;
  ctx.fill();
  ctx.stroke();

  // White stroke on top
  traceSpline();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = CELL_STROKE_WIDTH;
  ctx.stroke();
}

function drawMitosisCell(ctx: CanvasRenderingContext2D, cell: Cell, selected: boolean): void {
  const points = getMembranePoints(cell);
  if (points.length < 3) return;
  const center = getCellCenter(cell);
  const progress = cell.mitosisState!.progress;
  const axis = cell.mitosisState!.axis;

  // Pinch effect — push membrane points away from the division axis
  const pinchStrength = progress * 0.6; // How much to pinch inward at the center
  const modifiedPoints = points.map(p => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    // Project point onto the perpendicular axis
    const perpX = -Math.sin(axis);
    const perpY = Math.cos(axis);
    const dot = dx * perpX + dy * perpY;

    // Points near the division line get pulled inward
    const axisX = Math.cos(axis);
    const axisY = Math.sin(axis);
    const axisDot = dx * axisX + dy * axisY;
    const normalizedAxisDist = Math.abs(axisDot) / (cell.properties.baseRadius * cell.properties.growthScale);

    // Gaussian-like pinch centered on division line
    const pinchFactor = Math.exp(-(normalizedAxisDist * normalizedAxisDist) * 4);
    const pinchAmount = pinchFactor * pinchStrength;

    // Move point toward center along perpendicular
    return {
      x: p.x - perpX * dot * pinchAmount,
      y: p.y - perpY * dot * pinchAmount,
    };
  });

  // Selection ring
  if (selected) {
    let maxR = 0;
    for (const p of modifiedPoints) {
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

  // Glowing division line
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(axis);
  const lineLen = cell.properties.baseRadius * cell.properties.growthScale * 1.5;
  ctx.beginPath();
  ctx.moveTo(-lineLen, 0);
  ctx.lineTo(lineLen, 0);
  ctx.strokeStyle = `rgba(74, 238, 255, ${progress * 0.5})`;
  ctx.lineWidth = 2 + progress * 3;
  ctx.shadowColor = '#4aeeff';
  ctx.shadowBlur = 10 * progress;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Draw the pinched cell body
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const n = modifiedPoints.length;
  function traceMitosisSpline() {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p0 = modifiedPoints[(i - 1 + n) % n];
      const p1 = modifiedPoints[i];
      const p2 = modifiedPoints[(i + 1) % n];
      const p3 = modifiedPoints[(i + 2) % n];

      if (i === 0) ctx.moveTo(p1.x, p1.y);

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.closePath();
  }

  // Black outline (wider)
  traceMitosisSpline();
  ctx.fillStyle = CELL_FILL;
  ctx.strokeStyle = CELL_OUTLINE;
  ctx.lineWidth = CELL_OUTLINE_WIDTH;
  ctx.fill();
  ctx.stroke();

  // White stroke on top
  traceMitosisSpline();
  ctx.strokeStyle = CELL_STROKE;
  ctx.lineWidth = CELL_STROKE_WIDTH;
  ctx.stroke();
}

function drawInternalParticles(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
): void {
  const center = getCellCenter(cell);

  for (const p of cell.energy.particles) {
    const wx = center.x + p.x;
    const wy = center.y + p.y;

    let glowColor: string;
    let solidColor: string;
    if (p.type === 'carb') {
      glowColor = CARB_GLOW;
      solidColor = CARB_COLOR;
    } else if (p.type === 'protein') {
      glowColor = PROTEIN_GLOW;
      solidColor = PROTEIN_COLOR;
    } else {
      glowColor = WASTE_GLOW;
      solidColor = WASTE_COLOR;
    }

    // Glow
    ctx.beginPath();
    ctx.arc(wx, wy, GLOW_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = glowColor;
    ctx.fill();

    // Solid particle
    ctx.beginPath();
    ctx.arc(wx, wy, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = solidColor;
    ctx.fill();
  }
}

function drawModules(ctx: CanvasRenderingContext2D, cell: Cell, now: number, selection: SelectionState): void {
  const center = getCellCenter(cell);
  const memPoints = getMembranePoints(cell);

  // Draw anchor dots on every membrane point
  ctx.fillStyle = '#000000';
  for (const mp of memPoints) {
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Group modules by membrane index for stacking
  const byIndex = new Map<number, typeof cell.modules>();
  for (const mod of cell.modules) {
    const list = byIndex.get(mod.membraneIndex);
    if (list) list.push(mod);
    else byIndex.set(mod.membraneIndex, [mod]);
  }

  for (const [memIdx, mods] of byIndex) {
    const mp = memPoints[memIdx];
    if (!mp) continue;

    const dx = mp.x - center.x;
    const dy = mp.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    const angle = Math.atan2(ny, nx);

    for (let s = 0; s < mods.length; s++) {
      const mod = mods[s];
      const stackOffset = 12 + s * (MODULE_SIZE + 2);
      const mx = mp.x + nx * stackOffset;
      const my = mp.y + ny * stackOffset;

      const info = MODULE_CATALOG[mod.subtype];
      const color = mod.active ? info.activeColor : info.color;
      const half = MODULE_SIZE / 2;

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);

      if (mod.active) {
        ctx.shadowColor = info.activeColor;
        ctx.shadowBlur = 10;
      }

      if (mod.subtype === 'eye') {
        drawEyeShape(ctx, half, color, mod.active);
      } else if (mod.subtype === 'foot') {
        drawFootShape(ctx, half, color, now);
      } else {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.fillRect(-half, -half, MODULE_SIZE, MODULE_SIZE);
        ctx.strokeRect(-half, -half, MODULE_SIZE, MODULE_SIZE);
      }

      ctx.shadowBlur = 0;

      // Highlight ring if this module is selected in cascade UI
      if (selection.highlightedModuleId === mod.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, half + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Draw FOV cone for active eye modules
      if (mod.subtype === 'eye' && mod.active) {
        const lookAngle = Math.atan2(dy, dx);
        drawFovCone(ctx, mp.x, mp.y, lookAngle, mod.config.fovDegrees ?? 90, mod.config.eyeScale ?? 1, 'rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.2)');
      }
    }
  }
}

/** Compute eye range from FOV and scale */
function computeEyeRange(fovDeg: number, eyeScale: number): number {
  const BASE_EYE_RANGE = 450;
  const STANDARD_FOV_RAD = Math.PI / 2;
  const actualFovRad = fovDeg * (Math.PI / 180);
  return BASE_EYE_RANGE * Math.sqrt(STANDARD_FOV_RAD / actualFovRad) * Math.sqrt(eyeScale);
}

/** Draw a FOV cone arc at a position */
function drawFovCone(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  lookAngle: number,
  fovDeg: number,
  eyeScale: number,
  fillColor: string,
  strokeColor: string,
): void {
  const halfFov = (fovDeg / 2) * (Math.PI / 180);
  const range = computeEyeRange(fovDeg, eyeScale);
  if (range < 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, lookAngle - halfFov, lookAngle + halfFov);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Draw an eye shape: oval with a dark pupil */
function drawEyeShape(ctx: CanvasRenderingContext2D, half: number, color: string, active: boolean): void {
  // Outer eye (almond shape)
  ctx.fillStyle = '#e8e8f0';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, half + 1, half * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Iris
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(1, 0, half * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = active ? '#111' : '#333';
  ctx.beginPath();
  ctx.arc(1, 0, half * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a foot: rotating circle with cilia spokes */
function drawFootShape(ctx: CanvasRenderingContext2D, half: number, color: string, now: number): void {
  const radius = half * 0.8;
  const spokeCount = 6;
  const spinAngle = (now * 0.004) % (Math.PI * 2);

  // Central circle
  ctx.fillStyle = color;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cilia spokes
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < spokeCount; i++) {
    const a = spinAngle + (i / spokeCount) * Math.PI * 2;
    const innerR = radius;
    const outerR = radius + half * 0.5;
    // Curved spoke with slight wave
    const wave = Math.sin(now * 0.008 + i * 1.2) * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
    ctx.quadraticCurveTo(
      Math.cos(a) * (innerR + outerR) * 0.5 + wave,
      Math.sin(a) * (innerR + outerR) * 0.5 + wave,
      Math.cos(a) * outerR, Math.sin(a) * outerR,
    );
    ctx.stroke();
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

function drawPausedOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.7;
  ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
  ctx.globalAlpha = 1.0;
}
