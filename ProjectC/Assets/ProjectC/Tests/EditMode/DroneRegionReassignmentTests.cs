using NUnit.Framework;

namespace ProjectC.Core.Tests
{
    public sealed class DroneRegionReassignmentTests
    {
        [Test]
        public void ConstructionCompletesBeforeDroneReturnsAndChangesRegion()
        {
            GameSimulation simulation = CreateSimulationWithIronAtPort();
            FacilityState facility = PlaceConveyor(simulation);
            ConstructionSite site = simulation.World.ConstructionSites.Find(candidate => candidate.Facility == facility);

            AdvanceUntil(simulation, () => site.ProgressMilliseconds > 0, 90_000, "construction to start");
            DroneState drone = simulation.World.Drones.Find(candidate => candidate.Id == site.AssignedDroneId);
            Assert.That(drone, Is.Not.Null);
            Assert.That(drone.ActiveConstructionSiteId, Is.EqualTo(facility.Id));

            Assert.That(simulation.RequestDroneRegionChange(drone.Id, DroneRegion.Combat), Is.True);

            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Production));
            Assert.That(drone.PendingRegion, Is.EqualTo(DroneRegion.Combat));
            Assert.That(drone.ActiveConstructionSiteId, Is.EqualTo(facility.Id));
            int progressAtRequest = site.ProgressMilliseconds;

            AdvanceUntil(simulation, () => !facility.IsUnderConstruction &&
                drone.Region == DroneRegion.Combat && !drone.PendingRegion.HasValue,
                30_000, "construction completion and Outpost return");

            Assert.That(site.ProgressMilliseconds, Is.GreaterThan(progressAtRequest));
            Assert.That(drone.ActiveConstructionSiteId, Is.Null);
            AssertRegionChangeFollows(simulation.World, facility.Id + ":completed",
                drone.Id + ":region-changed:Production->Combat");
        }

        [Test]
        public void DemolitionCompletesBeforeDroneReturnsAndChangesRegion()
        {
            GameSimulation simulation = CreateSimulationWithIronAtPort();
            FacilityState facility = PlaceConveyor(simulation);
            AdvanceUntil(simulation, () => !facility.IsUnderConstruction, 90_000, "conveyor construction");

            Assert.That(simulation.RequestDemolition(facility.Id), Is.True);
            DemolitionTask task = simulation.Demolitions.GetTask(facility.Id);
            Assert.That(task, Is.Not.Null);
            AdvanceUntil(simulation, () => task.ProgressMilliseconds > 0, 10_000, "demolition to start");

            DroneState drone = simulation.World.Drones.Find(candidate => candidate.Id == task.AssignedDroneId);
            Assert.That(drone, Is.Not.Null);
            Assert.That(drone.ActiveDemolitionFacilityId, Is.EqualTo(facility.Id));
            Assert.That(simulation.RequestDroneRegionChange(drone.Id, DroneRegion.Combat), Is.True);

            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Production));
            Assert.That(drone.PendingRegion, Is.EqualTo(DroneRegion.Combat));
            Assert.That(drone.ActiveDemolitionFacilityId, Is.EqualTo(facility.Id));
            int progressAtRequest = task.ProgressMilliseconds;

            AdvanceUntil(simulation, () => simulation.World.FindFacility(facility.Id) == null &&
                drone.Region == DroneRegion.Combat && !drone.PendingRegion.HasValue,
                45_000, "demolition completion and Outpost return");

            Assert.That(task.ProgressMilliseconds, Is.GreaterThan(progressAtRequest));
            Assert.That(drone.ActiveDemolitionFacilityId, Is.Null);
            AssertRegionChangeFollows(simulation.World, facility.Id + ":completed:",
                drone.Id + ":region-changed:Production->Combat");
        }

        [Test]
        public void RepairCompletesBeforeDroneReturnsAndChangesRegion()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState turret = simulation.World.FindFacility("turret");
            Assert.That(turret.Inventory.TryAdd(ItemId.Iron, 10), Is.True);
            Assert.That(turret.Inventory.TryAdd(ItemId.Plate, 3), Is.True);
            simulation.DamageFacility(turret.Id, 500);
            Assert.That(simulation.RequestRepair(turret.Id), Is.True);
            RepairTask task = simulation.Repairs.GetTask(turret.Id);

            AdvanceUntil(simulation, () => task.Status == RepairTaskStatus.Repairing &&
                task.RestoredHitPoints > 0, 40_000, "repair to start");
            DroneState drone = simulation.World.Drones.Find(candidate => candidate.Id == task.AssignedDroneId);
            Assert.That(drone, Is.Not.Null);
            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Combat));

            Assert.That(simulation.RequestDroneRegionChange(drone.Id, DroneRegion.Production), Is.True);

            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Combat));
            Assert.That(drone.PendingRegion, Is.EqualTo(DroneRegion.Production));
            Assert.That(task.AssignedDroneId, Is.EqualTo(drone.Id));
            int restoredAtRequest = task.RestoredHitPoints;

            AdvanceUntil(simulation, () => turret.Health == turret.MaximumHealth &&
                drone.Region == DroneRegion.Production && !drone.PendingRegion.HasValue,
                30_000, "repair completion and Outpost return");

            Assert.That(task.RestoredHitPoints, Is.GreaterThan(restoredAtRequest));
            Assert.That(simulation.Repairs.GetTask(turret.Id), Is.Null);
            AssertRegionChangeFollows(simulation.World, turret.Id + ":completed:restored:500",
                drone.Id + ":region-changed:Combat->Production");
        }

        private static GameSimulation CreateSimulationWithIronAtPort()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.SetRestockTarget("ironworks", ItemId.Iron, 0);
            simulation.SetRestockTarget("ammunition-factory", ItemId.Plate, 0);
            AdvanceUntil(simulation, () => simulation.World.FindFacility("port").Inventory.GetStock(ItemId.Iron) > 0,
                10_000, "opening iron to reach the Port");
            return simulation;
        }

        private static FacilityState PlaceConveyor(GameSimulation simulation)
        {
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Conveyor, new GridPosition(61, 54), 0,
                out FacilityState facility, out string reason), Is.True, reason);
            return facility;
        }

        private static void AdvanceUntil(GameSimulation simulation, System.Func<bool> condition,
            int timeoutMilliseconds, string description)
        {
            long deadline = simulation.CurrentMilliseconds + timeoutMilliseconds;
            while (!condition() && simulation.World.Outcome == MatchOutcome.Running &&
                   simulation.CurrentMilliseconds < deadline)
                simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);

            Assert.That(condition(), Is.True, "Timed out waiting for " + description + " at " +
                simulation.CurrentMilliseconds + " ms; outcome: " + simulation.World.Outcome + ".");
        }

        private static void AssertRegionChangeFollows(GameWorld world, string workDetailPrefix,
            string regionChangeDetail)
        {
            int workIndex = world.Events.FindIndex(entry => entry.Detail.StartsWith(workDetailPrefix));
            int regionChangeIndex = world.Events.FindIndex(entry => entry.Detail == regionChangeDetail);
            Assert.That(workIndex, Is.GreaterThanOrEqualTo(0), "The original task must complete.");
            Assert.That(regionChangeIndex, Is.GreaterThan(workIndex),
                "The region change must occur only after the original task completes.");
        }
    }
}
