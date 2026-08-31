export type ResourceType = 'resource' | 'matter' | 'ammo' | 'nano';

export const RESOURCE_TYPES: ResourceType[] = ['resource', 'matter', 'ammo', 'nano'];

export class ResourceStorage {
  private readonly capacities: Record<ResourceType, number>;
  private readonly initialAmounts: Record<ResourceType, number>;
  private readonly amounts: Record<ResourceType, number>;

  constructor(initialResourceOrAmounts: number | Partial<Record<ResourceType, number>> = 50, capacity: number = 100) {
    const initialAmounts = typeof initialResourceOrAmounts === 'number'
      ? { resource: initialResourceOrAmounts }
      : initialResourceOrAmounts;
    const safeCapacity = Math.max(0, capacity);

    this.capacities = this.createAmounts(safeCapacity);
    this.initialAmounts = this.createAmounts(0);
    this.amounts = this.createAmounts(0);

    for (const type of RESOURCE_TYPES) {
      const initialAmount = Math.max(0, initialAmounts[type] ?? 0);
      this.initialAmounts[type] = Math.min(initialAmount, this.capacities[type]);
      this.amounts[type] = this.initialAmounts[type];
    }
  }

  public get(type: ResourceType): number {
    return this.amounts[type];
  }

  public getCapacity(type: ResourceType): number {
    return this.capacities[type];
  }

  public add(type: ResourceType, amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const added = Math.min(amount, this.capacities[type] - this.amounts[type]);
    this.amounts[type] += added;
    return added;
  }

  public tryAdd(type: ResourceType, amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || amount > this.capacities[type] - this.amounts[type]) {
      return false;
    }

    this.amounts[type] += amount;
    return true;
  }

  public spend(type: ResourceType, amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0 || amount > this.amounts[type]) return false;

    this.amounts[type] -= amount;
    return true;
  }

  public canAfford(cost: Partial<Record<ResourceType, number>>): boolean {
    return Object.entries(cost).every(([type, amount]) => {
      if (!(RESOURCE_TYPES as string[]).includes(type)) return false;
      return Number.isFinite(amount) && (amount ?? 0) >= 0 && (amount ?? 0) <= this.amounts[type as ResourceType];
    });
  }

  public spendCost(cost: Partial<Record<ResourceType, number>>): boolean {
    if (!this.canAfford(cost)) return false;

    for (const [type, amount] of Object.entries(cost)) {
      this.amounts[type as ResourceType] -= amount ?? 0;
    }
    return true;
  }

  public reset(): void {
    for (const type of RESOURCE_TYPES) {
      this.amounts[type] = this.initialAmounts[type];
    }
  }

  private createAmounts(value: number): Record<ResourceType, number> {
    return {
      resource: value,
      matter: value,
      ammo: value,
      nano: value,
    };
  }
}
