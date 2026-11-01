using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    /// <summary>Headless owner of match time, opening economy, and authoritative world state.</summary>
    public sealed class GameSimulation
    {
        public const int SimulationStepMilliseconds = 50;

        private readonly List<ImportShipState> waitingImportShips = new List<ImportShipState>();
        private readonly System.Collections.ObjectModel.ReadOnlyCollection<ImportShipState> pendingImportShipsView;
        private long processedMilliseconds;
        private long nextRegularOrderConfirmationMilliseconds;
        private long nextSubsidyMilliseconds;
        private int nextPeriodicOrderNumber = 2;
        private int nextOneOffOrderNumber = 1;
        private ImportShipState dockedImportShip;
        private int unloadingRateRemainder;
        private int loadingRateRemainder;
        private int nextShipTransferNumber;

        private GameSimulation(GameDefinitions definitions)
        {
            definitions.Validate();
            World = new GameWorld(definitions);
            Clock = new SimulationClock();
            Production = new ProductionSystem();
            Construction = new ConstructionSystem();
            Transport = new TransportSystem();
            Conveyors = new ConveyorSystem();
            Repairs = new RepairSystem();
            Demolitions = new DemolitionSystem();
            Mining = new MiningSystem();
            Combat = new WaveCombatSystem();
            pendingImportShipsView = waitingImportShips.AsReadOnly();
            nextRegularOrderConfirmationMilliseconds = definitions.ImportShipIntervalMilliseconds - definitions.ImportOrderLeadMilliseconds;
            nextSubsidyMilliseconds = definitions.SubsidyIntervalMilliseconds;
            CreateStartingFacilities();
            CreateStartingDrones();
            StartOpeningImport();
            ProcessEventsAtCurrentTime();
        }

        public SimulationClock Clock { get; }
        public GameWorld World { get; }
        public ProductionSystem Production { get; }
        public ConstructionSystem Construction { get; }
        public TransportSystem Transport { get; }
        public ConveyorSystem Conveyors { get; }
        public RepairSystem Repairs { get; }
        public DemolitionSystem Demolitions { get; }
        public MiningSystem Mining { get; }
        public WaveCombatSystem Combat { get; }
        public long CurrentMilliseconds => processedMilliseconds;
        public System.Collections.Generic.IReadOnlyList<ImportShipState> PendingImportShips => pendingImportShipsView;
        public int AvailableDronePurchaseCount => Math.Max(0, World.Definitions.MaximumDroneCount -
            World.Drones.Count - GetPendingDroneCount());

        public TransportOrder QueueTransfer(string sourceFacilityId, string destinationFacilityId, ItemId item, int quantity)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            return Transport.QueueTransfer(World, sourceFacilityId, destinationFacilityId, item, quantity, processedMilliseconds);
        }

        public bool TryPlaceFacility(FacilityKind kind, GridPosition position, int rotationDegrees,
            out FacilityState facility, out string reason)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            return Construction.TryPlaceFacility(World, kind, position, rotationDegrees,
                processedMilliseconds, out facility, out reason);
        }

        public bool TryConnectConveyorPath(string sourceFacilityId, System.Collections.Generic.IList<GridPosition> cells,
            string destinationFacilityId, out ConveyorPathState path, out string reason)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            return Conveyors.TryConnectPath(World, sourceFacilityId, cells, destinationFacilityId,
                processedMilliseconds, out path, out reason);
        }

        /// <summary>Validates and places all belt tiles before linking the path; invalid paths leave no sites or events.</summary>
        public bool TryPlaceConveyorPath(string sourceFacilityId, System.Collections.Generic.IList<GridPosition> cells,
            string destinationFacilityId, out ConveyorPathState path, out string reason)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            path = null;
            if (!Conveyors.CanConnectPlannedPath(World, sourceFacilityId, cells, destinationFacilityId, out reason))
                return false;
            if (!Construction.TryPlaceConveyorPath(World, cells, processedMilliseconds,
                out _, out reason)) return false;

            if (!Conveyors.TryConnectPath(World, sourceFacilityId, cells, destinationFacilityId,
                processedMilliseconds, out path, out reason))
                throw new InvalidOperationException("A prevalidated conveyor route changed during placement: " + reason);
            return true;
        }

        public bool SetConveyorOutputFilter(string pathId, IEnumerable<ItemId> allowedItems)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            return Conveyors.SetSplitterOutputFilter(World, pathId, allowedItems, processedMilliseconds);
        }

        public bool ReverseConveyorDirection(string facilityId)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            return Conveyors.ReverseDirection(World, facilityId, processedMilliseconds);
        }

        public bool RequestRepair(string facilityId)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            FacilityState facility = World.FindFacility(facilityId);
            if (facility == null || facility.IsDemolishing) return false;
            return Repairs.Request(World, facilityId, processedMilliseconds);
        }

        public bool CancelRepair(string facilityId)
        {
            return Repairs.Cancel(World, facilityId, processedMilliseconds);
        }

        public bool RequestDemolition(string facilityId)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            FacilityState facility = World.FindFacility(facilityId);
            if (facility == null) return false;
            if (facility.IsUnderConstruction)
                return Construction.Cancel(World, facilityId, processedMilliseconds, Transport);
            if (Demolitions.GetTask(facilityId) != null) return true;
            if (!Demolitions.CanRequest(World, facilityId)) return false;
            if (Repairs.GetTask(facilityId) != null) Repairs.Cancel(World, facilityId, processedMilliseconds);
            return Demolitions.Request(World, facilityId, processedMilliseconds, Transport);
        }

        public bool CancelDemolition(string facilityId)
        {
            return Demolitions.Cancel(World, facilityId, processedMilliseconds, Transport);
        }

        public bool CancelConstruction(string facilityId)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            return Construction.Cancel(World, facilityId, processedMilliseconds, Transport);
        }

        public void SetFacilityPriority(string facilityId, int priority)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            FacilityState facility = World.FindFacility(facilityId);
            if (facility == null) throw new ArgumentException("Facility does not exist.", nameof(facilityId));
            facility.SetPriority(priority);
            Record("priority", facility.Id + ":" + priority);
        }

        public void SetRestockTarget(string facilityId, ItemId item, int quantity)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            FacilityState facility = World.FindFacility(facilityId);
            if (facility == null) throw new ArgumentException("Facility does not exist.", nameof(facilityId));
            if (quantity < 0 || quantity > facility.Inventory.GetCapacity(item))
                throw new ArgumentOutOfRangeException(nameof(quantity), "The restock target must fit the facility's capacity.");
            facility.SetRestockTarget(item, quantity);
            Record("supply", facility.Id + ":target:" + item + ":" + quantity);
        }

        public void SetRegularImportContractQuantity(int quantity)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            ValidateContractQuantity(quantity);
            World.RegularImportContractQuantity = quantity;
            Record("contract", "regular-import:" + quantity);
        }

        public void SetRegularExportContractQuantity(int quantity)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            ValidateContractQuantity(quantity);
            World.RegularExportContractQuantity = quantity;
            Record("contract", "regular-export:" + quantity);
        }

        /// <summary>Confirms an irreversible one-off import order and prepays its iron and drone cargo.</summary>
        public ImportShipState PlaceOneOffOrder(int ironQuantity, int droneCount, int exportQuantity = 0)
        {
            if (World.Outcome != MatchOutcome.Running) throw new InvalidOperationException("The match has ended.");
            if (ironQuantity < 0) throw new ArgumentOutOfRangeException(nameof(ironQuantity));
            if (droneCount < 0) throw new ArgumentOutOfRangeException(nameof(droneCount));
            ValidateContractQuantity(exportQuantity);

            int cargoUsed = checked(ironQuantity + (droneCount * 100));
            if (cargoUsed == 0) throw new InvalidOperationException("A one-off order must include iron or at least one drone.");
            if (cargoUsed > World.Definitions.ShipCargoCapacity)
                throw new InvalidOperationException("The order exceeds the ship's cargo capacity.");
            if (droneCount > AvailableDronePurchaseCount)
                throw new InvalidOperationException("The order exceeds the available drone limit of " +
                    World.Definitions.MaximumDroneCount + ".");

            int totalCost = checked(ironQuantity * World.Definitions.IronUnitPrice +
                                    droneCount * World.Definitions.DroneUnitPrice);
            string orderId = "one-off-import-" + nextOneOffOrderNumber++;
            if (!World.Funds.TryPrepay(orderId, totalCost))
                throw new InvalidOperationException("Available funds cannot cover the complete one-off order.");

            var ship = new ImportShipState("ship-" + orderId, orderId,
                checked(processedMilliseconds + 60_000), ironQuantity, exportQuantity,
                World.Definitions.ShipCargoCapacity, true, droneCount);
            waitingImportShips.Add(ship);
            Record("order", orderId + ":confirmed:iron:" + ironQuantity + ":drones:" + droneCount +
                ":export:" + exportQuantity + ":prepaid:" + totalCost);
            return ship;
        }

        public static GameSimulation CreateNewMatch()
        {
            return CreateNewMatch(GameDefinitions.CreateDefault());
        }

        public static GameSimulation CreateNewMatch(GameDefinitions definitions)
        {
            if (definitions == null) throw new ArgumentNullException(nameof(definitions));
            return new GameSimulation(definitions);
        }

        public long AdvanceRealSeconds(double realSeconds)
        {
            if (World.Outcome != MatchOutcome.Running) return 0;
            long elapsed = Clock.AdvanceRealSeconds(realSeconds);
            if (elapsed > 0) ProcessUntil(Clock.Milliseconds);
            return elapsed;
        }

        /// <summary>Deterministic time control for headless scenarios and development diagnostics.</summary>
        public void AdvanceGameMilliseconds(long milliseconds)
        {
            if (milliseconds < 0) throw new ArgumentOutOfRangeException(nameof(milliseconds));
            if (World.Outcome != MatchOutcome.Running || milliseconds == 0) return;
            Clock.AdvanceGameMilliseconds(milliseconds);
            ProcessUntil(Clock.Milliseconds);
        }

        public void DamageFacility(string facilityId, int amount)
        {
            FacilityState facility = World.FindFacility(facilityId);
            if (facility == null) throw new ArgumentException("Facility does not exist.", nameof(facilityId));
            facility.ApplyDamage(amount);
            if (facility.Kind == FacilityKind.Outpost && facility.IsDestroyed && World.Outcome == MatchOutcome.Running)
            {
                World.Outcome = MatchOutcome.Defeat;
                Record("match", "outpost-destroyed");
            }
        }

        private void CreateStartingFacilities()
        {
            for (int i = 0; i < World.Definitions.StartingFacilities.Length; i++)
            {
                FacilityDefinitionData data = World.Definitions.StartingFacilities[i];
                var inventory = new InventoryStore("facility." + data.Id + ".inventory");
                if (data.Capacities != null)
                {
                    for (int j = 0; j < data.Capacities.Length; j++)
                    {
                        ItemQuantityData capacity = data.Capacities[j];
                        inventory.SetCapacity(GameDefinitions.ParseItem(capacity.Item), capacity.Quantity);
                    }
                }

                if (data.StartingStock != null)
                {
                    for (int j = 0; j < data.StartingStock.Length; j++)
                    {
                        ItemQuantityData stock = data.StartingStock[j];
                        if (!inventory.TryAdd(GameDefinitions.ParseItem(stock.Item), stock.Quantity))
                            throw new InvalidOperationException("Starting stock exceeds capacity for " + data.Id + ".");
                    }
                }

                FacilityKind kind = GameDefinitions.ParseFacilityKind(data.Kind);
                var facility = new FacilityState(data.Id, kind, new GridPosition(data.X, data.Y),
                    inventory, data.MaximumHealth, data.Width, data.Height);
                CopyRestockTargets(World.Definitions.FindBuildableFacility(kind), facility);
                World.Facilities.Add(facility);
            }
        }

        private void CreateStartingDrones()
        {
            FacilityState outpost = World.FindFacility(FacilityKind.Outpost);
            FacilityState turret = World.FindFacility(FacilityKind.Turret);
            // Drone starting anchors are provisional because the source snapshot does not fix their exact tiles.
            for (int i = 0; i < World.Definitions.StartingProductionDrones; i++)
                World.Drones.Add(new DroneState("drone-production-" + (i + 1), DroneRegion.Production,
                    outpost.Position.X, outpost.Position.Y));
            for (int i = 0; i < World.Definitions.StartingCombatDrones; i++)
                World.Drones.Add(new DroneState("drone-combat-" + (i + 1), DroneRegion.Combat,
                    turret.Position.X, turret.Position.Y));
        }

        internal static void CopyRestockTargets(FacilityDefinitionData definition, FacilityState facility)
        {
            if (definition == null || definition.RestockTargets == null) return;
            for (int i = 0; i < definition.RestockTargets.Length; i++)
            {
                ItemQuantityData target = definition.RestockTargets[i];
                facility.SetRestockTarget(GameDefinitions.ParseItem(target.Item), target.Quantity);
            }
        }

        private void ProcessUntil(long targetMilliseconds)
        {
            if (targetMilliseconds < processedMilliseconds) throw new InvalidOperationException("Simulation time cannot move backwards.");

            while (processedMilliseconds < targetMilliseconds && World.Outcome == MatchOutcome.Running)
            {
                int step = (int)Math.Min(SimulationStepMilliseconds, targetMilliseconds - processedMilliseconds);
                processedMilliseconds += step;
                ProcessEventsAtCurrentTime();
                if (World.Outcome != MatchOutcome.Running) break;
                Production.Tick(World, processedMilliseconds, step);
                Mining.Tick(World, processedMilliseconds, step);
                Construction.QueueMissingMaterials(World, processedMilliseconds, Transport);
                Repairs.QueueMissingMaterials(World, processedMilliseconds, Transport);
                Transport.Tick(World, processedMilliseconds, step);
                Conveyors.Tick(World, processedMilliseconds, step);
                Construction.Tick(World, processedMilliseconds, step);
                Combat.Tick(World, processedMilliseconds, step);
                Construction.RemoveDestroyedSites(World, processedMilliseconds, Transport);
                Demolitions.Tick(World, processedMilliseconds, step, Transport, Production, Mining, Combat);
                Repairs.Tick(World, processedMilliseconds, step);
                // Combat resolves before departure so a same-time outpost loss takes precedence over export victory.
                ProcessDockedImport(step);

                if (World.Outcome == MatchOutcome.Running && processedMilliseconds >= World.Definitions.MatchDeadlineMilliseconds)
                {
                    FacilityState outpost = World.FindFacility(FacilityKind.Outpost);
                    World.Outcome = MatchRules.Resolve(processedMilliseconds, World.ExportedCrystals,
                        outpost == null || outpost.IsDestroyed, World.Definitions);
                    if (World.Outcome == MatchOutcome.Defeat) Record("match", "deadline-or-outpost-loss");
                }
            }

            if (processedMilliseconds < targetMilliseconds) Clock.ClampToGameMilliseconds(processedMilliseconds);
        }

        private void StartOpeningImport()
        {
            int prepaid = checked(World.Definitions.FirstIronOrder * World.Definitions.IronUnitPrice);
            if (!World.Funds.TryPrepay("periodic-import-1", prepaid))
                throw new InvalidOperationException("Starting funds cannot cover the confirmed opening iron order.");

            waitingImportShips.Add(new ImportShipState("ship-import-1", "periodic-import-1", 0,
                World.Definitions.FirstIronOrder, World.RegularExportContractQuantity,
                World.Definitions.ShipCargoCapacity, false));
            Record("order", "periodic-import-1:prepaid:" + World.Definitions.FirstIronOrder);
        }

        private void ProcessEventsAtCurrentTime()
        {
            // If events share a timestamp, the source explicitly places support before affordability checks.
            if (processedMilliseconds == nextSubsidyMilliseconds)
            {
                int subsidy = World.Definitions.GetSubsidyAmount(World.ExportedCrystals);
                World.Funds.Credit("subsidy:" + nextSubsidyMilliseconds, subsidy);
                Record("economy", "subsidy:" + subsidy);
                nextSubsidyMilliseconds += World.Definitions.SubsidyIntervalMilliseconds;
            }

            if (processedMilliseconds == nextRegularOrderConfirmationMilliseconds)
            {
                string orderId = "periodic-import-" + nextPeriodicOrderNumber++;
                int quantity = World.RegularImportContractQuantity;
                int prepaid = checked(quantity * World.Definitions.IronUnitPrice);
                if (World.Funds.TryPrepay(orderId, prepaid))
                {
                    long arrival = nextRegularOrderConfirmationMilliseconds + World.Definitions.ImportOrderLeadMilliseconds;
                    waitingImportShips.Add(new ImportShipState("ship-" + orderId, orderId, arrival,
                        quantity, World.RegularExportContractQuantity, World.Definitions.ShipCargoCapacity, false));
                    Record("order", orderId + ":prepaid:" + quantity);
                }
                else
                {
                    Record("order", orderId + ":confirmation-failed:insufficient-funds");
                }

                nextRegularOrderConfirmationMilliseconds += World.Definitions.ImportShipIntervalMilliseconds;
            }

            for (int i = waitingImportShips.Count - 1; i >= 0; i--)
            {
                ImportShipState ship = waitingImportShips[i];
                if (ship.ArrivalMilliseconds > processedMilliseconds) continue;
                waitingImportShips.RemoveAt(i);
                ship.Phase = ImportShipPhase.Waiting;
                World.ImportShips.Add(ship);
            }

            if (dockedImportShip == null)
            {
                ImportShipState next = FindNextWaitingShip();
                if (next != null) Dock(next);
            }
        }

        private void ProcessDockedImport(int elapsedMilliseconds)
        {
            if (dockedImportShip == null) return;

            ImportShipState ship = dockedImportShip;
            InventoryStore port = World.FindFacility(FacilityKind.Port).Inventory;
            if (!ship.ExportLoadStarted && (ship.RemainingIron == 0 || ship.UnloadedIron >= ship.EligibleIronToUnload))
            {
                BeginExportLoading(ship, port);
                return;
            }

            if (!ship.ExportLoadStarted && ship.RemainingIron > 0 && ship.UnloadedIron < ship.EligibleIronToUnload)
            {
                int rateUnits = checked((World.Definitions.IronUnloadRatePerSecond * elapsedMilliseconds) + unloadingRateRemainder);
                int units = rateUnits / 1_000;
                unloadingRateRemainder = rateUnits % 1_000;
                int available = Math.Max(0, ship.EligibleIronToUnload - ship.UnloadedIron);
                int unload = Math.Min(Math.Min(units, ship.RemainingIron), available);
                if (unload > 0 && port.TryAdd(ItemId.Iron, unload))
                {
                    ship.RemainingIron -= unload;
                    ship.UnloadedIron += unload;
                    ship.Cargo.SetCapacity(ItemId.Crystal, World.Definitions.ShipCargoCapacity - ship.RemainingIron);
                    Record("ship", ship.Id + ":unloaded:" + unload);
                }
                else if (available > 0)
                {
                    // A full port stops this batch. The ship can continue to its export stage with unused iron aboard.
                    ship.EligibleIronToUnload = ship.UnloadedIron;
                }

                if (ship.RemainingIron == 0 || ship.UnloadedIron >= ship.EligibleIronToUnload)
                {
                    BeginExportLoading(ship, port);
                    unloadingRateRemainder = 0;
                    return;
                }
            }

            bool timeExpired = processedMilliseconds - ship.DockedAtMilliseconds >= World.Definitions.ShipDockLimitMilliseconds;
            if (timeExpired)
            {
                DepartShip(ship, "dock-limit");
                return;
            }

            if (!ship.ExportLoadStarted) return;

            int loadRateUnits = checked((World.Definitions.CrystalLoadRatePerSecond * elapsedMilliseconds) + loadingRateRemainder);
            int loadUnits = loadRateUnits / 1_000;
            loadingRateRemainder = loadRateUnits % 1_000;
            int remainingToLoad = Math.Max(0, ship.EligibleCrystalToLoad - ship.LoadedCrystal);
            int load = Math.Min(loadUnits, remainingToLoad);
            if (load > 0)
            {
                string transactionId = ship.Id + ":load:" + nextShipTransferNumber++;
                TransferResult transfer = World.InventoryLedger.CommitTransferChunk(transactionId,
                    ship.ExportReservationId, ship.Cargo, load);
                if (transfer.Succeeded) Record("ship", ship.Id + ":loaded-crystal:" + transfer.Moved);
            }

            if (ship.LoadedCrystal >= ship.EligibleCrystalToLoad)
                DepartShip(ship, "work-complete");
        }

        private void BeginExportLoading(ImportShipState ship, InventoryStore port)
        {
            if (ship.ExportLoadStarted) return;
            ship.ExportLoadStarted = true;
            int capacity = ship.Cargo.GetFreeCapacity(ItemId.Crystal);
            int quantity = Math.Min(ship.ExportContractQuantity,
                Math.Min(port.GetAvailable(ItemId.Crystal), capacity));
            ship.EligibleCrystalToLoad = quantity;
            if (quantity > 0)
            {
                ship.ExportReservationId = "export-reservation:" + ship.Id;
                if (!World.InventoryLedger.TryReserve(ship.ExportReservationId, port, ItemId.Crystal, quantity))
                    ship.EligibleCrystalToLoad = 0;
            }

            Record("ship", ship.Id + ":export-started:" + ship.EligibleCrystalToLoad);
            loadingRateRemainder = 0;
            if (ship.EligibleCrystalToLoad == 0) DepartShip(ship, "work-complete");
        }

        private void DepartShip(ImportShipState ship, string reason)
        {
            if (!string.IsNullOrEmpty(ship.ExportReservationId))
                World.InventoryLedger.CancelReservation(ship.ExportReservationId);

            int deliveredValue = checked(ship.UnloadedIron * World.Definitions.IronUnitPrice +
                (ship.DronesDelivered ? ship.DroneCount * World.Definitions.DroneUnitPrice : 0));
            World.Funds.SettleDelivered(ship.OrderId, deliveredValue);
            ship.Phase = ImportShipPhase.Departed;
            if (ship.LoadedCrystal > 0)
            {
                int exported = ship.LoadedCrystal;
                World.Funds.Credit("export:" + ship.Id, checked(exported * World.Definitions.ExportPricePerCrystal));
                World.ExportedCrystals = checked(World.ExportedCrystals + exported);
                Record("export", ship.Id + ":departed-crystal:" + exported);
            }

            Record("ship", ship.Id + ":departed:" + reason + ":delivered-iron:" + ship.UnloadedIron +
                ":refunded-iron:" + ship.RemainingIron + ":exported-crystal:" + ship.LoadedCrystal);
            dockedImportShip = null;
            unloadingRateRemainder = 0;
            loadingRateRemainder = 0;
            nextShipTransferNumber = 0;

            if (World.Outcome == MatchOutcome.Running && processedMilliseconds < World.Definitions.MatchDeadlineMilliseconds &&
                World.ExportedCrystals >= World.Definitions.ExportGoal)
            {
                FacilityState outpost = World.FindFacility(FacilityKind.Outpost);
                World.Outcome = MatchRules.Resolve(processedMilliseconds, World.ExportedCrystals,
                    outpost == null || outpost.IsDestroyed, World.Definitions);
                Record("match", World.Outcome == MatchOutcome.Victory ? "export-goal-departed" : "export-goal-not-won");
            }
        }

        private void Dock(ImportShipState ship)
        {
            FacilityState portFacility = World.FindFacility(FacilityKind.Port);
            if (portFacility == null) throw new InvalidOperationException("The port is required to dock ships.");

            ship.Phase = ImportShipPhase.Docked;
            ship.DockedAtMilliseconds = processedMilliseconds;
            ship.EligibleIronToUnload = Math.Min(ship.RemainingIron, portFacility.Inventory.GetFreeCapacity(ItemId.Iron));
            if (ship.DroneCount > 0 && !ship.DronesDelivered)
            {
                for (int i = 0; i < ship.DroneCount; i++)
                {
                    int number = World.Drones.Count + 1;
                    World.Drones.Add(new DroneState("drone-production-" + number, DroneRegion.Production,
                        portFacility.Position.X + portFacility.Width * 0.5d,
                        portFacility.Position.Y + portFacility.Height * 0.5d));
                }

                ship.DronesDelivered = true;
                Record("ship", ship.Id + ":drones-delivered:" + ship.DroneCount);
            }
            dockedImportShip = ship;
            Record("ship", ship.Id + ":docked:eligible-iron:" + ship.EligibleIronToUnload);
        }

        private void ValidateContractQuantity(int quantity)
        {
            if (quantity < 0 || quantity > World.Definitions.ShipCargoCapacity)
                throw new ArgumentOutOfRangeException(nameof(quantity), "A regular contract must fit within one ship's cargo capacity.");
        }

        private ImportShipState FindNextWaitingShip()
        {
            ImportShipState result = null;
            for (int i = 0; i < World.ImportShips.Count; i++)
            {
                ImportShipState ship = World.ImportShips[i];
                if (ship.Phase != ImportShipPhase.Waiting) continue;
                if (result == null || ship.ArrivalMilliseconds < result.ArrivalMilliseconds ||
                    (ship.ArrivalMilliseconds == result.ArrivalMilliseconds && result.OneOff && !ship.OneOff))
                    result = ship;
            }

            return result;
        }

        private int GetPendingDroneCount()
        {
            int pending = 0;
            for (int i = 0; i < waitingImportShips.Count; i++)
                if (!waitingImportShips[i].DronesDelivered) pending += waitingImportShips[i].DroneCount;
            for (int i = 0; i < World.ImportShips.Count; i++)
            {
                ImportShipState ship = World.ImportShips[i];
                if (!ship.DronesDelivered && ship.Phase != ImportShipPhase.Departed) pending += ship.DroneCount;
            }
            return pending;
        }

        private void Record(string category, string detail)
        {
            World.Record(processedMilliseconds, category, detail);
        }
    }
}
