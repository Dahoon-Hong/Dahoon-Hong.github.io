using System;
using NUnit.Framework;

namespace ProjectC.Core.Tests
{
    public sealed class EventBoundaryTests
    {
        [Test]
        public void EV04_LethalDamageBeforeRepairKeepsTurretDestroyed()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch(CreateDefinitionsWithRemoteMountain());
            FacilityState turret = simulation.World.FindFacility("turret");
            turret.ApplyDamage(975);
            Assert.That(turret.Inventory.TryAdd(ItemId.Iron, 20), Is.True);
            Assert.That(turret.Inventory.TryAdd(ItemId.Plate, 5), Is.True);

            DroneState combatDrone = simulation.World.Drones[simulation.World.Drones.Count - 1];
            combatDrone.PositionX = turret.Position.X + 0.5d;
            combatDrone.PositionY = turret.Position.Y + 0.5d;
            Assert.That(simulation.RequestRepair(turret.Id), Is.True);
            simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);

            RepairTask repair = simulation.Repairs.GetTask(turret.Id);
            Assert.That(repair, Is.Not.Null);
            Assert.That(repair.RestoredHitPoints, Is.GreaterThan(0));
            Assert.That(turret.Health, Is.GreaterThan(0));

            turret.ApplyDamage(turret.Health - 1);
            simulation.World.Enemies.Add(new EnemyState("ev04-lethal-hit", 1, 1, 0,
                turret.Position.X + 0.75d, turret.Position.Y + 1.25d,
                simulation.World.FindFacility(FacilityKind.Outpost).Position.X + 2d,
                simulation.World.FindFacility(FacilityKind.Outpost).Position.Y + 2d,
                simulation.World.Definitions.EnemyHealth)
            {
                TargetFacilityId = turret.Id,
                AttackRemainderMilliseconds = 950
            });

            simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);

            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Running));
            Assert.That(turret.IsDestroyed, Is.True);
            Assert.That(turret.Health, Is.Zero);
            Assert.That(simulation.Repairs.GetTask(turret.Id), Is.Null);
            Assert.That(HasEvent(simulation.World, simulation.CurrentMilliseconds,
                "repair", turret.Id + ":ended:facility-destroyed"), Is.True);
            Assert.That(HasEventPrefix(simulation.World, simulation.CurrentMilliseconds,
                "repair", turret.Id + ":restored:"), Is.False);
        }

        [Test]
        public void EV05_EqualDistanceTurretTargetsPreferEarlierSpawnSequence()
        {
            GameDefinitions definitions = CreateDefinitionsWithRemoteMountain();
            GameSimulation simulation = GameSimulation.CreateNewMatch(definitions);
            FacilityState turret = simulation.World.FindFacility("turret");
            FacilityState outpost = simulation.World.FindFacility(FacilityKind.Outpost);
            int ammunitionBefore = turret.Inventory.GetStock(ItemId.Ammunition);
            var laterLowHealth = new EnemyState("ev05-later", 7, 1, 1,
                65.75d, 105.25d, outpost.Position.X + 2d, outpost.Position.Y + 2d, 1)
            {
                TargetFacilityId = outpost.Id
            };
            var earlierHealthy = new EnemyState("ev05-earlier", 2, 1, 1,
                63.25d, 105.25d, outpost.Position.X + 2d, outpost.Position.Y + 2d, 1_000)
            {
                TargetFacilityId = outpost.Id
            };

            // Put the later enemy first to ensure the stable spawn-order tie-break is observed.
            simulation.World.Enemies.Add(laterLowHealth);
            simulation.World.Enemies.Add(earlierHealthy);
            int shotInterval = definitions.TurretRateOfFireMilliseconds;
            simulation.Combat.Tick(simulation.World, shotInterval, shotInterval);

            Assert.That(Math.Abs(DistanceToTurret(turret, laterLowHealth) -
                DistanceToTurret(turret, earlierHealthy)), Is.LessThan(0.000001d));
            Assert.That(earlierHealthy.Health, Is.EqualTo(1_000 - definitions.TurretDamage));
            Assert.That(laterLowHealth.Health, Is.EqualTo(1));
            Assert.That(simulation.World.EnemiesDefeated, Is.Zero);
            Assert.That(turret.Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(ammunitionBefore - 1));
            Assert.That(HasEventPrefix(simulation.World, shotInterval, "combat",
                "turret-fired:" + earlierHealthy.Id + ":"), Is.True);
        }

        [Test]
        public void EV06_CancelBeforeFinalConstructionStepRecoversMaterialsOnce()
        {
            GameDefinitions definitions = CreateDefinitionsWithRemoteMountain();
            GameSimulation simulation = GameSimulation.CreateNewMatch(definitions);
            var position = new GridPosition(20, 25);
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Conveyor, position, 0,
                out FacilityState conveyor, out string reason), Is.True, reason);
            Assert.That(conveyor.Inventory.TryAdd(ItemId.Iron, 1), Is.True);

            DroneState worker = simulation.World.Drones[0];
            worker.PositionX = position.X + 0.5d;
            worker.PositionY = position.Y + 0.5d;
            ConstructionSite site = simulation.World.ConstructionSites[0];
            simulation.Construction.Tick(simulation.World, simulation.CurrentMilliseconds,
                GameSimulation.SimulationStepMilliseconds);
            Assert.That(conveyor.IsConstructionStarted, Is.True);
            Assert.That(conveyor.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(site.Definition.ConstructionMilliseconds,
                Is.GreaterThan(GameSimulation.SimulationStepMilliseconds));

            site.ProgressMilliseconds = site.Definition.ConstructionMilliseconds -
                GameSimulation.SimulationStepMilliseconds;
            Assert.That(site.ProgressMilliseconds + GameSimulation.SimulationStepMilliseconds,
                Is.EqualTo(site.Definition.ConstructionMilliseconds));
            Assert.That(simulation.CancelConstruction(conveyor.Id), Is.True);
            Assert.That(simulation.World.RecoveryPiles.Count, Is.EqualTo(1));
            RecoveryPile pile = simulation.World.RecoveryPiles[0];
            Assert.That(pile.Inventory.GetStock(ItemId.Iron), Is.EqualTo(1));
            Assert.That(simulation.CancelConstruction(conveyor.Id), Is.False);
            Assert.That(pile.Inventory.GetStock(ItemId.Iron), Is.EqualTo(1));

            simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);

            Assert.That(simulation.World.FindFacility(conveyor.Id), Is.Null);
            Assert.That(simulation.World.ConstructionSites.Contains(site), Is.False);
            Assert.That(CountEventPrefix(simulation.World, "construction", conveyor.Id + ":cancelled:"), Is.EqualTo(1));
            Assert.That(HasEventPrefix(simulation.World, simulation.CurrentMilliseconds, "construction",
                conveyor.Id + ":completed"), Is.False);
        }

        private static double DistanceToTurret(FacilityState turret, EnemyState enemy)
        {
            double dx = enemy.X - (turret.Position.X + 0.5d);
            double dy = enemy.Y - (turret.Position.Y + 0.5d);
            return Math.Sqrt(dx * dx + dy * dy);
        }

        private static GameDefinitions CreateDefinitionsWithRemoteMountain()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.MountainRegions = new[]
            {
                new MapRegionDefinitionData { X = 0, Y = 97, Width = 1, Height = 1 }
            };
            return definitions;
        }

        private static bool HasEvent(GameWorld world, long time, string category, string detail)
        {
            for (int i = 0; i < world.Events.Count; i++)
            {
                SimulationEvent item = world.Events[i];
                if (item.TimeMilliseconds == time && item.Category == category && item.Detail == detail) return true;
            }
            return false;
        }

        private static bool HasEventPrefix(GameWorld world, long time, string category, string prefix)
        {
            for (int i = 0; i < world.Events.Count; i++)
            {
                SimulationEvent item = world.Events[i];
                if (item.TimeMilliseconds == time && item.Category == category &&
                    item.Detail.StartsWith(prefix, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        private static int CountEventPrefix(GameWorld world, string category, string prefix)
        {
            int count = 0;
            for (int i = 0; i < world.Events.Count; i++)
            {
                SimulationEvent item = world.Events[i];
                if (item.Category == category && item.Detail.StartsWith(prefix, StringComparison.Ordinal)) count++;
            }
            return count;
        }
    }
}
