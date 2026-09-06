export interface CameraPoint {
  x: number;
  y: number;
}

export class Camera {
  public x = 0;
  public y = 0;

  private readonly viewportWidth: number;
  private readonly viewportHeight: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly followSmoothing: number;

  public constructor(
    viewportWidth: number,
    viewportHeight: number,
    worldWidth: number,
    worldHeight: number,
    followSmoothing = 10,
  ) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.worldWidth = Math.max(viewportWidth, worldWidth);
    this.worldHeight = Math.max(viewportHeight, worldHeight);
    this.followSmoothing = Math.max(1, followSmoothing);
  }

  public get width(): number {
    return this.worldWidth;
  }

  public get height(): number {
    return this.worldHeight;
  }

  public update(dt: number, target: CameraPoint): void {
    if (dt <= 0) return;

    const targetX = this.clamp(target.x - this.viewportWidth / 2, 0, this.worldWidth - this.viewportWidth);
    const targetY = this.clamp(target.y - this.viewportHeight / 2, 0, this.worldHeight - this.viewportHeight);
    const amount = Math.min(1, dt * this.followSmoothing);
    this.x += (targetX - this.x) * amount;
    this.y += (targetY - this.y) * amount;
  }

  public snapTo(target: CameraPoint): void {
    this.x = this.clamp(target.x - this.viewportWidth / 2, 0, this.worldWidth - this.viewportWidth);
    this.y = this.clamp(target.y - this.viewportHeight / 2, 0, this.worldHeight - this.viewportHeight);
  }

  public worldToScreen(point: CameraPoint): CameraPoint {
    return { x: point.x - this.x, y: point.y - this.y };
  }

  public screenToWorld(point: CameraPoint): CameraPoint {
    return { x: point.x + this.x, y: point.y + this.y };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
