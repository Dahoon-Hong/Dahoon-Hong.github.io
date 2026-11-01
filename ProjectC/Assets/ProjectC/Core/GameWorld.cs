using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public enum DroneRegion
    {
        Production,
        Combat
    }

    public readonly struct GridPosition : IEquatable<GridPosition>
    {
        public GridPosition(int x, int y)
        {
            X = x;
            Y = y;
        }

        public int X { get; }
        public int Y { get; }
        public bool Equals(GridPosition other) => X == other.X && Y == other.Y;
        public override bool Equals(object obj) => obj is GridPosition other && Equals(other);
        public override int GetHashCode() => (X * 397) ^ Y;
    }

    public sealed class FacilityState
    {
        private readonly Dictionary<ItemId, int> restockTargets = new Dictionary<ItemId, int>();

        public FacilityState(string id, FacilityKind kind, GridPosition position, InventoryStore inventory,
            int maximumHealth = 0, int width = 1, int height = 1, int rotationDegrees = 0)
        {
            if (string.IsNullOrWhiteSpace(id)) throw new ArgumentException("Facility ID is required.", nameof(id));
            Id = id;
            Kind = kind;
            Position = position;
            Inventory = inventory ?? throw new ArgumentNullException(nameof(inventory));
            MaximumHealth = maximumHealth;
            Health = maximumHealth;
            Width = width;
            Height = height;
            RotationDegrees = rotationDegrees;
        }

        public string Id { get; }
        public FacilityKind Kind { get; }
        public GridPosition Position { get; }
        public InventoryStore Inventory { get; }
        public int MaximumHealth { get; }
        public int Width { get; }
        public int Height { get; }
        public int RotationDegrees { get; }
        public int Health { get; private set; }
        public bool IsDestroyed => MaximumHealth > 0 && Health <= 0;
        public bool IsUnderConstruction { get; set; }
        public bool IsConstructionStarted { get; set; }
        public bool IsDemolishing { get; internal set; }
        public int Priority { get; private set; } = 3;
        public int GetRestockTarget(ItemId item) => restockTargets.TryGetValue(item, out int target) ? target : 0;

        public void SetPriority(int priority)
        {
            if (priority < 1 || priority > 5) throw new ArgumentOutOfRangeException(nameof(priority));
            Priority = priority;
        }

        internal void SetRestockTarget(ItemId item, int target)
        {
            if (target < 0) throw new ArgumentOutOfRangeException(nameof(target));
            restockTargets[item] = target;
        }

        public void ApplyDamage(int amount)
        {
            if (amount <= 0 || MaximumHealth == 0 || IsDestroyed) return;
            Health = Math.Max(0, Health - amount);
        }

        public void Repair(int amount)
        {
            if (amount <= 0 || MaximumHealth == 0 || IsDestroyed) return;
            Health = Math.Min(MaximumHealth, Health + amount);
        }
    }

    public sealed class DroneState
    {
        public DroneState(string id, DroneRegion region, double positionX = 0d, double positionY = 0d)
        {
            Id = id ?? throw new ArgumentNullException(nameof(id));
            Region = region;
            PositionX = positionX;
            PositionY = positionY;
        }

        public string Id { get; }
        public DroneRegion Region { get; }
        public GridPosition? Position { get; set; }
        public double PositionX { get; internal set; }
        public double PositionY { get; internal set; }
        public bool IsAvailable { get; internal set; } = true;
        public string ActiveTransportOrderId { get; internal set; }
        public string ActiveConstructionSiteId { get; internal set; }
        public string ActiveDemolitionFacilityId { get; internal set; }
    }

    public enum ImportShipPhase
    {
        Waiting,
        Docked,
        Departed
    }

    public sealed class ImportShipState
    {
        internal ImportShipState(string id, string orderId, long arrivalMilliseconds, int paidIron,
            int exportContractQuantity, int shipCapacity, bool oneOff, int droneCount = 0)
        {
            if (paidIron < 0 || droneCount < 0 || paidIron + (droneCount * 100) > shipCapacity)
                throw new ArgumentOutOfRangeException(nameof(paidIron), "Import cargo must fit within the ship's capacity.");
            Id = id;
            OrderId = orderId;
            ArrivalMilliseconds = arrivalMilliseconds;
            PaidIron = paidIron;
            RemainingIron = paidIron;
            ExportContractQuantity = exportContractQuantity;
            OneOff = oneOff;
            DroneCount = droneCount;
            Phase = ImportShipPhase.Waiting;
            Cargo = new InventoryStore("ship." + id + ".cargo");
            Cargo.SetCapacity(ItemId.Crystal, shipCapacity - paidIron - (droneCount * 100));
        }

        public string Id { get; }
        public string OrderId { get; }
        public long ArrivalMilliseconds { get; }
        public int PaidIron { get; }
        public int RemainingIron { get; internal set; }
        public int EligibleIronToUnload { get; internal set; }
        public int UnloadedIron { get; internal set; }
        public int ExportContractQuantity { get; }
        public int EligibleCrystalToLoad { get; internal set; }
        public int LoadedCrystal => Cargo.GetStock(ItemId.Crystal);
        public bool ExportLoadStarted { get; internal set; }
        public string ExportReservationId { get; internal set; }
        public InventoryStore Cargo { get; }
        public long DockedAtMilliseconds { get; internal set; }
        public bool OneOff { get; }
        public int DroneCount { get; }
        public bool DronesDelivered { get; internal set; }
        public ImportShipPhase Phase { get; internal set; }
    }

    public sealed class GameWorld
    {
        internal GameWorld(GameDefinitions definitions)
        {
            Definitions = definitions ?? throw new ArgumentNullException(nameof(definitions));
            Funds = new FundsLedger(Definitions.StartingFunds);
            Facilities = new List<FacilityState>();
            Drones = new List<DroneState>();
            ImportShips = new List<ImportShipState>();
            Events = new List<SimulationEvent>();
            ConstructionSites = new List<ConstructionSite>();
            RecoveryPiles = new List<RecoveryPile>();
            RegularImportContractQuantity = Definitions.FirstIronOrder;
            RegularExportContractQuantity = Definitions.RegularExportOrderQuantity;
        }

        public FundsLedger Funds { get; }
        public GameDefinitions Definitions { get; }
        public InventoryLedger InventoryLedger { get; } = new InventoryLedger();
        public List<FacilityState> Facilities { get; }
        public List<DroneState> Drones { get; }
        public List<TransportOrder> TransportOrders { get; } = new List<TransportOrder>();
        public List<EnemyState> Enemies { get; } = new List<EnemyState>();
        public List<ImportShipState> ImportShips { get; }
        public List<SimulationEvent> Events { get; }
        public List<ConstructionSite> ConstructionSites { get; }
        public List<RecoveryPile> RecoveryPiles { get; }
        public int RegularImportContractQuantity { get; internal set; }
        public int RegularExportContractQuantity { get; internal set; }
        public int ExportedCrystals { get; internal set; }
        public int EnemiesDefeated { get; internal set; }
        public int HighestWaveReached { get; internal set; }
        public int GoalCompletionRatePercent => Math.Min(100, (int)((long)ExportedCrystals * 100 / Definitions.ExportGoal));
        public MatchOutcome Outcome { get; internal set; } = MatchOutcome.Running;

        private int nextRecoveryPileNumber = 1;

        internal RecoveryPile GetOrCreateRecoveryPile(GridPosition position)
        {
            for (int i = 0; i < RecoveryPiles.Count; i++)
                if (RecoveryPiles[i].Position.Equals(position)) return RecoveryPiles[i];

            string id = "recovery-pile-" + nextRecoveryPileNumber++;
            var pile = new RecoveryPile(id, position, new InventoryStore(id + ".inventory"));
            RecoveryPiles.Add(pile);
            return pile;
        }

        public FacilityState FindFacility(string id)
        {
            for (int i = 0; i < Facilities.Count; i++)
            {
                if (Facilities[i].Id == id) return Facilities[i];
            }

            return null;
        }

        public FacilityState FindFacility(FacilityKind kind)
        {
            for (int i = 0; i < Facilities.Count; i++)
            {
                if (Facilities[i].Kind == kind) return Facilities[i];
            }

            return null;
        }

        internal void Record(long timeMilliseconds, string category, string detail)
        {
            Events.Add(new SimulationEvent(timeMilliseconds, category, detail));
        }
    }

    public sealed class SimulationEvent
    {
        internal SimulationEvent(long timeMilliseconds, string category, string detail)
        {
            TimeMilliseconds = timeMilliseconds;
            Category = category;
            Detail = detail;
        }

        public long TimeMilliseconds { get; }
        public string Category { get; }
        public string Detail { get; }
    }
}
