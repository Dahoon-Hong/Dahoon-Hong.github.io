import { describe, expect, it } from 'vitest';
import { SettingsScreen, StartMenu } from './StartMenu';

describe('Canvas menus', () => {
  it('selects the start action from the initial menu and navigates with arrows', () => {
    const menu = new StartMenu();
    expect(menu.handleKey('Enter')).toBe('start');
    expect(menu.handleKey('ArrowDown')).toBeNull();
    expect(menu.handleKey('Enter')).toBe('settings');
    expect(menu.handleKey('ArrowDown')).toBeNull();
    expect(menu.handleKey('Enter')).toBe('exit');
  });

  it('returns to the start menu from settings with Escape', () => {
    const settings = new SettingsScreen();
    expect(settings.handleKey('Escape')).toBe('back');
    expect(settings.handleKey('Enter')).toBe('music');
    expect(settings.handleKey('ArrowDown')).toBeNull();
    expect(settings.handleKey('Enter')).toBe('sfx');
  });
});
