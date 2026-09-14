import type { TerrainCell, TerrainMapData } from './TerrainGrid';

export interface EnemyNavigationWorkerPathJob {
  requestId: string;
  key: string;
  start: TerrainCell;
  goal: TerrainCell;
  radius: number;
  targetRevision: number;
  terrainRevision: number;
}

export interface EnemyNavigationWorkerInitMessage {
  type: 'init';
  terrain: TerrainMapData;
  terrainRevision: number;
}

export interface EnemyNavigationWorkerSearchMessage {
  type: 'search';
  jobs: EnemyNavigationWorkerPathJob[];
}

export interface EnemyNavigationWorkerDisposeMessage {
  type: 'dispose';
}

export type EnemyNavigationWorkerMessage =
  | EnemyNavigationWorkerInitMessage
  | EnemyNavigationWorkerSearchMessage
  | EnemyNavigationWorkerDisposeMessage;

export interface EnemyNavigationWorkerReadyMessage {
  type: 'ready';
  terrainRevision: number;
}

export interface EnemyNavigationWorkerPathResult {
  requestId: string;
  key: string;
  targetRevision: number;
  terrainRevision: number;
  path: TerrainCell[] | null;
}

export interface EnemyNavigationWorkerResultMessage {
  type: 'result';
  results: EnemyNavigationWorkerPathResult[];
}

export type EnemyNavigationWorkerResponse =
  | EnemyNavigationWorkerReadyMessage
  | EnemyNavigationWorkerResultMessage;
