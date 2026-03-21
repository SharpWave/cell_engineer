import { EnergyState } from '../simulation/Energy';

export function drawHUD(ctx: CanvasRenderingContext2D, energy: EnergyState): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#e0c878';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Energy: ${energy.current}`, 20, 20);
}
