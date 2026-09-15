import { describe, expect, it } from 'vitest';
import { TerrainGrid } from '../core/TerrainGrid';
import { EnemyDefinition, StandardEnemy } from './Enemy';
import { ArcWeaponModule, findClosestEnemy, DirectWeaponModule } from './Module';
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
  id: 'machine-gun-12.7mm',
  kind: 'combat',
  name: 'Test Gun',
  behavior: 'direct',
  size: { width: 1, height: 1 },
  installCost: {},
  fireArcDegrees: 360,
  defaultOrientation: 0,
  baseStats: { minRange: 0, maxRange: 500, fireRate: 0.2, projectileSpeed: 100, damage: 10 },
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
    const upgrades = new UpgradeManager({ 'machine-gun-12.7mm': weaponDefinition });
    upgrades.registerInstance('machine-gun-12.7mm#1', 'machine-gun-12.7mm');
    const weapon = new DirectWeaponModule(weaponDefinition, 'machine-gun-12.7mm#1', { x: 0, y: 0 }, upgrades);
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

  it('fires a magazine, then spends one ammo to reload', () => {
    const definition: TankModuleDefinition = {
      ...weaponDefinition,
      weaponClass: 'machine-gun',
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
    expect(spent).toBe(0);
    fire(0.1);
    expect(weapon.getLoadedShots()).toBe(0);
    expect(weapon.isReloading()).toBe(true);
    expect(spent).toBe(1);
    expect(spawned).toBe(2);
    fire(0.5);
    expect(spent).toBe(1);
    fire(0.5);
    expect(spent).toBe(1);
    expect(weapon.getLoadedShots()).toBe(1);
  });

  it('spends one ammo for each single-shot weapon round', () => {
    const definition: TankModuleDefinition = {
      ...weaponDefinition,
      weaponClass: 'tank-gun',
      baseStats: {
        ...weaponDefinition.baseStats,
        fireRate: 0,
        magazineSize: 1,
        reloadTime: 1,
        penetration: 10,
      },
    };
    const upgrades = new UpgradeManager({ 'single-shot-test': definition });
    upgrades.registerInstance('single-shot-test#1', 'single-shot-test');
    const weapon = new DirectWeaponModule(definition, 'single-shot-test#1', { x: 0, y: 0 }, upgrades);
    const target = new StandardEnemy(100, 0, enemyDefinition);
    let spent = 0;
    let spawned = 0;

    weapon.update(
      0.01,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
    );

    expect(spent).toBe(1);
    expect(spawned).toBe(1);
    expect(weapon.getLoadedShots()).toBe(0);
    expect(weapon.isReloading()).toBe(true);
  });

  it('keeps a machine-gun empty when reload ammo is unavailable', () => {
    const definition: TankModuleDefinition = {
      ...weaponDefinition,
      weaponClass: 'machine-gun',
      baseStats: {
        ...weaponDefinition.baseStats,
        fireRate: 0,
        magazineSize: 1,
        reloadTime: 1,
        penetration: 10,
      },
    };
    const upgrades = new UpgradeManager({ 'empty-magazine-test': definition });
    upgrades.registerInstance('empty-magazine-test#1', 'empty-magazine-test');
    const weapon = new DirectWeaponModule(definition, 'empty-magazine-test#1', { x: 0, y: 0 }, upgrades);
    const target = new StandardEnemy(100, 0, enemyDefinition);
    let ammoAvailable = false;
    let reloadAttempts = 0;
    let spawned = 0;
    const fire = (dt: number) => weapon.update(
      dt,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => {
        reloadAttempts++;
        return ammoAvailable;
      },
      () => undefined,
    );

    fire(0.01);
    expect(spawned).toBe(1);
    expect(weapon.getLoadedShots()).toBe(0);
    expect(weapon.isReloading()).toBe(false);
    expect(reloadAttempts).toBe(1);

    fire(0.01);
    expect(spawned).toBe(1);
    expect(reloadAttempts).toBe(2);

    ammoAvailable = true;
    fire(0.01);
    expect(spawned).toBe(1);
    expect(weapon.isReloading()).toBe(true);
    fire(1);
    expect(spawned).toBe(2);
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

    target.x = 150;
    weapon.update(
      0.01,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
    );

    expect(spent).toBe(1);
    expect(spawned).toBe(1);
  });

  it('applies the same minimum and maximum range to indirect fire', () => {
    const definition: TankModuleDefinition = {
      ...weaponDefinition,
      id: 'mortar-test',
      behavior: 'arc',
      weaponClass: 'howitzer',
      baseStats: {
        ...weaponDefinition.baseStats,
        fireRate: 0,
        minRange: 100,
        maxRange: 500,
        aoeRadius: 40,
        flightTime: 1,
        magazineSize: 1,
        reloadTime: 1,
        penetration: 10,
      },
    };
    const upgrades = new UpgradeManager({ 'mortar-test': definition });
    upgrades.registerInstance('mortar-test#1', 'mortar-test');
    const weapon = new ArcWeaponModule(definition, 'mortar-test#1', { x: 0, y: 0 }, upgrades);
    const target = new StandardEnemy(550, 0, enemyDefinition);
    let spent = 0;
    let spawned = 0;

    weapon.update(
      0.01,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
    );

    expect(spent).toBe(0);
    expect(spawned).toBe(0);

    target.x = 150;
    weapon.update(
      0.01,
      { x: 0, y: 0 },
      0,
      [target],
      () => { spawned++; },
      () => { spent++; return true; },
      () => undefined,
    );

    expect(spent).toBe(1);
    expect(spawned).toBe(1);
  });
});
