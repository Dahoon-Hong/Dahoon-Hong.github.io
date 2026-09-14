import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../core/TerrainGrid';
import { EnemyDefinition, StandardEnemy } from './Enemy';
import { findClosestEnemy, DirectWeaponModule } from './Module';
import { UpgradeManager } from '../core/UpgradeManager';
import { TankModuleDefinition } from '../core/TankDefinitionLoader';

const enemyDefinition: EnemyDefinition = {
  spawnWeight: 1,
  spawnInterval: 0.6,
  spawnBatchSize: 5,
  hp: 45,
  armor: 0,
  speed: 95,
  radius: 12,
  reward: 10,
  typeName: 'Standard',
  contactDamage: 10,
  contactDamageInterval: 0.2,
};

const terrain = new TerrainGrid({
  world: { cellSize: 36, columns: 7, rows: 5 },
  terrain: { legend: { '.': 'open', H: 'hill' }, rows: ['.......', '.......', '..H....', '.......', '.......'] },
  terrainTypes: {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
    hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
  },
});

const tree = { rootId: 'root', nodes: [{ id: 'root', parentId: null, cost: {}, effects: [] }] };
const weaponDefinition: TankModuleDefinition = {
  id: 'direct-weapon',
  kind: 'combat',
  name: 'Test Gun',
  behavior: 'direct',
  size: { width: 1, height: 1 },
  installCost: {},
  fireArcDegrees: 360,
  defaultOrientation: 0,
  baseStats: { range: 500, fireRate: 0.2, projectileSpeed: 100, damage: 10, maxDistance: 500 },
  upgradeTree: tree,
};

describe('combat terrain targeting', () => {
  it('skips a closer enemy hidden behind a hill', () => {
    const hidden = new StandardEnemy(90, 90, enemyDefinition);
    const visible = new StandardEnemy(162, 18, enemyDefinition);
    const target = findClosestEnemy(
      { x: 18, y: 90 },
      [hidden, visible],
      500,
      0,
      360,
      (from, to) => terrain.raycast(from, to) === null,
    );

    expect(target).toBe(visible);
  });

  it('does not spend ammo or start cooldown when every target is hidden', () => {
    const upgrades = new UpgradeManager({ 'direct-weapon': weaponDefinition });
    upgrades.registerInstance('direct-weapon#1', 'direct-weapon');
    const weapon = new DirectWeaponModule(weaponDefinition, 'direct-weapon#1', { x: 0, y: 0 }, upgrades);
    const hidden = new StandardEnemy(90, 90, enemyDefinition);
    let spent = 0;
    let spawned = 0;

    weapon.update(
      1,
      { x: 18, y: 90 },
      0,
      [hidden],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
      (from, to) => terrain.raycast(from, to) === null,
    );

    expect(spent).toBe(0);
    expect(spawned).toBe(0);
    expect(weapon.getFireRate()).toBe(0.2);
  });

  it('fires a magazine, then reloads without reserving ammo', () => {
    const definition: TankModuleDefinition = {
      ...weaponDefinition,
      baseStats: {
        ...weaponDefinition.baseStats,
        fireRate: 0.1,
        magazineSize: 2,
        reloadTime: 1,
        penetration: 10,
      },
    };
    const upgrades = new UpgradeManager({ 'magazine-test': definition });
    upgrades.registerInstance('magazine-test#1', 'magazine-test');
    const weapon = new DirectWeaponModule(definition, 'magazine-test#1', { x: 0, y: 0 }, upgrades);
    const target = new StandardEnemy(100, 0, enemyDefinition);
    let spent = 0;
    let spawned = 0;
    const fire = (dt: number) => weapon.update(
      dt,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
    );

    fire(0.01);
    expect(weapon.getLoadedShots()).toBe(1);
    fire(0.1);
    expect(weapon.getLoadedShots()).toBe(0);
    expect(weapon.isReloading()).toBe(true);
    expect(spent).toBe(2);
    expect(spawned).toBe(2);
    fire(0.5);
    expect(spent).toBe(2);
    fire(0.5);
    expect(spent).toBe(3);
    expect(weapon.getLoadedShots()).toBe(1);
  });

  it('does not fire a minimum-range weapon at a target inside its dead zone', () => {
    const definition: TankModuleDefinition = {
      ...weaponDefinition,
      weaponClass: 'tank-gun',
      size: { width: 1, height: 2 },
      baseStats: {
        ...weaponDefinition.baseStats,
        minRange: 100,
        magazineSize: 1,
        reloadTime: 1,
        penetration: 50,
      },
    };
    const upgrades = new UpgradeManager({ 'minimum-range-test': definition });
    upgrades.registerInstance('minimum-range-test#1', 'minimum-range-test');
    const weapon = new DirectWeaponModule(definition, 'minimum-range-test#1', { x: 0, y: 0 }, upgrades);
    const target = new StandardEnemy(50, 0, enemyDefinition);
    let spent = 0;
    let spawned = 0;

    weapon.update(
      1,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
    );

    expect(spent).toBe(0);
    expect(spawned).toBe(0);
    expect(weapon.getLoadedShots()).toBe(1);
  });
});
