using System.Collections.Generic;
using NUnit.Framework;

namespace ProjectC.Core.Tests
{
    public sealed class ConveyorSystemTests
    {
        [Test]
        [Timeout(60_000)]
        public void ConnectsValidPathBetweenBuiltConveyorTiles()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState source = AddFixtureFacility(simulation, "connect-source", FacilityKind.Miner, 10, 20);
            AddFixtureFacility(simulation, "connect-belt-a", FacilityKind.Conveyor, 11, 20);
            AddFixtureFacility(simulation, "connect-belt-b", FacilityKind.Conveyor, 12, 20);
            FacilityState destination = AddFixtureFacility(simulation, "connect-destination", FacilityKind.Ironworks, 13, 20);
            int eventCount = simulation.World.Events.Count;
            GridPosition[] cells = { new GridPosition(11, 20), new GridPosition(12, 20) };

            bool connected = simulation.TryConnectConveyorPath(source.Id, cells, destination.Id,
                out ConveyorPathState path, out string reason);

            Assert.That(connected, Is.True, reason);
            Assert.That(path, Is.Not.Null);
            Assert.That(path.SourceFacilityId, Is.EqualTo(source.Id));
            Assert.That(path.DestinationFacilityId, Is.EqualTo(destination.Id));
            Assert.That(path.Cells, Is.EqualTo(cells));
            Assert.That(path.ConnectionIds.Count, Is.EqualTo(3));
            Assert.That(simulation.Conveyors.Nodes.Count, Is.EqualTo(2));
            Assert.That(simulation.World.Events.Count, Is.EqualTo(eventCount + 1));
            Assert.That(simulation.World.Events[eventCount].Detail,
                Is.EqualTo(path.Id + ":connected:" + source.Id + "->" + destination.Id + ":cells:2"));
        }

        [Test]
        [Timeout(60_000)]
        public void ConveyorMovesAndDeliversWithoutDroneTransport()
        {
            LinearFixture fixture = CreateLinearFixture("delivery", initialIron: 1);
            int transportEventsBefore = CountEvents(fixture.Simulation, "transport");

            TickConveyors(fixture.Simulation, 20);

            Assert.That(fixture.Destination.Inventory.GetStock(ItemId.Iron), Is.EqualTo(1));
            Assert.That(fixture.Source.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(CountEvents(fixture.Simulation, "transport"), Is.EqualTo(transportEventsBefore),
                "Only ConveyorSystem.Tick ran; a Drone transport must not account for this delivery.");
            Assert.That(fixture.Simulation.World.Events.Exists(entry => entry.Category == "conveyor" &&
                entry.Detail.Contains(":delivered:Iron:" + fixture.Destination.Id)), Is.True);
        }

        [Test]
        [Timeout(60_000)]
        public void InvalidPlannedRouteCreatesNoPartialFacilitiesOrEvents()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState source = AddFixtureFacility(simulation, "invalid-source", FacilityKind.Miner, 10, 20);
            FacilityState destination = AddFixtureFacility(simulation, "invalid-destination", FacilityKind.Ironworks, 12, 20);
            int facilityCount = simulation.World.Facilities.Count;
            int constructionSiteCount = simulation.World.ConstructionSites.Count;
            int eventCount = simulation.World.Events.Count;
            GridPosition[] cells = { new GridPosition(11, 20), new GridPosition(11, 20) };

            bool placed = simulation.TryPlaceConveyorPath(source.Id, cells, destination.Id,
                out ConveyorPathState path, out string reason);

            Assert.That(placed, Is.False);
            Assert.That(path, Is.Null);
            Assert.That(reason, Is.EqualTo("path-repeats-a-cell"));
            Assert.That(simulation.World.Facilities.Count, Is.EqualTo(facilityCount));
            Assert.That(simulation.World.ConstructionSites.Count, Is.EqualTo(constructionSiteCount));
            Assert.That(simulation.World.Events.Count, Is.EqualTo(eventCount));
        }

        [Test]
        [Timeout(60_000)]
        public void ReversingBeltKeepsCargoAlreadyOnIt()
        {
            LinearFixture fixture = CreateLinearFixture("reverse", initialIron: 1);
            TickConveyors(fixture.Simulation, 1);
            ConveyorNodeState node = fixture.Simulation.Conveyors.GetNode(fixture.Belt.Id);
            Assert.That(node, Is.Not.Null);
            Assert.That(node.Item, Is.EqualTo(ItemId.Iron));

            Assert.That(fixture.Simulation.Conveyors.ReverseDirection(fixture.Simulation.World, fixture.Belt.Id,
                GameSimulation.SimulationStepMilliseconds), Is.True);

            Assert.That(node.Item, Is.EqualTo(ItemId.Iron));
            Assert.That(node.DirectionReversed, Is.True);
            Assert.That(fixture.Simulation.World.Events.Exists(entry => entry.Category == "conveyor" &&
                entry.Detail == fixture.Belt.Id + ":direction-reversed:True"), Is.True);

            TickConveyors(fixture.Simulation, 2);

            Assert.That(fixture.Source.Inventory.GetStock(ItemId.Iron), Is.EqualTo(1),
                "The cargo already on the belt must travel back to its source after reversal.");
            Assert.That(fixture.Destination.Inventory.GetStock(ItemId.Iron), Is.Zero);
            Assert.That(node.Item.HasValue, Is.False);
            Assert.That(fixture.Simulation.World.Events.Exists(entry => entry.Category == "conveyor" &&
                entry.Detail.Contains(":delivered:Iron:" + fixture.Source.Id)), Is.True);
        }

        [Test]
        [Timeout(60_000)]
        public void SplitterFiltersItemsAndSelectsTheCompatibleBranch()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState source = AddFixtureFacility(simulation, "split-source", FacilityKind.Port,
                10, 20, ItemId.Plate, 5);
            Assert.That(source.Inventory.TryAdd(ItemId.Plate, 1), Is.True);
            FacilityState inputBelt = AddFixtureFacility(simulation, "split-input", FacilityKind.Conveyor, 11, 20);
            FacilityState splitter = AddFixtureFacility(simulation, "splitter", FacilityKind.Splitter, 12, 20);
            AddFixtureFacility(simulation, "split-iron-belt", FacilityKind.Conveyor, 13, 20);
            FacilityState ironBranch = AddFixtureFacility(simulation, "split-iron-sink", FacilityKind.Warehouse, 14, 20,
                ItemId.Plate, 5);
            ironBranch.Inventory.SetCapacity(ItemId.Iron, 5);
            AddFixtureFacility(simulation, "split-plate-belt", FacilityKind.Conveyor, 12, 21);
            FacilityState plateBranch = AddFixtureFacility(simulation, "split-plate-sink", FacilityKind.Warehouse, 12, 22,
                ItemId.Plate, 5);

            ConnectPath(simulation, source.Id, new GridPosition(11, 20), splitter.Id);
            ConveyorPathState ironPath = ConnectPath(simulation, splitter.Id,
                new GridPosition(13, 20), ironBranch.Id);
            ConveyorPathState platePath = ConnectPath(simulation, splitter.Id,
                new GridPosition(12, 21), plateBranch.Id);
            Assert.That(simulation.SetConveyorOutputFilter(ironPath.Id, new[] { ItemId.Iron }), Is.True);
            Assert.That(simulation.SetConveyorOutputFilter(platePath.Id, new[] { ItemId.Plate }), Is.True);
            Assert.That(simulation.Conveyors.GetNode(inputBelt.Id), Is.Not.Null);
            Assert.That(simulation.Conveyors.TryGetPathFilter(ironPath.Id, out bool ironFiltered,
                out ItemId[] ironAllowed), Is.True);
            Assert.That(ironFiltered, Is.True);
            Assert.That(ironAllowed, Is.EqualTo(new[] { ItemId.Iron }));

            TickConveyors(simulation, 12);

            Assert.That(ironBranch.Inventory.GetStock(ItemId.Plate), Is.Zero,
                "The Iron-only branch must reject Plate despite having capacity for it.");
            Assert.That(plateBranch.Inventory.GetStock(ItemId.Plate), Is.EqualTo(1));
            Assert.That(simulation.World.Events.Exists(entry => entry.Category == "conveyor" &&
                entry.Detail.Contains(":delivered:Plate:" + plateBranch.Id)), Is.True);
        }

        [Test]
        [Timeout(60_000)]
        public void MergerRotatesAcrossReadyInputsFairly()
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState sourceA = AddFixtureFacility(simulation, "merge-source-a", FacilityKind.Miner,
                30, 20, ItemId.Iron, 5);
            FacilityState sourceB = AddFixtureFacility(simulation, "merge-source-b", FacilityKind.Miner,
                32, 18, ItemId.Iron, 5);
            Assert.That(sourceA.Inventory.TryAdd(ItemId.Iron, 5), Is.True);
            Assert.That(sourceB.Inventory.TryAdd(ItemId.Iron, 5), Is.True);
            AddFixtureFacility(simulation, "merge-input-a", FacilityKind.Conveyor, 31, 20);
            AddFixtureFacility(simulation, "merge-input-b", FacilityKind.Conveyor, 32, 19);
            FacilityState merger = AddFixtureFacility(simulation, "merge-hub", FacilityKind.Merger, 32, 20);
            AddFixtureFacility(simulation, "merge-output", FacilityKind.Conveyor, 32, 21);
            FacilityState destination = AddFixtureFacility(simulation, "merge-destination", FacilityKind.Warehouse,
                32, 22, ItemId.Iron, 20);

            ConnectPath(simulation, sourceA.Id, new GridPosition(31, 20), merger.Id);
            ConnectPath(simulation, sourceB.Id, new GridPosition(32, 19), merger.Id);
            ConnectPath(simulation, merger.Id, new GridPosition(32, 21), destination.Id);

            TickConveyors(simulation, 20);

            var mergedInputs = new List<string>();
            for (int i = 0; i < simulation.World.Events.Count; i++)
            {
                string detail = simulation.World.Events[i].Detail;
                int mergedIndex = detail.IndexOf(":merged:");
                if (simulation.World.Events[i].Category != "conveyor" || mergedIndex < 0) continue;
                int sourceStart = mergedIndex + ":merged:".Length;
                int destinationSeparator = detail.IndexOf("->", sourceStart);
                if (destinationSeparator > sourceStart)
                    mergedInputs.Add(detail.Substring(sourceStart, destinationSeparator - sourceStart));
            }

            Assert.That(mergedInputs.Count, Is.GreaterThanOrEqualTo(3));
            Assert.That(mergedInputs[0], Is.EqualTo("merge-input-a"));
            Assert.That(mergedInputs[1], Is.EqualTo("merge-input-b"));
            Assert.That(mergedInputs[2], Is.EqualTo("merge-input-a"));
            Assert.That(destination.Inventory.GetStock(ItemId.Iron), Is.GreaterThan(0));
        }

        [Test]
        [Timeout(60_000)]
        public void DestroyedAndRemovedBeltNodesKeepCargoInertAndDoNotDeliverIt()
        {
            LinearFixture destroyedFixture = CreateLinearFixture("destroyed", initialIron: 1, beltHealth: 100);
            TickConveyors(destroyedFixture.Simulation, 1);
            ConveyorNodeState destroyedNode = destroyedFixture.Simulation.Conveyors.GetNode(destroyedFixture.Belt.Id);
            destroyedFixture.Belt.ApplyDamage(100);

            TickConveyors(destroyedFixture.Simulation, 10, GameSimulation.SimulationStepMilliseconds);

            Assert.That(destroyedFixture.Belt.IsDestroyed, Is.True);
            Assert.That(destroyedNode.Item, Is.EqualTo(ItemId.Iron));
            Assert.That(destroyedFixture.Destination.Inventory.GetStock(ItemId.Iron), Is.Zero);

            LinearFixture removedFixture = CreateLinearFixture("removed", initialIron: 1);
            TickConveyors(removedFixture.Simulation, 1);
            ConveyorNodeState removedNode = removedFixture.Simulation.Conveyors.GetNode(removedFixture.Belt.Id);
            Assert.That(removedFixture.Simulation.World.Facilities.Remove(removedFixture.Belt), Is.True);

            TickConveyors(removedFixture.Simulation, 10, GameSimulation.SimulationStepMilliseconds);

            Assert.That(removedFixture.Simulation.Conveyors.GetNode(removedFixture.Belt.Id), Is.SameAs(removedNode),
                "Cargo on a removed cell remains represented by an inert node.");
            Assert.That(removedNode.Item, Is.EqualTo(ItemId.Iron));
            Assert.That(removedFixture.Destination.Inventory.GetStock(ItemId.Iron), Is.Zero);
        }

        private static LinearFixture CreateLinearFixture(string prefix, int initialIron = 0, int beltHealth = 0)
        {
            GameSimulation simulation = GameSimulation.CreateNewMatch();
            FacilityState source = AddFixtureFacility(simulation, prefix + "-source", FacilityKind.Miner,
                10, 20, ItemId.Iron, 10);
            FacilityState belt = AddFixtureFacility(simulation, prefix + "-belt", FacilityKind.Conveyor,
                11, 20, maximumHealth: beltHealth);
            FacilityState destination = AddFixtureFacility(simulation, prefix + "-destination", FacilityKind.Ironworks,
                12, 20, ItemId.Iron, 10);
            if (initialIron > 0) Assert.That(source.Inventory.TryAdd(ItemId.Iron, initialIron), Is.True);
            ConnectPath(simulation, source.Id, new GridPosition(11, 20), destination.Id);
            return new LinearFixture(simulation, source, belt, destination);
        }

        private static FacilityState AddFixtureFacility(GameSimulation simulation, string id, FacilityKind kind,
            int x, int y, ItemId? capacityItem = null, int capacity = 0, int maximumHealth = 0)
        {
            var inventory = new InventoryStore("fixture." + id);
            if (capacityItem.HasValue) inventory.SetCapacity(capacityItem.Value, capacity);
            var facility = new FacilityState(id, kind, new GridPosition(x, y), inventory,
                maximumHealth, width: 1, height: 1);
            simulation.World.Facilities.Add(facility);
            return facility;
        }

        private static ConveyorPathState ConnectPath(GameSimulation simulation, string sourceId,
            GridPosition cell, string destinationId)
        {
            Assert.That(simulation.TryConnectConveyorPath(sourceId, new[] { cell }, destinationId,
                out ConveyorPathState path, out string reason), Is.True, reason);
            return path;
        }

        private static void TickConveyors(GameSimulation simulation, int ticks, long elapsedBeforeStart = 0)
        {
            long currentMilliseconds = elapsedBeforeStart;
            for (int tick = 1; tick <= ticks; tick++)
            {
                currentMilliseconds += GameSimulation.SimulationStepMilliseconds;
                simulation.Conveyors.Tick(simulation.World, currentMilliseconds,
                    GameSimulation.SimulationStepMilliseconds);
            }
        }

        private static int CountEvents(GameSimulation simulation, string category)
        {
            int count = 0;
            for (int i = 0; i < simulation.World.Events.Count; i++)
                if (simulation.World.Events[i].Category == category) count++;
            return count;
        }

        private sealed class LinearFixture
        {
            public LinearFixture(GameSimulation simulation, FacilityState source, FacilityState belt,
                FacilityState destination)
            {
                Simulation = simulation;
                Source = source;
                Belt = belt;
                Destination = destination;
            }

            public GameSimulation Simulation { get; }
            public FacilityState Source { get; }
            public FacilityState Belt { get; }
            public FacilityState Destination { get; }
        }
    }
}
