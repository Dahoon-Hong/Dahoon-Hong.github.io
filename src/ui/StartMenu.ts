import { VisualTheme } from '../rendering/VisualTheme';

export type StartMenuAction = 'start' | 'settings' | 'exit';
export type SettingsAction = 'back' | 'music' | 'sfx' | 'reducedMotion';

export interface SettingsValues {
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
}

interface MenuHitbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_ACTIONS: Array<{ label: string; action: StartMenuAction }> = [
  { label: 'GAME START', action: 'start' },
  { label: 'SETTINGS', action: 'settings' },
  { label: 'EXIT', action: 'exit' },
];

const SETTINGS_ACTIONS: Array<{ label: string; action: SettingsAction }> = [
  { label: 'MUSIC VOLUME', action: 'music' },
  { label: 'SFX VOLUME', action: 'sfx' },
  { label: 'REDUCED EFFECTS', action: 'reducedMotion' },
  { label: 'BACK', action: 'back' },
];

export class StartMenu {
  private selectedIndex = 0;
  private hitboxes: MenuHitbox[] = [];

  public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.renderBackdrop(ctx, width, height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = VisualTheme.color.accent;
    ctx.font = 'bold 48px monospace';
    ctx.fillText('PLATFORM VEHICLE DEFENSE', width / 2, 190);
    ctx.fillStyle = VisualTheme.color.textSecondary;
    ctx.font = '14px monospace';
    ctx.fillText('TACTICAL ORBITAL FRONTIER // COMMAND CONSOLE', width / 2, 222);

    const buttonWidth = 300;
    const buttonHeight = 54;
    const gap = 14;
    const left = width / 2 - buttonWidth / 2;
    const top = 292;
    this.hitboxes = MENU_ACTIONS.map((entry, index) => {
      const box = { x: left, y: top + index * (buttonHeight + gap), width: buttonWidth, height: buttonHeight };
      this.drawButton(ctx, box, entry.label, index === this.selectedIndex);
      return box;
    });

    ctx.fillStyle = VisualTheme.color.textMuted;
    ctx.font = '11px monospace';
    ctx.fillText('ARROW KEYS / WASD SELECT  ·  ENTER CONFIRM', width / 2, height - 36);
    ctx.restore();
  }

  public handlePointer(point: { x: number; y: number }): StartMenuAction | null {
    const index = this.hitboxes.findIndex((box) => this.contains(box, point.x, point.y));
    if (index < 0) return null;
    this.selectedIndex = index;
    return MENU_ACTIONS[index].action;
  }

  public handleKey(code: string): StartMenuAction | null {
    if (code === 'ArrowUp' || code === 'KeyW') this.selectedIndex = this.wrap(this.selectedIndex - 1, MENU_ACTIONS.length);
    else if (code === 'ArrowDown' || code === 'KeyS') this.selectedIndex = this.wrap(this.selectedIndex + 1, MENU_ACTIONS.length);
    else if (code === 'Enter' || code === 'Space') return MENU_ACTIONS[this.selectedIndex].action;
    else return null;
    return null;
  }

  public reset(): void {
    this.selectedIndex = 0;
    this.hitboxes = [];
  }

  private renderBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = '#0c111c';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(77, 234, 234, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, 0, width, height);
  }

  private drawButton(ctx: CanvasRenderingContext2D, box: MenuHitbox, label: string, selected: boolean): void {
    ctx.fillStyle = selected ? VisualTheme.color.surfaceAvailable : VisualTheme.color.surfacePanel;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeStyle = selected ? VisualTheme.color.accent : VisualTheme.color.border;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = selected ? VisualTheme.color.textPrimary : VisualTheme.color.textSecondary;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(label, box.x + box.width / 2, box.y + 33);
  }

  private contains(box: MenuHitbox, x: number, y: number): boolean {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  }

  private wrap(value: number, length: number): number {
    return (value + length) % length;
  }
}

export class SettingsScreen {
  private selectedIndex = 0;
  private hitboxes: MenuHitbox[] = [];

  public render(ctx: CanvasRenderingContext2D, width: number, height: number, values: SettingsValues): void {
    ctx.fillStyle = '#0c111c';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = VisualTheme.color.accent;
    ctx.font = 'bold 32px monospace';
    ctx.fillText('SETTINGS', width / 2, 132);
    ctx.fillStyle = VisualTheme.color.textMuted;
    ctx.font = '12px monospace';
    ctx.fillText('SESSION ONLY · VALUES RESET WHEN THE APP CLOSES', width / 2, 158);

    const buttonWidth = 460;
    const buttonHeight = 48;
    const gap = 12;
    const left = width / 2 - buttonWidth / 2;
    const top = 220;
    this.hitboxes = SETTINGS_ACTIONS.map((entry, index) => {
      const box = { x: left, y: top + index * (buttonHeight + gap), width: buttonWidth, height: buttonHeight };
      const value = this.getValue(entry.action, values);
      this.drawRow(ctx, box, entry.label, value, index === this.selectedIndex);
      return box;
    });
    ctx.fillStyle = VisualTheme.color.textMuted;
    ctx.font = '11px monospace';
    ctx.fillText('ARROW KEYS / WASD SELECT  ·  ENTER CHANGE  ·  ESC BACK', width / 2, height - 36);
    ctx.restore();
  }

  public handlePointer(point: { x: number; y: number }): SettingsAction | null {
    const index = this.hitboxes.findIndex((box) => this.contains(box, point.x, point.y));
    if (index < 0) return null;
    this.selectedIndex = index;
    return SETTINGS_ACTIONS[index].action;
  }

  public handleKey(code: string): SettingsAction | null {
    if (code === 'Escape') return 'back';
    if (code === 'ArrowUp' || code === 'KeyW') this.selectedIndex = this.wrap(this.selectedIndex - 1, SETTINGS_ACTIONS.length);
    else if (code === 'ArrowDown' || code === 'KeyS') this.selectedIndex = this.wrap(this.selectedIndex + 1, SETTINGS_ACTIONS.length);
    else if (code === 'Enter' || code === 'Space') return SETTINGS_ACTIONS[this.selectedIndex].action;
    else return null;
    return null;
  }

  public reset(): void {
    this.selectedIndex = 0;
    this.hitboxes = [];
  }

  private drawRow(ctx: CanvasRenderingContext2D, box: MenuHitbox, label: string, value: string, selected: boolean): void {
    ctx.textAlign = 'left';
    ctx.fillStyle = selected ? VisualTheme.color.surfaceAvailable : VisualTheme.color.surfacePanel;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeStyle = selected ? VisualTheme.color.accent : VisualTheme.color.border;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = selected ? VisualTheme.color.textPrimary : VisualTheme.color.textSecondary;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(label, box.x + 18, box.y + 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = selected ? VisualTheme.color.accent : VisualTheme.color.textPrimary;
    ctx.fillText(value, box.x + box.width - 18, box.y + 30);
    ctx.textAlign = 'center';
  }

  private getValue(action: SettingsAction, values: SettingsValues): string {
    if (action === 'music') return `${Math.round(values.musicVolume * 100)}%`;
    if (action === 'sfx') return `${Math.round(values.sfxVolume * 100)}%`;
    if (action === 'reducedMotion') return values.reducedMotion ? 'ON' : 'OFF';
    return 'BACK';
  }

  private contains(box: MenuHitbox, x: number, y: number): boolean {
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  }

  private wrap(value: number, length: number): number {
    return (value + length) % length;
  }
}
