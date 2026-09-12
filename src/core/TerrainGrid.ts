export type TerrainCollisionTarget = 'tank' | 'enemy' | 'projectile';
export type TerrainFootprintShape = 'rect' | 'circle';

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
  private readonly regionCells = new Map<string, TerrainRegion[]>();
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
    for (const region of this.regions) {
      for (const cell of this.getCellsForAabb(getPolygonBounds(region.polygon))) {
        const key = this.cellKey(cell);
        const regions = this.regionCells.get(key) ?? [];
        regions.push(region);
        this.regionCells.set(key, regions);
      }
    }
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
    if (!this.terrainRows) {
      return this.getCandidateRegions(aabb).some((region) => this.isRegionBlocked(region, target)
        && polygonIntersectsAabb(region.polygon, aabb));
    }
    return this.getCellsForAabb(aabb).some((cell) => this.isBlocked(cell, target));
  }

  public isBlockedCircle(center: { x: number; y: number }, radius: number, target: TerrainCollisionTarget): boolean {
    if (center.x - radius < 0 || center.y - radius < 0 || center.x + radius > this.width || center.y + radius > this.height) {
      return true;
    }
    if (!this.terrainRows) {
      return this.getCandidateRegions({
        left: center.x - radius,
        top: center.y - radius,
        right: center.x + radius,
        bottom: center.y + radius,
      }).some((region) => this.isRegionBlocked(region, target)
        && polygonIntersectsCircle(region.polygon, center, radius));
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
    if (!this.terrainRows) return this.raycastRegions(start, end, target);

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

  public isOpenForRadiusSegment(
    start: { x: number; y: number },
    end: { x: number; y: number },
    radius: number,
    target: TerrainCollisionTarget,
  ): boolean {
    return this.getSafeRadiusProgress(start, end, radius, target) >= 1 - 1e-9;
  }

  public getSafeRadiusProgress(
    start: { x: number; y: number },
    end: { x: number; y: number },
    radius: number,
    target: TerrainCollisionTarget,
  ): number {
    if (this.isBlockedCircle(start, radius, target)) return 0;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance === 0) return 1;

    const samples = Math.max(1, Math.ceil(distance / Math.max(1, this.cellSize / 2)));
    let previousProgress = 0;
    for (let sample = 1; sample <= samples; sample++) {
      const progress = sample / samples;
      const point = interpolate(start, end, progress);
      if (!this.isBlockedCircle(point, radius, target)) {
        previousProgress = progress;
        continue;
      }

      let low = previousProgress;
      let high = progress;
      for (let iteration = 0; iteration < 10; iteration++) {
        const middle = (low + high) / 2;
        if (this.isBlockedCircle(interpolate(start, end, middle), radius, target)) high = middle;
        else low = middle;
      }
      return low;
    }
    return 1;
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

  public getOrientedRectCorners(
    center: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    angle: number,
  ): TerrainPoint[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((point) => ({
      x: center.x + point.x * cos - point.y * sin,
      y: center.y + point.x * sin + point.y * cos,
    }));
  }

  public isBlockedOrientedRect(
    center: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    angle: number,
    target: TerrainCollisionTarget,
  ): boolean {
    const polygon = this.getOrientedRectCorners(center, halfWidth, halfHeight, angle);
    const bounds = getPolygonBounds(polygon);
    if (bounds.left < 0 || bounds.top < 0 || bounds.right > this.width || bounds.bottom > this.height) return true;
    if (!this.terrainRows) {
      return this.getCandidateRegions(bounds).some((region) => this.isRegionBlocked(region, target)
        && polygonsIntersect(region.polygon, polygon));
    }
    return this.getCellsForAabb(bounds).some((cell) => this.isBlocked(cell, target)
      && polygonIntersectsAabb(polygon, this.getCellBounds(cell)));
  }

  public isOpenForOrientedRectSegment(
    start: { x: number; y: number },
    end: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    startAngle: number,
    endAngle: number,
    target: TerrainCollisionTarget,
  ): boolean {
    return this.getSafeOrientedRectProgress(
      start,
      end,
      halfWidth,
      halfHeight,
      startAngle,
      endAngle,
      target,
    ) >= 1 - 1e-9;
  }

  public getSafeOrientedRectProgress(
    start: { x: number; y: number },
    end: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    startAngle: number,
    endAngle: number,
    target: TerrainCollisionTarget,
  ): number {
    if (this.isBlockedOrientedRect(start, halfWidth, halfHeight, startAngle, target)) return 0;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const angleDelta = shortestAngleDelta(startAngle, endAngle);
    if (distance === 0 && Math.abs(angleDelta) <= 1e-9) return 1;

    const samples = Math.max(
      1,
      Math.ceil(distance / Math.max(1, this.cellSize / 2)),
      Math.ceil(Math.abs(angleDelta) / (Math.PI / 36)),
    );
    let previousProgress = 0;
    for (let sample = 1; sample <= samples; sample++) {
      const progress = sample / samples;
      const point = interpolate(start, end, progress);
      const angle = startAngle + angleDelta * progress;
      if (!this.isBlockedOrientedRect(point, halfWidth, halfHeight, angle, target)) {
        previousProgress = progress;
        continue;
      }

      let low = previousProgress;
      let high = progress;
      for (let iteration = 0; iteration < 12; iteration++) {
        const middle = (low + high) / 2;
        const middlePoint = interpolate(start, end, middle);
        const middleAngle = startAngle + angleDelta * middle;
        if (this.isBlockedOrientedRect(middlePoint, halfWidth, halfHeight, middleAngle, target)) high = middle;
        else low = middle;
      }
      return low;
    }
    return 1;
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

  private cellKey(cell: TerrainCell): string {
    return `${cell.x},${cell.y}`;
  }

  private getCandidateRegions(aabb: TerrainAabb): TerrainRegion[] {
    const candidates = new Set<TerrainRegion>();
    for (const cell of this.getCellsForAabb(aabb)) {
      for (const region of this.regionCells.get(this.cellKey(cell)) ?? []) candidates.add(region);
    }
    return candidates.size > 0 ? [...candidates] : [...this.regions];
  }

  private isRegionBlocked(region: TerrainRegion, target: TerrainCollisionTarget): boolean {
    return this.terrainTypes[region.terrainTypeId]?.blocks[target] ?? true;
  }

  private raycastRegions(
    start: { x: number; y: number },
    end: { x: number; y: number },
    target: TerrainCollisionTarget,
  ): TerrainRaycastHit | null {
    const bounds = {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      right: Math.max(start.x, end.x),
      bottom: Math.max(start.y, end.y),
    };
    let bestProgress = Number.POSITIVE_INFINITY;
    let bestPoint: { x: number; y: number } | null = null;
    for (const region of this.getCandidateRegions(bounds)) {
      if (!this.isRegionBlocked(region, target)) continue;
      if (isPointInPolygon(start, region.polygon)) {
        bestProgress = 0;
        bestPoint = { ...start };
        continue;
      }
      for (let index = 0; index < region.polygon.length; index++) {
        const edgeStart = region.polygon[index];
        const edgeEnd = region.polygon[(index + 1) % region.polygon.length];
        const progress = segmentIntersectionProgress(start, end, edgeStart, edgeEnd);
        if (progress === null || progress >= bestProgress) continue;
        bestProgress = progress;
        bestPoint = interpolate(start, end, progress);
      }
    }
    if (!bestPoint || !Number.isFinite(bestProgress)) return null;
    const cell = this.worldToCell(bestPoint) ?? this.pointToUnboundedCell(bestPoint);
    return { cell, point: bestPoint, progress: Math.max(0, Math.min(1, bestProgress)) };
  }
}

function interpolate(start: TerrainPoint, end: TerrainPoint, progress: number): TerrainPoint {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function pointOnSegment(point: TerrainPoint, start: TerrainPoint, end: TerrainPoint): boolean {
  const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  if (Math.abs(cross) > 1e-9) return false;
  return point.x >= Math.min(start.x, end.x) - 1e-9
    && point.x <= Math.max(start.x, end.x) + 1e-9
    && point.y >= Math.min(start.y, end.y) - 1e-9
    && point.y <= Math.max(start.y, end.y) + 1e-9;
}

function isPointInPolygon(point: TerrainPoint, polygon: readonly TerrainPoint[]): boolean {
  for (let index = 0; index < polygon.length; index++) {
    if (pointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length])) return true;
  }

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

function getPolygonBounds(polygon: readonly TerrainPoint[]): TerrainAabb {
  return {
    left: Math.min(...polygon.map((point) => point.x)),
    top: Math.min(...polygon.map((point) => point.y)),
    right: Math.max(...polygon.map((point) => point.x)),
    bottom: Math.max(...polygon.map((point) => point.y)),
  };
}

function polygonIntersectsAabb(polygon: readonly TerrainPoint[], aabb: TerrainAabb): boolean {
  if (polygon.some((point) => point.x >= aabb.left && point.x <= aabb.right && point.y >= aabb.top && point.y <= aabb.bottom)) {
    return true;
  }
  const corners: TerrainPoint[] = [
    { x: aabb.left, y: aabb.top },
    { x: aabb.right, y: aabb.top },
    { x: aabb.right, y: aabb.bottom },
    { x: aabb.left, y: aabb.bottom },
  ];
  if (corners.some((corner) => isPointInPolygon(corner, polygon))) return true;
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    for (let corner = 0; corner < corners.length; corner++) {
      if (segmentsIntersect(start, end, corners[corner], corners[(corner + 1) % corners.length])) return true;
    }
  }
  return false;
}

function polygonsIntersect(first: readonly TerrainPoint[], second: readonly TerrainPoint[]): boolean {
  if (first.some((point) => isPointInPolygon(point, second)) || second.some((point) => isPointInPolygon(point, first))) {
    return true;
  }
  for (let firstIndex = 0; firstIndex < first.length; firstIndex++) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex++) {
      if (segmentsIntersect(
        firstStart,
        firstEnd,
        second[secondIndex],
        second[(secondIndex + 1) % second.length],
      )) return true;
    }
  }
  return false;
}

function polygonIntersectsCircle(polygon: readonly TerrainPoint[], center: TerrainPoint, radius: number): boolean {
  if (isPointInPolygon(center, polygon)) return true;
  const radiusSquared = radius * radius;
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (distanceSquaredToSegment(center, start, end) <= radiusSquared + 1e-9) return true;
  }
  return false;
}

function distanceSquaredToSegment(point: TerrainPoint, start: TerrainPoint, end: TerrainPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y) ** 2;
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const closest = { x: start.x + dx * progress, y: start.y + dy * progress };
  return (point.x - closest.x) ** 2 + (point.y - closest.y) ** 2;
}

function segmentsIntersect(a: TerrainPoint, b: TerrainPoint, c: TerrainPoint, d: TerrainPoint): boolean {
  const orientation = (first: TerrainPoint, second: TerrainPoint, third: TerrainPoint): number => {
    const value = (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
    return Math.abs(value) <= 1e-9 ? 0 : Math.sign(value);
  };
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first !== second && third !== fourth) return true;
  const onSegment = (start: TerrainPoint, end: TerrainPoint, point: TerrainPoint): boolean =>
    pointOnSegment(point, start, end);
  return (first === 0 && onSegment(a, b, c))
    || (second === 0 && onSegment(a, b, d))
    || (third === 0 && onSegment(c, d, a))
    || (fourth === 0 && onSegment(c, d, b));
}

function segmentIntersectionProgress(
  start: TerrainPoint,
  end: TerrainPoint,
  edgeStart: TerrainPoint,
  edgeEnd: TerrainPoint,
): number | null {
  const rayX = end.x - start.x;
  const rayY = end.y - start.y;
  const edgeX = edgeEnd.x - edgeStart.x;
  const edgeY = edgeEnd.y - edgeStart.y;
  const denominator = rayX * edgeY - rayY * edgeX;
  const offsetX = edgeStart.x - start.x;
  const offsetY = edgeStart.y - start.y;
  if (Math.abs(denominator) <= 1e-9) return null;
  const progress = (offsetX * edgeY - offsetY * edgeX) / denominator;
  const edgeProgress = (offsetX * rayY - offsetY * rayX) / denominator;
  if (progress < -1e-9 || progress > 1 + 1e-9 || edgeProgress < -1e-9 || edgeProgress > 1 + 1e-9) return null;
  return Math.max(0, Math.min(1, progress));
}

function shortestAngleDelta(start: number, end: number): number {
  let delta = (end - start) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
