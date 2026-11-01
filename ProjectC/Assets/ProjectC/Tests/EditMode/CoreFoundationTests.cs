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
        public void ExportVictoryUsesActualStrictDepartureAndLossWinsTie()
        {
            Assert.That(MatchRules.Resolve(3_899_950, 2_000, false), Is.EqualTo(MatchOutcome.Victory));
            Assert.That(MatchRules.Resolve(3_900_000, 2_000, false), Is.EqualTo(MatchOutcome.Defeat));
            Assert.That(MatchRules.Resolve(3_899_950, 2_000, true), Is.EqualTo(MatchOutcome.Defeat));
        }

        private static GameSimulation CreateMatchWithoutAutomaticRestock()
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.FindBuildableFacility(FacilityKind.Ironworks).RestockTargets = Array.Empty<ItemQuantityData>();
            definitions.FindBuildableFacility(FacilityKind.AmmunitionFactory).RestockTargets = Array.Empty<ItemQuantityData>();
            return GameSimulation.CreateNewMatch(definitions);
        }
    }
}
