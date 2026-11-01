using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public sealed class ConstructionSite
    {
        internal ConstructionSite(FacilityState facility, FacilityDefinitionData definition, long createdMilliseconds)
        {
            Facility = facility;
            Definition = definition;
            CreatedMilliseconds = createdMilliseconds;
        }

        public FacilityState Facility { get; }
        public long CreatedMilliseconds { get; }
        public int ProgressMilliseconds { get; internal set; }
        public string AssignedDroneId { get; internal set; }
        internal FacilityDefinitionData Definition { get; }
        internal bool IsComplete { get; set; }
    }

    public sealed class RecoveryPile
    {
        internal RecoveryPile(string id, GridPosition position, InventoryStore inventory)
        {
            Id = id;
            Position = position;
            Inventory = inventory;
        }

        public string Id { get; }
        public GridPosition Position { get; }
        public InventoryStore Inventory { get; }
    }

    /// <summary>Places facilities, moves construction materials through drones, and advances site work.</summary>
    public sealed class ConstructionSystem
    {
        private int nextFacilityNumber = 1;

        public bool CanPlaceFacility(GameWorld world, FacilityKind kind, GridPosition position, int rotationDegrees,
            out string reason)
        {
            reason = string.Empty;
            if (world == null) throw new ArgumentNullException(nameof(world));
            FacilityDefinitionData definition = world.Definitions.FindBuildableFacility(kind);
            if (definition == null) return Fail("facility-not-buildable", out reason);
            if (rotationDegrees != 0 && rotationDegrees != 90 && rotationDegrees != 180 && rotationDegrees != 270)
                return Fail("invalid-rotation", out reason);

            bool swapsDimensions = rotationDegrees == 90 || rotationDegrees == 270;
            int width = swapsDimensions ? definition.Height : definition.Width;
            int height = swapsDimensions ? definition.Width : definition.Height;
            if (position.X < 0 || position.Y < 0 || position.X + width > world.Definitions.MapWidth ||
                position.Y + height > world.Definitions.MapHeight)
                return Fail("outside-map", out reason);

            bool conveyor = kind == FacilityKind.Conveyor || kind == FacilityKind.Splitter || kind == FacilityKind.Merger;
            bool combatZone = kind == FacilityKind.Turret;
            if (!conveyor && (combatZone ? position.Y < world.Definitions.ProductionHeight :
                position.Y + height > world.Definitions.ProductionHeight))
                return Fail("wrong-region", out reason);
            if (OverlapsMountain(world.Definitions, position, width, height))
                return Fail("mountain", out reason);
            if (kind == FacilityKind.Miner && !CoversOreNode(world.Definitions, position, width, height))
                return Fail("miner-must-cover-ore-node", out reason);

            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState existing = world.Facilities[i];
                if (Overlaps(position.X, position.Y, width, height,
                    existing.Position.X, existing.Position.Y, existing.Width, existing.Height))
                    return Fail("occupied", out reason);
            }
            return true;
        }

        public bool TryPlaceFacility(GameWorld world, FacilityKind kind, GridPosition position, int rotationDegrees,
            long currentMilliseconds, out FacilityState facility, out string reason)
        {
            facility = null;
            if (!CanPlaceFacility(world, kind, position, rotationDegrees, out reason)) return false;
            FacilityDefinitionData definition = world.Definitions.FindBuildableFacility(kind);
            bool swapsDimensions = rotationDegrees == 90 || rotationDegrees == 270;
            int width = swapsDimensions ? definition.Height : definition.Width;
            int height = swapsDimensions ? definition.Width : definition.Height;

            string id = "facility-" + kind.ToString().ToLowerInvariant() + "-" + nextFacilityNumber++;
            var inventory = new InventoryStore("facility." + id + ".inventory");
            SetInitialSiteCapacities(inventory, definition);
            int maximumHealth = position.Y >= world.Definitions.ProductionHeight ? definition.MaximumHealth : 0;
            facility = new FacilityState(id, kind, position, inventory, maximumHealth,
                width, height, rotationDegrees)
            {
                IsUnderConstruction = true
            };
            GameSimulation.CopyRestockTargets(definition, facility);
            var site = new ConstructionSite(facility, definition, currentMilliseconds);
            world.Facilities.Add(facility);
            world.ConstructionSites.Add(site);
            world.Record(currentMilliseconds, "construction", id + ":placed:" + position.X + "," + position.Y + ":rotation:" + rotationDegrees);
            return true;
        }

        /// <summary>Places an entire validated belt path; invalid geometry creates no sites or events.</summary>
        public bool TryPlaceConveyorPath(GameWorld world, IList<GridPosition> cells, long currentMilliseconds,
            out List<FacilityState> facilities, out string reason)
        {
            facilities = new List<FacilityState>();
            reason = string.Empty;
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (cells == null || cells.Count == 0) return Fail("path-needs-at-least-one-tile", out reason);

            var visited = new HashSet<GridPosition>();
            for (int i = 0; i < cells.Count; i++)
            {
                if (!visited.Add(cells[i])) return Fail("path-repeats-a-cell", out reason);
                if (i > 0 && Math.Abs(cells[i - 1].X - cells[i].X) + Math.Abs(cells[i - 1].Y - cells[i].Y) != 1)
                    return Fail("path-must-use-four-direction-connections", out reason);
                if (!CanPlaceFacility(world, FacilityKind.Conveyor, cells[i], 0, out reason)) return false;
            }

            for (int i = 0; i < cells.Count; i++)
            {
                if (!TryPlaceFacility(world, FacilityKind.Conveyor, cells[i], 0, currentMilliseconds,
                    out FacilityState facility, out reason))
                    throw new InvalidOperationException("A prevalidated conveyor path changed during placement: " + reason);
                facilities.Add(facility);
            }
            return true;
        }

        /// <summary>Immediately removes an unfinished site and leaves all recoverable materials in a field pile.</summary>
        public bool Cancel(GameWorld world, string facilityId, long currentMilliseconds, TransportSystem transport)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (transport == null) throw new ArgumentNullException(nameof(transport));
            if (string.IsNullOrWhiteSpace(facilityId)) throw new ArgumentException("Facility ID is required.", nameof(facilityId));

            ConstructionSite site = FindSite(world, facilityId);
            if (site == null || site.IsComplete || site.Facility.IsDestroyed) return false;

            FacilityState facility = site.Facility;
            transport.CancelFacilityOrders(world, facility.Id, currentMilliseconds, true);
            RecoveryPile pile = world.GetOrCreateRecoveryPile(facility.Position);
            MoveStock(facility.Inventory, pile.Inventory);
            if (facility.IsConstructionStarted)
                AddConstructionCosts(site.Definition, pile.Inventory);
            ReleaseWorker(world, site);
            world.ConstructionSites.Remove(site);
            world.Facilities.Remove(facility);
            world.Record(currentMilliseconds, "construction", facility.Id + ":cancelled:recovery:" + pile.Id);
            return true;
        }

        /// <summary>Removes combat-destroyed sites and preserves only material not already consumed by construction.</summary>
        public void RemoveDestroyedSites(GameWorld world, long currentMilliseconds, TransportSystem transport)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (transport == null) throw new ArgumentNullException(nameof(transport));

            for (int i = world.ConstructionSites.Count - 1; i >= 0; i--)
            {
                ConstructionSite site = world.ConstructionSites[i];
                if (site.IsComplete || !site.Facility.IsDestroyed) continue;
                FacilityState facility = site.Facility;
                transport.CancelFacilityOrders(world, facility.Id, currentMilliseconds, true);
                RecoveryPile pile = world.GetOrCreateRecoveryPile(facility.Position);
                MoveStock(facility.Inventory, pile.Inventory);
                ReleaseWorker(world, site);
                world.ConstructionSites.RemoveAt(i);
                world.Facilities.Remove(facility);
                world.Record(currentMilliseconds, "construction", facility.Id + ":destroyed:recovery:" + pile.Id);
            }
        }

        /// <summary>Queues only currently available material; newly produced stock is picked up on a later tick.</summary>
        public void QueueMissingMaterials(GameWorld world, long currentMilliseconds, TransportSystem transport)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (transport == null) throw new ArgumentNullException(nameof(transport));

            for (int siteIndex = 0; siteIndex < world.ConstructionSites.Count; siteIndex++)
            {
                ConstructionSite site = world.ConstructionSites[siteIndex];
                if (site.IsComplete || site.Facility.IsConstructionStarted || site.Facility.IsDemolishing) continue;
                FacilityState destination = site.Facility;
                for (int costIndex = 0; costIndex < site.Definition.ConstructionCosts.Length; costIndex++)
                {
                    ItemQuantityData cost = site.Definition.ConstructionCosts[costIndex];
                    ItemId item = GameDefinitions.ParseItem(cost.Item);
                    int required = cost.Quantity - destination.Inventory.GetStock(item) - destination.Inventory.GetExpectedInbound(item);
                    while (required > 0)
                    {
                        FacilityState source = FindNearestSource(world, destination, item);
                        if (source == null) break;
                        int quantity = Math.Min(required, source.Inventory.GetAvailable(item));
                        if (quantity <= 0) break;
                        transport.QueueTransfer(world, source.Id, destination.Id, item, quantity, currentMilliseconds);
                        required -= quantity;
                    }
                }
            }
        }

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (world == null || elapsedMilliseconds <= 0) return;
            for (int i = 0; i < world.ConstructionSites.Count; i++)
            {
                ConstructionSite site = world.ConstructionSites[i];
                if (site.IsComplete || site.Facility.IsDemolishing) continue;

                if (site.AssignedDroneId == null)
                {
                    if (!HasAllMaterials(site)) continue;
                    DroneState worker = FindAvailableWorker(world, site.Facility);
                    if (worker == null) continue;
                    site.AssignedDroneId = worker.Id;
                    worker.IsAvailable = false;
                    worker.ActiveConstructionSiteId = site.Facility.Id;
                    world.Record(currentMilliseconds, "construction", site.Facility.Id + ":assigned:" + worker.Id);
                }

                DroneState assignedDrone = FindDrone(world, site.AssignedDroneId);
                if (assignedDrone == null)
                {
                    site.AssignedDroneId = null;
                    continue;
                }

                double targetX = site.Facility.Position.X + site.Facility.Width * 0.5d;
                double targetY = site.Facility.Position.Y + site.Facility.Height * 0.5d;
                if (!MoveToward(assignedDrone, targetX, targetY,
                    world.Definitions.DroneSpeedCellsPerSecond, elapsedMilliseconds)) continue;

                if (!site.Facility.IsConstructionStarted)
                {
                    ConsumeConstructionMaterials(site);
                    site.Facility.IsConstructionStarted = true;
                    site.ProgressMilliseconds = 0;
                    world.Record(currentMilliseconds, "construction", site.Facility.Id + ":started");
                    continue;
                }

                site.ProgressMilliseconds = (int)Math.Min(site.Definition.ConstructionMilliseconds,
                    site.ProgressMilliseconds + elapsedMilliseconds);
                if (site.ProgressMilliseconds < site.Definition.ConstructionMilliseconds) continue;

                FinishFacility(site);
                assignedDrone.IsAvailable = true;
                assignedDrone.ActiveConstructionSiteId = null;
                site.IsComplete = true;
                world.Record(currentMilliseconds, "construction", site.Facility.Id + ":completed");
            }
        }

        private static ConstructionSite FindSite(GameWorld world, string facilityId)
        {
            for (int i = 0; i < world.ConstructionSites.Count; i++)
                if (world.ConstructionSites[i].Facility.Id == facilityId) return world.ConstructionSites[i];
            return null;
        }

        private static void AddConstructionCosts(FacilityDefinitionData definition, InventoryStore inventory)
        {
            for (int i = 0; i < definition.ConstructionCosts.Length; i++)
            {
                ItemQuantityData cost = definition.ConstructionCosts[i];
                if (!inventory.TryAdd(GameDefinitions.ParseItem(cost.Item), cost.Quantity))
                    throw new InvalidOperationException("Construction recovery pile rejected a full-cost recovery.");
            }
        }

        private static void MoveStock(InventoryStore source, InventoryStore destination)
        {
            foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
            {
                int quantity = source.GetStock(item);
                if (quantity <= 0) continue;
                if (!source.TryRemove(item, quantity) || !destination.TryAdd(item, quantity))
                    throw new InvalidOperationException("Recovery pile transfer failed after cancellation preflight.");
            }
        }

        private static void ReleaseWorker(GameWorld world, ConstructionSite site)
        {
            if (site.AssignedDroneId == null) return;
            for (int i = 0; i < world.Drones.Count; i++)
            {
                DroneState drone = world.Drones[i];
                if (drone.Id != site.AssignedDroneId) continue;
                drone.IsAvailable = true;
                drone.ActiveConstructionSiteId = null;
                break;
            }
            site.AssignedDroneId = null;
        }

        private static bool HasAllMaterials(ConstructionSite site)
        {
            for (int i = 0; i < site.Definition.ConstructionCosts.Length; i++)
            {
                ItemQuantityData cost = site.Definition.ConstructionCosts[i];
                if (site.Facility.Inventory.GetAvailable(GameDefinitions.ParseItem(cost.Item)) < cost.Quantity) return false;
            }

            return true;
        }

        private static void ConsumeConstructionMaterials(ConstructionSite site)
        {
            for (int i = 0; i < site.Definition.ConstructionCosts.Length; i++)
            {
                ItemQuantityData cost = site.Definition.ConstructionCosts[i];
                if (!site.Facility.Inventory.TryRemove(GameDefinitions.ParseItem(cost.Item), cost.Quantity))
                    throw new InvalidOperationException("Construction material changed after the site was ready.");
            }

            for (int i = 0; i < site.Definition.ConstructionCosts.Length; i++)
            {
                ItemId item = GameDefinitions.ParseItem(site.Definition.ConstructionCosts[i].Item);
                if (!HasOperationalCapacity(site.Definition, item)) site.Facility.Inventory.ClearCapacity(item);
            }
        }

        private static void FinishFacility(ConstructionSite site)
        {
            for (int i = 0; i < site.Definition.Capacities.Length; i++)
            {
                ItemQuantityData capacity = site.Definition.Capacities[i];
                site.Facility.Inventory.SetCapacity(GameDefinitions.ParseItem(capacity.Item), capacity.Quantity);
            }

            site.Facility.IsUnderConstruction = false;
        }

        private static void SetInitialSiteCapacities(InventoryStore inventory, FacilityDefinitionData definition)
        {
            for (int i = 0; i < definition.Capacities.Length; i++)
            {
                ItemQuantityData capacity = definition.Capacities[i];
                inventory.SetCapacity(GameDefinitions.ParseItem(capacity.Item), capacity.Quantity);
            }

            for (int i = 0; i < definition.ConstructionCosts.Length; i++)
            {
                ItemQuantityData cost = definition.ConstructionCosts[i];
                ItemId item = GameDefinitions.ParseItem(cost.Item);
                int capacity = Math.Max(cost.Quantity, inventory.GetFreeCapacity(item));
                if (inventory.GetFreeCapacity(item) == int.MaxValue) capacity = cost.Quantity;
                inventory.SetCapacity(item, capacity);
            }
        }

        private static FacilityState FindNearestSource(GameWorld world, FacilityState destination, ItemId item)
        {
            FacilityState best = null;
            double bestDistanceSquared = double.MaxValue;
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState source = world.Facilities[i];
                if (source == destination || source.IsUnderConstruction || source.Inventory.GetAvailable(item) <= 0 ||
                    !HasLegalRoute(source, destination, world.Definitions.ProductionHeight)) continue;
                double dx = (source.Position.X + source.Width * 0.5d) - (destination.Position.X + destination.Width * 0.5d);
                double dy = (source.Position.Y + source.Height * 0.5d) - (destination.Position.Y + destination.Height * 0.5d);
                double distanceSquared = dx * dx + dy * dy;
                if (distanceSquared >= bestDistanceSquared) continue;
                best = source;
                bestDistanceSquared = distanceSquared;
            }

            return best;
        }

        private static DroneState FindAvailableWorker(GameWorld world, FacilityState facility)
        {
            bool combat = facility.Position.Y >= world.Definitions.ProductionHeight;
            DroneRegion requiredRegion = combat ? DroneRegion.Combat : DroneRegion.Production;
            DroneState best = null;
            double bestDistanceSquared = double.MaxValue;
            for (int i = 0; i < world.Drones.Count; i++)
            {
                DroneState drone = world.Drones[i];
                if (!drone.IsAvailable || drone.Region != requiredRegion) continue;
                double dx = drone.PositionX - (facility.Position.X + facility.Width * 0.5d);
                double dy = drone.PositionY - (facility.Position.Y + facility.Height * 0.5d);
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

        private static bool MoveToward(DroneState drone, double targetX, double targetY, int speed, long elapsedMilliseconds)
        {
            double dx = targetX - drone.PositionX;
            double dy = targetY - drone.PositionY;
            double distance = Math.Sqrt(dx * dx + dy * dy);
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

        private static bool HasLegalRoute(FacilityState source, FacilityState destination, int productionHeight)
        {
            bool sourceCombat = IsCombatFacility(source, productionHeight);
            bool destinationCombat = IsCombatFacility(destination, productionHeight);
            return sourceCombat == destinationCombat || source.Kind == FacilityKind.Outpost || destination.Kind == FacilityKind.Outpost;
        }

        private static bool IsCombatFacility(FacilityState facility, int productionHeight) =>
            facility.Kind != FacilityKind.Outpost && facility.Position.Y >= productionHeight;

        private static bool CoversOreNode(GameDefinitions definitions, GridPosition position, int width, int height)
        {
            for (int i = 0; i < definitions.OreNodes.Length; i++)
                if (definitions.OreNodes[i].X >= position.X && definitions.OreNodes[i].X < position.X + width &&
                    definitions.OreNodes[i].Y >= position.Y && definitions.OreNodes[i].Y < position.Y + height) return true;
            return false;
        }

        private static bool OverlapsMountain(GameDefinitions definitions, GridPosition position, int width, int height)
        {
            for (int x = position.X; x < position.X + width; x++)
                for (int y = position.Y; y < position.Y + height; y++)
                    if (definitions.IsMountainCell(x, y)) return true;
            return false;
        }

        private static bool HasOperationalCapacity(FacilityDefinitionData definition, ItemId item)
        {
            for (int i = 0; i < definition.Capacities.Length; i++)
                if (GameDefinitions.ParseItem(definition.Capacities[i].Item) == item) return true;
            return false;
        }

        private static bool Overlaps(int ax, int ay, int aw, int ah, int bx, int by, int bw, int bh) =>
            ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

        private static bool Fail(string error, out string reason)
        {
            reason = error;
            return false;
        }
    }
}
