import {
  ResourceCost,
  TankModuleDefinition,
  UpgradeEffect,
  UpgradeNodeDefinition,
} from './TankDefinitionLoader';

export type UpgradeNodeStatus = 'selected' | 'available' | 'locked' | 'disabled';

export interface UpgradeNodeState {
  definition: UpgradeNodeDefinition;
  status: UpgradeNodeStatus;
}

export class UpgradeManager {
  private readonly definitions: Readonly<Record<string, TankModuleDefinition>>;
  private readonly selectedByInstance = new Map<string, Set<string>>();

  constructor(definitions: Readonly<Record<string, TankModuleDefinition>>) {
    this.definitions = definitions;
  }

  public registerInstance(instanceId: string, moduleId: string): void {
    if (!this.definitions[moduleId]) {
      throw new Error(`[Upgrade] unknown module '${moduleId}'`);
    }
    this.selectedByInstance.set(instanceId, new Set());
  }

  public reset(): void {
    for (const selected of this.selectedByInstance.values()) selected.clear();
  }

  public getDefinition(instanceId: string): TankModuleDefinition {
    const moduleId = this.getModuleId(instanceId);
    const definition = this.definitions[moduleId];
    if (!definition) throw new Error(`[Upgrade] unknown instance '${instanceId}'`);
    return definition;
  }

  public getNodeStates(instanceId: string): UpgradeNodeState[] {
    const definition = this.getDefinition(instanceId);
    const selected = this.getSelected(instanceId);
    const nodesById = new Map(definition.upgradeTree.nodes.map((node) => [node.id, node]));
    const statuses = new Map<string, UpgradeNodeStatus>();
    const resolveStatus = (node: UpgradeNodeDefinition): UpgradeNodeStatus => {
      const existing = statuses.get(node.id);
      if (existing) return existing;
      if (node.id === definition.upgradeTree.rootId || selected.has(node.id)) {
        statuses.set(node.id, 'selected');
        return 'selected';
      }

      const selectedSibling = definition.upgradeTree.nodes.some(
        (candidate) => candidate.parentId === node.parentId && selected.has(candidate.id)
      );
      if (selectedSibling) {
        statuses.set(node.id, 'disabled');
        return 'disabled';
      }
      if (node.parentId === null) {
        statuses.set(node.id, 'locked');
        return 'locked';
      }

      const parent = nodesById.get(node.parentId);
      const parentStatus = parent ? resolveStatus(parent) : 'locked';
      const status = parentStatus === 'selected'
        ? 'available'
        : parentStatus === 'disabled'
          ? 'disabled'
          : 'locked';
      statuses.set(node.id, status);
      return status;
    };

    return definition.upgradeTree.nodes.map((node) => ({ definition: node, status: resolveStatus(node) }));
  }

  public select(
    instanceId: string,
    nodeId: string,
    spendCost: (cost: ResourceCost) => boolean
  ): boolean {
    const nodeState = this.getNodeStates(instanceId).find((state) => state.definition.id === nodeId);
    if (!nodeState || nodeState.status !== 'available') return false;
    if (!spendCost(nodeState.definition.cost)) return false;

    this.getSelected(instanceId).add(nodeId);
    return true;
  }

  public getEffectiveStats(instanceId: string): Record<string, number> {
    const definition = this.getDefinition(instanceId);
    const stats = { ...definition.baseStats };
    const selected = this.getSelected(instanceId);

    for (const node of definition.upgradeTree.nodes) {
      if (node.id === definition.upgradeTree.rootId || !selected.has(node.id)) continue;
      for (const effect of node.effects) this.applyEffect(stats, effect);
    }

    return stats;
  }

  public getLevel(instanceId: string): number {
    return 1 + this.getSelected(instanceId).size;
  }

  public getSelectedNodeIds(instanceId: string): readonly string[] {
    return [...this.getSelected(instanceId)];
  }

  private getModuleId(instanceId: string): string {
    const separator = instanceId.indexOf(':');
    const withoutPrefix = separator >= 0 ? instanceId.slice(separator + 1) : instanceId;
    const instanceNumber = withoutPrefix.indexOf('#');
    return instanceNumber >= 0 ? withoutPrefix.slice(0, instanceNumber) : withoutPrefix;
  }

  private getSelected(instanceId: string): Set<string> {
    const selected = this.selectedByInstance.get(instanceId);
    if (!selected) throw new Error(`[Upgrade] unregistered instance '${instanceId}'`);
    return selected;
  }

  private applyEffect(stats: Record<string, number>, effect: UpgradeEffect): void {
    const current = stats[effect.stat] ?? 0;
    stats[effect.stat] = effect.operation === 'add'
      ? current + effect.value
      : current * effect.value;
  }
}
