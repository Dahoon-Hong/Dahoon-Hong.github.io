using NUnit.Framework;

namespace ProjectC.Core.Tests
{
    public sealed class EventBoundaryDepartureTests
    {
        private const long ExportDepartureMilliseconds = 5_050;

        [Test]
        public void EV01_ActualShipDepartureBeforeDeadlineWins()
        {
            GameDefinitions definitions = CreateDefinitions(matchDeadlineMilliseconds: 5_100);
            GameSimulation simulation = CreateSingleCrystalExportMatch(definitions);

            simulation.AdvanceGameMilliseconds(ExportDepartureMilliseconds);

            ImportShipState ship = simulation.World.ImportShips[0];
            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Departed));
            Assert.That(ship.LoadedCrystal, Is.EqualTo(1));
            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(1));
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Victory));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(ExportDepartureMilliseconds));
            AssertExportEventAt(simulation, ship, ExportDepartureMilliseconds);
        }

        [Test]
        public void EV02_ActualShipDepartureAtDeadlineLoses()
        {
            GameDefinitions definitions = CreateDefinitions(matchDeadlineMilliseconds: 5_050);
            GameSimulation simulation = CreateSingleCrystalExportMatch(definitions);

            simulation.AdvanceGameMilliseconds(ExportDepartureMilliseconds);

            ImportShipState ship = simulation.World.ImportShips[0];
            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Departed));
            Assert.That(ship.LoadedCrystal, Is.EqualTo(1));
            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(1));
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Defeat));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(ExportDepartureMilliseconds));
            AssertExportEventAt(simulation, ship, ExportDepartureMilliseconds);
        }

        [Test]
        public void EV03_SameTickOutpostDestructionTakesPrecedenceOverActualExportDeparture()
        {
            GameDefinitions definitions = CreateDefinitions(matchDeadlineMilliseconds: 5_100,
                lethalWestEntryWave: true);
            GameSimulation simulation = CreateSingleCrystalExportMatch(definitions);
            simulation.DamageFacility("turret", definitions.TurretHealth);

            simulation.AdvanceGameMilliseconds(ExportDepartureMilliseconds);

            ImportShipState ship = simulation.World.ImportShips[0];
            FacilityState outpost = simulation.World.FindFacility(FacilityKind.Outpost);
            Assert.That(outpost.IsDestroyed, Is.True);
            Assert.That(ship.Phase, Is.EqualTo(ImportShipPhase.Departed));
            Assert.That(ship.LoadedCrystal, Is.EqualTo(1));
            Assert.That(simulation.World.ExportedCrystals, Is.EqualTo(1));
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Defeat));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(ExportDepartureMilliseconds));
            Assert.That(simulation.World.Events.Exists(entry =>
                entry.TimeMilliseconds == ExportDepartureMilliseconds &&
                entry.Category == "combat" && entry.Detail == "enemy-1:facility-destroyed:outpost"), Is.True);
            Assert.That(simulation.World.Events.Exists(entry =>
                entry.TimeMilliseconds == ExportDepartureMilliseconds &&
                entry.Category == "match" && entry.Detail == "outpost-destroyed"), Is.True);
            AssertExportEventAt(simulation, ship, ExportDepartureMilliseconds);
        }

        [Test]
        public void DefaultMatchDeadlineRemains3900000Milliseconds()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();

            Assert.That(simulation.World.Definitions.MatchDeadlineMilliseconds, Is.EqualTo(3_900_000));
        }

        private static GameDefinitions CreateDefinitions(int matchDeadlineMilliseconds,
            bool lethalWestEntryWave = false)
        {
            GameDefinitions definitions = GameDefinitions.CreateDefault();
            definitions.ExportGoal = 1;
            definitions.MatchDeadlineMilliseconds = matchDeadlineMilliseconds;
            definitions.WaveCount = 1;
            definitions.FirstWaveEnemyCount = 1;
            definitions.AdditionalEnemiesPerWave = 0;
            definitions.MaximumEnemiesPerEntrySpawn = 1;
            definitions.InitialWaveMilliseconds = lethalWestEntryWave
                ? 4_050
                : matchDeadlineMilliseconds + GameSimulation.SimulationStepMilliseconds;

            if (lethalWestEntryWave)
            {
                definitions.EnemySpeedCellsPerSecond = 2_000;
                definitions.EnemyDamagePerSecond = definitions.OutpostHealth;
            }

            return definitions;
        }

        private static GameSimulation CreateSingleCrystalExportMatch(GameDefinitions definitions)
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch(definitions);
            InventoryStore port = simulation.World.FindFacility(FacilityKind.Port).Inventory;
            Assert.That(port.TryAdd(ItemId.Crystal, 1), Is.True);
            return simulation;
        }

        private static void AssertExportEventAt(GameSimulation simulation, ImportShipState ship, long timeMilliseconds)
        {
            Assert.That(simulation.World.Events.Exists(entry =>
                entry.TimeMilliseconds == timeMilliseconds && entry.Category == "export" &&
                entry.Detail == ship.Id + ":departed-crystal:1"), Is.True);
        }
    }
}
