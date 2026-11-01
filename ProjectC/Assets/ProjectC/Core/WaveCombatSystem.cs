using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public sealed class EnemyState
    {
        internal EnemyState(string id, int spawnSequence, int waveNumber, int entryIndex,
            double x, double y, double targetX, double targetY, int health)
        {
            Id = id;
            SpawnSequence = spawnSequence;
            WaveNumber = waveNumber;
            EntryIndex = entryIndex;
            X = x;
            Y = y;
            TargetX = targetX;
            TargetY = targetY;
            Health = health;
        }

        public string Id { get; }
        public int SpawnSequence { get; }
        public int WaveNumber { get; }
        public int EntryIndex { get; }
        public double X { get; internal set; }
        public double Y { get; internal set; }
        public double TargetX { get; }
        public double TargetY { get; }
        public int Health { get; internal set; }
        public bool IsAlive => Health > 0;
        public bool ReachedOutpost { get; internal set; }
        public string TargetFacilityId { get; internal set; }
        internal int AttackRemainderMilliseconds { get; set; }
    }

    /// <summary>Schedules the three confirmed entry queues and resolves simple continuous movement and turret fire.</summary>
    public sealed class WaveCombatSystem
    {
        private const double EnemyRadius = 0.25d;
        private readonly Queue<SpawnBatch>[] entryQueues =
        {
            new Queue<SpawnBatch>(), new Queue<SpawnBatch>(), new Queue<SpawnBatch>()
        };
        private readonly long[] nextEntrySpawnMilliseconds = new long[3];
        private readonly bool[] entryClockInitialized = new bool[3];
        private int nextWaveNumber = 1;
        private int nextEnemySequence = 1;
        private readonly Dictionary<string, int> turretShotRemainderMilliseconds =
            new Dictionary<string, int>(StringComparer.Ordinal);

        internal void RemoveFacility(string facilityId) => turretShotRemainderMilliseconds.Remove(facilityId);

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (world == null || elapsedMilliseconds <= 0 || world.Outcome != MatchOutcome.Running) return;

            while (nextWaveNumber <= world.Definitions.WaveCount &&
                   world.Definitions.GetWaveStartMilliseconds(nextWaveNumber) <= currentMilliseconds)
            {
                EnqueueWave(world, nextWaveNumber++);
            }

            int existingEnemyCount = world.Enemies.Count;
            MoveEnemies(world, currentMilliseconds, elapsedMilliseconds, existingEnemyCount);
            if (world.Outcome != MatchOutcome.Running) return;
            SpawnReadyBatches(world, currentMilliseconds);
            FireTurret(world, currentMilliseconds, elapsedMilliseconds);
        }

        private void EnqueueWave(GameWorld world, int waveNumber)
        {
            int start = world.Definitions.GetWaveStartMilliseconds(waveNumber);
            int[] counts = world.Definitions.SplitWaveAcrossEntries(waveNumber);
            for (int entry = 0; entry < counts.Length; entry++)
            {
                if (!entryClockInitialized[entry])
                {
                    nextEntrySpawnMilliseconds[entry] = start;
                    entryClockInitialized[entry] = true;
                }
                entryQueues[entry].Enqueue(new SpawnBatch(waveNumber, entry, counts[entry]));
            }

            world.HighestWaveReached = waveNumber;
            world.Record(start, "wave", "started:" + waveNumber + ":enemies:" + world.Definitions.GetWaveEnemyCount(waveNumber));
        }

        private void SpawnReadyBatches(GameWorld world, long currentMilliseconds)
        {
            for (int entry = 0; entry < entryQueues.Length; entry++)
            {
                Queue<SpawnBatch> queue = entryQueues[entry];
                if (queue.Count == 0 || currentMilliseconds < nextEntrySpawnMilliseconds[entry]) continue;

                SpawnBatch batch = queue.Peek();
                if (batch.CurrentGroupSize == 0)
                    batch.CurrentGroupSize = Math.Min(batch.Remaining, world.Definitions.MaximumEnemiesPerEntrySpawn);
                while (batch.SpawnedInCurrentGroup < batch.CurrentGroupSize)
                {
                    int laneIndex = batch.SpawnedInCurrentGroup;
                    double lane = batch.CurrentGroupSize == 1 ? 0d :
                        (laneIndex - ((batch.CurrentGroupSize - 1) / 2d)) * 0.5d;
                    if (batch.CurrentGroupSize == 1)
                    {
                        if (!TryFindSingleSpawnPosition(world, entry, lane, out lane, out double x, out double y)) break;
                        SpawnEnemy(world, batch, lane, currentMilliseconds);
                    }
                    else
                    {
                        GetEntryPosition(world, entry, lane, out double x, out double y);
                        if (!CanEnemyOccupy(world, x, y, null)) break;
                        SpawnEnemy(world, batch, lane, currentMilliseconds);
                    }
                    batch.Remaining--;
                    batch.SpawnedInCurrentGroup++;
                }

                if (batch.SpawnedInCurrentGroup == batch.CurrentGroupSize)
                {
                    batch.CurrentGroupSize = 0;
                    batch.SpawnedInCurrentGroup = 0;
                }
                nextEntrySpawnMilliseconds[entry] += world.Definitions.WaveSpawnIntervalMilliseconds;
                if (batch.Remaining == 0) queue.Dequeue();
            }
        }

        private static bool TryFindSingleSpawnPosition(GameWorld world, int entryIndex, double preferredLane,
            out double lane, out double x, out double y)
        {
            GetEntryPosition(world, entryIndex, preferredLane, out x, out y);
            if (CanEnemyOccupy(world, x, y, null))
            {
                lane = preferredLane;
                return true;
            }

            EnemyEntryPointDefinitionData entry = world.Definitions.EnemyEntryPoints[entryIndex];
            int laneSteps = (entry.Edge == "North" ? world.Definitions.MapWidth : world.Definitions.MapHeight) * 2;
            for (int step = 1; step <= laneSteps; step++)
            {
                double offset = step * 0.5d;
                if (TryGetSpawnPosition(world, entryIndex, preferredLane + offset, out x, out y))
                {
                    lane = preferredLane + offset;
                    return true;
                }
                if (TryGetSpawnPosition(world, entryIndex, preferredLane - offset, out x, out y))
                {
                    lane = preferredLane - offset;
                    return true;
                }
            }

            lane = preferredLane;
            return false;
        }

        private static bool TryGetSpawnPosition(GameWorld world, int entryIndex, double lane, out double x, out double y)
        {
            GetEntryPosition(world, entryIndex, lane, out x, out y);
            return CanEnemyOccupy(world, x, y, null);
        }

        private void SpawnEnemy(GameWorld world, SpawnBatch batch, double laneOffset, long currentMilliseconds)
        {
            FacilityState outpost = world.FindFacility(FacilityKind.Outpost);
            if (outpost == null) return;

            double outpostX = outpost.Position.X + 2d;
            double outpostY = outpost.Position.Y + 2d;
            GetEntryPosition(world, batch.EntryIndex, laneOffset, out double x, out double y);
            double targetX;
            double targetY;
            targetX = outpostX;
            targetY = outpostY;

            int sequence = nextEnemySequence++;
            string id = "enemy-" + sequence;
            world.Enemies.Add(new EnemyState(id, sequence, batch.WaveNumber, batch.EntryIndex,
                x, y, targetX, targetY, world.Definitions.EnemyHealth));
            world.Record(currentMilliseconds, "wave", "spawned:" + id + ":entry:" + batch.EntryIndex);
        }

        private static void MoveEnemies(GameWorld world, long currentMilliseconds, long elapsedMilliseconds, int enemyCount)
        {
            FacilityState outpost = world.FindFacility(FacilityKind.Outpost);
            if (outpost == null || outpost.IsDestroyed) return;
            double distancePerStep = world.Definitions.EnemySpeedCellsPerSecond * (elapsedMilliseconds / 1_000d);
            var occupancy = new EnemyOccupancy(world);

            for (int i = 0; i < enemyCount; i++)
            {
                EnemyState enemy = world.Enemies[i];
                if (!enemy.IsAlive) continue;

                FacilityState blockingFacility = FindBlockingFacility(world, enemy);
                FacilityState target = blockingFacility ?? outpost;
                if (enemy.TargetFacilityId != target.Id)
                {
                    enemy.TargetFacilityId = target.Id;
                    enemy.AttackRemainderMilliseconds = 0;
                    world.Record(currentMilliseconds, "combat", enemy.Id + ":target:" + target.Id);
                }

                GetAttackPosition(target, enemy, out double targetX, out double targetY);
                double dx = targetX - enemy.X;
                double dy = targetY - enemy.Y;
                double distance = Math.Sqrt((dx * dx) + (dy * dy));
                if (distance > distancePerStep && distance > 0.000001d)
                {
                    TryMoveEnemy(world, enemy, targetX, targetY, distancePerStep, occupancy);
                    continue;
                }

                if (!CanEnemyOccupy(world, targetX, targetY, enemy, occupancy)) continue;
                occupancy.Remove(enemy);
                enemy.X = targetX;
                enemy.Y = targetY;
                occupancy.Add(enemy);
                if (blockingFacility == null)
                {
                    enemy.ReachedOutpost = true;
                    world.Record(currentMilliseconds, "combat", enemy.Id + ":attacking-outpost");
                }

                enemy.AttackRemainderMilliseconds += (int)elapsedMilliseconds;
                int wholeSeconds = enemy.AttackRemainderMilliseconds / 1_000;
                if (wholeSeconds <= 0) continue;
                enemy.AttackRemainderMilliseconds %= 1_000;
                int damage = wholeSeconds * world.Definitions.EnemyDamagePerSecond;
                target.ApplyDamage(damage);
                world.Record(currentMilliseconds, "combat", enemy.Id + ":facility-damage:" + target.Id + ":" + damage);

                if (target.IsDestroyed)
                {
                    world.Record(currentMilliseconds, "combat", enemy.Id + ":facility-destroyed:" + target.Id);
                    enemy.TargetFacilityId = null;
                    enemy.AttackRemainderMilliseconds = 0;
                    if (target.Kind == FacilityKind.Outpost)
                    {
                        world.Outcome = MatchOutcome.Defeat;
                        world.Record(currentMilliseconds, "match", "outpost-destroyed");
                        return;
                    }
                }
            }
        }

        private static FacilityState FindBlockingFacility(GameWorld world, EnemyState enemy)
        {
            FacilityState outpost = world.FindFacility(FacilityKind.Outpost);
            if (outpost == null) return null;

            double targetX = outpost.Position.X + outpost.Width * 0.5d;
            double targetY = outpost.Position.Y + outpost.Height * 0.5d;
            double mountainHit = double.MaxValue;
            MapRegionDefinitionData[] mountains = world.Definitions.MountainRegions;
            for (int i = 0; i < mountains.Length; i++)
            {
                MapRegionDefinitionData mountain = mountains[i];
                if (!SegmentIntersectsRectangle(enemy.X, enemy.Y, targetX, targetY,
                    mountain.X - EnemyRadius, mountain.Y - EnemyRadius,
                    mountain.X + mountain.Width + EnemyRadius, mountain.Y + mountain.Height + EnemyRadius,
                    out double hit) || hit >= mountainHit) continue;
                mountainHit = hit;
            }

            FacilityState selected = null;
            double facilityHit = double.MaxValue;
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (facility == outpost || facility.MaximumHealth <= 0 || facility.IsDestroyed) continue;
                if (!SegmentIntersectsRectangle(enemy.X, enemy.Y, targetX, targetY,
                    facility.Position.X - EnemyRadius, facility.Position.Y - EnemyRadius,
                    facility.Position.X + facility.Width + EnemyRadius, facility.Position.Y + facility.Height + EnemyRadius,
                    out double hit) || hit >= facilityHit) continue;
                facilityHit = hit;
                selected = facility;
            }

            return mountainHit <= facilityHit ? null : selected;
        }

        private static void GetEntryPosition(GameWorld world, int entryIndex, double laneOffset, out double x, out double y)
        {
            EnemyEntryPointDefinitionData entry = world.Definitions.EnemyEntryPoints[entryIndex];
            x = entry.X + 0.5d;
            y = entry.Y + 0.5d;
            if (entry.Edge == "North") x += laneOffset;
            else y += laneOffset;
        }

        private static void GetAttackPosition(FacilityState target, EnemyState enemy, out double x, out double y)
        {
            double centerX = target.Position.X + target.Width * 0.5d;
            double centerY = target.Position.Y + target.Height * 0.5d;
            double dx = enemy.X - centerX;
            double dy = enemy.Y - centerY;
            int side;
            if (enemy.TargetFacilityId == target.Id && target.Kind == FacilityKind.Outpost)
                side = enemy.EntryIndex == 0 ? 3 : enemy.EntryIndex == 1 ? 0 : 1;
            else
                side = Math.Abs(dx) > Math.Abs(dy) ? (dx < 0d ? 3 : 1) : (dy < 0d ? 2 : 0);

            int slotCount = (side == 0 || side == 2 ? target.Width : target.Height) * 2;
            if (slotCount <= 0) slotCount = 1;
            int cycle = enemy.SpawnSequence / slotCount;
            side = (side + cycle) % 4;
            int slot = enemy.SpawnSequence % slotCount;
            double offset = (slot + 0.5d) * 0.5d;
            switch (side)
            {
                case 0: x = target.Position.X + offset; y = target.Position.Y + target.Height + EnemyRadius; break;
                case 1: x = target.Position.X + target.Width + EnemyRadius; y = target.Position.Y + offset; break;
                case 2: x = target.Position.X + target.Width - offset; y = target.Position.Y - EnemyRadius; break;
                default: x = target.Position.X - EnemyRadius; y = target.Position.Y + target.Height - offset; break;
            }
        }

        private static void TryMoveEnemy(GameWorld world, EnemyState enemy, double targetX, double targetY,
            double distancePerStep, EnemyOccupancy occupancy)
        {
            double dx = targetX - enemy.X;
            double dy = targetY - enemy.Y;
            double angle = Math.Atan2(dy, dx);
            double[] offsets = { 0d, -Math.PI / 4d, Math.PI / 4d, -Math.PI / 2d,
                Math.PI / 2d, -3d * Math.PI / 4d, 3d * Math.PI / 4d, Math.PI };
            double bestDistance = double.MaxValue;
            double bestX = enemy.X;
            double bestY = enemy.Y;
            for (int i = 0; i < offsets.Length; i++)
            {
                double candidateAngle = angle + offsets[i];
                double candidateX = enemy.X + Math.Cos(candidateAngle) * distancePerStep;
                double candidateY = enemy.Y + Math.Sin(candidateAngle) * distancePerStep;
                if (!CanEnemyOccupy(world, candidateX, candidateY, enemy, occupancy)) continue;
                double remainingX = targetX - candidateX;
                double remainingY = targetY - candidateY;
                double remaining = remainingX * remainingX + remainingY * remainingY;
                if (remaining >= bestDistance) continue;
                bestDistance = remaining;
                bestX = candidateX;
                bestY = candidateY;
            }

            occupancy.Remove(enemy);
            enemy.X = bestX;
            enemy.Y = bestY;
            occupancy.Add(enemy);
        }

        private static bool CanEnemyOccupy(GameWorld world, double x, double y, EnemyState movingEnemy,
            EnemyOccupancy occupancy = null)
        {
            GameDefinitions definitions = world.Definitions;
            if (x < EnemyRadius || y < definitions.ProductionHeight + EnemyRadius ||
                x > definitions.MapWidth - EnemyRadius || y > definitions.MapHeight - EnemyRadius ||
                OverlapsMountain(definitions, x, y)) return false;

            if (occupancy != null)
            {
                if (!occupancy.CanOccupy(x, y, movingEnemy)) return false;
            }
            else
            {
                for (int i = 0; i < world.Enemies.Count; i++)
                {
                    EnemyState other = world.Enemies[i];
                    if (other == movingEnemy || !other.IsAlive) continue;
                    if (Math.Abs(x - other.X) < EnemyRadius * 2d && Math.Abs(y - other.Y) < EnemyRadius * 2d)
                        return false;
                }
            }

            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (facility.IsDestroyed || facility.Position.Y + facility.Height <= definitions.ProductionHeight) continue;
                if (Overlaps(x - EnemyRadius, y - EnemyRadius, EnemyRadius * 2d, EnemyRadius * 2d,
                    facility.Position.X, facility.Position.Y, facility.Width, facility.Height)) return false;
            }

            return true;
        }

        private static bool OverlapsMountain(GameDefinitions definitions, double x, double y)
        {
            int minX = Math.Max(0, (int)Math.Floor(x - EnemyRadius));
            int maxX = Math.Min(definitions.MapWidth - 1, (int)Math.Floor(x + EnemyRadius));
            int minY = Math.Max(0, (int)Math.Floor(y - EnemyRadius));
            int maxY = Math.Min(definitions.MapHeight - 1, (int)Math.Floor(y + EnemyRadius));
            for (int cellX = minX; cellX <= maxX; cellX++)
                for (int cellY = minY; cellY <= maxY; cellY++)
                    if (definitions.IsMountainCell(cellX, cellY)) return true;
            return false;
        }

        private static bool Overlaps(double ax, double ay, double aw, double ah,
            double bx, double by, double bw, double bh) =>
            ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

        private static bool SegmentIntersectsRectangle(double startX, double startY, double endX, double endY,
            double minX, double minY, double maxX, double maxY, out double entryT)
        {
            double dx = endX - startX;
            double dy = endY - startY;
            double minimum = 0d;
            double maximum = 1d;
            if (!Clip(-dx, startX - minX, ref minimum, ref maximum) ||
                !Clip(dx, maxX - startX, ref minimum, ref maximum) ||
                !Clip(-dy, startY - minY, ref minimum, ref maximum) ||
                !Clip(dy, maxY - startY, ref minimum, ref maximum))
            {
                entryT = 0d;
                return false;
            }

            entryT = minimum;
            return true;
        }

        private static bool Clip(double direction, double distance, ref double minimum, ref double maximum)
        {
            if (Math.Abs(direction) < 0.000001d) return distance >= 0d;
            double amount = distance / direction;
            if (direction < 0d)
            {
                if (amount > maximum) return false;
                if (amount > minimum) minimum = amount;
            }
            else
            {
                if (amount < minimum) return false;
                if (amount < maximum) maximum = amount;
            }

            return true;
        }

        private void FireTurret(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            for (int turretIndex = 0; turretIndex < world.Facilities.Count; turretIndex++)
            {
                FacilityState turret = world.Facilities[turretIndex];
                if (turret.Kind != FacilityKind.Turret || turret.IsDestroyed || turret.IsDemolishing ||
                    turret.Inventory.GetAvailable(ItemId.Ammunition) <= 0) continue;

                if (!turretShotRemainderMilliseconds.TryGetValue(turret.Id, out int remainder)) remainder = 0;
                remainder += (int)elapsedMilliseconds;
                while (remainder >= world.Definitions.TurretRateOfFireMilliseconds)
                {
                    EnemyState target = SelectTarget(world, turret);
                    if (target == null)
                    {
                        remainder = 0;
                        break;
                    }

                    if (!turret.Inventory.TryRemove(ItemId.Ammunition, 1)) break;
                    remainder -= world.Definitions.TurretRateOfFireMilliseconds;
                    target.Health = Math.Max(0, target.Health - world.Definitions.TurretDamage);
                    world.Record(currentMilliseconds, "combat", "turret-fired:" + target.Id + ":ammo:1");
                    if (!target.IsAlive)
                    {
                        world.EnemiesDefeated++;
                        world.Record(currentMilliseconds, "combat", "enemy-defeated:" + target.Id);
                    }
                }

                turretShotRemainderMilliseconds[turret.Id] = remainder;
            }
        }

        private static EnemyState SelectTarget(GameWorld world, FacilityState turret)
        {
            double turretX = turret.Position.X + 0.5d;
            double turretY = turret.Position.Y + 0.5d;
            double rangeSquared = world.Definitions.TurretRange * world.Definitions.TurretRange;
            EnemyState selected = null;
            double selectedDistanceSquared = double.MaxValue;

            for (int i = 0; i < world.Enemies.Count; i++)
            {
                EnemyState enemy = world.Enemies[i];
                if (!enemy.IsAlive) continue;
                double dx = enemy.X - turretX;
                double dy = enemy.Y - turretY;
                double distanceSquared = (dx * dx) + (dy * dy);
                if (distanceSquared > rangeSquared) continue;
                if (!HasLineOfSight(world.Definitions, turretX, turretY, enemy.X, enemy.Y)) continue;
                if (distanceSquared > selectedDistanceSquared) continue;
                if (distanceSquared == selectedDistanceSquared && selected != null && enemy.SpawnSequence > selected.SpawnSequence) continue;
                selected = enemy;
                selectedDistanceSquared = distanceSquared;
            }

            return selected;
        }

        private static bool HasLineOfSight(GameDefinitions definitions, double startX, double startY,
            double endX, double endY)
        {
            double dx = endX - startX;
            double dy = endY - startY;
            double distance = Math.Sqrt(dx * dx + dy * dy);
            int samples = Math.Max(1, (int)Math.Ceiling(distance * 4d));
            for (int i = 1; i < samples; i++)
            {
                double t = i / (double)samples;
                int x = (int)Math.Floor(startX + dx * t);
                int y = (int)Math.Floor(startY + dy * t);
                if (definitions.IsMountainCell(x, y)) return false;
            }

            return true;
        }

        private sealed class EnemyOccupancy
        {
            private readonly int bucketWidth;
            private readonly Dictionary<int, List<EnemyState>> cells = new Dictionary<int, List<EnemyState>>();

            public EnemyOccupancy(GameWorld world)
            {
                bucketWidth = world.Definitions.MapWidth * 2;
                for (int i = 0; i < world.Enemies.Count; i++)
                    if (world.Enemies[i].IsAlive) Add(world.Enemies[i]);
            }

            public bool CanOccupy(double x, double y, EnemyState movingEnemy)
            {
                int cellX = (int)Math.Floor(x * 2d);
                int cellY = (int)Math.Floor(y * 2d);
                for (int yOffset = -1; yOffset <= 1; yOffset++)
                {
                    for (int xOffset = -1; xOffset <= 1; xOffset++)
                    {
                        if (!cells.TryGetValue((cellY + yOffset) * bucketWidth + cellX + xOffset,
                            out List<EnemyState> bucket)) continue;
                        for (int i = 0; i < bucket.Count; i++)
                        {
                            EnemyState other = bucket[i];
                            if (other == movingEnemy) continue;
                            if (Math.Abs(x - other.X) < EnemyRadius * 2d &&
                                Math.Abs(y - other.Y) < EnemyRadius * 2d) return false;
                        }
                    }
                }

                return true;
            }

            public void Add(EnemyState enemy)
            {
                int key = GetCellKey(enemy.X, enemy.Y);
                if (!cells.TryGetValue(key, out List<EnemyState> bucket))
                {
                    bucket = new List<EnemyState>();
                    cells.Add(key, bucket);
                }
                bucket.Add(enemy);
            }

            public void Remove(EnemyState enemy)
            {
                int key = GetCellKey(enemy.X, enemy.Y);
                if (!cells.TryGetValue(key, out List<EnemyState> bucket)) return;
                bucket.Remove(enemy);
                if (bucket.Count == 0) cells.Remove(key);
            }

            private int GetCellKey(double x, double y) =>
                (int)Math.Floor(y * 2d) * bucketWidth + (int)Math.Floor(x * 2d);
        }

        private sealed class SpawnBatch
        {
            public SpawnBatch(int waveNumber, int entryIndex, int remaining)
            {
                WaveNumber = waveNumber;
                EntryIndex = entryIndex;
                Remaining = remaining;
            }

            public int WaveNumber { get; }
            public int EntryIndex { get; }
            public int Remaining { get; set; }
            public int CurrentGroupSize { get; set; }
            public int SpawnedInCurrentGroup { get; set; }
        }
    }
}
