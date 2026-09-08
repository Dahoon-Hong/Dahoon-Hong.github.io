import { TerrainCell, TerrainGrid } from './TerrainGrid';

export interface TerrainPathfinderOptions {
  radius: number;
}

const ORTHOGONAL_COST = 10;
const DIAGONAL_COST = 14;
const DIRECTIONS = [
  { x: -1, y: -1, cost: DIAGONAL_COST },
  { x: 0, y: -1, cost: ORTHOGONAL_COST },
  { x: 1, y: -1, cost: DIAGONAL_COST },
  { x: -1, y: 0, cost: ORTHOGONAL_COST },
  { x: 1, y: 0, cost: ORTHOGONAL_COST },
  { x: -1, y: 1, cost: DIAGONAL_COST },
  { x: 0, y: 1, cost: ORTHOGONAL_COST },
  { x: 1, y: 1, cost: DIAGONAL_COST },
] as const;

export class TerrainPathfinder {
  public constructor(private readonly grid: TerrainGrid) {}

  public findPath(
    start: TerrainCell,
    goal: TerrainCell,
    options: TerrainPathfinderOptions,
  ): TerrainCell[] | null {
    if (!this.isCellWalkable(start, options.radius) || !this.isCellWalkable(goal, options.radius)) return null;
    if (this.sameCell(start, goal)) return [];

    const startKey = this.key(start);
    const goalKey = this.key(goal);
    const open = [startKey];
    const cameFrom = new Map<string, string>();
    const costs = new Map<string, number>([[startKey, 0]]);

    while (open.length > 0) {
      // ponytail: linear open-set selection keeps this pure helper dependency-free; upgrade to a heap only if profiling needs it.
      let bestIndex = 0;
      let bestKey = open[0];
      let bestScore = this.score(bestKey, goal, costs);
      for (let index = 1; index < open.length; index++) {
        const score = this.score(open[index], goal, costs);
        if (score < bestScore) {
          bestIndex = index;
          bestKey = open[index];
          bestScore = score;
        }
      }
      open.splice(bestIndex, 1);
      const current = this.parseKey(bestKey);
      if (bestKey === goalKey) return this.reconstruct(cameFrom, bestKey, startKey);

      for (const direction of DIRECTIONS) {
        const neighbor = { x: current.x + direction.x, y: current.y + direction.y };
        if (!this.isStepWalkable(current, neighbor, options.radius)) continue;
        const neighborKey = this.key(neighbor);
        const nextCost = (costs.get(bestKey) ?? Number.POSITIVE_INFINITY) + direction.cost;
        if (nextCost >= (costs.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
        cameFrom.set(neighborKey, bestKey);
        costs.set(neighborKey, nextCost);
        if (!open.includes(neighborKey)) open.push(neighborKey);
      }
    }
    return null;
  }

  public isCellWalkable(cell: TerrainCell, radius: number): boolean {
    return this.grid.isOpenForRadius(this.grid.cellToWorldCenter(cell), radius, 'enemy');
  }

  public isPathValid(start: TerrainCell, path: readonly TerrainCell[], radius: number): boolean {
    let previous = start;
    for (const cell of path) {
      let cursor = { ...previous };
      while (!this.sameCell(cursor, cell)) {
        const step = {
          x: cursor.x + Math.sign(cell.x - cursor.x),
          y: cursor.y + Math.sign(cell.y - cursor.y),
        };
        if (!this.isStepWalkable(cursor, step, radius)) return false;
        cursor = step;
      }
      previous = cell;
    }
    return true;
  }

  private isStepWalkable(from: TerrainCell, to: TerrainCell, radius: number): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
    if (!this.isCellWalkable(to, radius)) return false;
    const fromPoint = this.grid.cellToWorldCenter(from);
    const toPoint = this.grid.cellToWorldCenter(to);
    if (!this.grid.isOpenForRadiusSegment(fromPoint, toPoint, radius, 'enemy')) return false;
    if (dx !== 0 && dy !== 0) {
      if (!this.isCellWalkable({ x: from.x + dx, y: from.y }, radius)) return false;
      if (!this.isCellWalkable({ x: from.x, y: from.y + dy }, radius)) return false;
    }
    return true;
  }

  private reconstruct(cameFrom: Map<string, string>, current: string, start: string): TerrainCell[] {
    const path: TerrainCell[] = [];
    let cursor = current;
    while (cursor !== start) {
      path.push(this.parseKey(cursor));
      const parent = cameFrom.get(cursor);
      if (!parent) return [];
      cursor = parent;
    }
    path.reverse();
    return this.compact(path, start);
  }

  private compact(path: TerrainCell[], startKey: string): TerrainCell[] {
    if (path.length < 2) return path;
    const full = [this.parseKey(startKey), ...path];
    const compacted: TerrainCell[] = [full[1]];
    for (let index = 2; index < full.length; index++) {
      const previous = full[index - 2];
      const current = full[index - 1];
      const next = full[index];
      const firstDirection = { x: Math.sign(current.x - previous.x), y: Math.sign(current.y - previous.y) };
      const secondDirection = { x: Math.sign(next.x - current.x), y: Math.sign(next.y - current.y) };
      if (firstDirection.x !== secondDirection.x || firstDirection.y !== secondDirection.y) compacted.push(current);
      if (index === full.length - 1) compacted.push(next);
    }
    return compacted;
  }

  private score(key: string, goal: TerrainCell, costs: Map<string, number>): number {
    const cell = this.parseKey(key);
    return (costs.get(key) ?? Number.POSITIVE_INFINITY) + this.heuristic(cell, goal);
  }

  private heuristic(a: TerrainCell, b: TerrainCell): number {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return DIAGONAL_COST * Math.min(dx, dy) + ORTHOGONAL_COST * Math.abs(dx - dy);
  }

  private sameCell(a: TerrainCell, b: TerrainCell): boolean {
    return a.x === b.x && a.y === b.y;
  }

  private key(cell: TerrainCell): string {
    return `${cell.x},${cell.y}`;
  }

  private parseKey(key: string): TerrainCell {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  }
}
