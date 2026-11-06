using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using NUnit.Framework;
using ProjectC.Core;

namespace ProjectC.Core.Tests
{
    public sealed class WaveCombatPerformanceTests
    {
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
    }
}
