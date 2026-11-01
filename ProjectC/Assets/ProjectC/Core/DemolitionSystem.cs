using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public sealed class DemolitionTask
    {
        internal DemolitionTask(string facilityId, long createdMilliseconds)
        {
            FacilityId = facilityId;
            CreatedMilliseconds = createdMilliseconds;
        }

        public string FacilityId { get; }
        public long CreatedMilliseconds { get; }
        public int ProgressMilliseconds { get; internal set; }
        public string AssignedDroneId { get; internal set; }
        public bool HasStarted { get; internal set; }
    }

    /// <summary>Stops and removes player-selected facilities while conserving their recoverable materials.</summary>
    public sealed class DemolitionSystem
    {
        private const int DemolitionWorkMilliseconds = 5_000;
        private readonly List<DemolitionTask> tasks = new List<DemolitionTask>();

        public DemolitionTask GetTask(string facilityId)
        {
            for (int i = 0; i < tasks.Count; i++)
                if (tasks[i].FacilityId == facilityId) return tasks[i];
            return null;
        }

        public bool CanRequest(GameWorld world, string facilityId)
        {
            if (world == null || string.IsNullOrWhiteSpace(facilityId)) return false;
            FacilityState facility = world.FindFacility(facilityId);
            return facility != null && !facility.IsUnderConstruction && !facility.IsDestroyed && !facility.IsDemolishing &&
                   facility.Kind != FacilityKind.Port && facility.Kind != FacilityKind.Outpost;
        }

        public bool Request(GameWorld world, string facilityId, long currentMilliseconds, TransportSystem transport)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (transport == null) throw new ArgumentNullException(nameof(transport));
            if (GetTask(facilityId) != null) return true;
            if (!CanRequest(world, facilityId)) return false;

            FacilityState facility = world.FindFacility(facilityId);
            facility.IsDemolishing = true;
            transport.CancelFacilityOrders(world, facilityId, currentMilliseconds, false);
            tasks.Add(new DemolitionTask(facilityId, currentMilliseconds));
            world.Record(currentMilliseconds, "demolition", facilityId + ":requested:work-ms:" + DemolitionWorkMilliseconds);
            return true;
        }

        public bool Cancel(GameWorld world, string facilityId, long currentMilliseconds, TransportSystem transport)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (transport == null) throw new ArgumentNullException(nameof(transport));
            DemolitionTask task = GetTask(facilityId);
            if (task == null) return false;
            FacilityState facility = world.FindFacility(facilityId);
            if (facility == null || facility.IsDestroyed) return false;

            facility.IsDemolishing = false;
            ReleaseWorker(world, task);
            tasks.Remove(task);
            transport.RestoreFacilityOrders(world, facilityId, currentMilliseconds);
            world.Record(currentMilliseconds, "demolition", facilityId + ":cancelled:progress-ms:" + task.ProgressMilliseconds);
            return true;
        }

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds,
            TransportSystem transport, ProductionSystem production, MiningSystem mining, WaveCombatSystem combat)
        {
            if (world == null || elapsedMilliseconds <= 0 || tasks.Count == 0) return;
            AssignWorkers(world, currentMilliseconds);

            for (int i = tasks.Count - 1; i >= 0; i--)
            {
                DemolitionTask task = tasks[i];
                FacilityState facility = world.FindFacility(task.FacilityId);
                if (facility == null)
                {
                    tasks.RemoveAt(i);
                    continue;
                }

                if (facility.IsDestroyed)
                {
                    Finish(world, task, facility, currentMilliseconds, transport, production, mining, combat, true);
                    tasks.RemoveAt(i);
                    continue;
                }

                if (task.AssignedDroneId == null) continue;
                DroneState worker = FindDrone(world, task.AssignedDroneId);
                if (worker == null)
                {
                    task.AssignedDroneId = null;
                    task.ProgressMilliseconds = 0;
                    task.HasStarted = false;
                    continue;
                }

                double targetX = facility.Position.X + facility.Width * 0.5d;
                double targetY = facility.Position.Y + facility.Height * 0.5d;
                if (!MoveToward(worker, targetX, targetY, world.Definitions.DroneSpeedCellsPerSecond,
                    elapsedMilliseconds)) continue;
                if (!task.HasStarted)
                {
                    task.HasStarted = true;
                    world.Record(currentMilliseconds, "demolition", facility.Id + ":started:" + worker.Id);
                    continue;
                }

                task.ProgressMilliseconds = (int)Math.Min(DemolitionWorkMilliseconds,
                    task.ProgressMilliseconds + elapsedMilliseconds);
                if (task.ProgressMilliseconds < DemolitionWorkMilliseconds) continue;
                Finish(world, task, facility, currentMilliseconds, transport, production, mining, combat, false);
                tasks.RemoveAt(i);
            }
        }

        private void AssignWorkers(GameWorld world, long currentMilliseconds)
        {
            while (true)
            {
                DemolitionTask best = null;
                FacilityState bestFacility = null;
                DroneState bestDrone = null;
                double bestDistanceSquared = double.MaxValue;
                for (int taskIndex = 0; taskIndex < tasks.Count; taskIndex++)
                {
                    DemolitionTask candidate = tasks[taskIndex];
                    if (candidate.AssignedDroneId != null) continue;
                    FacilityState facility = world.FindFacility(candidate.FacilityId);
                    if (facility == null || facility.IsDestroyed) continue;

                    for (int droneIndex = 0; droneIndex < world.Drones.Count; droneIndex++)
                    {
                        DroneState drone = world.Drones[droneIndex];
                        if (!drone.IsAvailable || !CanDroneServe(world, drone, facility)) continue;

                        double dx = drone.PositionX - (facility.Position.X + facility.Width * 0.5d);
                        double dy = drone.PositionY - (facility.Position.Y + facility.Height * 0.5d);
                        double distanceSquared = (dx * dx) + (dy * dy);
                        if (best != null && (facility.Priority < bestFacility.Priority ||
                            (facility.Priority == bestFacility.Priority && candidate.CreatedMilliseconds > best.CreatedMilliseconds) ||
                            (facility.Priority == bestFacility.Priority && candidate.CreatedMilliseconds == best.CreatedMilliseconds &&
                             distanceSquared >= bestDistanceSquared))) continue;
                        best = candidate;
                        bestFacility = facility;
                        bestDrone = drone;
                        bestDistanceSquared = distanceSquared;
                    }
                }

                if (best == null) return;
                best.AssignedDroneId = bestDrone.Id;
                bestDrone.IsAvailable = false;
                bestDrone.ActiveDemolitionFacilityId = best.FacilityId;
                world.Record(currentMilliseconds, "demolition", best.FacilityId + ":assigned:" + bestDrone.Id);
            }
        }

        private static bool CanDroneServe(GameWorld world, DroneState drone, FacilityState facility)
        {
            bool combat = facility.Kind != FacilityKind.Outpost &&
                          facility.Position.Y >= world.Definitions.ProductionHeight;
            return drone.Region == (combat ? DroneRegion.Combat : DroneRegion.Production);
        }

        private static void Finish(GameWorld world, DemolitionTask task, FacilityState facility,
            long currentMilliseconds, TransportSystem transport, ProductionSystem production,
            MiningSystem mining, WaveCombatSystem combat, bool destroyed)
        {
            production.RemoveFacility(world, facility.Id, !destroyed);
            mining.RemoveFacility(facility.Id);
            combat.RemoveFacility(facility.Id);
            RecoveryPile pile = world.GetOrCreateRecoveryPile(facility.Position);
            MoveStock(facility.Inventory, pile.Inventory);

            if (!destroyed)
            {
                FacilityDefinitionData definition = world.Definitions.FindBuildableFacility(facility.Kind);
                if (definition != null && definition.ConstructionCosts != null)
                {
                    int health = facility.MaximumHealth <= 0
                        ? 1
                        : Math.Max(0, facility.Health);
                    int maximumHealth = facility.MaximumHealth <= 0 ? 1 : facility.MaximumHealth;
                    for (int i = 0; i < definition.ConstructionCosts.Length; i++)
                    {
                        ItemQuantityData cost = definition.ConstructionCosts[i];
                        int recovered = (int)((long)cost.Quantity * health / maximumHealth);
                        if (recovered > 0 && !pile.Inventory.TryAdd(GameDefinitions.ParseItem(cost.Item), recovered))
                            throw new InvalidOperationException("Demolition recovery pile rejected a material refund.");
                    }
                }
            }

            ReleaseWorker(world, task);
            facility.IsDemolishing = false;
            world.ConstructionSites.RemoveAll(site => site.Facility == facility);
            world.Facilities.Remove(facility);
            world.Record(currentMilliseconds, "demolition", facility.Id + (destroyed ? ":destroyed-during-demolition" : ":completed") +
                ":recovery:" + pile.Id);
        }

        private static void MoveStock(InventoryStore source, InventoryStore destination)
        {
            foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
            {
                int quantity = source.GetStock(item);
                if (quantity <= 0) continue;
                if (!source.TryRemove(item, quantity) || !destination.TryAdd(item, quantity))
                    throw new InvalidOperationException("Demolition recovery transfer failed.");
            }
        }

        private static void ReleaseWorker(GameWorld world, DemolitionTask task)
        {
            if (task.AssignedDroneId == null) return;
            DroneState worker = FindDrone(world, task.AssignedDroneId);
            if (worker != null)
            {
                worker.IsAvailable = true;
                worker.ActiveDemolitionFacilityId = null;
            }
            task.AssignedDroneId = null;
        }

        private static DroneState FindDrone(GameWorld world, string id)
        {
            for (int i = 0; i < world.Drones.Count; i++)
                if (world.Drones[i].Id == id) return world.Drones[i];
            return null;
        }

        private static bool MoveToward(DroneState drone, double targetX, double targetY, int speed,
            long elapsedMilliseconds)
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
