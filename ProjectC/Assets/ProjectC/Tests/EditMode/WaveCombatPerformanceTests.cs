using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Reflection;
using NUnit.Framework;
using ProjectC.Core;

namespace ProjectC.Core.Tests
{
    public sealed class WaveCombatPerformanceTests
    {
        [Test]
        [Timeout(50_000)]
        public void DenseCombatTickScenarioProvidesTimingMeasurement()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch(GameDefinitions.CreateDefault());
            FacilityState outpost = simulation.World.FindFacility(FacilityKind.Outpost);
            const int enemyCount = 512;
            const int tickCount = 100;
            for (int i = 0; i < enemyCount; i++)
            {
                double x = 8.25d + (i % 112);
                double y = 104.25d + ((i / 112) % 4) * 0.25d;
                simulation.World.Enemies.Add(new EnemyState("benchmark-" + i, i + 1, 1, 0,
                    x, y, outpost.Position.X + 2d, outpost.Position.Y + 2d,
                    simulation.World.Definitions.EnemyHealth));
            }

            var stopwatch = Stopwatch.StartNew();
            for (int tick = 1; tick <= tickCount; tick++)
                simulation.Combat.Tick(simulation.World, tick * GameSimulation.SimulationStepMilliseconds,
                    GameSimulation.SimulationStepMilliseconds);
            stopwatch.Stop();

            Assert.That(simulation.World.Enemies, Has.Count.EqualTo(enemyCount));
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Running));
            TestContext.WriteLine("Dense combat: {0} enemies, {1} fixed ticks, {2:F2} ms.",
                enemyCount, tickCount, stopwatch.Elapsed.TotalMilliseconds);
        }

        [Test]
        [Timeout(50_000)]
        public void MountainCellLookupMatchesDefinitionsAndRefreshesAfterChanges()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            var lookup = new MountainCellLookup();
            lookup.RefreshIfChanged(definitions);
            AssertMountainLookupMatchesDefinitions(lookup, definitions);

            definitions.MountainRegions[0].X++;
            lookup.RefreshIfChanged(definitions);
            AssertMountainLookupMatchesDefinitions(lookup, definitions);

            definitions.MountainRegions = new[]
            {
                new MapRegionDefinitionData { X = 10, Y = 20, Width = 2, Height = 3 }
            };
            lookup.RefreshIfChanged(definitions);
            AssertMountainLookupMatchesDefinitions(lookup, definitions);

            definitions.MapWidth = 64;
            definitions.MapHeight = 64;
            lookup.RefreshIfChanged(definitions);
            AssertMountainLookupMatchesDefinitions(lookup, definitions);
        }

        [Test]
        [Timeout(60_000)]
        public void CombatTickReusesEnemyOccupancyAfterWarmup()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState outpost = simulation.World.FindFacility(FacilityKind.Outpost);
            for (int i = 0; i < 16; i++)
                simulation.World.Enemies.Add(new EnemyState("occupancy-" + i, i + 1, 1, 0,
                    20.25d + (i * 2), 20.25d, outpost.Position.X + 2d,
                    outpost.Position.Y + 2d, simulation.World.Definitions.EnemyHealth));

            FieldInfo occupancyField = typeof(WaveCombatSystem).GetField("enemyOccupancy",
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(occupancyField, Is.Not.Null,
                "Combat should own reusable occupancy storage instead of allocating it per tick.");
            object occupancy = occupancyField.GetValue(simulation.Combat);
            Assert.That(occupancy, Is.Not.Null);

            for (int i = 1; i <= 4; i++)
                simulation.Combat.Tick(simulation.World, i * GameSimulation.SimulationStepMilliseconds,
                    GameSimulation.SimulationStepMilliseconds);

            FieldInfo cellsField = occupancy.GetType().GetField("cells", BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.That(cellsField, Is.Not.Null);
            var buckets = (IDictionary)cellsField.GetValue(occupancy);
            var warmedBuckets = new Dictionary<object, object>();
            foreach (DictionaryEntry entry in buckets) warmedBuckets.Add(entry.Key, entry.Value);
            Assert.That(warmedBuckets, Is.Not.Empty, "Warmup must exercise occupied enemy cells.");

            for (int i = 5; i <= 104; i++)
                simulation.Combat.Tick(simulation.World, i * GameSimulation.SimulationStepMilliseconds,
                    GameSimulation.SimulationStepMilliseconds);

            Assert.That(occupancyField.GetValue(simulation.Combat), Is.SameAs(occupancy),
                "Combat ticks should reuse the same occupancy storage.");
            foreach (KeyValuePair<object, object> entry in warmedBuckets)
                Assert.That(buckets[entry.Key], Is.SameAs(entry.Value),
                    "Combat ticks should retain reusable buckets for previously occupied cells.");
        }

        private static void AssertMountainLookupMatchesDefinitions(MountainCellLookup lookup,
            GameDefinitions definitions)
        {
            for (int y = -1; y <= definitions.MapHeight; y++)
                for (int x = -1; x <= definitions.MapWidth; x++)
                    Assert.That(lookup.IsMountainCell(x, y), Is.EqualTo(definitions.IsMountainCell(x, y)),
                        "Mountain lookup differs at (" + x + "," + y + ").");
        }
    }
}
