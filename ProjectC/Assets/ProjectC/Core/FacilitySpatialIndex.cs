using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    /// <summary>Conservative half-cell broadphase for enemy collision checks against facilities.</summary>
    internal sealed class FacilitySpatialIndex
    {
        private const double EnemyRadius = 0.25d;
        private readonly Dictionary<int, List<FacilityState>> cells = new Dictionary<int, List<FacilityState>>();
        private readonly List<FacilityState> indexedFacilities = new List<FacilityState>();
        private GameWorld indexedWorld;
        private int bucketWidth;
        private int maximumCellX;
        private int maximumCellY;
        private int indexedProductionHeight;

        internal void Rebuild(GameWorld world)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (!NeedsRebuild(world)) return;

            bucketWidth = world.Definitions.MapWidth * 2;
            maximumCellX = bucketWidth - 1;
            maximumCellY = world.Definitions.MapHeight * 2 - 1;
            foreach (List<FacilityState> bucket in cells.Values) bucket.Clear();
            indexedFacilities.Clear();

            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                indexedFacilities.Add(facility);
                if (facility.Position.Y + facility.Height <= world.Definitions.ProductionHeight) continue;
                Add(facility);
            }

            indexedWorld = world;
            indexedProductionHeight = world.Definitions.ProductionHeight;
        }

        private bool NeedsRebuild(GameWorld world)
        {
            if (!ReferenceEquals(indexedWorld, world) || bucketWidth != world.Definitions.MapWidth * 2 ||
                maximumCellY != world.Definitions.MapHeight * 2 - 1 ||
                indexedProductionHeight != world.Definitions.ProductionHeight ||
                indexedFacilities.Count != world.Facilities.Count) return true;

            for (int i = 0; i < indexedFacilities.Count; i++)
                if (!ReferenceEquals(indexedFacilities[i], world.Facilities[i])) return true;

            return false;
        }

        internal bool IsBlocked(double x, double y)
        {
            int cellX = (int)Math.Floor(x * 2d);
            int cellY = (int)Math.Floor(y * 2d);
            if (!cells.TryGetValue(cellY * bucketWidth + cellX, out List<FacilityState> bucket)) return false;

            for (int i = 0; i < bucket.Count; i++)
            {
                FacilityState facility = bucket[i];
                if (facility.IsDestroyed) continue;
                if (Overlaps(x - EnemyRadius, y - EnemyRadius, EnemyRadius * 2d, EnemyRadius * 2d,
                    facility.Position.X, facility.Position.Y, facility.Width, facility.Height)) return true;
            }

            return false;
        }

        internal int CandidateCountAt(double x, double y)
        {
            int cellX = (int)Math.Floor(x * 2d);
            int cellY = (int)Math.Floor(y * 2d);
            return cells.TryGetValue(cellY * bucketWidth + cellX, out List<FacilityState> bucket)
                ? bucket.Count
                : 0;
        }

        private void Add(FacilityState facility)
        {
            int minimumCellX = Math.Max(0, (int)Math.Floor((facility.Position.X - EnemyRadius) * 2d));
            int maximumCellX = Math.Min(this.maximumCellX,
                (int)Math.Floor((facility.Position.X + facility.Width + EnemyRadius) * 2d));
            int minimumCellY = Math.Max(0, (int)Math.Floor((facility.Position.Y - EnemyRadius) * 2d));
            int maximumCellY = Math.Min(this.maximumCellY,
                (int)Math.Floor((facility.Position.Y + facility.Height + EnemyRadius) * 2d));
            if (minimumCellX > maximumCellX || minimumCellY > maximumCellY) return;

            for (int cellY = minimumCellY; cellY <= maximumCellY; cellY++)
            {
                for (int cellX = minimumCellX; cellX <= maximumCellX; cellX++)
                {
                    int key = cellY * bucketWidth + cellX;
                    if (!cells.TryGetValue(key, out List<FacilityState> bucket))
                    {
                        bucket = new List<FacilityState>();
                        cells.Add(key, bucket);
                    }
                    bucket.Add(facility);
                }
            }
        }

        private static bool Overlaps(double ax, double ay, double aw, double ah,
            double bx, double by, double bw, double bh) =>
            ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }
}
