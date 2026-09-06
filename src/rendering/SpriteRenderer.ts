import { AssetManager } from '../core/AssetManager';
import type { RenderContext } from './RenderContext';

export interface SpriteDrawOptions {
  rotation?: number;
  alpha?: number;
  scale?: number;
  frame?: number;
  tint?: string;
}

export class SpriteRenderer {
  public constructor(private readonly assets: AssetManager) {}

  public getAsset(id: string) {
    return this.assets.get(id);
  }

  public drawSprite(
    render: RenderContext,
    id: string,
    x: number,
    y: number,
    options: SpriteDrawOptions = {}
  ): boolean {
    const asset = this.assets.get(id);
    if (!asset) {
      this.drawFallback(render, 'shape.missing', x, y, 24, 24, { x: 0.5, y: 0.5 }, options);
      return false;
    }

    const image = this.assets.getImage(id);
    if (!image) {
      this.drawFallback(render, asset.fallback, x, y, asset.draw.width, asset.draw.height, asset.pivot, options);
      return false;
    }

    const scale = Math.max(0.01, options.scale ?? 1);
    const width = asset.draw.width * scale;
    const height = asset.draw.height * scale;
    const columns = Math.max(1, asset.frames.columns);
    const rows = Math.max(1, asset.frames.rows);
    const frame = Math.max(0, Math.floor(options.frame ?? 0));
    const frameIndex = frame % (columns * rows);
    const sourceWidth = image.naturalWidth / columns;
    const sourceHeight = image.naturalHeight / rows;
    const sourceX = (frameIndex % columns) * sourceWidth;
    const sourceY = Math.floor(frameIndex / columns) * sourceHeight;

    const ctx = render.ctx;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, options.alpha ?? 1));
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      -width * asset.pivot.x,
      -height * asset.pivot.y,
      width,
      height
    );
    if (options.tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha *= 0.18;
      ctx.fillStyle = options.tint;
      ctx.fillRect(-width * asset.pivot.x, -height * asset.pivot.y, width, height);
    }
    ctx.restore();
    return true;
  }

  private drawFallback(
    render: RenderContext,
    fallback: string,
    x: number,
    y: number,
    width: number,
    height: number,
    pivot: { x: number; y: number },
    options: SpriteDrawOptions
  ): void {
    const ctx = render.ctx;
    const scale = Math.max(0.01, options.scale ?? 1);
    const w = width * scale;
    const h = height * scale;
    const alpha = Math.max(0, Math.min(1, options.alpha ?? 1));
    const left = -w * pivot.x;
    const top = -h * pivot.y;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    ctx.lineWidth = Math.max(1, Math.min(3, Math.min(w, h) / 10));

    if (fallback.includes('map.field-base') || fallback === 'shape.map.background') {
      ctx.fillStyle = '#17232d';
      ctx.fillRect(left, top, w, h);
    } else if (fallback === 'shape.map.tile') {
      ctx.fillStyle = 'rgba(65, 86, 96, 0.35)';
      ctx.strokeStyle = 'rgba(111, 153, 163, 0.5)';
      ctx.fillRect(left + 6, top + 6, w - 12, h - 12);
      ctx.strokeRect(left + 6, top + 6, w - 12, h - 12);
    } else if (fallback === 'shape.map.debris') {
      this.fillPolygon(ctx, '#31434e', [
        [left + w * 0.1, top + h * 0.7], [left + w * 0.28, top + h * 0.2],
        [left + w * 0.65, top + h * 0.12], [left + w * 0.9, top + h * 0.56],
        [left + w * 0.65, top + h * 0.88], [left + w * 0.25, top + h * 0.82],
      ]);
    } else if (fallback === 'shape.map.spawn-edge') {
      ctx.strokeStyle = '#6eabb7';
      ctx.beginPath();
      ctx.moveTo(left + w * 0.03, top + h * 0.45);
      ctx.lineTo(left + w * 0.2, top + h * 0.45);
      ctx.moveTo(left + w * 0.8, top + h * 0.45);
      ctx.lineTo(left + w * 0.97, top + h * 0.45);
      ctx.stroke();
    } else if (fallback.includes('shadow')) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (fallback.includes('enemy.tanker')) {
      this.fillPolygon(ctx, '#a84420', this.regularPolygon(w / 2, h / 2, 6));
      ctx.strokeStyle = '#ff9f43';
      ctx.stroke();
    } else if (fallback.includes('enemy.standard')) {
      ctx.fillStyle = '#b71c1c';
      ctx.strokeStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (fallback === 'shape.resource.resource' || fallback === 'shape.resource.debris' || fallback === 'shape.icon.resource') {
      ctx.fillStyle = '#ffd54f';
      ctx.strokeStyle = '#ff8f00';
      this.fillPolygon(ctx, '#ffd54f', [[0, top + h * 0.08], [left + w * 0.88, 0], [0, top + h * 0.92], [left + w * 0.12, 0]]);
      ctx.stroke();
    } else if (fallback === 'shape.projectile.direct') {
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 5;
      ctx.fillRect(left + w * 0.15, top + h * 0.3, w * 0.7, h * 0.4);
    } else if (fallback === 'shape.projectile.arc') {
      ctx.fillStyle = '#ea80fc';
      ctx.strokeStyle = '#6a1b9a';
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (fallback.includes('effect') || fallback.includes('icon')) {
      const color = fallback.includes('enemy') || fallback.includes('contact') || fallback.includes('core')
        ? '#ff3045'
        : fallback.includes('resource')
          ? '#f7c948'
          : fallback.includes('arc')
            ? '#b783e8'
            : fallback.includes('nano')
              ? '#8b72df'
              : fallback.includes('ammo')
                ? '#e0a84b'
                : '#72d8ea';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(-Math.min(w, h) * 0.08, -Math.min(w, h) * 0.08, Math.min(w, h) * 0.16, Math.min(w, h) * 0.16);
    } else if (fallback.includes('tank.grid') || fallback.includes('tank.frame') || fallback.includes('tank.starter')) {
      ctx.fillStyle = fallback.includes('blocked') ? 'rgba(90, 90, 110, 0.65)' : '#1e2e3a';
      ctx.strokeStyle = fallback.includes('core') ? '#4deaea' : '#526d7b';
      ctx.fillRect(left + 2, top + 2, w - 4, h - 4);
      ctx.strokeRect(left + 2, top + 2, w - 4, h - 4);
      if (fallback.includes('blocked')) {
        ctx.beginPath();
        ctx.moveTo(left + w * 0.25, top + h * 0.25);
        ctx.lineTo(left + w * 0.75, top + h * 0.75);
        ctx.moveTo(left + w * 0.75, top + h * 0.25);
        ctx.lineTo(left + w * 0.25, top + h * 0.75);
        ctx.stroke();
      }
    } else if (fallback.includes('module.direct-weapon')) {
      ctx.fillStyle = '#176b94';
      ctx.strokeStyle = '#29b6f6';
      ctx.fillRect(left + 4, top + 4, w - 8, h - 8);
      ctx.strokeRect(left + w * 0.38, top + h * 0.2, w * 0.24, h * 0.6);
    } else if (fallback.includes('module.arc-weapon')) {
      ctx.fillStyle = '#6a1b9a';
      ctx.strokeStyle = '#ab47bc';
      ctx.fillRect(left + 4, top + 4, w - 8, h - 8);
      ctx.strokeRect(left + w * 0.18, top + h * 0.2, w * 0.64, h * 0.6);
    } else {
      ctx.strokeStyle = '#a9b9c2';
      ctx.strokeRect(left + 2, top + 2, w - 4, h - 4);
    }
    ctx.restore();
  }

  private fillPolygon(ctx: CanvasRenderingContext2D, color: string, points: number[][]): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }

  private regularPolygon(radiusX: number, radiusY: number, sides: number): number[][] {
    return Array.from({ length: sides }, (_, index) => {
      const angle = (index * Math.PI * 2) / sides;
      return [Math.cos(angle) * radiusX, Math.sin(angle) * radiusY];
    });
  }
}
