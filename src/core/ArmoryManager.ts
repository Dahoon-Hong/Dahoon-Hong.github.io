import { TankDefinition, TankModuleDefinition, ResourceCost } from './TankDefinitionLoader';
import { UpgradeManager } from './UpgradeManager';

export class ArmoryManager {
  private readonly definition: TankDefinition;
  private readonly upgrades: UpgradeManager;
  private readonly stock = new Map<string, number>();

  public constructor(definition: TankDefinition, upgrades: UpgradeManager) {
    this.definition = definition;
    this.upgrades = upgrades;
  }

  public getInstanceId(): string {
    return 'builtin:armory';
  }

  public getCombatModuleDefinitions(): TankModuleDefinition[] {
    return Object.values(this.definition.modules).filter(
      (module) => module.kind === 'combat' && module.id !== 'core' && module.behavior !== 'core'
    );
  }

  public isResearched(moduleId: string): boolean {
    const node = this.getResearchNode(moduleId);
    if (!node) return false;
    const armory = this.definition.modules.armory;
    return node.id === armory?.upgradeTree.rootId ||
      this.upgrades.getSelectedNodeIds(this.getInstanceId()).includes(node.id);
  }

  public getResearchCost(moduleId: string): ResourceCost {
    const definition = this.definition.modules[moduleId];
    return { ...(definition?.researchCost ?? this.getResearchNode(moduleId)?.cost ?? {}) };
  }

  public getPurchaseCost(moduleId: string): ResourceCost {
    const definition = this.definition.modules[moduleId];
    return { ...(definition?.purchaseCost ?? definition?.installCost ?? {}) };
  }

  public getStock(moduleId: string): number {
    return this.stock.get(moduleId) ?? 0;
  }

  public purchase(moduleId: string, spendCost: (cost: ResourceCost) => boolean): boolean {
    if (!this.isResearched(moduleId)) return false;
    const definition = this.definition.modules[moduleId];
    if (!definition || definition.kind !== 'combat') return false;
    const cost = this.getPurchaseCost(moduleId);
    if (!spendCost(cost)) return false;
    this.stock.set(moduleId, this.getStock(moduleId) + 1);
    return true;
  }

  public consume(moduleId: string): boolean {
    const count = this.getStock(moduleId);
    if (count <= 0) return false;
    this.stock.set(moduleId, count - 1);
    return true;
  }

  private getResearchNode(moduleId: string) {
    const armory = this.definition.modules.armory;
    return armory?.upgradeTree.nodes.find((node) => node.unlocksModuleId === moduleId) ?? null;
  }
}
