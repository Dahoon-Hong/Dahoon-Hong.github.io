export type TerrainCollisionTarget = 'tank' | 'enemy' | 'projectile';

export interface TerrainCell {
  x: number;
  y: number;
}

export interface TerrainPoint {
  x: number;
  y: number;
}

export interface TerrainRegion {
  id: string;
  terrainTypeId: string;
  polygon: TerrainPoint[];
}

export interface TerrainBlocks {
  tank: boolean;
  enemy: boolean;
  projectile: boolean;
}

export interface TerrainTypeDefinition {
  id: string;
  blocks: TerrainBlocks;
  assetId?: string;
}

export interface TerrainMapData {
  world: {
    cellSize: number;
    columns: number;
    rows: number;
  };
  terrain: {
    legend: Record<string, string>;
    rows?: string[];
    regions?: TerrainRegion[];
  };
  terrainTypes: Readonly<Record<string, TerrainTypeDefinition>>;
}

export interface TerrainAabb {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TerrainWorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TerrainRaycastHit {
  cell: TerrainCell;
  point: { x: number; y: number };
  progress: number;
}

const TARGETS: readonly TerrainCollisionTarget[] = ['tank', 'enemy', 'projectile'];

export class TerrainGrid {
  public readonly cellSize: number;
  public readonly columns: number;
  public readonly rows: number;
  public readonly width: number;
  public readonly height: number;
  private readonly legend: Readonly<Record<string, string>>;
  private readonly terrainRows: readonly string[] | null;
  private readonly regions: readonly TerrainRegion[];
  private readonly terrainTypes: Readonly<Record<string, TerrainTypeDefinition>>;

  public constructor(map: TerrainMapData) {
    this.cellSize = map.world.cellSize;
    this.columns = map.world.columns;
    this.rows = map.world.rows;
    this.width = this.columns * this.cellSize;
    this.height = this.rows * this.cellSize;
    this.legend = { ...map.terrain.legend };
    this.terrainRows = map.terrain.rows ? [...map.terrain.rows] : null;
    this.regions = (map.terrain.regions ?? []).map((region) => ({
      id: region.id,
      terrainTypeId: region.terrainTypeId,
      polygon: region.polygon.map((point) => ({ ...point })),
    }));
    this.terrainTypes = Object.fromEntries(
      Object.entries(map.terrainTypes).map(([id, type]) => [id, { ...type, blocks: { ...type.blocks } }]),
    );
  }

  public getWorldBounds(): TerrainWorldBounds {
    return {
      left: 0,
      top: 0,
      right: this.width,
      bottom: this.height,
      width: this.width,
      height: this.height,
    };
  }

  public isInside(cell: TerrainCell): boolean {
    return cell.x >= 0 && cell.x < this.columns && cell.y >= 0 && cell.y < this.rows;
  }

  public worldToCell(point: { x: number; y: number }): TerrainCell | null {
    const cell = this.pointToUnboundedCell(point);
    return this.isInside(cell) ? cell : null;
  }

  public cellToWorldCenter(cell: TerrainCell): { x: number; y: number } {
    return {
      x: (cell.x + 0.5) * this.cellSize,
      y: (cell.y + 0.5) * this.cellSize,
    };
  }

  public getCellBounds(cell: TerrainCell): TerrainAabb {
    return {
      left: cell.x * this.cellSize,
      top: cell.y * this.cellSize,
      right: (cell.x + 1) * this.cellSize,
      bottom: (cell.y + 1) * this.cellSize,
    };
  }

  public getTerrainTypeId(cell: TerrainCell): string | null {
    if (!this.isInside(cell)) return null;
    if (this.terrainRows) return this.legend[this.terrainRows[cell.y][cell.x]] ?? null;

    const center = this.cellToWorldCenter(cell);
    return this.regions.find((region) => isPointInPolygon(center, region.polygon))?.terrainTypeId ?? 'open';
  }

  public getTerrainType(cell: TerrainCell): TerrainTypeDefinition | null {
    const typeId = this.getTerrainTypeId(cell);
    return typeId ? this.terrainTypes[typeId] ?? null : null;
  }

  public getTerrainRegions(): TerrainRegion[] {
    return this.regions.map((region) => ({
      id: region.id,
      terrainTypeId: region.terrainTypeId,
      polygon: region.polygon.map((point) => ({ ...point })),
    }));
  }

  public isBlocked(cell: TerrainCell, target: TerrainCollisionTarget): boolean {
    if (!this.isInside(cell)) return true;
    return this.getTerrainType(cell)?.blocks[target] ?? true;
  }

  public getCellsForAabb(aabb: TerrainAabb): TerrainCell[] {
    const left = Math.max(0, Math.floor(aabb.left / this.cellSize));
    const top = Math.max(0, Math.floor(aabb.top / this.cellSize));
    const right = Math.min(this.columns - 1, Math.floor((aabb.right - 1e-9) / this.cellSize));
    const bottom = Math.min(this.rows - 1, Math.floor((aabb.bottom - 1e-9) / this.cellSize));
    if (right < left || bottom < top) return [];

    const cells: TerrainCell[] = [];
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) cells.push({ x, y });
    }
    return cells;
  }

  public getCellsForCircle(center: { x: number; y: number }, radius: number): TerrainCell[] {
    const cells = this.getCellsForAabb({
      left: center.x - radius,
      top: center.y - radius,
      right: center.x + radius,
      bottom: center.y + radius,
    });
    const radiusSquared = radius * radius;
    return cells.filter((cell) => {
      const bounds = this.getCellBounds(cell);
      const closestX = Math.max(bounds.left, Math.min(bounds.right, center.x));
      const closestY = Math.max(bounds.top, Math.min(bounds.bottom, center.y));
      const dx = center.x - closestX;
      const dy = center.y - closestY;
      return dx * dx + dy * dy <= radiusSquared + 1e-9;
    });
  }

  public isBlockedAabb(aabb: TerrainAabb, target: TerrainCollisionTarget): boolean {
    if (aabb.left < 0 || aabb.top < 0 || aabb.right > this.width || aabb.bottom > this.height) return true;
    return this.getCellsForAabb(aabb).some((cell) => this.isBlocked(cell, target));
  }

  public isBlockedCircle(center: { x: number; y: number }, radius: number, target: TerrainCollisionTarget): boolean {
    if (center.x - radius < 0 || center.y - radius < 0 || center.x + radius > this.width || center.y + radius > this.height) {
      return true;
    }
    return this.getCellsForCircle(center, radius).some((cell) => this.isBlocked(cell, target));
  }

  public getNeighbors(cell: TerrainCell): TerrainCell[] {
    const neighbors: TerrainCell[] = [];
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        if (x === 0 && y === 0) continue;
        const neighbor = { x: cell.x + x, y: cell.y + y };
        if (this.isInside(neighbor)) neighbors.push(neighbor);
      }
    }
    return neighbors;
  }

  public getCellsAlongSegment(start: { x: number; y: number }, end: { x: number; y: number }): TerrainCell[] {
    const cells: TerrainCell[] = [];
    const add = (cell: TerrainCell): void => {
      const previous = cells[cells.length - 1];
      if (!previous || previous.x !== cell.x || previous.y !== cell.y) cells.push(cell);
    };

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let cellX = Math.floor(start.x / this.cellSize);
    let cellY = Math.floor(start.y / this.cellSize);
    add({ x: cellX, y: cellY });
    if (dx === 0 && dy === 0) return cells;

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : this.cellSize / Math.abs(dx);
    const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : this.cellSize / Math.abs(dy);
    let maxX = stepX > 0
      ? (((cellX + 1) * this.cellSize) - start.x) / dx
      : stepX < 0
        ? ((cellX * this.cellSize) - start.x) / dx
        : Number.POSITIVE_INFINITY;
    let maxY = stepY > 0
      ? (((cellY + 1) * this.cellSize) - start.y) / dy
      : stepY < 0
        ? ((cellY * this.cellSize) - start.y) / dy
        : Number.POSITIVE_INFINITY;

    while (Math.min(maxX, maxY) <= 1 + 1e-9) {
      if (Math.abs(maxX - maxY) <= 1e-9) {
        cellX += stepX;
        add({ x: cellX, y: cellY });
        cellY += stepY;
        add({ x: cellX, y: cellY });
        maxX += deltaX;
        maxY += deltaY;
      } else if (maxX < maxY) {
        cellX += stepX;
        add({ x: cellX, y: cellY });
        maxX += deltaX;
      } else {
        cellY += stepY;
        add({ x: cellX, y: cellY });
        maxY += deltaY;
      }
    }
    return cells;
  }

  public raycast(
    start: { x: number; y: number },
    end: { x: number; y: number },
    target: TerrainCollisionTarget = 'projectile',
  ): TerrainRaycastHit | null {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let cellX = Math.floor(start.x / this.cellSize);
    let cellY = Math.floor(start.y / this.cellSize);
    const blockedAt = (progress: number, cell: TerrainCell): TerrainRaycastHit | null => {
      if (!this.isBlocked(cell, target)) return null;
      const safeProgress = Math.max(0, Math.min(1, progress));
      return {
        cell: { ...cell },
        point: { x: start.x + dx * safeProgress, y: start.y + dy * safeProgress },
        progress: safeProgress,
      };
    };

    const initialHit = blockedAt(0, { x: cellX, y: cellY });
    if (initialHit) return initialHit;
    if (dx === 0 && dy === 0) return null;

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : this.cellSize / Math.abs(dx);
    const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : this.cellSize / Math.abs(dy);
    let maxX = stepX > 0
      ? (((cellX + 1) * this.cellSize) - start.x) / dx
      : stepX < 0
        ? ((cellX * this.cellSize) - start.x) / dx
        : Number.POSITIVE_INFINITY;
    let maxY = stepY > 0
      ? (((cellY + 1) * this.cellSize) - start.y) / dy
      : stepY < 0
        ? ((cellY * this.cellSize) - start.y) / dy
        : Number.POSITIVE_INFINITY;

    while (Math.min(maxX, maxY) <= 1 + 1e-9) {
      if (Math.abs(maxX - maxY) <= 1e-9) {
        cellX += stepX;
        const xHit = blockedAt(maxX, { x: cellX, y: cellY });
        if (xHit) return xHit;
        cellY += stepY;
        const yHit = blockedAt(maxY, { x: cellX, y: cellY });
        if (yHit) return yHit;
        maxX += deltaX;
        maxY += deltaY;
      } else if (maxX < maxY) {
        cellX += stepX;
        const hit = blockedAt(maxX, { x: cellX, y: cellY });
        if (hit) return hit;
        maxX += deltaX;
      } else {
        cellY += stepY;
        const hit = blockedAt(maxY, { x: cellX, y: cellY });
        if (hit) return hit;
        maxY += deltaY;
      }
    }
    return null;
  }

  public isOpenForFootprint(
    center: { x: number; y: number },
    footprint: { halfWidth: number; halfHeight: number },
    target: TerrainCollisionTarget,
  ): boolean {
    return !this.isBlockedAabb({
      left: center.x - footprint.halfWidth,
      top: center.y - footprint.halfHeight,
      right: center.x + footprint.halfWidth,
      bottom: center.y + footprint.halfHeight,
    }, target);
  }

  public isOpenForRadius(center: { x: number; y: number }, radius: number, target: TerrainCollisionTarget): boolean {
    return !this.isBlockedCircle(center, radius, target);
  }

  public static allTargets(): readonly TerrainCollisionTarget[] {
    return TARGETS;
  }

  private pointToUnboundedCell(point: { x: number; y: number }): TerrainCell {
    return {
      x: Math.floor(point.x / this.cellSize),
      y: Math.floor(point.y / this.cellSize),
    };
  }
}

function isPointInPolygon(point: TerrainPoint, polygon: readonly TerrainPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y);
    if (!crosses) continue;
    const intersectionX = (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
      / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (point.x < intersectionX) inside = !inside;
  }
  return inside;
}
