import type { RenderContext } from '../rendering/RenderContext';

export class ResourcePickup {
  public x: number;
  public y: number;
  public amount: number;
  private collectionEffectPending = false;

  constructor(x: number, y: number, amount: number) {
    this.x = x;
    this.y = y;
    this.amount = Math.max(0, amount);
  }

  public isEmpty(): boolean {
    return this.amount <= 0;
  }

  public collect(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const collected = Math.min(amount, this.amount);
    this.amount -= collected;
    if (collected > 0) this.collectionEffectPending = true;
    return collected;
  }

  public consumeCollectionEffect(): boolean {
    if (!this.collectionEffectPending) return false;
    this.collectionEffectPending = false;
    return true;
  }

  public render(render: RenderContext): void {
    if (this.isEmpty()) return;

    render.renderer.drawSprite(render, 'resource.resource.idle', this.x, this.y);
    const ctx = render.ctx;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.amount}`, 0, 3);
    ctx.restore();
  }
}
