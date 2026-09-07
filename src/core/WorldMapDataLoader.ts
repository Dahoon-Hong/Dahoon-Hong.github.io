import worldMapData from '../data/world-map.json';
import { MapDefinitionLoader, mapDefinitionLoader } from './MapDefinitionLoader';
import { ProgressionManager } from './ProgressionManager';

export interface WorldMapNode {
  id: string;
  mapId: string;
  label: string;
  position: { x: number; y: number };
  nextMapId: string | null;
  test: boolean;
}

export interface WorldMapDataRoot {
  version: number;
  nodes: unknown[];
}

const DEFAULT_DATA = worldMapData as unknown as WorldMapDataRoot;

function fail(path: string, message: string): never {
  throw new Error(`[WorldMap] ${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'expected an object');
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function unit(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(path, 'expected a number between 0 and 1');
  }
  return value;
}

export class WorldMapDataLoader {
  private readonly nodes: readonly WorldMapNode[];

  public constructor(
    raw: WorldMapDataRoot = DEFAULT_DATA,
    maps: MapDefinitionLoader = mapDefinitionLoader,
    progression: ProgressionManager = new ProgressionManager(),
  ) {
    if (!Number.isInteger(raw.version) || raw.version < 1) fail('version', 'must be a positive integer');
    if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) fail('nodes', 'must contain at least one node');

    const nodeIds = new Set<string>();
    const mapIds = new Set<string>();
    this.nodes = raw.nodes.map((rawNode, index) => {
      const path = `nodes[${index}]`;
      const source = record(rawNode, path);
      const position = record(source.position, `${path}.position`);
      const node: WorldMapNode = {
        id: string(source.id, `${path}.id`),
        mapId: string(source.mapId, `${path}.mapId`),
        label: string(source.label, `${path}.label`),
        position: {
          x: unit(position.x, `${path}.position.x`),
          y: unit(position.y, `${path}.position.y`),
        },
        nextMapId: source.nextMapId === null ? null : string(source.nextMapId, `${path}.nextMapId`),
        test: boolean(source.test, `${path}.test`),
      };
      if (nodeIds.has(node.id)) fail(`${path}.id`, `duplicate node ID '${node.id}'`);
      if (mapIds.has(node.mapId)) fail(`${path}.mapId`, `duplicate map ID '${node.mapId}'`);
      nodeIds.add(node.id);
      mapIds.add(node.mapId);

      const map = maps.getById(node.mapId);
      if (!map) fail(`${path}.mapId`, `unknown map '${node.mapId}'`);
      const region = progression.getRegionByMapId(node.mapId);
      if (!region) fail(`${path}.mapId`, `map '${node.mapId}' is missing from progression`);
      if (node.test !== (region.campaign === false)) {
        fail(`${path}.test`, `does not match progression campaign flag for '${node.mapId}'`);
      }
      return node;
    });

    const byMapId = new Map(this.nodes.map((node) => [node.mapId, node]));
    for (const node of this.nodes) {
      if (node.nextMapId !== null && !byMapId.has(node.nextMapId)) {
        fail(`${node.mapId}.nextMapId`, `unknown next map '${node.nextMapId}'`);
      }
    }

    const campaignNodes = this.nodes.filter((node) => !node.test);
    if (campaignNodes.length === 0) fail('nodes', 'must contain at least one campaign node');
    for (let index = 0; index < campaignNodes.length; index++) {
      const expectedNext = campaignNodes[index + 1]?.mapId ?? null;
      if (campaignNodes[index].nextMapId !== expectedNext) {
        fail(`${campaignNodes[index].mapId}.nextMapId`, `campaign chain must point to '${expectedNext ?? 'null'}'`);
      }
    }

    const visited = new Set<string>();
    let current: WorldMapNode | undefined = campaignNodes[0];
    while (current) {
      if (visited.has(current.mapId)) fail('nodes', `campaign chain contains a cycle at '${current.mapId}'`);
      visited.add(current.mapId);
      current = current.nextMapId ? byMapId.get(current.nextMapId) : undefined;
    }
    if (visited.size !== campaignNodes.length) fail('nodes', 'campaign chain is disconnected');
  }

  public getNodes(): readonly WorldMapNode[] {
    return this.nodes.map((node) => ({ ...node, position: { ...node.position } }));
  }

  public getCampaignMapIds(): string[] {
    return this.nodes.filter((node) => !node.test).map((node) => node.mapId);
  }
}
