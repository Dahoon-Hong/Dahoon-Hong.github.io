import { RESOURCE_TYPES, ResourceType } from './ResourceStorage';

export type ModuleKind = 'builtin' | 'combat';
export type UpgradeOperation = 'add' | 'multiply';

export interface GridCell {
  x: number;
  y: number;
}

export type ModuleOrientation = 0 | 1 | 2 | 3;

export interface GridDefinition {
  columns: number;
  rows: number;
  blockedCells: GridCell[];
}

export type ResourceCost = Partial<Record<ResourceType, number>>;

export interface UpgradeEffect {
  stat: string;
  operation: UpgradeOperation;
  value: number;
}

export interface UpgradeNodeDefinition {
  id: string;
  parentId: string | null;
  cost: ResourceCost;
  effects: UpgradeEffect[];
  unlocksModuleId?: string;
}

export interface UpgradeTreeDefinition {
  rootId: string;
  nodes: UpgradeNodeDefinition[];
}

export interface ModuleSize {
  width: number;
  height: number;
}

export function getOrientedModuleSize(size: ModuleSize, orientation: ModuleOrientation): ModuleSize {
  return orientation % 2 === 0
    ? { ...size }
    : { width: size.height, height: size.width };
}

export interface TankModuleDefinition {
  id: string;
  kind: ModuleKind;
  name: string;
  behavior: string;
  size?: ModuleSize;
  installCost?: ResourceCost;
  researchCost?: ResourceCost;
  purchaseCost?: ResourceCost;
  fireArcDegrees?: number;
  defaultOrientation?: ModuleOrientation;
  baseStats: Record<string, number>;
  upgradeTree: UpgradeTreeDefinition;
}

export interface InitialCombatModule {
  moduleId: string;
  anchor: GridCell;
  orientation?: ModuleOrientation;
}

export interface TankDefinition {
  id: string;
  name: string;
  grid: GridDefinition;
  builtinModuleIds: string[];
  initialCombatModules: InitialCombatModule[];
  modules: Readonly<Record<string, TankModuleDefinition>>;
}

const JSON_FILES: Record<string, unknown> = import.meta.glob('../data/tanks/*/*.json', {
  eager: true,
  import: 'default',
});

const ALLOWED_STATS = new Set([
  'maxHp',
  'range',
  'damage',
  'fireRate',
  'projectileSpeed',
  'maxDistance',
  'aoeRadius',
  'flightTime',
  'movementSpeed',
  'trackMaxSpeed',
  'rotationSpeed',
  'armorValue',
  'productionAmount',
  'productionInterval',
  'collectionRadius',
  'transferAmount',
  'inputAmount',
  'outputCapacity',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`[TankData] ${path}: ${message}`);
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'expected an object');
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function requiredNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    fail(path, `expected a finite number >= ${minimum}`);
  }
  return value;
}

function requiredInteger(value: unknown, path: string, minimum = 0): number {
  const number = requiredNumber(value, path, minimum);
  if (!Number.isInteger(number)) fail(path, 'expected an integer');
  return number;
}

function parseOrientation(value: unknown, path: string): ModuleOrientation {
  const orientation = requiredInteger(value, path);
  if (orientation > 3) fail(path, 'must be between 0 and 3');
  return orientation as ModuleOrientation;
}

function requiredArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value;
}

function parseCell(value: unknown, path: string): GridCell {
  const record = requiredRecord(value, path);
  return {
    x: requiredInteger(record.x, `${path}.x`),
    y: requiredInteger(record.y, `${path}.y`),
  };
}

function isInside(cell: GridCell, grid: GridDefinition): boolean {
  return cell.x >= 0 && cell.x < grid.columns && cell.y >= 0 && cell.y < grid.rows;
}

function parseCost(value: unknown, path: string): ResourceCost {
  const record = requiredRecord(value, path);
  const cost: ResourceCost = {};

  for (const [key, rawAmount] of Object.entries(record)) {
    if (!(RESOURCE_TYPES as string[]).includes(key)) fail(`${path}.${key}`, 'unknown resource type');
    cost[key as ResourceType] = requiredNumber(rawAmount, `${path}.${key}`);
  }

  return cost;
}

function parseEffects(value: unknown, path: string): UpgradeEffect[] {
  return requiredArray(value, path).map((rawEffect, index) => {
    const effectPath = `${path}[${index}]`;
    const record = requiredRecord(rawEffect, effectPath);
    const stat = requiredString(record.stat, `${effectPath}.stat`);
    if (!ALLOWED_STATS.has(stat)) fail(`${effectPath}.stat`, `unsupported stat '${stat}'`);

    const operation = requiredString(record.operation, `${effectPath}.operation`);
    if (operation !== 'add' && operation !== 'multiply') {
      fail(`${effectPath}.operation`, `unsupported operation '${operation}'`);
    }
    return {
      stat,
      operation,
      value: requiredNumber(record.value, `${effectPath}.value`),
    };
  });
}

function parseUpgradeTree(value: unknown, path: string): UpgradeTreeDefinition {
  const record = requiredRecord(value, path);
  const rootId = requiredString(record.rootId, `${path}.rootId`);
  const nodes = requiredArray(record.nodes, `${path}.nodes`).map((rawNode, index) => {
    const nodePath = `${path}.nodes[${index}]`;
    const node = requiredRecord(rawNode, nodePath);
    const rawParentId = node.parentId;
    if (rawParentId !== null && typeof rawParentId !== 'string') {
      fail(`${nodePath}.parentId`, 'expected a string or null');
    }

    return {
      id: requiredString(node.id, `${nodePath}.id`),
      parentId: rawParentId as string | null,
      cost: parseCost(node.cost, `${nodePath}.cost`),
      effects: parseEffects(node.effects, `${nodePath}.effects`),
      ...(node.unlocksModuleId === undefined
        ? {}
        : { unlocksModuleId: requiredString(node.unlocksModuleId, `${nodePath}.unlocksModuleId`) }),
    };
  });

  const byId = new Map<string, UpgradeNodeDefinition>();
  for (const node of nodes) {
    if (byId.has(node.id)) fail(`${path}.nodes`, `duplicate node '${node.id}'`);
    byId.set(node.id, node);
  }

  if (!byId.has(rootId)) fail(`${path}.rootId`, `missing node '${rootId}'`);
  const roots = nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1 || roots[0].id !== rootId) {
    fail(`${path}.nodes`, 'tree must contain exactly one root matching rootId');
  }

  for (const node of nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) {
      fail(`${path}.nodes.${node.id}.parentId`, `missing parent '${node.parentId}'`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) fail(`${path}.nodes`, `cycle detected at '${nodeId}'`);
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) fail(`${path}.nodes`, `missing node '${nodeId}'`);
    if (node.parentId !== null) visit(node.parentId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.id);

  return { rootId, nodes };
}

function parseGrid(value: unknown, path: string): GridDefinition {
  const record = requiredRecord(value, path);
  const grid: GridDefinition = {
    columns: requiredInteger(record.columns, `${path}.columns`, 1),
    rows: requiredInteger(record.rows, `${path}.rows`, 1),
    blockedCells: requiredArray(record.blockedCells ?? [], `${path}.blockedCells`).map((cell, index) =>
      parseCell(cell, `${path}.blockedCells[${index}]`)
    ),
  };

  const seen = new Set<string>();
  for (const [index, cell] of grid.blockedCells.entries()) {
    if (!isInside(cell, grid)) fail(`${path}.blockedCells[${index}]`, 'cell is outside the grid');
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) fail(`${path}.blockedCells[${index}]`, 'duplicate blocked cell');
    seen.add(key);
  }

  return grid;
}

function parseModuleDefinition(value: unknown, path: string, expectedId: string): TankModuleDefinition {
  const record = requiredRecord(value, path);
  const id = requiredString(record.id, `${path}.id`);
  if (id !== expectedId) fail(`${path}.id`, `must match filename '${expectedId}.json'`);

  const kind = requiredString(record.kind, `${path}.kind`);
  if (kind !== 'builtin' && kind !== 'combat') fail(`${path}.kind`, `unsupported kind '${kind}'`);
  if (id === 'core' && kind !== 'builtin') fail(`${path}.kind`, 'core must be a builtin system');

  const definition: TankModuleDefinition = {
    id,
    kind,
    name: requiredString(record.name, `${path}.name`),
    behavior: requiredString(record.behavior, `${path}.behavior`),
    baseStats: Object.fromEntries(
      Object.entries(requiredRecord(record.baseStats, `${path}.baseStats`)).map(([stat, rawValue]) => [
        stat,
        requiredNumber(rawValue, `${path}.baseStats.${stat}`),
      ])
    ),
    upgradeTree: parseUpgradeTree(record.upgradeTree, `${path}.upgradeTree`),
  };

  if (kind === 'combat') {
    const sizeRecord = requiredRecord(record.size, `${path}.size`);
    definition.size = {
      width: requiredInteger(sizeRecord.width, `${path}.size.width`, 1),
      height: requiredInteger(sizeRecord.height, `${path}.size.height`, 1),
    };
    definition.installCost = parseCost(record.installCost, `${path}.installCost`);
    if (record.researchCost !== undefined) definition.researchCost = parseCost(record.researchCost, `${path}.researchCost`);
    if (record.purchaseCost !== undefined) definition.purchaseCost = parseCost(record.purchaseCost, `${path}.purchaseCost`);
    definition.fireArcDegrees = requiredNumber(record.fireArcDegrees, `${path}.fireArcDegrees`);
    if (definition.fireArcDegrees <= 0) fail(`${path}.fireArcDegrees`, 'must be > 0');
    if (definition.fireArcDegrees > 360) fail(`${path}.fireArcDegrees`, 'must be <= 360');
    definition.defaultOrientation = parseOrientation(record.defaultOrientation ?? 0, `${path}.defaultOrientation`);
  }

  if (definition.behavior === 'core' && definition.kind !== 'builtin') {
    fail(`${path}.behavior`, 'core behavior is only allowed on builtin systems');
  }
  if (definition.id === 'core' && definition.behavior !== 'core') {
    fail(`${path}.behavior`, 'core must use core behavior');
  }

  return definition;
}

function parseManifest(value: unknown, path: string): Omit<TankDefinition, 'modules'> {
  const record = requiredRecord(value, path);
  const builtinModuleIds = requiredArray(record.builtinModuleIds, `${path}.builtinModuleIds`).map((id, index) =>
    requiredString(id, `${path}.builtinModuleIds[${index}]`)
  );
  const initialCombatModules = requiredArray(
    record.initialCombatModules,
    `${path}.initialCombatModules`
  ).map((rawPlacement, index) => {
    const placementPath = `${path}.initialCombatModules[${index}]`;
    const placement = requiredRecord(rawPlacement, placementPath);
    return {
      moduleId: requiredString(placement.moduleId, `${placementPath}.moduleId`),
      anchor: parseCell(placement.anchor, `${placementPath}.anchor`),
      ...(placement.orientation === undefined
        ? {}
        : { orientation: parseOrientation(placement.orientation, `${placementPath}.orientation`) }),
    };
  });

  return {
    id: requiredString(record.id, `${path}.id`),
    name: requiredString(record.name, `${path}.name`),
    grid: parseGrid(record.grid, `${path}.grid`),
    builtinModuleIds,
    initialCombatModules,
  };
}

function getTankIdFromManifestPath(path: string): string {
  const match = path.match(/\/tanks\/([^/]+)\/module\.json$/);
  if (!match) fail(path, 'path does not identify a tank directory');
  return match[1];
}

function getModuleIdFromPath(modulePath: string, directory: string): string {
  const filename = modulePath.slice(directory.length + 1);
  if (!filename.endsWith('.json') || filename.includes('/')) fail(modulePath, 'invalid module filename');
  return filename.slice(0, -'.json'.length);
}

function validateManifestReferences(
  manifest: Omit<TankDefinition, 'modules'>,
  modules: Readonly<Record<string, TankModuleDefinition>>,
  path: string
): void {
  const builtinIds = new Set<string>();
  for (const moduleId of manifest.builtinModuleIds) {
    if (builtinIds.has(moduleId)) fail(`${path}.builtinModuleIds`, `duplicate module '${moduleId}'`);
    builtinIds.add(moduleId);
    const module = modules[moduleId];
    if (!module) fail(`${path}.builtinModuleIds`, `missing module '${moduleId}'`);
    if (module.kind !== 'builtin') fail(`${path}.builtinModuleIds`, `'${moduleId}' is not builtin`);
  }

  const coreModules = manifest.builtinModuleIds.filter((moduleId) => modules[moduleId]?.behavior === 'core');
  if (coreModules.length !== 1) fail(`${path}.builtinModuleIds`, 'manifest must contain exactly one core system');

  for (const module of Object.values(modules)) {
    for (const node of module.upgradeTree.nodes) {
      if (!node.unlocksModuleId) continue;
      const unlocked = modules[node.unlocksModuleId];
      if (!unlocked || unlocked.kind !== 'combat') {
        fail(`${path}.modules.${module.id}.upgradeTree.nodes.${node.id}.unlocksModuleId`, `must reference a combat module '${node.unlocksModuleId}'`);
      }
    }
  }

  const blocked = new Set(manifest.grid.blockedCells.map((cell) => `${cell.x},${cell.y}`));
  const occupied = new Set<string>();
  for (const placement of manifest.initialCombatModules) {
    const module = modules[placement.moduleId];
    if (!module) fail(`${path}.initialCombatModules`, `missing module '${placement.moduleId}'`);
    if (module.kind !== 'combat' || !module.size) {
      fail(`${path}.initialCombatModules`, `'${placement.moduleId}' is not combat`);
    }

    const orientation = placement.orientation ?? module.defaultOrientation ?? 0;
    const width = orientation % 2 === 0 ? module.size.width : module.size.height;
    const height = orientation % 2 === 0 ? module.size.height : module.size.width;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = { x: placement.anchor.x + x, y: placement.anchor.y + y };
        if (!isInside(cell, manifest.grid)) fail(`${path}.initialCombatModules`, 'placement is outside the grid');
        const key = `${cell.x},${cell.y}`;
        if (blocked.has(key)) fail(`${path}.initialCombatModules`, 'placement overlaps a blocked cell');
        if (occupied.has(key)) fail(`${path}.initialCombatModules`, 'initial placements overlap');
        occupied.add(key);
      }
    }
  }
}

export class TankDefinitionLoader {
  private readonly tanks: TankDefinition[];

  constructor() {
    this.tanks = this.loadTanks();
    if (this.tanks.length === 0) throw new Error('[TankData] no tank module.json files found');
  }

  public getDefault(): TankDefinition {
    return this.tanks[0];
  }

  public getAll(): readonly TankDefinition[] {
    return this.tanks;
  }

  private loadTanks(): TankDefinition[] {
    const manifests = Object.entries(JSON_FILES).filter(([path]) => path.endsWith('/module.json'));
    const tankIds = new Set<string>();

    return manifests.map(([manifestPath, rawManifest]) => {
      const tankId = getTankIdFromManifestPath(manifestPath);
      if (tankIds.has(tankId)) fail(manifestPath, `duplicate tank '${tankId}'`);
      tankIds.add(tankId);

      const manifest = parseManifest(rawManifest, manifestPath);
      if (manifest.id !== tankId) fail(`${manifestPath}.id`, `must match directory '${tankId}'`);

      const modules: Record<string, TankModuleDefinition> = {};
      const directory = manifestPath.slice(0, manifestPath.lastIndexOf('/'));
      const moduleFiles = Object.entries(JSON_FILES).filter(
        ([path]) => path !== manifestPath && path.startsWith(`${directory}/`) && path.endsWith('.json')
      );
      for (const [modulePath, rawModule] of moduleFiles) {
        const moduleId = getModuleIdFromPath(modulePath, directory);
        if (modules[moduleId]) fail(modulePath, `duplicate module '${moduleId}'`);
        modules[moduleId] = parseModuleDefinition(rawModule, modulePath, moduleId);
      }

      validateManifestReferences(manifest, modules, manifestPath);
      return { ...manifest, modules };
    });
  }
}
