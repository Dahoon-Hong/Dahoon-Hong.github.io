import { ResourceStorage, ResourceType } from './ResourceStorage';
import { TankDefinition, TankModuleDefinition } from './TankDefinitionLoader';
import { ResourcePickup } from '../entities/ResourcePickup';
import { UpgradeManager } from './UpgradeManager';

type ProductionRule = {
  input: ResourceType;
  output: ResourceType;
};

export type ProductionStatus = 'running' | 'waiting-input' | 'buffer-full' | 'storage-full';

export interface ProductionSnapshot {
  moduleId: string;
  input: ResourceType | null;
  output: ResourceType;
  progress: number;
  interval: number;
  bufferedOutput: number;
  outputCapacity: number;
  status: ProductionStatus;
}

const PRODUCTION_RULES: Record<string, ProductionRule> = {
  recycler: { input: 'resource', output: 'matter' },
  arsenal: { input: 'matter', output: 'ammo' },
  composer: { input: 'matter', output: 'nano' },
};

const PRODUCTION_MODULE_IDS = ['resource-generator', ...Object.keys(PRODUCTION_RULES)] as const;

export class VehicleSystems {
  private readonly definition: TankDefinition;
  private readonly upgrades: UpgradeManager;
  private readonly timers = new Map<string, number>();
  private readonly outputs = new Map<string, number>();
  private coreHp: number;

  constructor(definition: TankDefinition, upgrades: UpgradeManager) {
    this.definition = definition;
    this.upgrades = upgrades;

    for (const moduleId of definition.builtinModuleIds) {
      upgrades.registerInstance(this.getInstanceId(moduleId), moduleId);
      this.timers.set(moduleId, 0);
      if (moduleId in PRODUCTION_RULES) this.outputs.set(moduleId, 0);
    }

    this.coreHp = this.getStat('core', 'maxHp', 100);
  }

  public getBuiltInModuleIds(): readonly string[] {
    return this.definition.builtinModuleIds;
  }

  public getBuiltInDefinition(moduleId: string): TankModuleDefinition | null {
    const definition = this.definition.modules[moduleId];
    return definition?.kind === 'builtin' ? definition : null;
  }

  public getInstanceId(moduleId: string): string {
    return `builtin:${moduleId}`;
  }

  public getStat(moduleId: string, stat: string, fallback = 0): number {
    const instanceId = this.getInstanceId(moduleId);
    try {
      return this.upgrades.getEffectiveStats(instanceId)[stat] ?? fallback;
    } catch {
      return fallback;
    }
  }

  public getLevel(moduleId: string): number {
    return this.upgrades.getLevel(this.getInstanceId(moduleId));
  }

  public getCoreHp(): number {
    return this.coreHp;
  }

  public getCoreMaxHp(): number {
    return this.getStat('core', 'maxHp', 100);
  }

  public isCoreActive(): boolean {
    return this.coreHp > 0;
  }

  public takeCoreDamage(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.coreHp = Math.max(0, this.coreHp - amount);
  }

  public resetRuntime(): void {
    this.coreHp = this.getCoreMaxHp();
    this.timers.clear();
    this.outputs.clear();
    for (const moduleId of this.definition.builtinModuleIds) {
      this.timers.set(moduleId, 0);
      if (moduleId in PRODUCTION_RULES) this.outputs.set(moduleId, 0);
    }
  }

  public getMovementSpeed(): number {
    const powerSpeed = this.getStat('power-pack', 'movementSpeed', 0);
    const trackSpeed = this.getStat('caterpillar-track', 'trackMaxSpeed', 0);
    if (powerSpeed <= 0) return 0;
    if (trackSpeed <= 0) return powerSpeed * 0.5;
    return Math.min(powerSpeed, trackSpeed);
  }

  public getArmorValue(): number {
    return this.getStat('armor-plate', 'armorValue', 0);
  }

  public update(
    dt: number,
    vehiclePosition: { x: number; y: number },
    pickups: ResourcePickup[],
    storage: ResourceStorage
  ): void {
    if (dt <= 0) return;

    this.tick('resource-generator', dt, () => {
      storage.add('resource', this.getStat('resource-generator', 'productionAmount', 10));
    });
    this.collect(vehiclePosition, pickups, storage);

    for (const moduleId of Object.keys(PRODUCTION_RULES)) {
      this.produce(moduleId, PRODUCTION_RULES[moduleId], dt, storage);
    }
    this.flushOutputs(storage);
  }

  public getOutput(moduleId: string): number {
    return this.outputs.get(moduleId) ?? 0;
  }

  public getProductionSnapshots(storage: ResourceStorage): ProductionSnapshot[] {
    return PRODUCTION_MODULE_IDS
      .filter((moduleId) => this.definition.builtinModuleIds.includes(moduleId))
      .map((moduleId) => this.getProductionSnapshot(moduleId, storage));
  }

  private collect(position: { x: number; y: number }, pickups: ResourcePickup[], storage: ResourceStorage): void {
    const radius = this.getStat('gatherer', 'collectionRadius', 120);
    for (const pickup of pickups) {
      if (pickup.isEmpty()) continue;
      if (Math.hypot(pickup.x - position.x, pickup.y - position.y) > radius) continue;
      if (storage.tryAdd('resource', pickup.amount)) pickup.collect(pickup.amount);
    }
  }

  private produce(moduleId: string, rule: ProductionRule, dt: number, storage: ResourceStorage): void {
    const interval = Math.max(0.1, this.getStat(moduleId, 'productionInterval', 1));
    const amount = this.getStat(moduleId, 'productionAmount', 1);
    const inputAmount = this.getStat(moduleId, 'inputAmount', 1);
    const outputCapacity = this.getStat(moduleId, 'outputCapacity', 20);
    let timer = (this.timers.get(moduleId) ?? 0) + dt;
    let cycles = 0;

    while (timer >= interval && cycles < 4) {
      timer -= interval;
      cycles++;
      const output = this.outputs.get(moduleId) ?? 0;
      if (output + amount <= outputCapacity && storage.spend(rule.input, inputAmount)) {
        this.outputs.set(moduleId, output + amount);
      }
    }
    this.timers.set(moduleId, timer);
  }

  private getProductionSnapshot(moduleId: string, storage: ResourceStorage): ProductionSnapshot {
    const interval = Math.max(0.1, this.getStat(moduleId, 'productionInterval', 1));
    const timer = this.timers.get(moduleId) ?? 0;
    const progress = Math.max(0, Math.min(1, timer / interval));
    const rule = PRODUCTION_RULES[moduleId];

    if (!rule) {
      return {
        moduleId,
        input: null,
        output: 'resource',
        progress,
        interval,
        bufferedOutput: 0,
        outputCapacity: 0,
        status: storage.get('resource') >= storage.getCapacity('resource') ? 'storage-full' : 'running',
      };
    }

    const amount = this.getStat(moduleId, 'productionAmount', 1);
    const inputAmount = this.getStat(moduleId, 'inputAmount', 1);
    const outputCapacity = this.getStat(moduleId, 'outputCapacity', 20);
    const bufferedOutput = this.outputs.get(moduleId) ?? 0;
    const status: ProductionStatus = bufferedOutput + amount > outputCapacity
      ? 'buffer-full'
      : storage.get(rule.input) < inputAmount
        ? 'waiting-input'
        : storage.get(rule.output) >= storage.getCapacity(rule.output)
          ? 'storage-full'
          : 'running';

    return {
      moduleId,
      input: rule.input,
      output: rule.output,
      progress,
      interval,
      bufferedOutput,
      outputCapacity,
      status,
    };
  }

  private flushOutputs(storage: ResourceStorage): void {
    const transferAmount = Math.max(1, this.getStat('rail', 'transferAmount', 20));
    const priority = ['arsenal', 'recycler', 'composer'];
    for (const moduleId of priority) {
      const output = this.outputs.get(moduleId) ?? 0;
      if (output <= 0) continue;
      const outputType = PRODUCTION_RULES[moduleId].output;
      const moved = storage.add(outputType, Math.min(output, transferAmount));
      this.outputs.set(moduleId, output - moved);
    }
  }

  private tick(
    moduleId: string,
    dt: number,
    callback: () => void
  ): void {
    const interval = Math.max(0.1, this.getStat(moduleId, 'productionInterval', 1));
    let timer = (this.timers.get(moduleId) ?? 0) + dt;
    let cycles = 0;
    while (timer >= interval && cycles < 4) {
      timer -= interval;
      cycles++;
      callback();
    }
    this.timers.set(moduleId, timer);
  }
}
