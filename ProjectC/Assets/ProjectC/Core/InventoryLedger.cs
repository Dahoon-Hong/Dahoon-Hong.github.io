using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public sealed class InventoryStore
    {
        private readonly Dictionary<ItemId, int> stock = new Dictionary<ItemId, int>();
        private readonly Dictionary<ItemId, int> outboundReservations = new Dictionary<ItemId, int>();
        private readonly Dictionary<ItemId, int> expectedInbound = new Dictionary<ItemId, int>();
        private readonly Dictionary<ItemId, int> inTransit = new Dictionary<ItemId, int>();
        private readonly Dictionary<ItemId, int> capacities = new Dictionary<ItemId, int>();

        public InventoryStore(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) throw new ArgumentException("Store ID is required.", nameof(id));
            Id = id;
        }

        public string Id { get; }
        public int GetStock(ItemId item) => Get(stock, item);
        public int GetReserved(ItemId item) => Get(outboundReservations, item);
        public int GetExpectedInbound(ItemId item) => Get(expectedInbound, item);
        public int GetInTransit(ItemId item) => Get(inTransit, item);
        public int GetAvailable(ItemId item) => GetStock(item) - GetReserved(item);
        public bool HasCapacity(ItemId item) => capacities.ContainsKey(item);

        public void SetCapacity(ItemId item, int capacity)
        {
            if (capacity < 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            if (GetStock(item) > capacity) throw new InvalidOperationException("Capacity cannot be lower than current stock.");
            capacities[item] = capacity;
        }

        internal void ClearCapacity(ItemId item)
        {
            if (GetStock(item) > 0) throw new InvalidOperationException("Cannot clear capacity while stock remains.");
            capacities.Remove(item);
        }

        public int GetFreeCapacity(ItemId item)
        {
            return capacities.TryGetValue(item, out int capacity) ? capacity - GetStock(item) : int.MaxValue;
        }

        public int GetCapacity(ItemId item) => capacities.TryGetValue(item, out int capacity) ? capacity : int.MaxValue;

        public bool TryAdd(ItemId item, int quantity)
        {
            if (quantity <= 0 || GetFreeCapacity(item) < quantity) return false;
            stock[item] = checked(GetStock(item) + quantity);
            return true;
        }

        public bool TryRemove(ItemId item, int quantity)
        {
            if (quantity <= 0 || GetAvailable(item) < quantity) return false;
            stock[item] = GetStock(item) - quantity;
            return true;
        }

        internal bool TryRemoveReservedStock(ItemId item, int quantity)
        {
            if (quantity <= 0 || GetReserved(item) < quantity || GetStock(item) < quantity) return false;
            stock[item] = GetStock(item) - quantity;
            return true;
        }

        internal void AddReservation(ItemId item, int quantity)
        {
            outboundReservations[item] = checked(GetReserved(item) + quantity);
        }

        internal void RemoveReservation(ItemId item, int quantity)
        {
            int reserved = GetReserved(item);
            if (quantity < 0 || reserved < quantity) throw new InvalidOperationException("Reservation underflow.");
            outboundReservations[item] = reserved - quantity;
        }

        internal void AddExpectedInbound(ItemId item, int quantity)
        {
            expectedInbound[item] = checked(GetExpectedInbound(item) + quantity);
        }

        internal void RemoveExpectedInbound(ItemId item, int quantity)
        {
            int expected = GetExpectedInbound(item);
            if (quantity < 0 || expected < quantity) throw new InvalidOperationException("Inbound estimate underflow.");
            expectedInbound[item] = expected - quantity;
        }

        internal void SetInTransit(ItemId item, int quantity)
        {
            if (quantity < 0) throw new ArgumentOutOfRangeException(nameof(quantity));
            inTransit[item] = quantity;
        }

        internal void AddInTransit(ItemId item, int quantity)
        {
            if (quantity < 0) throw new ArgumentOutOfRangeException(nameof(quantity));
            inTransit[item] = checked(GetInTransit(item) + quantity);
        }

        internal void RemoveInTransit(ItemId item, int quantity)
        {
            if (quantity < 0 || GetInTransit(item) < quantity) throw new InvalidOperationException("In-transit quantity underflow.");
            inTransit[item] = GetInTransit(item) - quantity;
        }

        private static int Get(Dictionary<ItemId, int> values, ItemId item) =>
            values.TryGetValue(item, out int quantity) ? quantity : 0;
    }

    public readonly struct TransferResult
    {
        public TransferResult(bool succeeded, int moved, string reason)
        {
            Succeeded = succeeded;
            Moved = moved;
            Reason = reason;
        }

        public bool Succeeded { get; }
        public int Moved { get; }
        public string Reason { get; }
    }

    /// <summary>Owns stock transfers and makes each committed transaction idempotent.</summary>
    public sealed class InventoryLedger
    {
        private readonly Dictionary<string, TransferResult> completedTransfers = new Dictionary<string, TransferResult>();
        private readonly Dictionary<string, bool> completedCrafts = new Dictionary<string, bool>();
        private readonly Dictionary<string, Reservation> reservations = new Dictionary<string, Reservation>();

        public bool TryReserve(string reservationId, InventoryStore source, ItemId item, int quantity)
        {
            if (string.IsNullOrWhiteSpace(reservationId)) throw new ArgumentException("Reservation ID is required.", nameof(reservationId));
            if (source == null) throw new ArgumentNullException(nameof(source));
            if (quantity <= 0 || source.GetAvailable(item) < quantity || reservations.ContainsKey(reservationId)) return false;

            source.AddReservation(item, quantity);
            reservations.Add(reservationId, new Reservation(source, item, quantity));
            return true;
        }

        public TransferResult CommitTransfer(string transactionId, string reservationId, InventoryStore destination)
        {
            if (string.IsNullOrWhiteSpace(transactionId)) throw new ArgumentException("Transaction ID is required.", nameof(transactionId));
            if (destination == null) throw new ArgumentNullException(nameof(destination));
            if (completedTransfers.TryGetValue(transactionId, out TransferResult previous)) return previous;
            if (!reservations.TryGetValue(reservationId, out Reservation reservation))
            {
                return Remember(transactionId, new TransferResult(false, 0, "reservation-not-found"));
            }

            int moved = Math.Min(reservation.Quantity, destination.GetFreeCapacity(reservation.Item));
            if (moved <= 0)
            {
                Release(reservationId, reservation);
                return Remember(transactionId, new TransferResult(false, 0, "destination-full"));
            }

            if (!reservation.Source.TryRemoveReservedStock(reservation.Item, moved))
            {
                Release(reservationId, reservation);
                return Remember(transactionId, new TransferResult(false, 0, "source-stock-changed"));
            }

            if (!destination.TryAdd(reservation.Item, moved))
            {
                // A failed destination add is not expected after the capacity check; restore the source atomically.
                reservation.Source.TryAdd(reservation.Item, moved);
                Release(reservationId, reservation);
                return Remember(transactionId, new TransferResult(false, 0, "destination-capacity-changed"));
            }

            Release(reservationId, reservation);
            return Remember(transactionId, new TransferResult(true, moved, moved == reservation.Quantity ? string.Empty : "partial-capacity"));
        }

        /// <summary>Moves part of a reservation while retaining the untransferred amount for later ticks.</summary>
        public TransferResult CommitTransferChunk(string transactionId, string reservationId, InventoryStore destination, int requestedQuantity)
        {
            if (string.IsNullOrWhiteSpace(transactionId)) throw new ArgumentException("Transaction ID is required.", nameof(transactionId));
            if (destination == null) throw new ArgumentNullException(nameof(destination));
            if (requestedQuantity <= 0) throw new ArgumentOutOfRangeException(nameof(requestedQuantity));
            if (completedTransfers.TryGetValue(transactionId, out TransferResult previous)) return previous;
            if (!reservations.TryGetValue(reservationId, out Reservation reservation))
                return Remember(transactionId, new TransferResult(false, 0, "reservation-not-found"));

            int moved = Math.Min(Math.Min(reservation.Quantity, requestedQuantity), destination.GetFreeCapacity(reservation.Item));
            if (moved <= 0) return Remember(transactionId, new TransferResult(false, 0, "destination-full"));
            if (!reservation.Source.TryRemoveReservedStock(reservation.Item, moved))
            {
                Release(reservationId, reservation);
                return Remember(transactionId, new TransferResult(false, 0, "source-stock-changed"));
            }

            if (!destination.TryAdd(reservation.Item, moved))
            {
                reservation.Source.TryAdd(reservation.Item, moved);
                Release(reservationId, reservation);
                return Remember(transactionId, new TransferResult(false, 0, "destination-capacity-changed"));
            }

            reservation.Source.RemoveReservation(reservation.Item, moved);
            reservation.Quantity -= moved;
            if (reservation.Quantity == 0) reservations.Remove(reservationId);
            return Remember(transactionId, new TransferResult(true, moved, reservation.Quantity == 0 ? string.Empty : "reservation-remains"));
        }

        public bool CancelReservation(string reservationId)
        {
            if (!reservations.TryGetValue(reservationId, out Reservation reservation)) return false;
            Release(reservationId, reservation);
            return true;
        }

        public bool CommitCrafting(string transactionId, string reservationId, InventoryStore outputStore, ItemId outputItem, int outputQuantity)
        {
            if (string.IsNullOrWhiteSpace(transactionId)) throw new ArgumentException("Transaction ID is required.", nameof(transactionId));
            if (outputStore == null) throw new ArgumentNullException(nameof(outputStore));
            if (outputQuantity <= 0) throw new ArgumentOutOfRangeException(nameof(outputQuantity));
            if (completedCrafts.TryGetValue(transactionId, out bool completed)) return completed;
            if (!reservations.TryGetValue(reservationId, out Reservation reservation)) return false;
            if (outputStore.GetFreeCapacity(outputItem) < outputQuantity) return false;

            if (!reservation.Source.TryRemoveReservedStock(reservation.Item, reservation.Quantity))
            {
                Release(reservationId, reservation);
                completedCrafts.Add(transactionId, false);
                return false;
            }

            if (!outputStore.TryAdd(outputItem, outputQuantity))
            {
                // Input and output commit as one operation. Restore the input if output space changed.
                reservation.Source.TryAdd(reservation.Item, reservation.Quantity);
                Release(reservationId, reservation);
                completedCrafts.Add(transactionId, false);
                return false;
            }

            Release(reservationId, reservation);
            completedCrafts.Add(transactionId, true);
            return true;
        }

        private void Release(string reservationId, Reservation reservation)
        {
            reservation.Source.RemoveReservation(reservation.Item, reservation.Quantity);
            reservations.Remove(reservationId);
        }

        private TransferResult Remember(string id, TransferResult result)
        {
            completedTransfers.Add(id, result);
            return result;
        }

        private sealed class Reservation
        {
            public Reservation(InventoryStore source, ItemId item, int quantity)
            {
                Source = source;
                Item = item;
                Quantity = quantity;
            }

            public InventoryStore Source { get; }
            public ItemId Item { get; }
            public int Quantity { get; set; }
        }
    }
}
