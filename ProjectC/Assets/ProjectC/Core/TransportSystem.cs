using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public enum TransportOrderState
    {
        Waiting,
        InProgress,
        Completed,
        Cancelled
    }

    /// <summary>A player-issued request to move a fixed amount of one item between facilities.</summary>
    public sealed class TransportOrder
    {
        internal TransportOrder(string id, string sourceFacilityId, string destinationFacilityId,
            ItemId item, int quantity, long createdMilliseconds, string sourceRecoveryPileId = null)
        {
            Id = id;
            SourceFacilityId = sourceFacilityId;
            SourceRecoveryPileId = sourceRecoveryPileId;
            DestinationFacilityId = destinationFacilityId;
            Item = item;
            Quantity = quantity;
            CreatedMilliseconds = createdMilliseconds;
            State = TransportOrderState.Waiting;
            CancellationFacilityIds = new HashSet<string>(StringComparer.Ordinal);
        }

        public string Id { get; }
        public string SourceFacilityId { get; }
        public string SourceRecoveryPileId { get; }
        public string DestinationFacilityId { get; }
        public ItemId Item { get; }
        public int Quantity { get; }
        public int DeliveredQuantity { get; internal set; }
        public int ReservedQuantity { get; internal set; }
        public int InTransitQuantity { get; internal set; }
        public int CancelledQuantity { get; internal set; }
        internal int RestorableCancelledQuantity { get; set; }
        public long CreatedMilliseconds { get; }
        public TransportOrderState State { get; internal set; }
        public bool IsAutomatic { get; internal set; }
        internal bool IsCancelled { get; set; }
        internal HashSet<string> CancellationFacilityIds { get; }
        internal int RemainingUnassigned => Quantity - DeliveredQuantity - ReservedQuantity - InTransitQuantity - CancelledQuantity;
    }

    /// <summary>Moves reserved cargo with the confirmed drone capacity and game-time speed.</summary>
    public sealed class TransportSystem
    {
        private readonly List<Trip> trips = new List<Trip>();
        private int nextOrderNumber = 1;

        public TransportOrder QueueTransfer(GameWorld world, string sourceFacilityId, string destinationFacilityId,
            ItemId item, int quantity, long createdMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
            if (sourceFacilityId == destinationFacilityId) throw new ArgumentException("Source and destination must differ.");

            FacilityState source = world.FindFacility(sourceFacilityId);
            FacilityState destination = world.FindFacility(destinationFacilityId);
            if (source == null || destination == null) throw new ArgumentException("Both facilities must exist.");
            if (source.IsDemolishing || destination.IsDemolishing)
                throw new InvalidOperationException("Facilities under demolition cannot receive new transfers.");
            if (!HasLegalRoute(source, destination, world.Definitions.ProductionHeight))
                throw new InvalidOperationException("Cross-region transport must pass through the outpost.");

            string id = "transport-" + nextOrderNumber++;
            var order = new TransportOrder(id, sourceFacilityId, destinationFacilityId, item, quantity, createdMilliseconds);
            destination.Inventory.AddExpectedInbound(item, quantity);
            world.TransportOrders.Add(order);
            world.Record(createdMilliseconds, "transport", id + ":queued:" + quantity + ":" + item + ":" + sourceFacilityId + "->" + destinationFacilityId);
            return order;
        }

        private TransportOrder QueueRecoveryTransfer(GameWorld world, RecoveryPile source, FacilityState destination,
            ItemId item, int quantity, long createdMilliseconds)
        {
            string id = "transport-" + nextOrderNumber++;
            var order = new TransportOrder(id, null, destination.Id, item, quantity, createdMilliseconds, source.Id)
            {
                IsAutomatic = true
            };
            destination.Inventory.AddExpectedInbound(item, quantity);
            world.TransportOrders.Add(order);
            world.Record(createdMilliseconds, "recovery", id + ":queued:" + quantity + ":" + item + ":" + source.Id + "->" + destination.Id);
            return order;
        }

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (world == null || elapsedMilliseconds <= 0) return;
            QueueRestockTransfers(world, currentMilliseconds);
            QueueRecoveryTransfers(world, currentMilliseconds);
            AssignTrips(world, currentMilliseconds);

            for (int i = trips.Count - 1; i >= 0; i--)
            {
                Trip trip = trips[i];
                if (trip.Phase == TripPhase.ToPickup)
                {
                    if (!MoveToward(trip.Drone, trip.SourceX, trip.SourceY,
                        world.Definitions.DroneSpeedCellsPerSecond, elapsedMilliseconds)) continue;

                    if (!trip.SourceInventory.TryRemoveReservedStock(trip.Order.Item, trip.ReservedCargo))
                        throw new InvalidOperationException("Reserved cargo disappeared before drone pickup.");
                    trip.SourceInventory.RemoveReservation(trip.Order.Item, trip.ReservedCargo);

                    trip.Order.ReservedQuantity -= trip.ReservedCargo;
                    trip.Order.InTransitQuantity += trip.ReservedCargo;
                    trip.Destination.Inventory.AddInTransit(trip.Order.Item, trip.ReservedCargo);
                    trip.Cargo = trip.ReservedCargo;
                    trip.ReservedCargo = 0;
                    trip.Phase = TripPhase.ToDestination;
                    world.Record(currentMilliseconds, "transport", trip.Order.Id + ":picked-up:" + trip.Cargo);
                    continue;
                }

                if (trip.Phase == TripPhase.ReturningToSource)
                {
                    double returnX = trip.ReturnFacility != null
                        ? trip.ReturnFacility.Position.X + trip.ReturnFacility.Width * 0.5d
                        : trip.ReturnPile.Position.X + 0.5d;
                    double returnY = trip.ReturnFacility != null
                        ? trip.ReturnFacility.Position.Y + trip.ReturnFacility.Height * 0.5d
                        : trip.ReturnPile.Position.Y + 0.5d;
                    if (!MoveToward(trip.Drone, returnX, returnY,
                        world.Definitions.DroneSpeedCellsPerSecond, elapsedMilliseconds)) continue;
                    FinishReturn(world, trip, currentMilliseconds);
                    trips.RemoveAt(i);
                    continue;
                }

                if (trip.Phase != TripPhase.ToDestination) continue;
                if (!MoveToward(trip.Drone,
                    trip.Destination.Position.X + trip.Destination.Width * 0.5d,
                    trip.Destination.Position.Y + trip.Destination.Height * 0.5d,
                    world.Definitions.DroneSpeedCellsPerSecond, elapsedMilliseconds)) continue;

                int delivered = Math.Min(trip.Cargo, trip.Destination.Inventory.GetFreeCapacity(trip.Order.Item));
                if (delivered > 0)
                {
                    if (!trip.Destination.Inventory.TryAdd(trip.Order.Item, delivered))
                        throw new InvalidOperationException("Destination capacity changed during drone delivery.");
                    trip.Destination.Inventory.RemoveInTransit(trip.Order.Item, delivered);
                    trip.Destination.Inventory.RemoveExpectedInbound(trip.Order.Item, delivered);
                    trip.Order.InTransitQuantity -= delivered;
                    trip.Order.DeliveredQuantity += delivered;
                    trip.Cargo -= delivered;
                    world.Record(currentMilliseconds, "transport", trip.Order.Id + ":delivered:" + delivered);
                }

                if (trip.Cargo > 0) continue;
                trip.Drone.IsAvailable = true;
                trip.Drone.ActiveTransportOrderId = null;
                trips.RemoveAt(i);

                if (trip.Order.CancelledQuantity > 0 && trip.Order.DeliveredQuantity + trip.Order.CancelledQuantity >= trip.Order.Quantity)
                {
                    trip.Order.State = TransportOrderState.Cancelled;
                    world.Record(currentMilliseconds, "transport", trip.Order.Id + ":cancelled:remaining-settled");
                }
                else if (trip.Order.DeliveredQuantity >= trip.Order.Quantity)
                {
                    trip.Order.State = TransportOrderState.Completed;
                    world.Record(currentMilliseconds, "transport", trip.Order.Id + ":completed");
                }
                else
                {
                    trip.Order.State = TransportOrderState.Waiting;
                }
            }

            AssignTrips(world, currentMilliseconds);
        }

        private void QueueRestockTransfers(GameWorld world, long currentMilliseconds)
        {
            for (int destinationIndex = 0; destinationIndex < world.Facilities.Count; destinationIndex++)
            {
                FacilityState destination = world.Facilities[destinationIndex];
                if (destination.IsUnderConstruction || destination.IsDestroyed || destination.IsDemolishing) continue;

                foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
                {
                    int deficit = destination.GetRestockTarget(item) - destination.Inventory.GetStock(item) -
                                  destination.Inventory.GetExpectedInbound(item);
                    if (deficit <= 0) continue;

                    FacilityState source = FindRestockSource(world, destination, item);
                    if (source == null) continue;
                    int protectedStock = Math.Min(source.Inventory.GetStock(item),
                        Math.Max(0, source.GetRestockTarget(item) - source.Inventory.GetExpectedInbound(item)));
                    int available = Math.Max(0, source.Inventory.GetAvailable(item) - protectedStock);
                    int quantity = Math.Min(deficit, available);
                    if (quantity <= 0) continue;

                    TransportOrder order = QueueTransfer(world, source.Id, destination.Id, item, quantity, currentMilliseconds);
                    order.IsAutomatic = true;
                }
            }
        }

        private static FacilityState FindRestockSource(GameWorld world, FacilityState destination, ItemId item)
        {
            FacilityState best = null;
            double bestDistanceSquared = double.MaxValue;
            bool destinationCombat = IsCombatFacility(destination, world.Definitions.ProductionHeight);
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState source = world.Facilities[i];
                if (source == destination || source.IsUnderConstruction || source.IsDestroyed || source.IsDemolishing ||
                    source.Inventory.GetAvailable(item) <= 0 ||
                    !HasLegalRoute(source, destination, world.Definitions.ProductionHeight)) continue;
                if (destinationCombat && destination.Kind != FacilityKind.Outpost && source.Kind != FacilityKind.Outpost)
                    continue;

                int protectedStock = Math.Min(source.Inventory.GetStock(item),
                    Math.Max(0, source.GetRestockTarget(item) - source.Inventory.GetExpectedInbound(item)));
                if (source.Inventory.GetAvailable(item) <= protectedStock) continue;
                double dx = (source.Position.X + source.Width * 0.5d) - (destination.Position.X + destination.Width * 0.5d);
                double dy = (source.Position.Y + source.Height * 0.5d) - (destination.Position.Y + destination.Height * 0.5d);
                double distanceSquared = dx * dx + dy * dy;
                if (distanceSquared >= bestDistanceSquared) continue;
                best = source;
                bestDistanceSquared = distanceSquared;
            }

            return best;
        }

        private void QueueRecoveryTransfers(GameWorld world, long currentMilliseconds)
        {
            for (int pileIndex = 0; pileIndex < world.RecoveryPiles.Count; pileIndex++)
            {
                RecoveryPile pile = world.RecoveryPiles[pileIndex];
                bool combatPile = pile.Position.Y >= world.Definitions.ProductionHeight;
                foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
                {
                    int alreadyQueued = 0;
                    for (int orderIndex = 0; orderIndex < world.TransportOrders.Count; orderIndex++)
                    {
                        TransportOrder order = world.TransportOrders[orderIndex];
                        if (!order.IsCancelled && order.SourceRecoveryPileId == pile.Id && order.Item == item)
                            alreadyQueued += order.RemainingUnassigned;
                    }
                    int available = pile.Inventory.GetAvailable(item) - alreadyQueued;
                    if (available <= 0) continue;
                    FacilityState destination = FindRecoveryDestination(world, pile.Position, combatPile, item);
                    if (destination == null) continue;
                    int free = destination.Inventory.GetFreeCapacity(item) - destination.Inventory.GetExpectedInbound(item);
                    int quantity = Math.Min(available, Math.Max(0, free));
                    if (quantity > 0) QueueRecoveryTransfer(world, pile, destination, item, quantity, currentMilliseconds);
                }
            }
        }

        private static FacilityState FindRecoveryDestination(GameWorld world, GridPosition position,
            bool combatPile, ItemId item)
        {
            FacilityState best = null;
            double bestDistanceSquared = double.MaxValue;
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState candidate = world.Facilities[i];
                if (candidate.IsUnderConstruction || candidate.IsDestroyed || candidate.IsDemolishing ||
                    !candidate.Inventory.HasCapacity(item) ||
                    candidate.Inventory.GetFreeCapacity(item) - candidate.Inventory.GetExpectedInbound(item) <= 0) continue;
                if (combatPile ? candidate.Kind != FacilityKind.Outpost : IsCombatFacility(candidate, world.Definitions.ProductionHeight))
                    continue;

                double dx = position.X + 0.5d - (candidate.Position.X + candidate.Width * 0.5d);
                double dy = position.Y + 0.5d - (candidate.Position.Y + candidate.Height * 0.5d);
                double distanceSquared = (dx * dx) + (dy * dy);
                if (best != null && (candidate.Priority < best.Priority ||
                    (candidate.Priority == best.Priority && distanceSquared >= bestDistanceSquared))) continue;
                best = candidate;
                bestDistanceSquared = distanceSquared;
            }

            return best;
        }

        /// <summary>Stops work attached to a facility without losing reserved or carried material.</summary>
        public void CancelFacilityOrders(GameWorld world, string facilityId, long currentMilliseconds,
            bool dropCombatCargoAtCurrentPosition)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (string.IsNullOrWhiteSpace(facilityId)) throw new ArgumentException("Facility ID is required.", nameof(facilityId));

            for (int orderIndex = 0; orderIndex < world.TransportOrders.Count; orderIndex++)
            {
                TransportOrder order = world.TransportOrders[orderIndex];
                if (order.State == TransportOrderState.Completed) continue;
                bool sourceRemoved = order.SourceFacilityId == facilityId;
                bool destinationRemoved = order.DestinationFacilityId == facilityId;
                if (!sourceRemoved && !destinationRemoved) continue;
                if (!order.CancellationFacilityIds.Add(facilityId)) continue;

                order.IsCancelled = true;
                for (int tripIndex = trips.Count - 1; tripIndex >= 0; tripIndex--)
                {
                    Trip trip = trips[tripIndex];
                    if (trip.Order != order) continue;
                    if (trip.Phase == TripPhase.ToPickup)
                    {
                        CancelBeforePickup(world, trip, currentMilliseconds);
                        trips.RemoveAt(tripIndex);
                    }
                    else if (destinationRemoved && trip.Phase == TripPhase.ToDestination)
                    {
                        CancelInFlightToRemovedDestination(world, trip, currentMilliseconds,
                            dropCombatCargoAtCurrentPosition);
                        if (trip.Phase != TripPhase.ReturningToSource) trips.RemoveAt(tripIndex);
                    }
                }

                int unassigned = order.RemainingUnassigned;
                if (unassigned > 0)
                {
                    FacilityState destination = world.FindFacility(order.DestinationFacilityId);
                    if (destination != null) destination.Inventory.RemoveExpectedInbound(order.Item, unassigned);
                    order.CancelledQuantity += unassigned;
                    order.RestorableCancelledQuantity += unassigned;
                }

                UpdateCancelledOrderState(world, order, currentMilliseconds);
                world.Record(currentMilliseconds, "transport", order.Id + ":cancelled-for-facility:" + facilityId +
                    ":reserved:" + order.ReservedQuantity + ":in-transit:" + order.InTransitQuantity);
            }
        }

        /// <summary>Reopens requests cancelled by an unfinished demolition that the player then cancels.</summary>
        public void RestoreFacilityOrders(GameWorld world, string facilityId, long currentMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            for (int i = 0; i < world.TransportOrders.Count; i++)
            {
                TransportOrder order = world.TransportOrders[i];
                if (!order.CancellationFacilityIds.Remove(facilityId)) continue;
                if (order.CancellationFacilityIds.Count > 0 || order.RestorableCancelledQuantity <= 0) continue;
                FacilityState destination = world.FindFacility(order.DestinationFacilityId);
                if (destination == null || destination.IsDestroyed || destination.IsDemolishing) continue;

                int restoredQuantity = order.RestorableCancelledQuantity;
                if (order.SourceFacilityId != null)
                {
                    FacilityState source = world.FindFacility(order.SourceFacilityId);
                    if (source == null || source.IsDestroyed || source.IsDemolishing) continue;
                }

                destination.Inventory.AddExpectedInbound(order.Item, restoredQuantity);
                order.CancelledQuantity -= restoredQuantity;
                order.RestorableCancelledQuantity = 0;
                order.IsCancelled = false;
                order.State = order.InTransitQuantity > 0 ? TransportOrderState.InProgress : TransportOrderState.Waiting;
                world.Record(currentMilliseconds, "transport", order.Id + ":restored-after-demolition-cancel:" + restoredQuantity);
            }
        }

        private void CancelBeforePickup(GameWorld world, Trip trip, long currentMilliseconds)
        {
            trip.SourceInventory.RemoveReservation(trip.Order.Item, trip.ReservedCargo);
            trip.Order.ReservedQuantity -= trip.ReservedCargo;
            FacilityState destination = world.FindFacility(trip.Order.DestinationFacilityId);
            if (destination != null) destination.Inventory.RemoveExpectedInbound(trip.Order.Item, trip.ReservedCargo);
            trip.Order.CancelledQuantity += trip.ReservedCargo;
            trip.Order.RestorableCancelledQuantity += trip.ReservedCargo;
            trip.Drone.IsAvailable = true;
            trip.Drone.ActiveTransportOrderId = null;
            world.Record(currentMilliseconds, "transport", trip.Order.Id + ":pickup-cancelled:" + trip.ReservedCargo);
        }

        private void CancelInFlightToRemovedDestination(GameWorld world, Trip trip, long currentMilliseconds,
            bool dropCombatCargoAtCurrentPosition)
        {
            int cargo = trip.Cargo;
            if (cargo <= 0) return;
            trip.Destination.Inventory.RemoveInTransit(trip.Order.Item, cargo);
            trip.Destination.Inventory.RemoveExpectedInbound(trip.Order.Item, cargo);
            trip.Order.InTransitQuantity -= cargo;

            if (dropCombatCargoAtCurrentPosition && trip.Drone.Region == DroneRegion.Combat)
            {
                DropCargo(world, trip.Drone, trip.Order.Item, cargo, currentMilliseconds, trip.Order.Id);
                trip.Order.CancelledQuantity += cargo;
                trip.Cargo = 0;
                trip.Drone.IsAvailable = true;
                trip.Drone.ActiveTransportOrderId = null;
                world.Record(currentMilliseconds, "transport", trip.Order.Id + ":combat-cargo-recovered:" + cargo);
                return;
            }

            trip.Order.CancelledQuantity += cargo;
            trip.Cargo = cargo;
            trip.ReturnFacility = trip.SourceFacility;
            trip.ReturnPile = trip.SourcePile;
            if (trip.ReturnFacility != null && (trip.ReturnFacility.IsDestroyed || trip.ReturnFacility.IsDemolishing ||
                world.FindFacility(trip.ReturnFacility.Id) == null)) trip.ReturnFacility = null;
            if (trip.ReturnFacility == null && trip.ReturnPile == null)
                trip.ReturnFacility = FindRecoveryDestination(world,
                    new GridPosition((int)Math.Floor(trip.SourceX), (int)Math.Floor(trip.SourceY)),
                    trip.Drone.Region == DroneRegion.Combat, trip.Order.Item);
            if (trip.ReturnFacility == null && trip.ReturnPile == null)
            {
                DropCargo(world, trip.Drone, trip.Order.Item, cargo, currentMilliseconds, trip.Order.Id);
                trip.Cargo = 0;
                trip.Drone.IsAvailable = true;
                trip.Drone.ActiveTransportOrderId = null;
                world.Record(currentMilliseconds, "transport", trip.Order.Id + ":cargo-recovered-in-place:" + cargo);
                return;
            }

            trip.Phase = TripPhase.ReturningToSource;
            world.Record(currentMilliseconds, "transport", trip.Order.Id + ":returning-to-source:" + cargo);
        }

        private static void FinishReturn(GameWorld world, Trip trip, long currentMilliseconds)
        {
            if (trip.ReturnFacility != null && (trip.ReturnFacility.IsDestroyed || trip.ReturnFacility.IsDemolishing ||
                world.FindFacility(trip.ReturnFacility.Id) == null))
                trip.ReturnFacility = null;
            if (trip.ReturnFacility == null && trip.ReturnPile == null)
                trip.ReturnFacility = FindRecoveryDestination(world,
                    new GridPosition((int)Math.Floor(trip.Drone.PositionX), (int)Math.Floor(trip.Drone.PositionY)),
                    trip.Drone.Region == DroneRegion.Combat, trip.Order.Item);

            if (trip.ReturnFacility == null && trip.ReturnPile == null)
            {
                DropCargo(world, trip.Drone, trip.Order.Item, trip.Cargo, currentMilliseconds, trip.Order.Id);
                trip.Drone.IsAvailable = true;
                trip.Drone.ActiveTransportOrderId = null;
                world.Record(currentMilliseconds, "transport", trip.Order.Id + ":returned-to-recovery-pile:" + trip.Cargo);
                return;
            }

            InventoryStore destination = trip.ReturnFacility != null
                ? trip.ReturnFacility.Inventory
                : trip.ReturnPile.Inventory;
            int returned = Math.Min(trip.Cargo, destination.GetFreeCapacity(trip.Order.Item));
            if (returned > 0 && !destination.TryAdd(trip.Order.Item, returned))
                throw new InvalidOperationException("Returned cargo exceeded the selected recovery capacity.");
            int remaining = trip.Cargo - returned;
            if (remaining > 0)
                DropCargo(world, trip.Drone, trip.Order.Item, remaining, currentMilliseconds, trip.Order.Id);
            trip.Drone.IsAvailable = true;
            trip.Drone.ActiveTransportOrderId = null;
            world.Record(currentMilliseconds, "transport", trip.Order.Id + ":returned:" + returned + ":recovered:" + remaining);
        }

        private static void UpdateCancelledOrderState(GameWorld world, TransportOrder order, long currentMilliseconds)
        {
            if (order.InTransitQuantity > 0)
            {
                order.State = TransportOrderState.InProgress;
                return;
            }
            if (order.DeliveredQuantity + order.CancelledQuantity >= order.Quantity)
            {
                order.State = TransportOrderState.Cancelled;
                world.Record(currentMilliseconds, "transport", order.Id + ":cancelled");
            }
        }

        private static void DropCargo(GameWorld world, DroneState drone, ItemId item, int quantity,
            long currentMilliseconds, string sourceId)
        {
            var position = new GridPosition((int)Math.Floor(drone.PositionX), (int)Math.Floor(drone.PositionY));
            RecoveryPile pile = world.GetOrCreateRecoveryPile(position);
            if (!pile.Inventory.TryAdd(item, quantity))
                throw new InvalidOperationException("Recovery pile could not preserve drone cargo.");
            world.Record(currentMilliseconds, "recovery", sourceId + ":dropped:" + quantity + ":" + item + ":" + pile.Id);
        }

        private static RecoveryPile FindRecoveryPile(GameWorld world, string id)
        {
            for (int i = 0; i < world.RecoveryPiles.Count; i++)
                if (world.RecoveryPiles[i].Id == id) return world.RecoveryPiles[i];
            return null;
        }

        private void AssignTrips(GameWorld world, long currentMilliseconds)
        {
            for (int droneIndex = 0; droneIndex < world.Drones.Count; droneIndex++)
            {
                DroneState drone = world.Drones[droneIndex];
                if (!drone.IsAvailable) continue;

                TransportOrder bestOrder = null;
                FacilityState bestSourceFacility = null;
                RecoveryPile bestSourcePile = null;
                FacilityState bestDestination = null;
                int bestCargo = 0;
                int bestPriority = int.MinValue;
                long bestCreatedMilliseconds = long.MaxValue;
                double bestDistanceSquared = double.MaxValue;

                for (int orderIndex = 0; orderIndex < world.TransportOrders.Count; orderIndex++)
                {
                    TransportOrder order = world.TransportOrders[orderIndex];
                    if (order.State == TransportOrderState.Completed || order.IsCancelled || order.RemainingUnassigned <= 0) continue;
                    FacilityState source = order.SourceRecoveryPileId == null ? world.FindFacility(order.SourceFacilityId) : null;
                    RecoveryPile sourcePile = order.SourceRecoveryPileId == null ? null : FindRecoveryPile(world, order.SourceRecoveryPileId);
                    FacilityState destination = world.FindFacility(order.DestinationFacilityId);
                    if (destination == null || destination.IsDemolishing || destination.IsDestroyed ||
                        (source == null && sourcePile == null) || (source != null && (source.IsDemolishing || source.IsDestroyed)) ||
                        !CanDroneServe(drone, source, sourcePile, destination, world.Definitions.ProductionHeight)) continue;

                    int cargo = Math.Min(world.Definitions.DroneCarryCapacity,
                        Math.Min(order.RemainingUnassigned,
                            Math.Min(source != null ? source.Inventory.GetAvailable(order.Item) : sourcePile.Inventory.GetAvailable(order.Item),
                                destination.Inventory.GetFreeCapacity(order.Item))));
                    if (cargo <= 0) continue;

                    double sourceX = source != null
                        ? source.Position.X + source.Width * 0.5d
                        : sourcePile.Position.X + 0.5d;
                    double sourceY = source != null
                        ? source.Position.Y + source.Height * 0.5d
                        : sourcePile.Position.Y + 0.5d;
                    double dx = drone.PositionX - sourceX;
                    double dy = drone.PositionY - sourceY;
                    double distanceSquared = (dx * dx) + (dy * dy);
                    int priority = destination.Priority;
                    if (bestOrder != null && (priority < bestPriority ||
                        (priority == bestPriority && order.CreatedMilliseconds > bestCreatedMilliseconds) ||
                        (priority == bestPriority && order.CreatedMilliseconds == bestCreatedMilliseconds &&
                         distanceSquared >= bestDistanceSquared))) continue;

                    bestOrder = order;
                    bestSourceFacility = source;
                    bestSourcePile = sourcePile;
                    bestDestination = destination;
                    bestCargo = cargo;
                    bestPriority = priority;
                    bestCreatedMilliseconds = order.CreatedMilliseconds;
                    bestDistanceSquared = distanceSquared;
                }

                if (bestOrder == null) continue;

                InventoryStore sourceInventory = bestSourceFacility != null
                    ? bestSourceFacility.Inventory
                    : bestSourcePile.Inventory;
                sourceInventory.AddReservation(bestOrder.Item, bestCargo);
                bestOrder.ReservedQuantity += bestCargo;
                bestOrder.State = TransportOrderState.InProgress;
                drone.IsAvailable = false;
                drone.ActiveTransportOrderId = bestOrder.Id;
                trips.Add(new Trip(bestOrder, drone, bestSourceFacility, bestSourcePile, bestDestination, bestCargo));
                world.Record(currentMilliseconds, "transport", bestOrder.Id + ":assigned:" + drone.Id + ":" + bestCargo);
            }
        }

        private static bool MoveToward(DroneState drone, double targetX, double targetY,
            int speedCellsPerSecond, long elapsedMilliseconds)
        {
            double dx = targetX - drone.PositionX;
            double dy = targetY - drone.PositionY;
            double distance = Math.Sqrt((dx * dx) + (dy * dy));
            double travel = speedCellsPerSecond * (elapsedMilliseconds / 1_000d);
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

        private static bool CanDroneServe(DroneState drone, FacilityState source, RecoveryPile sourcePile,
            FacilityState destination, int productionHeight)
        {
            bool sourceCombat = source != null
                ? IsCombatFacility(source, productionHeight)
                : sourcePile.Position.Y >= productionHeight;
            bool destinationCombat = IsCombatFacility(destination, productionHeight);
            if (drone.Region == DroneRegion.Production)
            {
                return !sourceCombat && !destinationCombat;
            }

            return (sourceCombat || (source != null && source.Kind == FacilityKind.Outpost)) &&
                   (destinationCombat || destination.Kind == FacilityKind.Outpost);
        }

        private static bool IsCombatFacility(FacilityState facility, int productionHeight) =>
            facility.Kind != FacilityKind.Outpost && facility.Position.Y >= productionHeight;

        private enum TripPhase
        {
            ToPickup,
            ToDestination,
            ReturningToSource
        }

        private sealed class Trip
        {
            public Trip(TransportOrder order, DroneState drone, FacilityState sourceFacility,
                RecoveryPile sourcePile, FacilityState destination, int reservedCargo)
            {
                Order = order;
                Drone = drone;
                SourceFacility = sourceFacility;
                SourcePile = sourcePile;
                SourceInventory = sourceFacility != null ? sourceFacility.Inventory : sourcePile.Inventory;
                SourceX = sourceFacility != null
                    ? sourceFacility.Position.X + sourceFacility.Width * 0.5d
                    : sourcePile.Position.X + 0.5d;
                SourceY = sourceFacility != null
                    ? sourceFacility.Position.Y + sourceFacility.Height * 0.5d
                    : sourcePile.Position.Y + 0.5d;
                Destination = destination;
                ReservedCargo = reservedCargo;
                Phase = TripPhase.ToPickup;
            }

            public TransportOrder Order { get; }
            public DroneState Drone { get; }
            public FacilityState SourceFacility { get; }
            public RecoveryPile SourcePile { get; }
            public InventoryStore SourceInventory { get; }
            public double SourceX { get; }
            public double SourceY { get; }
            public FacilityState Destination { get; }
            public FacilityState ReturnFacility { get; set; }
            public RecoveryPile ReturnPile { get; set; }
            public int ReservedCargo { get; set; }
            public int Cargo { get; set; }
            public TripPhase Phase { get; set; }
        }
    }
}
