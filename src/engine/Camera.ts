export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(x: number, y: number): Camera {
  return { x, y, zoom: 1 };
}

export function applyCamera(ctx: CanvasRenderingContext2D, camera: Camera, canvasW: number, canvasH: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}
