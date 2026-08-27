export class ResourceStorage {
  public readonly capacity: number;
  private readonly initialAmount: number;
  private amount: number;

  constructor(initialAmount: number = 50, capacity: number = 100) {
    this.capacity = Math.max(0, capacity);
    this.initialAmount = Math.min(Math.max(0, initialAmount), this.capacity);
    this.amount = this.initialAmount;
  }

  public get current(): number {
    return this.amount;
  }

  public add(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const added = Math.min(amount, this.capacity - this.amount);
    this.amount += added;
    return added;
  }

  public tryAdd(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || amount > this.capacity - this.amount) {
      return false;
    }

    this.amount += amount;
    return true;
  }

  public spend(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0 || amount > this.amount) return false;

    this.amount -= amount;
    return true;
  }

  public reset(): void {
    this.amount = this.initialAmount;
  }
}
