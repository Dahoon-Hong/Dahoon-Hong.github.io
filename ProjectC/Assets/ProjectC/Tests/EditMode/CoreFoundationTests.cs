using System;
using NUnit.Framework;

namespace ProjectC.Core.Tests
{
    public sealed class CoreFoundationTests
    {
        [Test]
        public void ClockHonorsPauseAndGameSpeed()
        {
            var clock = new SimulationClock();
            clock.AdvanceRealSeconds(1d);
            Assert.That(clock.Milliseconds, Is.EqualTo(1_000));

            clock.SetSpeed(GameSpeed.Four);
            clock.AdvanceRealSeconds(1d);
            Assert.That(clock.Milliseconds, Is.EqualTo(5_000));

            clock.SetPaused(true);
            Assert.That(clock.AdvanceRealSeconds(3d), Is.EqualTo(0));
            Assert.That(clock.Milliseconds, Is.EqualTo(5_000));
        }

        [Test]
        public void ClockKeepsFractionalMillisecondsAcrossFrames()
        {
            var clock = new SimulationClock();
            for (int i = 0; i < 10; i++) clock.AdvanceRealSeconds(0.0166666667d);
            Assert.That(clock.Milliseconds, Is.EqualTo(166));
        }

        [Test]
        public void PausingAndResumingKeepsTheSelectedSpeed()
        {
            var clock = new SimulationClock();
            clock.SetSpeed(GameSpeed.Two);
            clock.SetPaused(true);
            Assert.That(clock.Speed, Is.EqualTo(GameSpeed.Paused));
            clock.SetPaused(false);
            Assert.That(clock.Speed, Is.EqualTo(GameSpeed.Two));
        }

        [Test]
        public void TransferPreservesStockAndRepeatedCommitDoesNotDuplicate()
        {
            var source = new InventoryStore("source");
            var destination = new InventoryStore("destination");
            source.TryAdd(ItemId.Iron, 10);
            destination.SetCapacity(ItemId.Iron, 20);
            var ledger = new InventoryLedger();

            Assert.That(ledger.TryReserve("job-1", source, ItemId.Iron, 6), Is.True);
            Assert.That(source.GetAvailable(ItemId.Iron), Is.EqualTo(4));
            TransferResult first = ledger.CommitTransfer("transfer-1", "job-1", destination);
            TransferResult repeated = ledger.CommitTransfer("transfer-1", "job-1", destination);

            Assert.That(first.Succeeded, Is.True);
            Assert.That(first.Moved, Is.EqualTo(6));
            Assert.That(repeated.Moved, Is.EqualTo(6));
            Assert.That(source.GetStock(ItemId.Iron) + destination.GetStock(ItemId.Iron), Is.EqualTo(10));
        }

        [Test]
        public void PartialTransferRechecksActualDestinationCapacity()
        {
            var source = new InventoryStore("source");
            var destination = new InventoryStore("destination");
            source.TryAdd(ItemId.Iron, 10);
            destination.SetCapacity(ItemId.Iron, 3);
            var ledger = new InventoryLedger();
            ledger.TryReserve("job-1", source, ItemId.Iron, 7);

            TransferResult result = ledger.CommitTransfer("transfer-1", "job-1", destination);

            Assert.That(result.Succeeded, Is.True);
            Assert.That(result.Moved, Is.EqualTo(3));
            Assert.That(source.GetStock(ItemId.Iron), Is.EqualTo(7));
            Assert.That(source.GetReserved(ItemId.Iron), Is.EqualTo(0));
        }

        [Test]
        public void ChunkTransferKeepsTheUnmovedReservationUntilTheNextTick()
        {
            var source = new InventoryStore("source");
            var destination = new InventoryStore("destination");
            source.TryAdd(ItemId.Crystal, 5);
            var ledger = new InventoryLedger();
            Assert.That(ledger.TryReserve("ship-load", source, ItemId.Crystal, 5), Is.True);

            TransferResult first = ledger.CommitTransferChunk("load-1", "ship-load", destination, 2);

            Assert.That(first.Moved, Is.EqualTo(2));
            Assert.That(source.GetStock(ItemId.Crystal), Is.EqualTo(3));
            Assert.That(source.GetReserved(ItemId.Crystal), Is.EqualTo(3));
            Assert.That(destination.GetStock(ItemId.Crystal), Is.EqualTo(2));

            TransferResult second = ledger.CommitTransferChunk("load-2", "ship-load", destination, 3);
            Assert.That(second.Moved, Is.EqualTo(3));
            Assert.That(source.GetReserved(ItemId.Crystal), Is.EqualTo(0));
            Assert.That(source.GetStock(ItemId.Crystal) + destination.GetStock(ItemId.Crystal), Is.EqualTo(5));
        }

        [Test]
        public void PrepaymentAndRefundCannotSettleTwice()
        {
            var funds = new FundsLedger(GameDefinitions.Default.StartingFunds);
            Assert.That(funds.TryPrepay("ship-1", 100), Is.True);
            Assert.That(funds.Balance, Is.EqualTo(400));
            Assert.That(funds.OutstandingPrepayments, Is.EqualTo(100));
            Assert.That(funds.SettleDelivered("ship-1", 60), Is.True);
            Assert.That(funds.SettleDelivered("ship-1", 60), Is.False);
            Assert.That(funds.Balance, Is.EqualTo(440));
        }

        [Test]
        public void NewMatchHasConfirmedOpeningStateAndNoStartingRawMaterials()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            GameWorld world = simulation.World;

            Assert.That(world.Funds.Balance, Is.EqualTo(400));
            Assert.That(world.Funds.OutstandingPrepayments, Is.EqualTo(100));
            Assert.That(world.Drones.Count, Is.EqualTo(5));
            Assert.That(world.FindFacility("port").Inventory.GetStock(ItemId.Iron), Is.EqualTo(0));
            Assert.That(world.FindFacility("ironworks").Inventory.GetStock(ItemId.Iron), Is.EqualTo(0));
            Assert.That(world.FindFacility("ammunition-factory").Inventory.GetStock(ItemId.Plate), Is.EqualTo(0));
            Assert.That(world.FindFacility("outpost").Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(0));
            Assert.That(world.FindFacility("turret").Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(60));
            Assert.That(world.ImportShips.Count, Is.EqualTo(1));
            Assert.That(world.ImportShips[0].Phase, Is.EqualTo(ImportShipPhase.Docked));
        }

        [Test]
        public void FirstIronOrderUnloadsAtTwentyItemsPerGameSecond()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.AdvanceGameMilliseconds(2_500);
            Assert.That(simulation.World.FindFacility("port").Inventory.GetStock(ItemId.Iron), Is.EqualTo(50));
            Assert.That(simulation.World.ImportShips[0].RemainingIron, Is.EqualTo(50));

            simulation.AdvanceGameMilliseconds(2_500);
            Assert.That(simulation.World.FindFacility("port").Inventory.GetStock(ItemId.Iron), Is.EqualTo(100));
            Assert.That(simulation.World.ImportShips[0].Phase, Is.EqualTo(ImportShipPhase.Departed));
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(400));
        }

        [Test]
        public void OpeningIronOrderContinuesAfterAZeroUnloadFractionalTick()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            ImportShipState ship = simulation.World.ImportShips[0];

            simulation.AdvanceGameMilliseconds(186);

            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Docked));
            Assert.That(ship.ExportLoadStarted, Is.False);
            Assert.That(ship.EligibleIronToUnload, Is.EqualTo(100));
            Assert.That(ship.UnloadedIron, Is.EqualTo(3));
            Assert.That(ship.RemainingIron, Is.EqualTo(97));

            simulation.AdvanceGameMilliseconds(64);

            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Docked));
            Assert.That(ship.UnloadedIron, Is.EqualTo(5));
            Assert.That(ship.RemainingIron, Is.EqualTo(95));
        }

        [Test]
        public void RegularShipLoadsAtConfirmedRateAndCreditsOnlyAtDeparture()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            InventoryStore port = simulation.World.FindFacility("port").Inventory;
            Assert.That(port.TryAdd(ItemId.Crystal, 100), Is.True);

            simulation.AdvanceGameMilliseconds(5_000);
            ImportShipState ship = simulation.World.ImportShips[0];
            Assert.That(ship.ExportLoadStarted, Is.True);
            Assert.That(ship.LoadedCrystal, Is.EqualTo(0));
            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(0));

            simulation.AdvanceGameMilliseconds(2_500);
            Assert.That(ship.LoadedCrystal, Is.EqualTo(50));
            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Docked));
            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(0));
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(400));

            simulation.AdvanceGameMilliseconds(2_500);
            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Departed));
            Assert.That(ship.LoadedCrystal, Is.EqualTo(100));
            Assert.That(port.GetStock(ItemId.Crystal), Is.EqualTo(0));
            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(100));
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(600));
        }

        [Test]
        public void RegularContractChangesApplyOnlyToNotYetConfirmedShips()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            ImportShipState openingShip = simulation.World.ImportShips[0];
            simulation.SetRegularImportContractQuantity(200);
            simulation.SetRegularExportContractQuantity(125);
            Assert.That(openingShip.PaidIron, Is.EqualTo(100));
            Assert.That(openingShip.ExportContractQuantity, Is.EqualTo(500));

            simulation.AdvanceGameMilliseconds(120_000);

            Assert.That(simulation.World.ImportShips.Count, Is.EqualTo(1));
            Assert.That(simulation.World.Funds.OutstandingPrepayments, Is.EqualTo(200));

            simulation.AdvanceGameMilliseconds(60_000);
            ImportShipState nextShip = simulation.World.ImportShips[1];
            Assert.That(nextShip.PaidIron, Is.EqualTo(200));
            Assert.That(nextShip.ExportContractQuantity, Is.EqualTo(125));
        }

        [Test]
        public void MinerPlacementRequiresOneOfTheConfirmedOreNodeTiles()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();

            bool rejected = simulation.TryPlaceFacility(FacilityKind.Miner, new GridPosition(21, 25), 0,
                out FacilityState invalidMiner, out string invalidReason);
            bool accepted = simulation.TryPlaceFacility(FacilityKind.Miner, new GridPosition(20, 25), 0,
                out FacilityState miner, out string acceptedReason);

            Assert.That(rejected, Is.False);
            Assert.That(invalidMiner, Is.Null);
            Assert.That(invalidReason, Is.EqualTo("miner-must-cover-ore-node"));
            Assert.That(accepted, Is.True, acceptedReason);
            Assert.That(miner.IsUnderConstruction, Is.True);
            Assert.That(miner.Width, Is.EqualTo(2));
            Assert.That(miner.Height, Is.EqualTo(2));
        }

        [Test]
        public void DefaultMapUsesConfirmedMountainRectanglesAndOpenEntries()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();

            Assert.That(definitions.MapWidth, Is.EqualTo(128));
            Assert.That(definitions.MapHeight, Is.EqualTo(128));
            Assert.That(definitions.ProductionHeight, Is.EqualTo(103));
            Assert.That(definitions.IsMountainCell(34, 113), Is.True);
            Assert.That(definitions.IsMountainCell(17, 104), Is.True);
            Assert.That(definitions.IsMountainCell(5, 0), Is.True);
            Assert.That(definitions.IsMountainCell(64, 0), Is.False);
            Assert.That(definitions.IsMountainCell(0, 114), Is.False);
            Assert.That(definitions.IsMountainCell(64, 127), Is.False);
            Assert.That(definitions.IsMountainCell(127, 114), Is.False);
        }

        [Test]
        public void FacilityPlacementRejectsMountainCells()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();

            bool accepted = simulation.TryPlaceFacility(FacilityKind.Ironworks, new GridPosition(0, 10), 0,
                out FacilityState facility, out string reason);

            Assert.That(accepted, Is.False);
            Assert.That(facility, Is.Null);
            Assert.That(reason, Is.EqualTo("mountain"));
        }

        [Test]
        public void BlockedEnemyEntryWaitsAndSpawnsItsRemainingBatchAtTheSamePoint()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.World.Facilities.Add(new FacilityState("west-entry-blocker", FacilityKind.Turret,
                new GridPosition(0, 114), new InventoryStore("west-entry-blocker.inventory"), 1_000));

            simulation.AdvanceGameMilliseconds(300_000);
            Assert.That(simulation.World.Enemies.Count, Is.EqualTo(6));
            Assert.That(simulation.World.HighestWaveReached, Is.EqualTo(1));

            simulation.World.Facilities.RemoveAt(simulation.World.Facilities.Count - 1);
            simulation.AdvanceGameMilliseconds(500);

            Assert.That(simulation.World.Enemies.Count, Is.EqualTo(9));
            Assert.That(simulation.World.Enemies.FindAll(enemy => enemy.EntryIndex == 0).Count, Is.EqualTo(3));
        }

        [Test]
        public void BlockedEntryQueuesPriorWaveWhileOtherEntriesContinueIndependently()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.World.Facilities.Add(new FacilityState("west-entry-blocker", FacilityKind.Turret,
                new GridPosition(0, 114), new InventoryStore("west-entry-blocker.inventory"), 1_000));

            simulation.AdvanceGameMilliseconds(300_000);
            Assert.That(simulation.World.Enemies.FindAll(enemy => enemy.WaveNumber == 1).Count, Is.EqualTo(6));

            simulation.AdvanceGameMilliseconds(120_000);

            Assert.That(simulation.World.HighestWaveReached, Is.EqualTo(2));
            Assert.That(simulation.World.Enemies.Exists(enemy => enemy.WaveNumber == 2 && enemy.EntryIndex != 0),
                Is.True, "Unblocked entry queues should spawn the second wave on schedule.");
            Assert.That(simulation.World.Enemies.Exists(enemy => enemy.WaveNumber == 2 && enemy.EntryIndex == 0),
                Is.False, "The blocked entry must keep its first-wave batch ahead of the second wave.");

            // Isolate the queued-spawn assertions from movement and combat of already-observed enemies.
            simulation.World.Enemies.Clear();
            simulation.World.Facilities.RemoveAt(simulation.World.Facilities.Count - 1);
            simulation.AdvanceGameMilliseconds(500);

            int firstWaveEntryCount = simulation.World.Definitions.SplitWaveAcrossEntries(1)[0];
            int firstWaveFirstGroupCount = Math.Min(firstWaveEntryCount,
                simulation.World.Definitions.MaximumEnemiesPerEntrySpawn);
            Assert.That(simulation.World.Enemies.FindAll(enemy => enemy.EntryIndex == 0 && enemy.WaveNumber == 1)
                .Count, Is.EqualTo(firstWaveFirstGroupCount));
            Assert.That(simulation.World.Enemies.Exists(enemy => enemy.EntryIndex == 0 && enemy.WaveNumber == 2),
                Is.False, "The queued second wave must wait for the previous batch to spawn.");

            simulation.World.Enemies.Clear();
            simulation.AdvanceGameMilliseconds(simulation.World.Definitions.WaveSpawnIntervalMilliseconds);

            Assert.That(simulation.World.Enemies.FindAll(enemy => enemy.EntryIndex == 0 && enemy.WaveNumber == 1)
                .Count, Is.EqualTo(firstWaveEntryCount - firstWaveFirstGroupCount));
            Assert.That(simulation.World.Enemies.Exists(enemy => enemy.EntryIndex == 0 && enemy.WaveNumber == 2),
                Is.False, "The second wave must wait for the previous wave's remaining enemy.");

            // Free the spawn area after observing the prior batch so occupancy cannot delay the queued batch.
            simulation.World.Enemies.Clear();
            simulation.AdvanceGameMilliseconds(simulation.World.Definitions.WaveSpawnIntervalMilliseconds);

            Assert.That(simulation.World.Enemies.Exists(enemy => enemy.EntryIndex == 0 && enemy.WaveNumber == 2),
                Is.True, "The queued second-wave batch must remain and spawn after the first batch.");
        }

        [Test]
        public void MovingEnemiesStayInsideCombatTerrainAndDoNotOverlap()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.AdvanceGameMilliseconds(330_000);

            for (int i = 0; i < simulation.World.Enemies.Count; i++)
            {
                EnemyState enemy = simulation.World.Enemies[i];
                if (!enemy.IsAlive) continue;
                Assert.That(enemy.X, Is.InRange(0.25d, 127.75d));
                Assert.That(enemy.Y, Is.InRange(103.25d, 127.75d));
                for (int x = 0; x < simulation.World.Definitions.MapWidth; x++)
                {
                    for (int y = 0; y < simulation.World.Definitions.MapHeight; y++)
                    {
                        if (!simulation.World.Definitions.IsMountainCell(x, y)) continue;
                        Assert.That(enemy.X + 0.25d <= x || enemy.X - 0.25d >= x + 1 ||
                                    enemy.Y + 0.25d <= y || enemy.Y - 0.25d >= y + 1, Is.True,
                            enemy.Id + " overlaps mountain cell " + x + "," + y);
                    }
                }

                for (int otherIndex = i + 1; otherIndex < simulation.World.Enemies.Count; otherIndex++)
                {
                    EnemyState other = simulation.World.Enemies[otherIndex];
                    if (!other.IsAlive) continue;
                    Assert.That(Math.Abs(enemy.X - other.X) < 0.5d && Math.Abs(enemy.Y - other.Y) < 0.5d,
                        Is.False, enemy.Id + " overlaps " + other.Id);
                }
            }
        }

        [Test]
        public void ConstructionMovesMaterialsConsumesThemOnceAndCompletesWithOperationalInventory()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            FacilityState outpost = simulation.World.FindFacility("outpost");
            Assert.That(outpost.Inventory.TryAdd(ItemId.Iron, 20), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Plate, 5), Is.True);
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Miner, new GridPosition(20, 25), 0,
                out FacilityState miner, out string reason), Is.True, reason);

            simulation.AdvanceGameMilliseconds(140_000);

            Assert.That(miner.IsUnderConstruction, Is.False);
            Assert.That(miner.IsConstructionStarted, Is.True);
            Assert.That(miner.Inventory.GetStock(ItemId.Iron), Is.EqualTo(0));
            Assert.That(miner.Inventory.GetStock(ItemId.Plate), Is.EqualTo(0));
            Assert.That(miner.Inventory.GetStock(ItemId.Ore), Is.GreaterThan(0));
            Assert.That(outpost.Inventory.GetStock(ItemId.Iron), Is.EqualTo(0));
            Assert.That(outpost.Inventory.GetStock(ItemId.Plate), Is.EqualTo(0));
            Assert.That(simulation.World.ConstructionSites[0].ProgressMilliseconds, Is.EqualTo(3_000));
        }

        [TestCase(10_000, MatchOutcome.Victory)]
        [TestCase(7_500, MatchOutcome.Defeat)]
        public void ExportGoalUsesStrictShipDepartureDeadline(int deadline, MatchOutcome expected)
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.ExportGoal = 50;
            definitions.MatchDeadlineMilliseconds = deadline;
            GameSimulation simulation = GameSimulation.CreateNewMatch(definitions);
            Assert.That(simulation.World.FindFacility("port").Inventory.TryAdd(ItemId.Crystal, 50), Is.True);

            simulation.AdvanceGameMilliseconds(20_000);

            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(50));
            Assert.That(simulation.World.Outcome, Is.EqualTo(expected));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(expected == MatchOutcome.Victory ? 7_500 : deadline));
        }

        [Test]
        public void ImportRefundsCargoThatCouldNotFitAtDocking()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            InventoryStore port = simulation.World.FindFacility("port").Inventory;
            simulation.AdvanceGameMilliseconds(120_000);
            Assert.That(port.TryAdd(ItemId.Iron, 350), Is.True);

            simulation.AdvanceGameMilliseconds(63_000);

            Assert.That(port.GetStock(ItemId.Iron), Is.EqualTo(500));
            Assert.That(simulation.World.ImportShips[1].Phase, Is.EqualTo(ImportShipPhase.Departed));
            Assert.That(simulation.World.ImportShips[1].UnloadedIron, Is.EqualTo(50));
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(450));
        }

        [Test]
        public void RegularOrderIsPrepaidAtOneTwentyAndSupportArrivesAtOneEighty()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.AdvanceGameMilliseconds(120_000);

            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(300));
            Assert.That(simulation.World.Funds.OutstandingPrepayments, Is.EqualTo(100));
            Assert.That(simulation.World.ImportShips.Count, Is.EqualTo(1));

            simulation.AdvanceGameMilliseconds(60_000);

            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(400));
            Assert.That(simulation.World.ImportShips.Count, Is.EqualTo(2));
            Assert.That(simulation.World.ImportShips[1].Phase, Is.EqualTo(ImportShipPhase.Docked));
        }

        [Test]
        public void SuppliedFactoriesUseConfirmedRecipesAndGameTime()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState ironworks = simulation.World.FindFacility("ironworks");
            FacilityState ammunitionFactory = simulation.World.FindFacility("ammunition-factory");
            Assert.That(ironworks.Inventory.TryAdd(ItemId.Iron, 2), Is.True);

            simulation.AdvanceGameMilliseconds(1_000);

            Assert.That(ironworks.Inventory.GetStock(ItemId.Iron), Is.EqualTo(1));
            Assert.That(ironworks.Inventory.GetStock(ItemId.Plate), Is.EqualTo(1));
            Assert.That(simulation.Production.GetProgress("ironworks").CompletedCycles, Is.EqualTo(1));

            Assert.That(ammunitionFactory.Inventory.TryAdd(ItemId.Plate, 1), Is.True);
            simulation.AdvanceGameMilliseconds(12_000);

            Assert.That(ammunitionFactory.Inventory.GetStock(ItemId.Plate), Is.EqualTo(0));
            Assert.That(ammunitionFactory.Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(12));
            Assert.That(simulation.Production.GetProgress("ammunition-factory").CompletedCycles, Is.EqualTo(1));
        }

        [Test]
        public void DroneTransferReservesCargoThenDeliversWithoutCreatingStock()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            simulation.AdvanceGameMilliseconds(5_000);
            InventoryStore port = simulation.World.FindFacility("port").Inventory;
            InventoryStore ironworks = simulation.World.FindFacility("ironworks").Inventory;
            Assert.That(port.GetStock(ItemId.Iron), Is.EqualTo(100));

            TransportOrder order = simulation.QueueTransfer("port", "ironworks", ItemId.Iron, 10);
            simulation.AdvanceGameMilliseconds(40_000);

            Assert.That(order.DeliveredQuantity, Is.EqualTo(0));
            Assert.That(port.GetReserved(ItemId.Iron), Is.EqualTo(10));
            Assert.That(ironworks.GetExpectedInbound(ItemId.Iron), Is.EqualTo(10));
            Assert.That(port.GetStock(ItemId.Iron), Is.EqualTo(100));

            simulation.AdvanceGameMilliseconds(55_000);

            Assert.That(order.State, Is.EqualTo(TransportOrderState.Completed));
            Assert.That(order.DeliveredQuantity, Is.EqualTo(10));
            Assert.That(ironworks.GetStock(ItemId.Iron), Is.EqualTo(0));
            Assert.That(ironworks.GetStock(ItemId.Plate), Is.EqualTo(10));
            Assert.That(ironworks.GetExpectedInbound(ItemId.Iron), Is.EqualTo(0));
            Assert.That(port.GetStock(ItemId.Iron) + ironworks.GetStock(ItemId.Iron) +
                        ironworks.GetStock(ItemId.Plate), Is.EqualTo(100));
        }

        [Test]
        public void CombatTransportMustRelayThroughTheOutpost()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            Assert.Throws<System.InvalidOperationException>(() =>
                simulation.QueueTransfer("ammunition-factory", "turret", ItemId.Ammunition, 1));

            TransportOrder order = simulation.QueueTransfer("ammunition-factory", "outpost", ItemId.Ammunition, 1);
            Assert.That(order.State, Is.EqualTo(TransportOrderState.Waiting));
        }

        [Test]
        public void FirstWaveSpawnsInThreeEntryBatchesAtHalfSecondSpacing()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.AdvanceGameMilliseconds(300_000);
            Assert.That(simulation.World.HighestWaveReached, Is.EqualTo(1));
            Assert.That(simulation.World.Enemies.Count, Is.EqualTo(9));

            simulation.AdvanceGameMilliseconds(500);
            Assert.That(simulation.World.Enemies.Count, Is.EqualTo(10));
        }

        [Test]
        public void MinerAndRefineryProduceConfirmedOreAndCrystalRates()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.World.Facilities.Add(new FacilityState("miner-test", FacilityKind.Miner,
                new GridPosition(20, 25), new InventoryStore("miner-test.inventory")));
            var refineryInventory = new InventoryStore("refinery-test.inventory");
            Assert.That(refineryInventory.TryAdd(ItemId.Ore, 4), Is.True);
            simulation.World.Facilities.Add(new FacilityState("refinery-test", FacilityKind.Refinery,
                new GridPosition(21, 25), refineryInventory));

            simulation.AdvanceGameMilliseconds(4_050);

            Assert.That(simulation.World.FindFacility("miner-test").Inventory.GetStock(ItemId.Ore), Is.EqualTo(4));
            Assert.That(refineryInventory.GetStock(ItemId.Ore), Is.EqualTo(0));
            Assert.That(refineryInventory.GetStock(ItemId.Crystal), Is.EqualTo(2));
        }

        [Test]
        public void OutpostTargetAllowsCombatSupplyAndRequeuesAfterPickup()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            GameWorld world = simulation.World;
            FacilityState outpost = world.FindFacility("outpost");
            FacilityState ammunitionFactory = world.FindFacility("ammunition-factory");
            FacilityState turret = world.FindFacility("turret");

            simulation.SetRestockTarget(outpost.Id, ItemId.Ammunition, 12);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Ammunition, 12), Is.True);
            Assert.That(ammunitionFactory.Inventory.TryAdd(ItemId.Ammunition, 5), Is.True);
            Assert.That(turret.Inventory.TryRemove(ItemId.Ammunition, 5), Is.True);

            simulation.AdvanceGameMilliseconds(1_000);

            TransportOrder combatRestock = world.TransportOrders.Find(order => order.IsAutomatic &&
                order.SourceFacilityId == outpost.Id && order.DestinationFacilityId == turret.Id &&
                order.Item == ItemId.Ammunition);
            Assert.That(combatRestock, Is.Not.Null,
                "A full Outpost restock target must not block automatic turret supply.");
            Assert.That(combatRestock.Quantity, Is.EqualTo(5));
            Assert.That(outpost.Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(12));
            Assert.That(turret.Inventory.GetExpectedInbound(ItemId.Ammunition), Is.EqualTo(5));

            simulation.AdvanceGameMilliseconds(4_000);

            Assert.That(outpost.Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(7));
            Assert.That(world.TransportOrders.Exists(order => order.IsAutomatic &&
                order.SourceFacilityId == ammunitionFactory.Id && order.DestinationFacilityId == outpost.Id &&
                order.Item == ItemId.Ammunition && order.Quantity == 5), Is.True,
                "Production restock resumes after an actual outbound pickup reduces Outpost stock.");
        }

        [Test]
        public void AutomaticRestockMergesIncrementalStockIntoOneTransferOrder()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            GameWorld world = simulation.World;
            FacilityState port = world.FindFacility("port");
            FacilityState ironworks = world.FindFacility("ironworks");
            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 60);

            for (int unit = 1; unit <= 5; unit++)
            {
                Assert.That(port.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
                simulation.Transport.Tick(world, unit * 50, 50);
            }

            var initialOrders = world.TransportOrders.FindAll(order => order.IsAutomatic &&
                order.SourceFacilityId == port.Id && order.DestinationFacilityId == ironworks.Id &&
                order.Item == ItemId.Iron);
            Assert.That(initialOrders, Has.Count.EqualTo(1));
            Assert.That(initialOrders[0].Quantity, Is.EqualTo(5));

            for (int unit = 6; unit <= 10; unit++)
            {
                Assert.That(port.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
                simulation.Transport.Tick(world, unit * 50, 50);
            }

            var automaticIronOrders = world.TransportOrders.FindAll(order => order.IsAutomatic &&
                order.SourceFacilityId == port.Id && order.DestinationFacilityId == ironworks.Id &&
                order.Item == ItemId.Iron);
            Assert.That(automaticIronOrders, Has.Count.EqualTo(1));
            Assert.That(automaticIronOrders[0].Quantity, Is.EqualTo(10));
            Assert.That(automaticIronOrders[0].ReservedQuantity, Is.EqualTo(10));
            Assert.That(ironworks.Inventory.GetExpectedInbound(ItemId.Iron), Is.EqualTo(10));
        }

        [Test]
        public void LoweringRestockTargetCancelsAutomaticExcessAndKeepsManualOrder()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            GameWorld world = simulation.World;
            FacilityState port = world.FindFacility("port");
            FacilityState ironworks = world.FindFacility("ironworks");
            Assert.That(port.Inventory.TryAdd(ItemId.Iron, 30), Is.True);
            TransportOrder manual = simulation.QueueTransfer(port.Id, ironworks.Id, ItemId.Iron, 5);

            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 30);
            simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);

            TransportOrder automatic = world.TransportOrders.Find(order => order.IsAutomatic &&
                order.SourceFacilityId == port.Id && order.DestinationFacilityId == ironworks.Id &&
                order.Item == ItemId.Iron);
            Assert.That(automatic, Is.Not.Null);
            Assert.That(automatic.Quantity, Is.EqualTo(25));
            Assert.That(automatic.Quantity - automatic.DeliveredQuantity - automatic.ReservedQuantity -
                automatic.InTransitQuantity - automatic.CancelledQuantity, Is.EqualTo(10));
            Assert.That(automatic.ReservedQuantity, Is.EqualTo(15));

            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 13);

            Assert.That(automatic.CancelledQuantity, Is.EqualTo(17));
            Assert.That(automatic.ReservedQuantity, Is.EqualTo(8),
                "A partial pickup cancellation should preserve the amount still required by the reduced target.");
            Assert.That(automatic.State, Is.EqualTo(TransportOrderState.InProgress));
            Assert.That(ironworks.Inventory.GetExpectedInbound(ItemId.Iron), Is.EqualTo(13));
            Assert.That(port.Inventory.GetReserved(ItemId.Iron), Is.EqualTo(13));
            Assert.That(world.Drones.FindAll(drone => drone.Region == DroneRegion.Production &&
                drone.IsAvailable), Has.Count.EqualTo(1));

            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 0);

            Assert.That(automatic.CancelledQuantity, Is.EqualTo(25));
            Assert.That(automatic.State, Is.EqualTo(TransportOrderState.Cancelled));
            Assert.That(automatic.ReservedQuantity, Is.Zero);
            Assert.That(automatic.Quantity - automatic.DeliveredQuantity - automatic.ReservedQuantity -
                automatic.InTransitQuantity - automatic.CancelledQuantity, Is.Zero);
            Assert.That(manual.CancelledQuantity, Is.Zero);
            Assert.That(manual.ReservedQuantity, Is.EqualTo(5));
            Assert.That(ironworks.Inventory.GetExpectedInbound(ItemId.Iron), Is.EqualTo(5));
            Assert.That(port.Inventory.GetReserved(ItemId.Iron), Is.EqualTo(5));
            Assert.That(world.Drones.FindAll(drone => drone.Region == DroneRegion.Production &&
                drone.IsAvailable), Has.Count.EqualTo(3));

            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 10);
            simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);
            TransportOrder replacement = world.TransportOrders.Find(order => order.IsAutomatic &&
                order != automatic && order.SourceFacilityId == port.Id &&
                order.DestinationFacilityId == ironworks.Id && order.Item == ItemId.Iron);

            Assert.That(replacement, Is.Not.Null);
            Assert.That(replacement.Quantity, Is.EqualTo(5));
            Assert.That(ironworks.Inventory.GetExpectedInbound(ItemId.Iron), Is.EqualTo(10));
        }

        [Test]
        public void LoweringRestockTargetPreservesCargoAlreadyInTransit()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            GameWorld world = simulation.World;
            FacilityState port = world.FindFacility("port");
            FacilityState ironworks = world.FindFacility("ironworks");
            Assert.That(port.Inventory.TryAdd(ItemId.Iron, 10), Is.True);
            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 10);
            int waitedMilliseconds = 0;
            while (waitedMilliseconds < 60_000 && !world.TransportOrders.Exists(order => order.IsAutomatic &&
                       order.DestinationFacilityId == ironworks.Id && order.Item == ItemId.Iron &&
                       order.InTransitQuantity > 0))
            {
                simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);
                waitedMilliseconds += GameSimulation.SimulationStepMilliseconds;
            }

            TransportOrder automatic = world.TransportOrders.Find(order => order.IsAutomatic &&
                order.DestinationFacilityId == ironworks.Id && order.Item == ItemId.Iron &&
                order.InTransitQuantity > 0);
            Assert.That(automatic, Is.Not.Null, "Automatic restock must reach its source pickup before delivery. " +
                "elapsed=" + waitedMilliseconds + ", target=" + ironworks.GetRestockTarget(ItemId.Iron) +
                ", stock=" + ironworks.Inventory.GetStock(ItemId.Iron) +
                ", inbound=" + ironworks.Inventory.GetExpectedInbound(ItemId.Iron) +
                ", sourceStock=" + port.Inventory.GetStock(ItemId.Iron) +
                ", orders=" + DescribeTransportOrders(world) + ", drones=" + DescribeDrones(world));
            int inTransitBefore = automatic.InTransitQuantity;

            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 0);

            Assert.That(automatic.InTransitQuantity, Is.EqualTo(inTransitBefore));
            Assert.That(ironworks.Inventory.GetExpectedInbound(ItemId.Iron), Is.EqualTo(inTransitBefore));
            Assert.That(automatic.CancelledQuantity, Is.EqualTo(automatic.Quantity -
                automatic.DeliveredQuantity - inTransitBefore));
            Assert.That(automatic.State, Is.EqualTo(TransportOrderState.InProgress));
        }

        [Test]
        public void ConstructionMaterialOrdersWaitForDroneSizedSourceBatch()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            GameWorld world = simulation.World;
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Miner, new GridPosition(20, 25), 0,
                out FacilityState miner, out string reason), Is.True, reason);

            simulation.AdvanceGameMilliseconds(250);
            Assert.That(world.FindFacility("port").Inventory.GetStock(ItemId.Iron), Is.EqualTo(5));
            Assert.That(world.TransportOrders, Is.Empty,
                "A partial import should accumulate until a drone can carry a full construction batch.");

            simulation.AdvanceGameMilliseconds(50);
            var firstBatch = world.TransportOrders.FindAll(order => order.DestinationFacilityId == miner.Id &&
                order.Item == ItemId.Iron);
            Assert.That(firstBatch, Has.Count.EqualTo(1));
            Assert.That(firstBatch[0].Quantity, Is.EqualTo(5));

            simulation.AdvanceGameMilliseconds(250);
            var accumulatedBatches = world.TransportOrders.FindAll(order => order.DestinationFacilityId == miner.Id &&
                order.Item == ItemId.Iron);
            Assert.That(accumulatedBatches, Has.Count.EqualTo(2));
            Assert.That(accumulatedBatches.TrueForAll(order => order.Quantity == 5), Is.True);
            Assert.That(miner.Inventory.GetExpectedInbound(ItemId.Iron), Is.EqualTo(10));
        }

        [Test]
        public void ReadyConstructionClaimsAWorkerBeforeTransportDispatch()
        {
            GameSimulation simulation = CreateMatchWithoutAutomaticRestock();
            GameWorld world = simulation.World;
            FacilityState port = world.FindFacility("port");
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Miner, new GridPosition(20, 25), 0,
                out FacilityState miner, out string reason), Is.True, reason);
            Assert.That(miner.Inventory.TryAdd(ItemId.Iron, 20), Is.True);
            Assert.That(miner.Inventory.TryAdd(ItemId.Plate, 5), Is.True);
            Assert.That(port.Inventory.TryAdd(ItemId.Iron, 20), Is.True);

            TransportOrder import = simulation.QueueTransfer(port.Id, "ironworks", ItemId.Iron, 20);
            simulation.AdvanceGameMilliseconds(GameSimulation.SimulationStepMilliseconds);

            ConstructionSite site = world.ConstructionSites.Find(candidate => candidate.Facility == miner);
            Assert.That(site, Is.Not.Null);
            Assert.That(site.AssignedDroneId, Is.Not.Null,
                "A funded site should claim an available production drone before new transport work.");
            DroneState worker = world.Drones.Find(candidate => candidate.Id == site.AssignedDroneId);
            Assert.That(worker.ActiveConstructionSiteId, Is.EqualTo(miner.Id));
            Assert.That(import.State, Is.EqualTo(TransportOrderState.InProgress),
                "The remaining production drones should still be able to serve transport.");
            Assert.That(import.ReservedQuantity, Is.EqualTo(15));
        }

        [Test]
        [Timeout(60_000)]
        public void ConfirmedOpeningFlowConnectsFirstDefenseToActualCrystalExport()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            GameWorld world = simulation.World;
            FacilityState port = world.FindFacility("port");
            FacilityState ironworks = world.FindFacility("ironworks");
            FacilityState ammunitionFactory = world.FindFacility("ammunition-factory");
            FacilityState outpost = world.FindFacility("outpost");
            FacilityState turret = world.FindFacility("turret");

            Assert.That(simulation.Conveyors.Paths, Is.Empty,
                "The opening match must not contain a preconnected conveyor path.");
            Assert.That(port.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(ironworks.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(ammunitionFactory.Inventory.GetStock(ItemId.Plate), Is.Zero);
            Assert.That(outpost.Inventory.GetStock(ItemId.Ammunition), Is.Zero);
            Assert.That(turret.Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(60));
            Assert.That(world.Funds.Balance, Is.EqualTo(400));
            Assert.That(world.Funds.OutstandingPrepayments, Is.EqualTo(100));
            Assert.That(ironworks.GetRestockTarget(ItemId.Iron), Is.EqualTo(60));
            Assert.That(ammunitionFactory.GetRestockTarget(ItemId.Plate), Is.EqualTo(5));

            simulation.SetRestockTarget("outpost", ItemId.Ammunition, 12);
            simulation.SetFacilityPriority("outpost", 5);
            simulation.SetRestockTarget(ironworks.Id, ItemId.Iron, 0);
            simulation.SetRestockTarget(ammunitionFactory.Id, ItemId.Plate, 0);
            simulation.SetFacilityPriority(ironworks.Id, 5);
            Assert.That(outpost.GetRestockTarget(ItemId.Ammunition), Is.EqualTo(12));
            Assert.That(outpost.Priority, Is.EqualTo(5));

            AdvanceUntil(simulation, () => world.ImportShips[0].UnloadedIron == 100,
                10_000, "opening iron shipment");
            TransportOrder ironSupply = simulation.QueueTransfer(port.Id, ironworks.Id, ItemId.Iron, 20);
            AdvanceUntil(simulation, () => ironSupply.DeliveredQuantity == 20 &&
                    ironworks.Inventory.GetStock(ItemId.Plate) >= 20 &&
                    ironworks.Inventory.GetStock(ItemId.Iron) == 0,
                180_000, "ironworks production batch for construction", () => "port iron=" +
                port.Inventory.GetStock(ItemId.Iron) + ", ironworks iron=" +
                ironworks.Inventory.GetStock(ItemId.Iron) + ", plates=" +
                ironworks.Inventory.GetStock(ItemId.Plate) + ", delivered iron=" +
                ironSupply.DeliveredQuantity + ", orders=" + DescribeTransportOrders(world));

            Assert.That(simulation.TryPlaceFacility(FacilityKind.Miner, new GridPosition(20, 25), 0,
                out FacilityState miner, out string minerReason), Is.True, minerReason);
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Refinery, new GridPosition(23, 25), 0,
                out FacilityState refinery, out string refineryReason), Is.True, refineryReason);
            simulation.SetFacilityPriority(miner.Id, 5);
            simulation.SetFacilityPriority(refinery.Id, 5);
            simulation.SetRestockTarget(refinery.Id, ItemId.Ore, 0);
            Assert.That(simulation.TryPlaceConveyorPath(miner.Id,
                new[] { new GridPosition(22, 25) }, refinery.Id,
                out ConveyorPathState orePath, out string orePathReason), Is.True, orePathReason);
            FacilityState oreBelt = world.Facilities.Find(facility =>
                facility.Kind == FacilityKind.Conveyor && facility.Position.X == 22 && facility.Position.Y == 25);
            Assert.That(oreBelt, Is.Not.Null);
            AdvanceUntil(simulation, () => !miner.IsUnderConstruction && !refinery.IsUnderConstruction &&
                    !oreBelt.IsUnderConstruction,
                600_000, "Miner, Refinery, and conveyor construction", () =>
                "miner started=" + miner.IsConstructionStarted + ", building=" + miner.IsUnderConstruction +
                ", iron=" + miner.Inventory.GetStock(ItemId.Iron) + ", plate=" + miner.Inventory.GetStock(ItemId.Plate) +
                "; refinery started=" + refinery.IsConstructionStarted + ", building=" + refinery.IsUnderConstruction +
                ", iron=" + refinery.Inventory.GetStock(ItemId.Iron) + ", plate=" + refinery.Inventory.GetStock(ItemId.Plate) +
                "; belt started=" + oreBelt.IsConstructionStarted + ", building=" + oreBelt.IsUnderConstruction +
                "; drones=" + DescribeDrones(world) + "; orders=" + DescribeTransportOrders(world));
            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(1));
            Assert.That(orePath.Cells, Has.Count.EqualTo(1));
            simulation.SetRestockTarget(ammunitionFactory.Id, ItemId.Plate, 5);

            AdvanceUntil(simulation, () => refinery.Inventory.GetStock(ItemId.Ore) >= 10,
                300_000, "mined Ore delivery through conveyor", () => "miner ore=" +
                miner.Inventory.GetStock(ItemId.Ore) + ", refinery ore=" +
                refinery.Inventory.GetStock(ItemId.Ore) + ", drones=" + DescribeDrones(world));
            Assert.That(world.Events.Exists(entry => entry.Category == "conveyor" &&
                entry.Detail.Contains(":delivered:Ore:" + refinery.Id)), Is.True,
                "Mined Ore must reach the Refinery through the installed conveyor path.");
            Assert.That(world.TransportOrders.Exists(order => order.SourceFacilityId == miner.Id &&
                order.DestinationFacilityId == refinery.Id && order.Item == ItemId.Ore), Is.False,
                "No Drone transfer may mask the conveyor flow.");
            AdvanceUntil(simulation, () => refinery.Inventory.GetAvailable(ItemId.Crystal) >= 5,
                60_000, "five produced crystals");

            simulation.SetFacilityPriority(port.Id, 5);
            simulation.SetFacilityPriority(miner.Id, 3);
            simulation.SetFacilityPriority(refinery.Id, 3);
            TransportOrder crystalTransfer = simulation.QueueTransfer(refinery.Id, port.Id, ItemId.Crystal, 5);
            AdvanceUntil(simulation, () => crystalTransfer.DeliveredQuantity == 5,
                60_000, "crystal delivery to port", () => "refinery crystal=" +
                refinery.Inventory.GetStock(ItemId.Crystal) + ", reserved=" +
                refinery.Inventory.GetReserved(ItemId.Crystal) + ", port crystal=" +
                port.Inventory.GetStock(ItemId.Crystal) + ", delivered=" + crystalTransfer.DeliveredQuantity +
                ", order reserved=" + crystalTransfer.ReservedQuantity + ", transit=" +
                crystalTransfer.InTransitQuantity + ", drones=" + DescribeDrones(world) +
                ", orders=" + DescribeTransportOrders(world));
            Assert.That(port.Inventory.GetStock(ItemId.Crystal), Is.GreaterThanOrEqualTo(5));

            int exportsBeforeDeparture = world.ExportedCrystals;
            long latestAcceptableArrival = world.Definitions.ImportShipIntervalMilliseconds * 2L;
            int shipDepartureTimeout = (int)Math.Max(0,
                latestAcceptableArrival + world.Definitions.ShipDockLimitMilliseconds + 5_000 -
                simulation.CurrentMilliseconds);
            AdvanceUntil(simulation, () => world.ExportedCrystals >= exportsBeforeDeparture + 5,
                shipDepartureTimeout, "scheduled ship export departure", () => "time=" + simulation.CurrentMilliseconds +
                ", port crystal=" + port.Inventory.GetStock(ItemId.Crystal) +
                ", exports=" + world.ExportedCrystals + ", ships=" + DescribeImportShips(world));

            ImportShipState exportingShip = world.ImportShips.Find(ship =>
                ship.Phase == ImportShipPhase.Departed && ship.LoadedCrystal > 0);
            Assert.That(exportingShip, Is.Not.Null);
            Assert.That(exportingShip.LoadedCrystal, Is.EqualTo(5));
            Assert.That(exportingShip.ArrivalMilliseconds, Is.LessThanOrEqualTo(latestAcceptableArrival));
            Assert.That(world.Events.Exists(entry => entry.Category == "export" &&
                entry.Detail == exportingShip.Id + ":departed-crystal:" + exportingShip.LoadedCrystal), Is.True);
            Assert.That(crystalTransfer.State, Is.EqualTo(TransportOrderState.Completed));

            AdvanceUntil(simulation, () => simulation.Production.GetProgress("ammunition-factory").CompletedCycles > 0,
                240_000, "ammunition production", () => "ironworks plate=" +
                ironworks.Inventory.GetStock(ItemId.Plate) + ", factory plate=" +
                ammunitionFactory.Inventory.GetStock(ItemId.Plate) + ", factory target=" +
                ammunitionFactory.GetRestockTarget(ItemId.Plate) + ", orders=" + DescribeTransportOrders(world));
            AdvanceUntil(simulation, () => SumDeliveredQuantity(world, ammunitionFactory.Id, outpost.Id,
                    ItemId.Ammunition, true) >= 12,
                240_000, "twelve ammunition relayed to outpost", () => "factory ammo=" +
                ammunitionFactory.Inventory.GetStock(ItemId.Ammunition) + ", outpost ammo=" +
                outpost.Inventory.GetStock(ItemId.Ammunition) + ", inbound=" +
                outpost.Inventory.GetExpectedInbound(ItemId.Ammunition) + ", target=" +
                outpost.GetRestockTarget(ItemId.Ammunition) + ", delivered=" +
                SumDeliveredQuantity(world, ammunitionFactory.Id, outpost.Id, ItemId.Ammunition, true) +
                ", orders=" + DescribeTransportOrders(world));

            AdvanceUntil(simulation, () => world.Enemies.Exists(enemy =>
                    enemy.WaveNumber == 1 && !enemy.IsAlive),
                360_000, "first-wave turret defense");

            Assert.That(world.HighestWaveReached, Is.GreaterThanOrEqualTo(1));
            AdvanceUntil(simulation, () => world.TransportOrders.Exists(order =>
                    order.IsAutomatic && order.SourceFacilityId == "outpost" && order.DestinationFacilityId == "turret" &&
                    order.Item == ItemId.Ammunition && order.DeliveredQuantity > 0),
                300_000, "outpost ammunition delivery to turret", () => "outpost ammo=" +
                outpost.Inventory.GetStock(ItemId.Ammunition) + ", expected=" +
                outpost.Inventory.GetExpectedInbound(ItemId.Ammunition) + ", turret ammo=" +
                turret.Inventory.GetStock(ItemId.Ammunition) + ", turret expected=" +
                turret.Inventory.GetExpectedInbound(ItemId.Ammunition) +
                ", drones=" + DescribeDrones(world) + ", orders=" + DescribeTransportOrders(world));
            simulation.SetFacilityPriority(outpost.Id, 3);
            Assert.That(world.Outcome, Is.EqualTo(MatchOutcome.Running));

            int producedCrystal = simulation.Production.GetProgress(refinery.Id).CompletedCycles;
            int storedCrystal = 0;
            int inTransitCrystal = 0;
            for (int i = 0; i < world.Facilities.Count; i++)
                storedCrystal += world.Facilities[i].Inventory.GetStock(ItemId.Crystal);
            for (int i = 0; i < world.ImportShips.Count; i++)
                if (world.ImportShips[i].Phase != ImportShipPhase.Departed)
                    storedCrystal += world.ImportShips[i].Cargo.GetStock(ItemId.Crystal);
            for (int i = 0; i < world.TransportOrders.Count; i++)
                if (world.TransportOrders[i].Item == ItemId.Crystal)
                    inTransitCrystal += world.TransportOrders[i].InTransitQuantity;

            Assert.That(world.ExportedCrystals + storedCrystal + inTransitCrystal, Is.EqualTo(producedCrystal),
                "Crystal output must remain accounted for through port loading and ship departure.");
        }

        [Test]
        public void SimulationPauseAndFourTimesSpeedUseTheSameGameClock()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.Clock.SetPaused(true);
            Assert.That(simulation.AdvanceRealSeconds(5d), Is.EqualTo(0));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(0));

            simulation.Clock.SetSpeed(GameSpeed.Four);
            Assert.That(simulation.AdvanceRealSeconds(1.25d), Is.EqualTo(5_000));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(5_000));
            Assert.That(simulation.World.FindFacility("port").Inventory.GetStock(ItemId.Iron), Is.EqualTo(100));
        }

        [Test]
        public void IdleDroneAtOutpostChangesRegionImmediately()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            DroneState drone = simulation.World.Drones[0];
            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Production));
            Assert.That(drone.PositionX, Is.EqualTo(simulation.World.FindFacility("outpost").Position.X));

            Assert.That(simulation.RequestDroneRegionChange(drone.Id, DroneRegion.Combat), Is.True);

            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Combat));
            Assert.That(drone.PendingRegion, Is.Null);
            Assert.That(drone.IsAvailable, Is.True);
        }

        [Test]
        public void IdleDroneReturnsToOutpostBeforeChangingRegion()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.SetRestockTarget("ironworks", ItemId.Iron, 0);
            simulation.SetRestockTarget("ammunition-factory", ItemId.Plate, 0);
            DroneState drone = simulation.World.Drones[4];
            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Combat));

            Assert.That(simulation.RequestDroneRegionChange(drone.Id, DroneRegion.Production), Is.True);

            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Combat));
            Assert.That(drone.PendingRegion, Is.EqualTo(DroneRegion.Production));
            Assert.That(drone.IsAvailable, Is.False);
            Assert.That(drone.IsReturningToOutpost, Is.True);

            AdvanceUntil(simulation, () => drone.Region == DroneRegion.Production && !drone.PendingRegion.HasValue,
                10_000, "idle drone return and region change");

            FacilityState outpost = simulation.World.FindFacility("outpost");
            Assert.That(drone.IsAvailable, Is.True);
            Assert.That(drone.IsReturningToOutpost, Is.False);
            Assert.That(drone.PositionX, Is.EqualTo(outpost.Position.X + outpost.Width * 0.5d));
            Assert.That(drone.PositionY, Is.EqualTo(outpost.Position.Y + outpost.Height * 0.5d));
        }

        [Test]
        public void ActiveTransportCompletesBeforeDroneChangesRegion()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.SetRestockTarget("ironworks", ItemId.Iron, 0);
            simulation.SetRestockTarget("ammunition-factory", ItemId.Plate, 0);
            GameWorld world = simulation.World;
            FacilityState outpost = world.FindFacility("outpost");
            FacilityState turret = world.FindFacility("turret");
            DroneState drone = world.Drones[4];
            Assert.That(turret.Inventory.TryRemove(ItemId.Ammunition, 5), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Ammunition, 5), Is.True);
            TransportOrder order = simulation.QueueTransfer(outpost.Id, turret.Id, ItemId.Ammunition, 5);
            simulation.AdvanceGameMilliseconds(50);
            Assert.That(drone.ActiveTransportOrderId, Is.EqualTo(order.Id));

            Assert.That(simulation.RequestDroneRegionChange(drone.Id, DroneRegion.Production), Is.True);

            Assert.That(drone.Region, Is.EqualTo(DroneRegion.Combat));
            Assert.That(drone.PendingRegion, Is.EqualTo(DroneRegion.Production));
            Assert.That(drone.ActiveTransportOrderId, Is.EqualTo(order.Id));
            AdvanceUntil(simulation, () => order.DeliveredQuantity == 5 &&
                    drone.Region == DroneRegion.Production && !drone.PendingRegion.HasValue,
                10_000, "active transport completion and drone region change");

            Assert.That(outpost.Inventory.GetStock(ItemId.Ammunition), Is.Zero);
            Assert.That(turret.Inventory.GetStock(ItemId.Ammunition), Is.EqualTo(60));
            Assert.That(order.State, Is.EqualTo(TransportOrderState.Completed));
            Assert.That(drone.ActiveTransportOrderId, Is.Null);
            Assert.That(drone.IsAvailable, Is.True);
            int deliveredEventIndex = world.Events.FindIndex(entry => entry.Category == "transport" &&
                entry.Detail == order.Id + ":delivered:5");
            int regionChangedEventIndex = world.Events.FindIndex(entry => entry.Category == "drone" &&
                entry.Detail == drone.Id + ":region-changed:Combat->Production");
            Assert.That(deliveredEventIndex, Is.GreaterThanOrEqualTo(0));
            Assert.That(regionChangedEventIndex, Is.GreaterThan(deliveredEventIndex));
        }

        [Test]
        public void OutpostRepairKeepsItsInitialPlanWhileWaitingAndFinishesPaidWorkBeforeMoreMaterials()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState outpost = simulation.World.FindFacility("outpost");
            simulation.DamageFacility(outpost.Id, 500);

            Assert.That(simulation.RequestRepair(outpost.Id), Is.True);
            RepairTask task = simulation.Repairs.GetTask(outpost.Id);
            Assert.That(task.PlannedRecoveryHitPoints, Is.EqualTo(500));

            simulation.DamageFacility(outpost.Id, 1_000);
            simulation.AdvanceGameMilliseconds(5_000);
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            Assert.That(task.PlannedRecoveryHitPoints, Is.EqualTo(500));
            Assert.That(task.PaidRecoveryHitPoints, Is.Zero);
            Assert.That(task.RestoredHitPoints, Is.Zero);

            Assert.That(outpost.Inventory.TryAdd(ItemId.Iron, 9), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Plate, 2), Is.True);
            simulation.AdvanceGameMilliseconds(50);
            Assert.That(task.PaidRecoveryHitPoints, Is.Zero);
            Assert.That(outpost.Inventory.GetStock(ItemId.Iron), Is.EqualTo(9));
            Assert.That(outpost.Inventory.GetStock(ItemId.Plate), Is.EqualTo(2));

            Assert.That(outpost.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Plate, 1), Is.True);
            simulation.AdvanceGameMilliseconds(50);
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(500));
            string outpostRepairDroneId = task.AssignedDroneId;
            Assert.That(outpostRepairDroneId, Is.Not.Null);

            AdvanceUntil(simulation, () => task.RestoredHitPoints == 500, 20_000,
                "initially paid Outpost repair tranche");
            Assert.That(outpost.Health, Is.EqualTo(4_000));
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            Assert.That(task.AssignedDroneId, Is.Null);
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(500));
            Assert.That(task.PlannedRecoveryHitPoints, Is.EqualTo(1_500));
            DroneState outpostRepairDrone = simulation.World.Drones.Find(drone => drone.Id == outpostRepairDroneId);
            Assert.That(outpostRepairDrone, Is.Not.Null);
            Assert.That(outpostRepairDrone.IsAvailable, Is.True);

            Assert.That(outpost.Inventory.TryAdd(ItemId.Iron, 19), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Plate, 4), Is.True);
            simulation.AdvanceGameMilliseconds(50);
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(1_400),
                "The affordable cumulative tranche should use the available Iron and Plate without rounding either item independently per tick.");
            Assert.That(outpost.Inventory.GetStock(ItemId.Iron), Is.EqualTo(1));
            Assert.That(outpost.Inventory.GetStock(ItemId.Plate), Is.Zero);

            AdvanceUntil(simulation, () => task.RestoredHitPoints == 1_400, 20_000,
                "partially funded Outpost repair tranche");
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            Assert.That(task.AssignedDroneId, Is.Null);

            FacilityState turret = simulation.World.FindFacility("turret");
            Assert.That(turret.Inventory.TryRemove(ItemId.Ammunition, 5), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Ammunition, 5), Is.True);
            TransportOrder droneReuseOrder = simulation.QueueTransfer(outpost.Id, turret.Id,
                ItemId.Ammunition, 5);
            simulation.AdvanceGameMilliseconds(50);
            Assert.That(outpostRepairDrone.IsAvailable, Is.False);
            Assert.That(outpostRepairDrone.ActiveTransportOrderId, Is.EqualTo(droneReuseOrder.Id),
                "The worker released at the repair tranche boundary should be eligible for new work.");
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            AdvanceUntil(simulation, () => droneReuseOrder.State == TransportOrderState.Completed, 10_000,
                "released Outpost repair drone to complete another task");
            Assert.That(outpostRepairDrone.IsAvailable, Is.True);

            Assert.That(outpost.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
            Assert.That(outpost.Inventory.TryAdd(ItemId.Plate, 1), Is.True);
            AdvanceUntil(simulation, () => simulation.Repairs.GetTask(outpost.Id) == null, 20_000,
                "remaining Outpost repair after the next material tranche");

            Assert.That(outpost.Health, Is.EqualTo(outpost.MaximumHealth));
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(1_500));
            Assert.That(task.RestoredHitPoints, Is.EqualTo(1_500));
            Assert.That(outpost.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(outpost.Inventory.GetStock(ItemId.Plate), Is.Zero);
        }

        [Test]
        public void TurretRepairCompletesPaidTrancheBeforeWaitingForCostsFromAdditionalDamage()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState turret = simulation.World.FindFacility("turret");
            simulation.DamageFacility(turret.Id, 100);

            Assert.That(simulation.RequestRepair(turret.Id), Is.True);
            RepairTask task = simulation.Repairs.GetTask(turret.Id);
            Assert.That(task.PlannedRecoveryHitPoints, Is.EqualTo(100));
            Assert.That(turret.Inventory.TryAdd(ItemId.Iron, 2), Is.True);
            Assert.That(turret.Inventory.TryAdd(ItemId.Plate, 1), Is.True);
            simulation.AdvanceGameMilliseconds(50);
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(100));
            string turretRepairDroneId = task.AssignedDroneId;
            Assert.That(turretRepairDroneId, Is.Not.Null);

            simulation.DamageFacility(turret.Id, 100);
            AdvanceUntil(simulation, () => task.RestoredHitPoints == 100, 10_000,
                "paid Turret repair tranche after additional damage");

            Assert.That(turret.Health, Is.EqualTo(900));
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            Assert.That(task.AssignedDroneId, Is.Null);
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(100));
            Assert.That(task.PlannedRecoveryHitPoints, Is.EqualTo(200));
            DroneState turretRepairDrone = simulation.World.Drones.Find(drone => drone.Id == turretRepairDroneId);
            Assert.That(turretRepairDrone, Is.Not.Null);
            Assert.That(turretRepairDrone.IsAvailable, Is.True);

            var reuseInventory = new InventoryStore("turret-repair-reuse.inventory");
            Assert.That(reuseInventory.TryAdd(ItemId.Iron, 2), Is.True);
            Assert.That(reuseInventory.TryAdd(ItemId.Plate, 1), Is.True);
            var reuseTurret = new FacilityState("turret-repair-reuse", FacilityKind.Turret,
                new GridPosition(80, 110), reuseInventory, maximumHealth: 1_000);
            reuseTurret.ApplyDamage(100);
            simulation.World.Facilities.Add(reuseTurret);
            Assert.That(simulation.RequestRepair(reuseTurret.Id), Is.True);
            RepairTask reuseTask = simulation.Repairs.GetTask(reuseTurret.Id);
            AdvanceUntil(simulation, () => reuseTask.AssignedDroneId == turretRepairDroneId, 1_000,
                "released Turret repair drone to take another repair task");
            AdvanceUntil(simulation, () => simulation.Repairs.GetTask(reuseTurret.Id) == null, 10_000,
                "released Turret repair drone to complete another task");
            Assert.That(reuseTurret.Health, Is.EqualTo(reuseTurret.MaximumHealth));
            Assert.That(reuseTask.PaidRecoveryHitPoints, Is.EqualTo(100));
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            Assert.That(turretRepairDrone.IsAvailable, Is.True);

            Assert.That(turret.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
            AdvanceUntil(simulation, () => task.RestoredHitPoints == 150, 10_000,
                "first separately supplied Turret repair increment");
            Assert.That(task.Status, Is.EqualTo(RepairTaskStatus.WaitingForMaterials));
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(150));
            Assert.That(task.AssignedDroneId, Is.Null);
            Assert.That(turretRepairDrone.IsAvailable, Is.True);
            Assert.That(turret.Inventory.GetStock(ItemId.Iron), Is.Zero);

            Assert.That(turret.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
            AdvanceUntil(simulation, () => simulation.Repairs.GetTask(turret.Id) == null, 10_000,
                "remaining Turret repair after material replenishment");

            Assert.That(turret.Health, Is.EqualTo(turret.MaximumHealth));
            Assert.That(task.PaidRecoveryHitPoints, Is.EqualTo(200));
            Assert.That(task.RestoredHitPoints, Is.EqualTo(200));
            Assert.That(turret.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(turret.Inventory.GetStock(ItemId.Plate), Is.Zero);
        }

        [Test]
        public void DestroyingOutpostImmediatelyEndsMatchAsDefeat()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            simulation.DamageFacility("outpost", GameDefinitions.Default.OutpostHealth);
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Defeat));
        }

        [Test]
        public void MatchEndsAtTheDeadlineWithoutExtendingPastIt()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.MatchDeadlineMilliseconds = 250_000;
            GameSimulation simulation = GameSimulation.CreateNewMatch(definitions);
            simulation.AdvanceGameMilliseconds(4_000_000);

            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Defeat));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(definitions.MatchDeadlineMilliseconds));
            Assert.That(simulation.Clock.Milliseconds, Is.EqualTo(definitions.MatchDeadlineMilliseconds));
        }

        [TestCase(1, 300_000, 10)]
        [TestCase(2, 420_000, 15)]
        [TestCase(30, 3_780_000, 155)]
        public void WaveScheduleMatchesConfirmedTable(int wave, int startMilliseconds, int enemies)
        {
            GameDefinitions definitions = GameDefinitions.Default;
            Assert.That(definitions.GetWaveStartMilliseconds(wave), Is.EqualTo(startMilliseconds));
            Assert.That(definitions.GetWaveEnemyCount(wave), Is.EqualTo(enemies));
            Assert.That(definitions.SplitWaveAcrossEntries(wave)[0] +
                        definitions.SplitWaveAcrossEntries(wave)[1] +
                        definitions.SplitWaveAcrossEntries(wave)[2], Is.EqualTo(enemies));
        }

        [Test]
        [Timeout(60_000)]
        public void EveryWaveMatchesTheConfirmedThirtyWaveSchedule()
        {
            GameDefinitions definitions = GameDefinitions.Default;
            Assert.That(definitions.WaveCount, Is.EqualTo(30));
            Assert.That(definitions.InitialWaveMilliseconds, Is.EqualTo(300_000));
            Assert.That(definitions.WaveIntervalMilliseconds, Is.EqualTo(120_000));
            Assert.That(definitions.FirstWaveEnemyCount, Is.EqualTo(10));
            Assert.That(definitions.AdditionalEnemiesPerWave, Is.EqualTo(5));
            Assert.That(definitions.MaximumEnemiesPerEntrySpawn, Is.EqualTo(3));

            for (int wave = 1; wave <= definitions.WaveCount; wave++)
            {
                int expectedStart = 300_000 + ((wave - 1) * 120_000);
                int expectedEnemies = 10 + ((wave - 1) * 5);
                int[] entries = definitions.SplitWaveAcrossEntries(wave);

                Assert.That(definitions.GetWaveStartMilliseconds(wave), Is.EqualTo(expectedStart),
                    "Unexpected start time for wave " + wave + ".");
                Assert.That(definitions.GetWaveEnemyCount(wave), Is.EqualTo(expectedEnemies),
                    "Unexpected enemy count for wave " + wave + ".");
                Assert.That(entries, Has.Length.EqualTo(3));
                Assert.That(entries[0] + entries[1] + entries[2], Is.EqualTo(expectedEnemies),
                    "Entry batches must preserve the wave total for wave " + wave + ".");
                Assert.That(entries[0], Is.GreaterThanOrEqualTo(entries[1]));
                Assert.That(entries[1], Is.GreaterThanOrEqualTo(entries[2]));
                Assert.That(entries[0] - entries[2], Is.LessThanOrEqualTo(1));
            }
        }

        [Test]
        public void ExportVictoryUsesActualStrictDepartureAndLossWinsTie()
        {
            Assert.That(MatchRules.Resolve(3_899_950, 2_000, false), Is.EqualTo(MatchOutcome.Victory));
            Assert.That(MatchRules.Resolve(3_900_000, 2_000, false), Is.EqualTo(MatchOutcome.Defeat));
            Assert.That(MatchRules.Resolve(3_899_950, 2_000, true), Is.EqualTo(MatchOutcome.Defeat));
        }

        [Test]
        public void EnemyRecordsOutpostArrivalOnceWhileContinuingToAttack()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.InitialWaveMilliseconds = 50;
            definitions.WaveCount = 1;
            definitions.FirstWaveEnemyCount = 1;
            definitions.AdditionalEnemiesPerWave = 0;
            definitions.MaximumEnemiesPerEntrySpawn = 1;
            definitions.EnemySpeedCellsPerSecond = 5;
            definitions.MatchDeadlineMilliseconds = 60_000;
            GameSimulation simulation = GameSimulation.CreateNewMatch(definitions);
            FacilityState outpost = simulation.World.FindFacility("outpost");
            simulation.DamageFacility("turret", definitions.TurretHealth);

            AdvanceUntil(simulation,
                () => simulation.World.Enemies.Exists(enemy => enemy.ReachedOutpost),
                20_000, "single enemy to reach the Outpost");
            EnemyState enemy = simulation.World.Enemies[0];
            string arrivalEvent = enemy.Id + ":attacking-outpost";

            Assert.That(simulation.World.Events.FindAll(entry => entry.Category == "combat" &&
                entry.Detail == arrivalEvent).Count, Is.EqualTo(1));
            int healthAtArrival = outpost.Health;
            simulation.AdvanceGameMilliseconds(2_000);

            Assert.That(outpost.Health, Is.LessThan(healthAtArrival));
            Assert.That(simulation.World.Events.FindAll(entry => entry.Category == "combat" &&
                entry.Detail == arrivalEvent).Count, Is.EqualTo(1));
        }

        private static GameSimulation CreateMatchWithoutAutomaticRestock()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.FindBuildableFacility(FacilityKind.Ironworks).RestockTargets = Array.Empty<ItemQuantityData>();
            definitions.FindBuildableFacility(FacilityKind.AmmunitionFactory).RestockTargets = Array.Empty<ItemQuantityData>();
            return GameSimulation.CreateNewMatch(definitions);
        }

        private static void AdvanceUntil(GameSimulation simulation, Func<bool> condition,
            int timeoutMilliseconds, string description, Func<string> diagnostics = null)
        {
            long deadline = simulation.CurrentMilliseconds + timeoutMilliseconds;
            while (!condition() && simulation.World.Outcome == MatchOutcome.Running &&
                   simulation.CurrentMilliseconds < deadline)
            {
                long remaining = deadline - simulation.CurrentMilliseconds;
                simulation.AdvanceGameMilliseconds(Math.Min(1_000, remaining));
            }

            string diagnosticText = diagnostics == null ? string.Empty : " " + diagnostics();
            Assert.That(condition(), Is.True, "Timed out waiting for " + description + " at " +
                simulation.CurrentMilliseconds + " ms; outcome: " + simulation.World.Outcome + "." + diagnosticText);
        }

        private static int SumDeliveredQuantity(GameWorld world, string sourceId, string destinationId,
            ItemId item, bool automaticOnly)
        {
            int delivered = 0;
            for (int i = 0; i < world.TransportOrders.Count; i++)
            {
                TransportOrder order = world.TransportOrders[i];
                if (order.SourceFacilityId != sourceId || order.DestinationFacilityId != destinationId ||
                    order.Item != item || (automaticOnly && !order.IsAutomatic)) continue;
                delivered += order.DeliveredQuantity;
            }

            return delivered;
        }

        private static string DescribeImportShips(GameWorld world)
        {
            var summary = new System.Text.StringBuilder();
            for (int i = 0; i < world.ImportShips.Count; i++)
            {
                ImportShipState ship = world.ImportShips[i];
                if (summary.Length > 0) summary.Append("; ");
                summary.Append(ship.Id).Append(" phase=").Append(ship.Phase)
                    .Append(" arrival=").Append(ship.ArrivalMilliseconds)
                    .Append(" docked=").Append(ship.DockedAtMilliseconds)
                    .Append(" eligible=").Append(ship.EligibleCrystalToLoad)
                    .Append(" loaded=").Append(ship.LoadedCrystal)
                    .Append(" remainingIron=").Append(ship.RemainingIron);
            }

            return summary.ToString();
        }

        private static string DescribeTransportOrders(GameWorld world)
        {
            var summary = new System.Text.StringBuilder();
            for (int i = 0; i < world.TransportOrders.Count; i++)
            {
                TransportOrder order = world.TransportOrders[i];
                if (order.State == TransportOrderState.Completed || order.State == TransportOrderState.Cancelled)
                    continue;
                if (summary.Length > 0) summary.Append("; ");
                summary.Append(order.SourceFacilityId).Append("->").Append(order.DestinationFacilityId)
                    .Append(':').Append(order.Item).Append(" state=").Append(order.State)
                    .Append(" delivered=").Append(order.DeliveredQuantity)
                    .Append(" reserved=").Append(order.ReservedQuantity)
                    .Append(" transit=").Append(order.InTransitQuantity);
            }

            return summary.ToString();
        }

        private static string DescribeDrones(GameWorld world)
        {
            var summary = new System.Text.StringBuilder();
            for (int i = 0; i < world.Drones.Count; i++)
            {
                DroneState drone = world.Drones[i];
                if (summary.Length > 0) summary.Append("; ");
                summary.Append(drone.Id).Append(" available=").Append(drone.IsAvailable)
                    .Append(" task=").Append(drone.ActiveTransportOrderId ?? drone.ActiveConstructionSiteId ?? "none")
                    .Append(" position=").Append(drone.PositionX).Append(',').Append(drone.PositionY);
            }

            return summary.ToString();
        }
    }
}
