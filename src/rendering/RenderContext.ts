import type { SpriteRenderer } from './SpriteRenderer';

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  renderer: SpriteRenderer;
  time: number;
  reducedMotion: boolean;
}
