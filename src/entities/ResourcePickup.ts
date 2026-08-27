export class ResourcePickup {
  public x: number;
  public y: number;
  public amount: number;

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
    return collected;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.isEmpty()) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#ffd54f';
    ctx.strokeStyle = '#ff8f00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.amount}`, 0, 3);
    ctx.restore();
  }
}
