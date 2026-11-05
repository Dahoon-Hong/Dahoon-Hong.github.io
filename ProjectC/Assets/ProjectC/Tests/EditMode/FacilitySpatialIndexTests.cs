using NUnit.Framework;

namespace ProjectC.Core.Tests
{
    public sealed class FacilitySpatialIndexTests
    {
        private const double EnemyRadius = 0.25d;
        private const double EdgeEpsilon = 0.000001d;

        [Test]
        public void RebuiltIndexMatchesLinearCollisionAcrossCombatPlaneAndFacilityEdges()
        {
            GameWorld world = GameSimulation.CreateNewMatch().World;
            GameDefinitions definitions = world.Definitions;
            AddFacility(world, "test-map-left", 0, definitions.ProductionHeight, 3, 2);
            AddFacility(world, "test-map-right", definitions.MapWidth - 3, definitions.MapHeight - 3, 3, 3);
            AddFacility(world, "test-production-excluded", 10, definitions.ProductionHeight - 1, 2, 1);
            AddFacility(world, "test-production-overlap", 20, definitions.ProductionHeight - 1, 2, 2);
            FacilityState scattered = AddFacility(world, "test-scattered", definitions.MapWidth - 10,
                definitions.ProductionHeight + 12, 2, 3);

            var index = new FacilitySpatialIndex();
            index.Rebuild(world);

            for (double y = definitions.ProductionHeight + EnemyRadius;
                 y <= definitions.MapHeight - EnemyRadius;
                 y += EnemyRadius * 2d)
            {
                for (double x = EnemyRadius; x <= definitions.MapWidth - EnemyRadius; x += EnemyRadius * 2d)
                    AssertMatchesLinear(world, index, x, y);
            }

            AssertMatchesLinear(world, index, EnemyRadius,
                definitions.ProductionHeight + EnemyRadius + EdgeEpsilon);
            AssertMatchesLinear(world, index, definitions.MapWidth - EnemyRadius,
                definitions.ProductionHeight + EnemyRadius);
            AssertMatchesLinear(world, index, EnemyRadius, definitions.MapHeight - EnemyRadius);
            AssertMatchesLinear(world, index, definitions.MapWidth - EnemyRadius,
                definitions.MapHeight - EnemyRadius - EdgeEpsilon);

            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                double[] xSamples =
                {
                    facility.Position.X - EnemyRadius - EdgeEpsilon,
                    facility.Position.X - EnemyRadius,
                    facility.Position.X - EnemyRadius + EdgeEpsilon,
                    facility.Position.X + facility.Width * 0.5d,
                    facility.Position.X + facility.Width + EnemyRadius - EdgeEpsilon,
                    facility.Position.X + facility.Width + EnemyRadius,
                    facility.Position.X + facility.Width + EnemyRadius + EdgeEpsilon
                };
                double[] ySamples =
                {
                    facility.Position.Y - EnemyRadius - EdgeEpsilon,
                    facility.Position.Y - EnemyRadius,
                    facility.Position.Y - EnemyRadius + EdgeEpsilon,
                    facility.Position.Y + facility.Height * 0.5d,
                    facility.Position.Y + facility.Height + EnemyRadius - EdgeEpsilon,
                    facility.Position.Y + facility.Height + EnemyRadius,
                    facility.Position.Y + facility.Height + EnemyRadius + EdgeEpsilon
                };

                for (int yIndex = 0; yIndex < ySamples.Length; yIndex++)
                {
                    for (int xIndex = 0; xIndex < xSamples.Length; xIndex++)
                    {
                        double x = xSamples[xIndex];
                        double y = ySamples[yIndex];
                        if (x < EnemyRadius || x > definitions.MapWidth - EnemyRadius ||
                            y < definitions.ProductionHeight + EnemyRadius ||
                            y > definitions.MapHeight - EnemyRadius) continue;
                        AssertMatchesLinear(world, index, x, y);
                    }
                }
            }

            double scatteredX = scattered.Position.X + scattered.Width * 0.5d;
            double scatteredY = scattered.Position.Y + scattered.Height * 0.5d;
            Assert.That(index.CandidateCountAt(scatteredX, scatteredY), Is.LessThan(world.Facilities.Count));
        }

        [Test]
        public void IndexChecksDestroyedFacilityStateLiveAndRebuildTracksFacilityChanges()
        {
            GameWorld world = GameSimulation.CreateNewMatch().World;
            GameDefinitions definitions = world.Definitions;
            int x = 14;
            int y = definitions.ProductionHeight + 20;
            var index = new FacilitySpatialIndex();
            index.Rebuild(world);

            FacilityState added = AddFacility(world, "test-added", x, y, 2, 2);
            index.Rebuild(world);
            AssertMatchesLinear(world, index, x + 1d, y + 1d);
            Assert.That(index.IsBlocked(x + 1d, y + 1d), Is.True);

            world.Facilities.Remove(added);
            index.Rebuild(world);
            AssertMatchesLinear(world, index, x + 1d, y + 1d);
            Assert.That(index.IsBlocked(x + 1d, y + 1d), Is.False);

            FacilityState moved = AddFacility(world, "test-moved", x + 5, y + 3, 3, 1);
            index.Rebuild(world);
            AssertMatchesLinear(world, index, x + 1d, y + 1d);
            Assert.That(index.IsBlocked(x + 1d, y + 1d), Is.False);
            AssertMatchesLinear(world, index, moved.Position.X + 1d, moved.Position.Y + 0.5d);
            Assert.That(index.IsBlocked(moved.Position.X + 1d, moved.Position.Y + 0.5d), Is.True);

            FacilityState destroyed = AddFacility(world, "test-destroyed", x + 10, y + 3, 2, 2, 1);
            index.Rebuild(world);
            double destroyedX = destroyed.Position.X + 1d;
            double destroyedY = destroyed.Position.Y + 1d;
            Assert.That(index.IsBlocked(destroyedX, destroyedY), Is.True);
            destroyed.ApplyDamage(1);
            AssertMatchesLinear(world, index, destroyedX, destroyedY);
            Assert.That(index.IsBlocked(destroyedX, destroyedY), Is.False);
        }

        private static FacilityState AddFacility(GameWorld world, string id, int x, int y,
            int width, int height, int maximumHealth = 0)
        {
            var facility = new FacilityState(id, FacilityKind.Warehouse, new GridPosition(x, y),
                new InventoryStore(id + ".inventory"), maximumHealth, width, height);
            world.Facilities.Add(facility);
            return facility;
        }

        private static void AssertMatchesLinear(GameWorld world, FacilitySpatialIndex index, double x, double y)
        {
            bool indexed = index.IsBlocked(x, y);
            bool linear = LinearIsBlocked(world, x, y);
            if (indexed != linear)
                Assert.Fail("Collision result differed at candidate center (" + x + ", " + y + ").");
        }

        private static bool LinearIsBlocked(GameWorld world, double x, double y)
        {
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (facility.IsDestroyed || facility.Position.Y + facility.Height <= world.Definitions.ProductionHeight)
                    continue;
                if (x - EnemyRadius < facility.Position.X + facility.Width &&
                    x + EnemyRadius > facility.Position.X &&
                    y - EnemyRadius < facility.Position.Y + facility.Height &&
                    y + EnemyRadius > facility.Position.Y) return true;
            }

            return false;
        }
    }
}
