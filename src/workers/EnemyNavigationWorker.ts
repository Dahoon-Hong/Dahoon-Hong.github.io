import { TerrainGrid } from '../core/TerrainGrid';
import { TerrainPathfinder } from '../core/TerrainPathfinder';
import type {
  EnemyNavigationWorkerMessage,
  EnemyNavigationWorkerResponse,
} from '../core/EnemyNavigationWorkerProtocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<EnemyNavigationWorkerMessage>) => void) | null;
  postMessage(message: EnemyNavigationWorkerResponse): void;
  close(): void;
}

const workerScope = self as unknown as WorkerScope;
let terrainRevision = 0;
let pathfinder: TerrainPathfinder | null = null;

workerScope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') {
    pathfinder = new TerrainPathfinder(new TerrainGrid(message.terrain));
    terrainRevision = message.terrainRevision;
    workerScope.postMessage({ type: 'ready', terrainRevision });
    return;
  }

  if (message.type === 'dispose') {
    pathfinder = null;
    workerScope.close();
    return;
  }

  if (!pathfinder) throw new Error('[EnemyNavigationWorker] search received before init');
  const results = message.jobs.map((job) => ({
    requestId: job.requestId,
    key: job.key,
    targetRevision: job.targetRevision,
    terrainRevision: job.terrainRevision,
    path: job.terrainRevision === terrainRevision
      ? pathfinder!.findPath(job.start, job.goal, { radius: job.radius })
      : null,
  }));
  workerScope.postMessage({ type: 'result', results });
};
