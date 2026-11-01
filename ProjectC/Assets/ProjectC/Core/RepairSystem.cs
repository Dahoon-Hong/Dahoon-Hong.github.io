using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public enum RepairTaskStatus
    {
        WaitingForMaterials,
        WaitingForDrone,
        EnRoute,
        Repairing
    }

    /// <summary>Persistent manual repair order for one damaged combat facility.</summary>
    public sealed class RepairTask
    {
        internal RepairTask(string facilityId, long createdMilliseconds)
        {
            FacilityId = facilityId;
            CreatedMilliseconds = createdMilliseconds;
            Status = RepairTaskStatus.WaitingForMaterials;
        }

        public string FacilityId { get; }
        public long CreatedMilliseconds { get; }
        public int PlannedRecoveryHitPoints { get; internal set; }
        public int PaidRecoveryHitPoints { get; internal set; }
        public int RestoredHitPoints { get; internal set; }
        public string AssignedDroneId { get; internal set; }
        public RepairTaskStatus Status { get; internal set; }
        internal int RepairRateRemainder { get; set; }
        internal readonly Dictionary<ItemId, int> PaidCosts = new Dictionary<ItemId, int>();
    }

    /// <summary>Applies explicit player repair orders using game time and conserved facility stock.</summary>
    public sealed class RepairSystem
    {
        private const int OutpostIronCostForFullRepair = 100;
        private const int OutpostPlateCostForFullRepair = 25;
        private readonly Dictionary<string, RepairTask> tasks = new Dictionary<string, RepairTask>(StringComparer.Ordinal);

        public RepairTask GetTask(string facilityId)
        {
            if (string.IsNullOrEmpty(facilityId)) return null;
            return tasks.TryGetValue(facilityId, out RepairTask task) ? task : null;
        }

        public bool Request(GameWorld world, string facilityId, long currentMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (string.IsNullOrWhiteSpace(facilityId)) throw new ArgumentException("Facility ID is required.", nameof(facilityId));
            if (tasks.ContainsKey(facilityId)) return true;

            FacilityState facility = world.FindFacility(facilityId);
            if (!IsRepairable(world, facility) || facility.IsDestroyed || facility.Health >= facility.MaximumHealth)
                return false;
            if (!TryGetRepairCosts(world, facility, out Dictionary<ItemId, int> costs)) return false;

            var task = new RepairTask(facilityId, currentMilliseconds);
            foreach (KeyValuePair<ItemId, int> cost in costs) task.PaidCosts.Add(cost.Key, 0);
            task.PlannedRecoveryHitPoints = facility.MaximumHealth - facility.Health;
            tasks.Add(facilityId, task);
            world.Record(currentMilliseconds, "repair", facilityId + ":requested:missing:" + task.PlannedRecoveryHitPoints);
            return true;
        }

        public bool Cancel(GameWorld world, string facilityId, long currentMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (string.IsNullOrWhiteSpace(facilityId)) throw new ArgumentException("Facility ID is required.", nameof(facilityId));
            if (!tasks.TryGetValue(facilityId, out RepairTask task)) return false;

            ReleaseDrone(world, task);
            tasks.Remove(facilityId);
            world.Record(currentMilliseconds, "repair", facilityId + ":cancelled:restored:" + task.RestoredHitPoints + ":paid:" + task.PaidRecoveryHitPoints);
            return true;
        }

        /// <summary>Creates only the material deliveries required by active field repair orders.</summary>
        public void QueueMissingMaterials(GameWorld world, long currentMilliseconds, TransportSystem transport)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (transport == null) throw new ArgumentNullException(nameof(transport));
            FacilityState outpost = world.FindFacility(FacilityKind.Outpost);
            if (outpost == null || outpost.IsDestroyed) return;

            foreach (KeyValuePair<string, RepairTask> pair in tasks)
            {
                FacilityState facility = world.FindFacility(pair.Key);
                RepairTask task = pair.Value;
                if (facility == null || facility.IsDestroyed || facility.Kind == FacilityKind.Outpost ||
                    !TryGetRepairCosts(world, facility, out Dictionary<ItemId, int> fullCosts)) continue;

                foreach (KeyValuePair<ItemId, int> cost in fullCosts)
                {
                    int required = DivideRoundUp(checked((long)task.PlannedRecoveryHitPoints * cost.Value), facility.MaximumHealth);
                    task.PaidCosts.TryGetValue(cost.Key, out int paid);
                    int missing = required - paid - facility.Inventory.GetStock(cost.Key) -
                                  facility.Inventory.GetExpectedInbound(cost.Key);
                    if (missing <= 0) continue;
                    int quantity = Math.Min(missing, outpost.Inventory.GetAvailable(cost.Key));
                    if (quantity > 0)
                        transport.QueueTransfer(world, outpost.Id, facility.Id, cost.Key, quantity, currentMilliseconds);
                }
            }
        }

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (world == null || elapsedMilliseconds <= 0 || tasks.Count == 0) return;

            var completed = new List<string>();
            foreach (KeyValuePair<string, RepairTask> pair in tasks)
            {
                RepairTask task = pair.Value;
                FacilityState facility = world.FindFacility(task.FacilityId);
                if (facility == null || facility.IsDestroyed)
                {
                    ReleaseDrone(world, task);
                    world.Record(currentMilliseconds, "repair", task.FacilityId + ":ended:facility-destroyed");
                    completed.Add(task.FacilityId);
                    continue;
                }

                if (facility.Health >= facility.MaximumHealth)
                {
                    ReleaseDrone(world, task);
                    world.Record(currentMilliseconds, "repair", task.FacilityId + ":completed:restored:" + task.RestoredHitPoints);
                    completed.Add(task.FacilityId);
                    continue;
                }

                int requiredRecovery = checked(task.RestoredHitPoints + facility.MaximumHealth - facility.Health);
                task.PlannedRecoveryHitPoints = Math.Max(task.PlannedRecoveryHitPoints, requiredRecovery);
                if (!TryPayAdditionalCosts(world, facility, task, task.PlannedRecoveryHitPoints))
                {
                    if (task.RestoredHitPoints >= task.PaidRecoveryHitPoints)
                    {
                        ReleaseDrone(world, task);
                        task.Status = RepairTaskStatus.WaitingForMaterials;
                    }
                    continue;
                }

                if (task.AssignedDroneId == null)
                {
                    DroneState drone = FindAvailableDrone(world, facility);
                    if (drone == null)
                    {
                        task.Status = RepairTaskStatus.WaitingForDrone;
                        continue;
                    }

                    drone.IsAvailable = false;
                    task.AssignedDroneId = drone.Id;
                    task.Status = RepairTaskStatus.EnRoute;
                    world.Record(currentMilliseconds, "repair", task.FacilityId + ":assigned:" + drone.Id);
                }

                DroneState assignedDrone = FindDrone(world, task.AssignedDroneId);
                if (assignedDrone == null)
                {
                    task.AssignedDroneId = null;
                    task.Status = RepairTaskStatus.WaitingForDrone;
                    continue;
                }

                double targetX = facility.Position.X + facility.Width * 0.5d;
                double targetY = facility.Position.Y + facility.Height * 0.5d;
                if (!MoveToward(assignedDrone, targetX, targetY,
                    world.Definitions.DroneSpeedCellsPerSecond, elapsedMilliseconds))
                    continue;

                task.Status = RepairTaskStatus.Repairing;
                int rate = Math.Max(1, facility.MaximumHealth / 10);
                long repairUnits = checked((long)rate * elapsedMilliseconds + task.RepairRateRemainder);
                int healing = (int)(repairUnits / 1_000L);
                task.RepairRateRemainder = (int)(repairUnits % 1_000L);
                healing = Math.Min(healing, task.PaidRecoveryHitPoints - task.RestoredHitPoints);
                healing = Math.Min(healing, facility.MaximumHealth - facility.Health);
                if (healing > 0)
                {
                    facility.Repair(healing);
                    task.RestoredHitPoints += healing;
                    world.Record(currentMilliseconds, "repair", task.FacilityId + ":restored:" + healing + ":total:" + task.RestoredHitPoints);
                }

                if (facility.Health >= facility.MaximumHealth)
                {
                    ReleaseDrone(world, task);
                    world.Record(currentMilliseconds, "repair", task.FacilityId + ":completed:restored:" + task.RestoredHitPoints);
                    completed.Add(task.FacilityId);
                }
                else if (task.RestoredHitPoints >= task.PaidRecoveryHitPoints)
                {
                    // The paid portion is complete. The task remains, but its field worker can take other work.
                    ReleaseDrone(world, task);
                    task.Status = RepairTaskStatus.WaitingForMaterials;
                }
            }

            for (int i = 0; i < completed.Count; i++) tasks.Remove(completed[i]);
        }

        private static bool TryPayAdditionalCosts(GameWorld world, FacilityState facility, RepairTask task, int cumulativeRecovery)
        {
            if (!TryGetRepairCosts(world, facility, out Dictionary<ItemId, int> fullRepairCosts)) return false;
            int maximumHealth = facility.MaximumHealth;
            var deltas = new Dictionary<ItemId, int>();
            foreach (KeyValuePair<ItemId, int> cost in fullRepairCosts)
            {
                int required = DivideRoundUp(checked((long)cumulativeRecovery * cost.Value), maximumHealth);
                task.PaidCosts.TryGetValue(cost.Key, out int alreadyPaid);
                int delta = Math.Max(0, required - alreadyPaid);
                if (facility.Inventory.GetAvailable(cost.Key) < delta) return false;
                deltas.Add(cost.Key, delta);
            }

            foreach (KeyValuePair<ItemId, int> delta in deltas)
            {
                if (delta.Value > 0 && !facility.Inventory.TryRemove(delta.Key, delta.Value))
                    throw new InvalidOperationException("Repair stock changed after payment preflight.");
                task.PaidCosts[delta.Key] = task.PaidCosts[delta.Key] + delta.Value;
            }

            task.PaidRecoveryHitPoints = cumulativeRecovery;
            return true;
        }

        private static bool TryGetRepairCosts(GameWorld world, FacilityState facility, out Dictionary<ItemId, int> costs)
        {
            costs = new Dictionary<ItemId, int>();
            if (facility.Kind == FacilityKind.Outpost)
            {
                costs.Add(ItemId.Iron, OutpostIronCostForFullRepair);
                costs.Add(ItemId.Plate, OutpostPlateCostForFullRepair);
                return true;
            }

            FacilityDefinitionData definition = world.Definitions.FindBuildableFacility(facility.Kind);
            if (definition == null || definition.ConstructionCosts == null || definition.ConstructionCosts.Length == 0)
                return false;

            for (int i = 0; i < definition.ConstructionCosts.Length; i++)
            {
                ItemQuantityData cost = definition.ConstructionCosts[i];
                ItemId item = GameDefinitions.ParseItem(cost.Item);
                costs[item] = checked(costs.TryGetValue(item, out int quantity) ? quantity + cost.Quantity : cost.Quantity);
            }

            return true;
        }

        private static int DivideRoundUp(long numerator, int denominator)
        {
            if (numerator <= 0) return 0;
            return checked((int)((numerator + denominator - 1L) / denominator));
        }

        private static bool IsRepairable(GameWorld world, FacilityState facility)
        {
            if (facility == null || facility.MaximumHealth <= 0 || facility.IsUnderConstruction) return false;
            return facility.Kind == FacilityKind.Outpost || facility.Position.Y >= world.Definitions.ProductionHeight;
        }

        private static DroneState FindAvailableDrone(GameWorld world, FacilityState facility)
        {
            DroneRegion requiredRegion = facility.Kind == FacilityKind.Outpost ||
                                         facility.Position.Y >= world.Definitions.ProductionHeight
                ? DroneRegion.Combat
                : DroneRegion.Production;
            double targetX = facility.Position.X + facility.Width * 0.5d;
            double targetY = facility.Position.Y + facility.Height * 0.5d;
            DroneState best = null;
            double bestDistanceSquared = double.MaxValue;
            for (int i = 0; i < world.Drones.Count; i++)
            {
                DroneState drone = world.Drones[i];
                if (!drone.IsAvailable || drone.Region != requiredRegion) continue;
                double dx = drone.PositionX - targetX;
                double dy = drone.PositionY - targetY;
                double distanceSquared = dx * dx + dy * dy;
                if (distanceSquared >= bestDistanceSquared) continue;
                best = drone;
                bestDistanceSquared = distanceSquared;
            }

            return best;
        }

        private static DroneState FindDrone(GameWorld world, string id)
        {
            for (int i = 0; i < world.Drones.Count; i++)
                if (world.Drones[i].Id == id) return world.Drones[i];
            return null;
        }

        private static void ReleaseDrone(GameWorld world, RepairTask task)
        {
            if (task.AssignedDroneId == null) return;
            DroneState drone = FindDrone(world, task.AssignedDroneId);
            if (drone != null) drone.IsAvailable = true;
            task.AssignedDroneId = null;
        }

        private static bool MoveToward(DroneState drone, double targetX, double targetY, int speed, long elapsedMilliseconds)
        {
            double dx = targetX - drone.PositionX;
            double dy = targetY - drone.PositionY;
            double distance = Math.Sqrt((dx * dx) + (dy * dy));
            double travel = speed * (elapsedMilliseconds / 1_000d);
            if (distance <= travel || distance <= 0.000001d)
            {
                drone.PositionX = targetX;
                drone.PositionY = targetY;
                return true;
            }

            double ratio = travel / distance;
            drone.PositionX += dx * ratio;
            drone.PositionY += dy * ratio;
            return false;
        }
    }
}
