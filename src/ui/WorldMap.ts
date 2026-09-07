import type { CampaignProgress } from '../core/CampaignProgressStore';
import type { WorldMapNode } from '../core/WorldMapDataLoader';
import type { RenderContext } from '../rendering/RenderContext';
import { VisualTheme } from '../rendering/VisualTheme';

export type WorldMapNodeStatus = 'locked' | 'available' | 'cleared' | 'test';
export type WorldMapAction =
  | { type: 'back' }
  | { type: 'select'; mapId: string }
  | { type: 'locked' };

interface RenderNode extends WorldMapNode {
  status: WorldMapNodeStatus;
  screenX: number;
  screenY: number;
}

export class WorldMap {
  private selectedIndex = 0;
  private renderedNodes: RenderNode[] = [];
  private feedbackMessage: string | null = null;

  public constructor(private readonly nodes: readonly WorldMapNode[]) {}

  public render(
    render: RenderContext,
    width: number,
    height: number,
    progress: CampaignProgress,
    progressReady: boolean,
  ): void {
    render.renderer.drawSprite(render, 'ui.galaxy-map.background', width / 2, height / 2);
    const ctx = render.ctx;
    const statuses = this.getStatuses(progress);
    this.renderedNodes = this.nodes.map((node, index) => ({
      ...node,
      status: statuses[index],
      screenX: node.position.x * width,
      screenY: node.position.y * height,
    }));

    ctx.save();
    ctx.fillStyle = 'rgba(7, 12, 23, 0.78)';
    ctx.fillRect(0, 0, width, 88);
    ctx.fillStyle = VisualTheme.color.accent;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('GALACTIC OPERATIONS', 28, 40);
    ctx.fillStyle = VisualTheme.color.textSecondary;
    ctx.font = '11px monospace';
    ctx.fillText(progressReady ? 'SELECT A DEPLOYMENT NODE' : 'SYNCING CAMPAIGN PROGRESS...', 30, 63);

    this.renderConnections(ctx, width, height);
    for (const [index, node] of this.renderedNodes.entries()) this.renderNode(ctx, node, index === this.selectedIndex);

    ctx.fillStyle = VisualTheme.color.textMuted;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ARROWS / WASD MOVE  ·  ENTER DEPLOY  ·  ESC BACK', 28, height - 26);
    if (this.feedbackMessage) {
      ctx.textAlign = 'right';
      ctx.fillStyle = VisualTheme.color.warning;
      ctx.fillText(this.feedbackMessage, width - 28, height - 26);
    }
    ctx.restore();
  }

  public handlePointer(point: { x: number; y: number }, progress: CampaignProgress): WorldMapAction | null {
    const index = this.renderedNodes.findIndex((node) => Math.hypot(node.screenX - point.x, node.screenY - point.y) <= 30);
    if (index < 0) return null;
    this.selectedIndex = index;
    return this.selectSelected(progress);
  }

  public handleKey(code: string, progress: CampaignProgress): WorldMapAction | null {
    if (code === 'Escape') return { type: 'back' };
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') {
      this.selectedIndex = this.wrap(this.selectedIndex - 1, this.nodes.length);
      this.feedbackMessage = null;
      return null;
    }
    if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') {
      this.selectedIndex = this.wrap(this.selectedIndex + 1, this.nodes.length);
      this.feedbackMessage = null;
      return null;
    }
    if (code === 'Enter' || code === 'Space') return this.selectSelected(progress);
    return null;
  }

  public reset(): void {
    this.selectedIndex = 0;
    this.renderedNodes = [];
    this.feedbackMessage = null;
  }

  public getStatuses(progress: CampaignProgress): WorldMapNodeStatus[] {
    const cleared = new Set(progress.clearedMapIds);
    return this.nodes.map((node, index) => {
      if (node.test) return 'test';
      if (cleared.has(node.mapId)) return 'cleared';
      const previous = this.nodes.slice(0, index).reverse().find((candidate) => !candidate.test);
      return !previous || cleared.has(previous.mapId) ? 'available' : 'locked';
    });
  }

  private renderConnections(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const byMapId = new Map(this.renderedNodes.map((node) => [node.mapId, node]));
    ctx.lineWidth = 2;
    for (const node of this.renderedNodes) {
      if (node.test || !node.nextMapId) continue;
      const next = byMapId.get(node.nextMapId);
      if (!next) continue;
      ctx.strokeStyle = node.status === 'locked' ? 'rgba(127, 137, 152, 0.28)' : 'rgba(77, 234, 234, 0.62)';
      ctx.beginPath();
      ctx.moveTo(node.screenX, node.screenY);
      ctx.lineTo(next.screenX, next.screenY);
      ctx.stroke();
    }
    void width;
    void height;
  }

  private renderNode(ctx: CanvasRenderingContext2D, node: RenderNode, selected: boolean): void {
    const color = this.statusColor(node.status);
    ctx.save();
    if (selected) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.screenX, node.screenY, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = node.status === 'locked' ? 'rgba(41, 45, 57, 0.92)' : 'rgba(13, 25, 40, 0.94)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(node.screenX, node.screenY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (node.status === 'cleared' || node.status === 'test') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.screenX, node.screenY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = node.position.x > 0.72 ? 'right' : 'left';
    const labelX = node.position.x > 0.72 ? node.screenX - 20 : node.screenX + 20;
    ctx.fillText(node.label, labelX, node.screenY - 4);
    ctx.fillStyle = VisualTheme.color.textMuted;
    ctx.font = '10px monospace';
    ctx.fillText(node.status.toUpperCase(), labelX, node.screenY + 12);
    ctx.restore();
  }

  private selectSelected(progress: CampaignProgress): WorldMapAction {
    const node = this.renderedNodes[this.selectedIndex];
    const status = this.getStatuses(progress)[this.selectedIndex];
    if (!node || status === 'locked') {
      this.feedbackMessage = 'NODE LOCKED // CLEAR THE PREVIOUS REGION';
      return { type: 'locked' };
    }
    this.feedbackMessage = null;
    return { type: 'select', mapId: node.mapId };
  }

  private statusColor(status: WorldMapNodeStatus): string {
    if (status === 'cleared') return VisualTheme.color.success;
    if (status === 'test') return VisualTheme.color.warning;
    if (status === 'available') return VisualTheme.color.accent;
    return VisualTheme.color.textDisabled;
  }

  private wrap(value: number, length: number): number {
    return (value + length) % length;
  }
}
