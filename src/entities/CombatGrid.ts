import { GridCell, GridDefinition, InitialCombatModule, TankModuleDefinition } from '../core/TankDefinitionLoader';
import { UpgradeManager } from '../core/UpgradeManager';
import { CombatModule, createCombatModule } from './Module';

export interface CombatPlacement {
  module: CombatModule;
  anchor: GridCell;
}

export class CombatGrid {
  private readonly definition: GridDefinition;
  private readonly baseColumns: number;
  private readonly baseRows: number;
  private readonly modules: Readonly<Record<string, TankModuleDefinition>>;
  private readonly upgrades: UpgradeManager;
  private readonly placements: CombatPlacement[] = [];
  private readonly occupancy = new Map<string, CombatModule>();
  private nextInstanceNumber = 1;

  constructor(
    definition: GridDefinition,
    modules: Readonly<Record<string, TankModuleDefinition>>,
    upgrades: UpgradeManager
  ) {
    this.definition = definition;
    this.baseColumns = definition.columns;
    this.baseRows = definition.rows;
    this.modules = modules;
    this.upgrades = upgrades;
  }

  public get columns(): number {
    return this.baseColumns;
  }

  public get rows(): number {
    return this.baseRows;
  }

  public getCombatModuleDefinitions(): TankModuleDefinition[] {
    return Object.values(this.modules).filter(
      (module) => module.kind === 'combat' && module.id !== 'core' && module.behavior !== 'core'
    );
  }

  public getPlacements(): readonly CombatPlacement[] {
    return this.placements;
  }

  public getModuleAtCell(x: number, y: number): CombatModule | null {
    return this.occupancy.get(this.key(x, y)) ?? null;
  }

  public getOccupiedCells(module: CombatModule): GridCell[] {
    const cells: GridCell[] = [];
    for (let y = 0; y < module.size.height; y++) {
      for (let x = 0; x < module.size.width; x++) {
        cells.push({ x: module.anchor.x + x, y: module.anchor.y + y });
      }
    }
    return cells;
  }

  public canInstall(moduleId: string, anchor: GridCell): boolean {
    const definition = this.modules[moduleId];
    if (
      !definition ||
      definition.id === 'core' ||
      definition.behavior === 'core' ||
      definition.kind !== 'combat' ||
      !definition.size
    ) return false;
    if (!this.isIntegerCell(anchor)) return false;

    for (let y = 0; y < definition.size.height; y++) {
      for (let x = 0; x < definition.size.width; x++) {
        const cell = { x: anchor.x + x, y: anchor.y + y };
        if (!this.isInstallableCell(cell)) return false;
      }
    }
    return true;
  }

  public install(moduleId: string, anchor: GridCell): CombatModule | null {
    if (!this.canInstall(moduleId, anchor)) return null;

    const definition = this.modules[moduleId];
    if (!definition) return null;
    const instanceId = `${moduleId}#${this.nextInstanceNumber++}`;
    this.upgrades.registerInstance(instanceId, moduleId);
    const module = createCombatModule(definition, instanceId, anchor, this.upgrades);
    if (!module) return null;

    const placement = { module, anchor: { ...anchor } };
    this.placements.push(placement);
    for (const cell of this.getOccupiedCells(module)) this.occupancy.set(this.key(cell.x, cell.y), module);
    return module;
  }

  public installInitial(placements: readonly InitialCombatModule[]): void {
    for (const placement of placements) {
      if (!this.install(placement.moduleId, placement.anchor)) {
        throw new Error(`[CombatGrid] invalid initial placement '${placement.moduleId}'`);
      }
    }
  }

  public isInside(cell: GridCell): boolean {
    return cell.x >= 0 && cell.x < this.columns && cell.y >= 0 && cell.y < this.rows;
  }

  public isBlocked(cell: GridCell): boolean {
    return this.definition.blockedCells.some((blocked) => blocked.x === cell.x && blocked.y === cell.y);
  }

  private isInstallableCell(cell: GridCell): boolean {
    return this.isInside(cell) && !this.isBlocked(cell) && !this.getModuleAtCell(cell.x, cell.y);
  }

  private isIntegerCell(cell: GridCell): boolean {
    return Number.isInteger(cell.x) && Number.isInteger(cell.y);
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
}
