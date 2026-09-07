import mapData from '../data/maps.json';
import assetData from '../data/assets.json';
import enemyData from '../data/enemies.json';
import {
  TerrainBlocks,
  TerrainCell,
  TerrainGrid,
  TerrainMapData,
  TerrainPoint,
  TerrainRegion,
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
  artwork: MapArtworkDefinition | null;
  repeat: { background: boolean; tile: boolean };
  safeMargin: { top: number; right: number; bottom: number; left: number };
  gameplay: { decorativeOnly: boolean; campaign: boolean };
  tankStartCell: TerrainCell;
  enemySpawnCells: TerrainCell[];
}

export interface MapArtworkDefinition {
  worldSize: { width: number; height: number };
  origin: TerrainPoint;
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

function point(value: unknown, path: string, world: { width: number; height: number }): TerrainPoint {
  const source = record(value, path);
  const x = number(source.x, `${path}.x`);
  const y = number(source.y, `${path}.y`);
  if (x > world.width || y > world.height) fail(path, 'point must stay inside the world bounds');
  return { x, y };
}

function cross(a: TerrainPoint, b: TerrainPoint, c: TerrainPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function samePoint(a: TerrainPoint, b: TerrainPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function orientation(a: TerrainPoint, b: TerrainPoint, c: TerrainPoint): number {
  const value = cross(a, b, c);
  return Math.abs(value) <= 1e-9 ? 0 : Math.sign(value);
}

function onSegment(a: TerrainPoint, b: TerrainPoint, pointValue: TerrainPoint): boolean {
  return pointValue.x >= Math.min(a.x, b.x) - 1e-9
    && pointValue.x <= Math.max(a.x, b.x) + 1e-9
    && pointValue.y >= Math.min(a.y, b.y) - 1e-9
    && pointValue.y <= Math.max(a.y, b.y) + 1e-9;
}

function segmentsIntersect(a: TerrainPoint, b: TerrainPoint, c: TerrainPoint, d: TerrainPoint): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first !== second && third !== fourth) return true;
  return (first === 0 && onSegment(a, b, c))
    || (second === 0 && onSegment(a, b, d))
    || (third === 0 && onSegment(c, d, a))
    || (fourth === 0 && onSegment(c, d, b));
}

function validatePolygon(points: readonly TerrainPoint[], path: string): void {
  if (points.length < 3) fail(path, 'polygon must contain at least 3 points');
  for (let index = 0; index < points.length; index++) {
    for (let other = index + 1; other < points.length; other++) {
      if (samePoint(points[index], points[other])) fail(path, 'polygon cannot contain duplicate points');
    }
  }

  let winding = 0;
  for (let index = 0; index < points.length; index++) {
    const sign = orientation(points[index], points[(index + 1) % points.length], points[(index + 2) % points.length]);
    if (sign === 0) continue;
    if (winding === 0) winding = sign;
    else if (winding !== sign) fail(path, 'polygon must be convex');
  }
  if (winding === 0) fail(path, 'polygon must have a non-zero area');

  for (let first = 0; first < points.length; first++) {
    const firstEnd = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondEnd = (second + 1) % points.length;
      if (first === second || firstEnd === second || secondEnd === first) continue;
      if (segmentsIntersect(points[first], points[firstEnd], points[second], points[secondEnd])) {
        fail(path, 'polygon edges cannot intersect');
      }
    }
  }
}

function parseRegions(
  value: unknown,
  path: string,
  world: { width: number; height: number },
  terrainTypes: Readonly<Record<string, TerrainTypeDefinition>>,
): TerrainRegion[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'must contain at least one region');
  const ids = new Set<string>();
  return value.map((rawRegion, index) => {
    const regionPath = `${path}[${index}]`;
    const source = record(rawRegion, regionPath);
    const id = string(source.id, `${regionPath}.id`);
    if (ids.has(id)) fail(`${regionPath}.id`, `duplicate region ID '${id}'`);
    ids.add(id);
    const terrainTypeId = string(source.type, `${regionPath}.type`);
    if (!terrainTypes[terrainTypeId]) fail(`${regionPath}.type`, `unknown terrain type '${terrainTypeId}'`);
    if (!Array.isArray(source.polygon)) fail(`${regionPath}.polygon`, 'expected an array');
    const polygon = source.polygon.map((rawPoint, pointIndex) => point(
      rawPoint,
      `${regionPath}.polygon[${pointIndex}]`,
      world,
    ));
    validatePolygon(polygon, `${regionPath}.polygon`);
    return { id, terrainTypeId, polygon };
  });
}

function parseArtwork(
  value: unknown,
  path: string,
  world: { width: number; height: number },
): MapArtworkDefinition | null {
  if (value === undefined) return null;
  const source = record(value, path);
  const worldSize = record(source.worldSize, `${path}.worldSize`);
  const parsedWorldSize = {
    width: number(worldSize.width, `${path}.worldSize.width`, 1),
    height: number(worldSize.height, `${path}.worldSize.height`, 1),
  };
  if (parsedWorldSize.width !== world.width || parsedWorldSize.height !== world.height) {
    fail(`${path}.worldSize`, `must match the terrain world (${world.width}x${world.height})`);
  }
  const origin = point(source.origin, `${path}.origin`, world);
  if (origin.x !== 0 || origin.y !== 0) fail(`${path}.origin`, 'must be { x: 0, y: 0 }');
  return { worldSize: parsedWorldSize, origin };
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

function parseAssets(value: unknown, path: string): {
  backgroundAsset: string;
  groundAsset: string;
  tileAssets: string[];
  propAssets: string[];
  spawnEdgeAsset: string;
  terrainAssets: MapDefinition['terrainAssets'];
} {
  const source = record(value, path);
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

export class MapDefinitionLoader {
  private readonly maps: readonly MapDefinition[];
  private readonly assetIds: ReadonlySet<string>;

  public constructor(
    raw: MapDataRoot = DEFAULT_DATA,
    assets: AssetManifest = DEFAULT_ASSETS,
  ) {
    this.assetIds = new Set(Object.keys(assets.sprites ?? {}));
    if (!Number.isInteger(raw.version) || raw.version < 1) fail('version', 'must be a positive integer');
    const terrainTypes = parseTerrainTypes(raw.terrainTypes, 'terrainTypes');
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

      const world = record(source.world, `${path}.world`);
      const parsedWorld = {
        cellSize: integer(world.cellSize, `${path}.world.cellSize`, 1),
        columns: integer(world.columns, `${path}.world.columns`, 1),
        rows: integer(world.rows, `${path}.world.rows`, 1),
      };
      if (parsedWorld.cellSize !== 36) fail(`${path}.world.cellSize`, 'must be 36');

      const terrain = record(source.terrain, `${path}.terrain`);
      const hasRows = Object.prototype.hasOwnProperty.call(terrain, 'rows');
      const hasRegions = Object.prototype.hasOwnProperty.call(terrain, 'regions');
      if (hasRows && hasRegions) fail(`${path}.terrain`, 'must define either rows or regions, not both');
      if (!hasRows && !hasRegions) fail(`${path}.terrain`, 'must define rows or regions');

      const legend: Record<string, string> = {};
      let parsedRows: string[] | undefined;
      if (hasRows) {
        const legendSource = record(terrain.legend, `${path}.terrain.legend`);
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
        parsedRows = rows.map((rawRow, rowIndex) => {
          const row = string(rawRow, `${path}.terrain.rows[${rowIndex}]`);
          if (row.length !== parsedWorld.columns) {
            fail(`${path}.terrain.rows[${rowIndex}]`, `must contain exactly ${parsedWorld.columns} cells`);
          }
          for (const symbol of row) {
            if (!legend[symbol]) fail(`${path}.terrain.rows[${rowIndex}]`, `unknown terrain symbol '${symbol}'`);
          }
          return row;
        });
      }
      const regions = hasRegions
        ? parseRegions(
          terrain.regions,
          `${path}.terrain.regions`,
          { width: parsedWorld.columns * parsedWorld.cellSize, height: parsedWorld.rows * parsedWorld.cellSize },
          terrainTypes,
        )
        : undefined;

      const assetsForMap = parseAssets(source.assets, `${path}.assets`);
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

      const worldBounds = {
        width: parsedWorld.columns * parsedWorld.cellSize,
        height: parsedWorld.rows * parsedWorld.cellSize,
      };
      const terrainData: TerrainMapData = {
        world: parsedWorld,
        terrain: {
          legend,
          ...(parsedRows ? { rows: parsedRows } : {}),
          ...(regions ? { regions } : {}),
        },
        terrainTypes,
      };
      const grid = new TerrainGrid(terrainData);
      const tankStartCell = cell(
        source.tankStartCell,
        `${path}.tankStartCell`,
      );
      if (!grid.isInside(tankStartCell)) fail(`${path}.tankStartCell`, 'cell is outside the map');
      if (grid.isBlocked(tankStartCell, 'tank')) fail(`${path}.tankStartCell`, 'cell is blocked for tank');

      const rawSpawns = source.enemySpawnCells;
      if (!Array.isArray(rawSpawns) || rawSpawns.length === 0) fail(`${path}.enemySpawnCells`, 'must contain at least one cell');
      const enemySpawnCells = rawSpawns.map((rawSpawn, spawnIndex) => {
        const spawn = cell(rawSpawn, `${path}.enemySpawnCells[${spawnIndex}]`);
        if (!grid.isInside(spawn)) fail(`${path}.enemySpawnCells[${spawnIndex}]`, 'cell is outside the map');
        if (grid.isBlocked(spawn, 'enemy')) fail(`${path}.enemySpawnCells[${spawnIndex}]`, 'cell is blocked for enemy');
        return spawn;
      });

      const gameplay = record(source.gameplay, `${path}.gameplay`);
      const safeMargin = record(source.safeMargin, `${path}.safeMargin`);
      const artwork = parseArtwork(source.artwork, `${path}.artwork`, worldBounds);
      return {
        ...terrainData,
        mapId,
        planetId,
        regionId,
        ...assetsForMap,
        artwork,
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
