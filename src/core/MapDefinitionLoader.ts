import mapData from '../data/maps.json';
import assetData from '../data/assets.json';
import enemyData from '../data/enemies.json';
import {
  TerrainBlocks,
  TerrainCell,
  TerrainGrid,
  TerrainMapData,
  TerrainTypeDefinition,
} from './TerrainGrid';
import { TerrainPathfinder } from './TerrainPathfinder';

export interface MapDefinition extends TerrainMapData {
  mapId: string;
  planetId: string;
  regionId: string;
  backgroundAsset: string;
  groundAsset: string;
  tileAssets: string[];
  propAssets: string[];
  spawnEdgeAsset: string;
  terrainAssets: {
    hillCenter: string;
    hillEdge: string;
    hillCorner: string;
  };
  repeat: { background: boolean; tile: boolean };
  safeMargin: { top: number; right: number; bottom: number; left: number };
  gameplay: { decorativeOnly: boolean; campaign: boolean };
  tankStartCell: TerrainCell;
  enemySpawnCells: TerrainCell[];
}

export interface MapDataRoot {
  version: number;
  terrainTypes: Record<string, { blocks: TerrainBlocks; assetId?: string }>;
  maps: unknown[];
}

type AssetManifest = { sprites?: Record<string, unknown> };

const DEFAULT_DATA = mapData as unknown as MapDataRoot;
const DEFAULT_ASSETS = assetData as AssetManifest;
const ENEMY_RADII = [enemyData.standard.radius, enemyData.tanker.radius];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`[MapData] ${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'expected an object');
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function number(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    fail(path, `expected a finite number >= ${minimum}`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  const parsed = number(value, path, minimum);
  if (!Number.isInteger(parsed)) fail(path, 'expected an integer');
  return parsed;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function cell(value: unknown, path: string): TerrainCell {
  const source = record(value, path);
  return { x: integer(source.x, `${path}.x`), y: integer(source.y, `${path}.y`) };
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value.map((entry, index) => string(entry, `${path}[${index}]`));
}

function parseBlocks(value: unknown, path: string): TerrainBlocks {
  const source = record(value, path);
  return {
    tank: boolean(source.tank, `${path}.tank`),
    enemy: boolean(source.enemy, `${path}.enemy`),
    projectile: boolean(source.projectile, `${path}.projectile`),
  };
}

function parseTerrainTypes(value: unknown, path: string): Record<string, TerrainTypeDefinition> {
  const source = record(value, path);
  const types: Record<string, TerrainTypeDefinition> = {};
  for (const [id, rawType] of Object.entries(source)) {
    const type = record(rawType, `${path}.${id}`);
    types[id] = {
      id,
      blocks: parseBlocks(type.blocks, `${path}.${id}.blocks`),
      ...(type.assetId === undefined ? {} : { assetId: string(type.assetId, `${path}.${id}.assetId`) }),
    };
  }
  if (!types.open) fail(path, 'must define an open terrain type');
  return types;
}

function parseAssets(value: unknown, path: string, legacy: Record<string, unknown> = {}): {
  backgroundAsset: string;
  groundAsset: string;
  tileAssets: string[];
  propAssets: string[];
  spawnEdgeAsset: string;
  terrainAssets: MapDefinition['terrainAssets'];
} {
  const source = value === undefined ? legacy : record(value, path);
  const terrainAssets = source.terrain === undefined
    ? {}
    : record(source.terrain, `${path}.terrain`);
  return {
    backgroundAsset: string(source.background ?? source.backgroundAsset, `${path}.background`),
    groundAsset: string(source.ground ?? source.background ?? source.backgroundAsset, `${path}.ground`),
    tileAssets: stringArray(source.tiles ?? source.tileAssets ?? [], `${path}.tiles`),
    propAssets: stringArray(source.props ?? source.propAssets ?? [], `${path}.props`),
    spawnEdgeAsset: string(source.spawnEdge ?? source.spawnEdgeAsset, `${path}.spawnEdge`),
    terrainAssets: {
      hillCenter: string(terrainAssets.hillCenter ?? source.ground ?? source.background ?? source.backgroundAsset, `${path}.terrain.hillCenter`),
      hillEdge: string(terrainAssets.hillEdge ?? source.ground ?? source.background ?? source.backgroundAsset, `${path}.terrain.hillEdge`),
      hillCorner: string(terrainAssets.hillCorner ?? source.ground ?? source.background ?? source.backgroundAsset, `${path}.terrain.hillCorner`),
    },
  };
}

function defaultTerrainTypes(): Record<string, TerrainTypeDefinition> {
  return {
    open: { id: 'open', blocks: { tank: false, enemy: false, projectile: false } },
    hill: { id: 'hill', blocks: { tank: true, enemy: true, projectile: true } },
  };
}

export class MapDefinitionLoader {
  private readonly maps: readonly MapDefinition[];
  private readonly assetIds: ReadonlySet<string>;

  public constructor(
    raw: MapDataRoot = DEFAULT_DATA,
    assets: AssetManifest = DEFAULT_ASSETS,
  ) {
    this.assetIds = new Set(Object.keys(assets.sprites ?? {}));
    if (!Number.isInteger(raw.version) || raw.version < 1) fail('version', 'must be a positive integer');
    const terrainTypes = raw.terrainTypes ? parseTerrainTypes(raw.terrainTypes, 'terrainTypes') : defaultTerrainTypes();
    for (const type of Object.values(terrainTypes)) {
      if (type.assetId && this.assetIds.size > 0 && !this.assetIds.has(type.assetId)) {
        fail(`terrainTypes.${type.id}.assetId`, `unknown asset ID '${type.assetId}'`);
      }
    }
    if (!Array.isArray(raw.maps) || raw.maps.length === 0) fail('maps', 'must contain at least one map');

    const ids = new Set<string>();
    this.maps = raw.maps.map((rawMap, index) => {
      const path = `maps[${index}]`;
      const source = record(rawMap, path);
      const planetId = string(source.planetId, `${path}.planetId`);
      const regionId = string(source.regionId, `${path}.regionId`);
      const mapId = string(source.mapId ?? `${planetId}/${regionId}`, `${path}.mapId`);
      if (ids.has(mapId)) fail(`${path}.mapId`, `duplicate map ID '${mapId}'`);
      ids.add(mapId);
      if (mapId !== `${planetId}/${regionId}`) fail(`${path}.mapId`, 'must match planetId/regionId');

      const hasTerrain = source.world !== undefined && source.terrain !== undefined;
      const world = hasTerrain ? record(source.world, `${path}.world`) : {};
      const parsedWorld = {
        cellSize: hasTerrain ? integer(world.cellSize, `${path}.world.cellSize`, 1) : 36,
        columns: hasTerrain ? integer(world.columns, `${path}.world.columns`, 1) : 80,
        rows: hasTerrain ? integer(world.rows, `${path}.world.rows`, 1) : 60,
      };
      if (parsedWorld.cellSize !== 36) fail(`${path}.world.cellSize`, 'must be 36');

      const terrain = hasTerrain
        ? record(source.terrain, `${path}.terrain`)
        : { legend: { '.': 'open' }, rows: Array<string>(parsedWorld.rows).fill('.'.repeat(parsedWorld.columns)) };
      const legendSource = record(terrain.legend, `${path}.terrain.legend`);
      const legend: Record<string, string> = {};
      for (const [symbol, typeId] of Object.entries(legendSource)) {
        if (symbol.length !== 1) fail(`${path}.terrain.legend`, 'symbols must be one character');
        const parsedTypeId = string(typeId, `${path}.terrain.legend.${symbol}`);
        if (!terrainTypes[parsedTypeId]) fail(`${path}.terrain.legend.${symbol}`, `unknown terrain type '${parsedTypeId}'`);
        legend[symbol] = parsedTypeId;
      }
      const rows = terrain.rows;
      if (!Array.isArray(rows) || rows.length !== parsedWorld.rows) {
        fail(`${path}.terrain.rows`, `must contain exactly ${parsedWorld.rows} rows`);
      }
      const parsedRows = rows.map((rawRow, rowIndex) => {
        const row = string(rawRow, `${path}.terrain.rows[${rowIndex}]`);
        if (row.length !== parsedWorld.columns) {
          fail(`${path}.terrain.rows[${rowIndex}]`, `must contain exactly ${parsedWorld.columns} cells`);
        }
        for (const symbol of row) {
          if (!legend[symbol]) fail(`${path}.terrain.rows[${rowIndex}]`, `unknown terrain symbol '${symbol}'`);
        }
        return row;
      });

      const assetsForMap = parseAssets(source.assets, `${path}.assets`, source);
      const assetRefs = [
        assetsForMap.backgroundAsset,
        assetsForMap.groundAsset,
        ...assetsForMap.tileAssets,
        ...assetsForMap.propAssets,
        assetsForMap.spawnEdgeAsset,
        assetsForMap.terrainAssets.hillCenter,
        assetsForMap.terrainAssets.hillEdge,
        assetsForMap.terrainAssets.hillCorner,
      ];
      for (const assetId of assetRefs) {
        if (this.assetIds.size > 0 && !this.assetIds.has(assetId)) fail(`${path}.assets`, `unknown asset ID '${assetId}'`);
      }

      const terrainData: TerrainMapData = { world: parsedWorld, terrain: { legend, rows: parsedRows }, terrainTypes };
      const grid = new TerrainGrid(terrainData);
      const tankStartCell = cell(
        source.tankStartCell ?? (hasTerrain ? undefined : { x: 40, y: 30 }),
        `${path}.tankStartCell`,
      );
      if (!grid.isInside(tankStartCell)) fail(`${path}.tankStartCell`, 'cell is outside the map');
      if (grid.isBlocked(tankStartCell, 'tank')) fail(`${path}.tankStartCell`, 'cell is blocked for tank');

      const rawSpawns = source.enemySpawnCells ?? (hasTerrain ? undefined : [{ x: 2, y: 30 }, { x: 77, y: 30 }]);
      if (!Array.isArray(rawSpawns) || rawSpawns.length === 0) fail(`${path}.enemySpawnCells`, 'must contain at least one cell');
      const enemySpawnCells = rawSpawns.map((rawSpawn, spawnIndex) => {
        const spawn = cell(rawSpawn, `${path}.enemySpawnCells[${spawnIndex}]`);
        if (!grid.isInside(spawn)) fail(`${path}.enemySpawnCells[${spawnIndex}]`, 'cell is outside the map');
        if (grid.isBlocked(spawn, 'enemy')) fail(`${path}.enemySpawnCells[${spawnIndex}]`, 'cell is blocked for enemy');
        return spawn;
      });

      const gameplay = record(source.gameplay, `${path}.gameplay`);
      const safeMargin = record(source.safeMargin, `${path}.safeMargin`);
      return {
        ...terrainData,
        mapId,
        planetId,
        regionId,
        ...assetsForMap,
        repeat: {
          background: boolean(record(source.repeat, `${path}.repeat`).background, `${path}.repeat.background`),
          tile: boolean(record(source.repeat, `${path}.repeat`).tile, `${path}.repeat.tile`),
        },
        safeMargin: {
          top: number(safeMargin.top, `${path}.safeMargin.top`),
          right: number(safeMargin.right, `${path}.safeMargin.right`),
          bottom: number(safeMargin.bottom, `${path}.safeMargin.bottom`),
          left: number(safeMargin.left, `${path}.safeMargin.left`),
        },
        gameplay: {
          decorativeOnly: boolean(gameplay.decorativeOnly, `${path}.gameplay.decorativeOnly`),
          campaign: gameplay.campaign === undefined ? true : boolean(gameplay.campaign, `${path}.gameplay.campaign`),
        },
        tankStartCell,
        enemySpawnCells,
      };
    });
    this.validateEnemyReachability();
  }

  public getAll(): readonly MapDefinition[] {
    return this.maps;
  }

  public getById(mapId: string): MapDefinition | null {
    return this.maps.find((map) => map.mapId === mapId) ?? null;
  }

  public getByLocation(planetId: string, regionId: string): MapDefinition | null {
    return this.getById(`${planetId}/${regionId}`);
  }

  public createTerrainGrid(mapId: string): TerrainGrid {
    const map = this.getById(mapId);
    if (!map) throw new Error(`[MapData] unknown map '${mapId}'`);
    return new TerrainGrid(map);
  }

  public getAccessiblePickupCells(mapId: string, count: number): TerrainCell[] {
    const map = this.getById(mapId);
    if (!map) throw new Error(`[MapData] unknown map '${mapId}'`);
    const grid = new TerrainGrid(map);
    const result: TerrainCell[] = [];
    const queue = [map.tankStartCell];
    const visited = new Set<string>();
    while (queue.length > 0 && result.length < Math.max(0, count)) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!grid.isBlocked(current, 'tank')) result.push(current);
      for (const neighbor of grid.getNeighbors(current)) {
        if (!visited.has(`${neighbor.x},${neighbor.y}`) && !grid.isBlocked(neighbor, 'tank')) queue.push(neighbor);
      }
    }
    return result;
  }

  private validateEnemyReachability(): void {
    for (const map of this.maps) {
      const grid = new TerrainGrid(map);
      const pathfinder = new TerrainPathfinder(grid);
      for (const [spawnIndex, spawn] of map.enemySpawnCells.entries()) {
        for (const radius of ENEMY_RADII) {
          if (pathfinder.findPath(spawn, map.tankStartCell, { radius }) === null) {
            fail(
              `${map.mapId}.enemySpawnCells[${spawnIndex}]`,
              `has no enemy path to tankStartCell for radius ${radius}`,
            );
          }
        }
      }
    }
  }
}

export const mapDefinitionLoader = new MapDefinitionLoader();
