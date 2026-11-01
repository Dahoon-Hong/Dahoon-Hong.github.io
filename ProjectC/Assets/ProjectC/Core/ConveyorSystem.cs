using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    /// <summary>One occupied or empty tile in the directed conveyor network.</summary>
    public sealed class ConveyorNodeState
    {
        internal ConveyorNodeState(FacilityState facility)
        {
            FacilityId = facility.Id;
            Position = facility.Position;
            Kind = facility.Kind;
        }

        public string FacilityId { get; }
        public GridPosition Position { get; }
        public FacilityKind Kind { get; }
        public ItemId? Item { get; internal set; }
        public int ProgressMilliseconds { get; internal set; }
        public bool DirectionReversed { get; internal set; }
        internal int InputCursor { get; set; }
        internal int OutputCursor { get; set; }
        internal List<ConveyorConnection> Incoming { get; } = new List<ConveyorConnection>();
        internal List<ConveyorConnection> Outgoing { get; } = new List<ConveyorConnection>();
    }

    /// <summary>A directed set of connected conveyor tiles between two facility ports.</summary>
    public sealed class ConveyorPathState
    {
        internal ConveyorPathState(string id, string sourceFacilityId, string destinationFacilityId,
            List<GridPosition> cells, List<string> connectionIds)
        {
            Id = id;
            SourceFacilityId = sourceFacilityId;
            DestinationFacilityId = destinationFacilityId;
            Cells = cells.AsReadOnly();
            ConnectionIds = connectionIds.AsReadOnly();
        }

        public string Id { get; }
        public string SourceFacilityId { get; }
        public string DestinationFacilityId { get; }
        public IReadOnlyList<GridPosition> Cells { get; }
        public IReadOnlyList<string> ConnectionIds { get; }
    }

    internal sealed class ConveyorConnection
    {
        public ConveyorConnection(string id, string pathId, ConveyorNodeState sourceNode,
            FacilityState sourceFacility, ConveyorNodeState destinationNode, FacilityState destinationFacility)
        {
            Id = id;
            PathId = pathId;
            SourceNode = sourceNode;
            SourceFacility = sourceFacility;
            DestinationNode = destinationNode;
            DestinationFacility = destinationFacility;
        }

        public string Id { get; }
        public string PathId { get; }
        public ConveyorNodeState SourceNode { get; private set; }
        public FacilityState SourceFacility { get; private set; }
        public ConveyorNodeState DestinationNode { get; private set; }
        public FacilityState DestinationFacility { get; private set; }
        public HashSet<ItemId> AllowedItems { get; set; }

        public void Reverse()
        {
            ConveyorNodeState node = SourceNode;
            SourceNode = DestinationNode;
            DestinationNode = node;
            FacilityState facility = SourceFacility;
            SourceFacility = DestinationFacility;
            DestinationFacility = facility;
        }
    }

    /// <summary>Moves one item per conveyor cell per game-time interval without depending on Unity.</summary>
    public sealed class ConveyorSystem
    {
        private readonly Dictionary<string, ConveyorNodeState> nodesByFacilityId =
            new Dictionary<string, ConveyorNodeState>(StringComparer.Ordinal);
        private readonly List<ConveyorNodeState> nodes = new List<ConveyorNodeState>();
        private readonly List<ConveyorConnection> connections = new List<ConveyorConnection>();
        private readonly List<ConveyorPathState> paths = new List<ConveyorPathState>();
        private readonly IReadOnlyList<ConveyorNodeState> nodesView;
        private readonly IReadOnlyList<ConveyorPathState> pathsView;
        private int nextPathNumber = 1;
        private int nextConnectionNumber = 1;

        public ConveyorSystem()
        {
            nodesView = nodes.AsReadOnly();
            pathsView = paths.AsReadOnly();
        }

        public IReadOnlyList<ConveyorNodeState> Nodes => nodesView;
        public IReadOnlyList<ConveyorPathState> Paths => pathsView;

        /// <summary>
        /// Connects already placed conveyor, splitter, or merger facilities in the supplied tile order.
        /// Cells are the intermediate belt tiles; the first and last must touch their endpoint facility.
        /// </summary>
        public bool TryConnectPath(GameWorld world, string sourceFacilityId, IList<GridPosition> cells,
            string destinationFacilityId, long currentMilliseconds, out ConveyorPathState path, out string reason)
        {
            path = null;
            reason = string.Empty;
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (string.IsNullOrWhiteSpace(sourceFacilityId) || string.IsNullOrWhiteSpace(destinationFacilityId) ||
                sourceFacilityId == destinationFacilityId)
                return Fail("invalid-endpoint", out reason);
            if (cells == null || cells.Count == 0) return Fail("path-needs-at-least-one-tile", out reason);

            FacilityState source = world.FindFacility(sourceFacilityId);
            FacilityState destination = world.FindFacility(destinationFacilityId);
            if (source == null || destination == null) return Fail("endpoint-not-found", out reason);
            if (!CanRouteBetweenRegions(world, source, destination)) return Fail("outpost-relay-required", out reason);

            var cellFacilities = new List<FacilityState>(cells.Count);
            var visited = new HashSet<GridPosition>();
            for (int i = 0; i < cells.Count; i++)
            {
                GridPosition cell = cells[i];
                if (!visited.Add(cell)) return Fail("path-repeats-a-cell", out reason);
                if (cell.X < 0 || cell.X >= world.Definitions.MapWidth ||
                    cell.Y < 0 || cell.Y >= world.Definitions.MapHeight)
                    return Fail("path-outside-map", out reason);
                if (world.Definitions.IsMountainCell(cell.X, cell.Y)) return Fail("mountain", out reason);
                if (i > 0 && Manhattan(cells[i - 1], cell) != 1)
                    return Fail("path-must-use-four-direction-connections", out reason);
                FacilityState belt = FindConveyorAt(world, cell);
                if (belt == null) return Fail("path-cell-needs-a-built-conveyor", out reason);
                if (belt.Kind == FacilityKind.Conveyor && IsConnectedOrdinaryBelt(world, cell))
                    return Fail("overlaps-existing-belt", out reason);
                if (belt.Id == source.Id || belt.Id == destination.Id)
                    return Fail("endpoint-is-not-an-intermediate-path-cell", out reason);
                if (belt.IsDestroyed || belt.IsDemolishing) return Fail("path-cell-unavailable", out reason);
                cellFacilities.Add(belt);
            }

            if (!TouchesFacility(cells[0], source) || !TouchesFacility(cells[cells.Count - 1], destination))
                return Fail("path-must-touch-both-endpoints", out reason);

            for (int i = 0; i < paths.Count; i++)
                if (SamePath(paths[i], sourceFacilityId, destinationFacilityId, cells))
                    return Fail("path-already-connected", out reason);

            string pathId = "conveyor-path-" + nextPathNumber;
            var candidateNodes = new Dictionary<string, ConveyorNodeState>(StringComparer.Ordinal);
            ConveyorNodeState[] routeNodes = new ConveyorNodeState[cellFacilities.Count];
            for (int i = 0; i < cellFacilities.Count; i++)
                routeNodes[i] = GetCandidateNode(cellFacilities[i], candidateNodes);

            ConveyorNodeState sourceNode = IsConveyor(source) ? GetCandidateNode(source, candidateNodes) : null;
            ConveyorNodeState destinationNode = IsConveyor(destination) ? GetCandidateNode(destination, candidateNodes) : null;
            var proposed = new List<ConveyorConnection>(routeNodes.Length + 1);
            for (int i = 0; i <= routeNodes.Length; i++)
            {
                ConveyorNodeState fromNode = i == 0 ? sourceNode : routeNodes[i - 1];
                FacilityState fromFacility = i == 0 && sourceNode == null ? source : null;
                ConveyorNodeState toNode = i == routeNodes.Length ? destinationNode : routeNodes[i];
                FacilityState toFacility = i == routeNodes.Length && destinationNode == null ? destination : null;
                if (!CanConnectEndpoints(fromNode, fromFacility, toNode, toFacility))
                    return Fail("connection-endpoints-must-share-a-side", out reason);
                proposed.Add(new ConveyorConnection("conveyor-link-pending", pathId,
                    fromNode, fromFacility, toNode, toFacility));
            }

            if (!HasConnectionCapacity(proposed, out reason)) return false;

            foreach (KeyValuePair<string, ConveyorNodeState> candidate in candidateNodes)
            {
                nodesByFacilityId.Add(candidate.Key, candidate.Value);
                nodes.Add(candidate.Value);
            }

            var connectionIds = new List<string>(proposed.Count);
            for (int i = 0; i < proposed.Count; i++)
            {
                ConveyorConnection connection = proposed[i];
                connection = new ConveyorConnection("conveyor-link-" + nextConnectionNumber++, pathId,
                    connection.SourceNode, connection.SourceFacility,
                    connection.DestinationNode, connection.DestinationFacility);
                Attach(connection);
                connections.Add(connection);
                connectionIds.Add(connection.Id);
            }

            path = new ConveyorPathState(pathId, sourceFacilityId, destinationFacilityId,
                new List<GridPosition>(cells), connectionIds);
            paths.Add(path);
            nextPathNumber++;
            world.Record(currentMilliseconds, "conveyor", path.Id + ":connected:" + sourceFacilityId + "->" + destinationFacilityId +
                ":cells:" + cells.Count);
            return true;
        }

        /// <summary>Preflights a new all-belt path before construction creates any sites or events.</summary>
        public bool CanConnectPlannedPath(GameWorld world, string sourceFacilityId, IList<GridPosition> cells,
            string destinationFacilityId, out string reason)
        {
            reason = string.Empty;
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (string.IsNullOrWhiteSpace(sourceFacilityId) || string.IsNullOrWhiteSpace(destinationFacilityId) ||
                sourceFacilityId == destinationFacilityId)
                return Fail("invalid-endpoint", out reason);
            if (cells == null || cells.Count == 0) return Fail("path-needs-at-least-one-tile", out reason);

            FacilityState source = world.FindFacility(sourceFacilityId);
            FacilityState destination = world.FindFacility(destinationFacilityId);
            if (source == null || destination == null) return Fail("endpoint-not-found", out reason);
            if (!CanRouteBetweenRegions(world, source, destination)) return Fail("outpost-relay-required", out reason);

            var candidateNodes = new Dictionary<string, ConveyorNodeState>(StringComparer.Ordinal);
            var routeNodes = new ConveyorNodeState[cells.Count];
            var visited = new HashSet<GridPosition>();
            for (int i = 0; i < cells.Count; i++)
            {
                GridPosition cell = cells[i];
                if (!visited.Add(cell)) return Fail("path-repeats-a-cell", out reason);
                if (cell.X < 0 || cell.X >= world.Definitions.MapWidth ||
                    cell.Y < 0 || cell.Y >= world.Definitions.MapHeight)
                    return Fail("path-outside-map", out reason);
                if (world.Definitions.IsMountainCell(cell.X, cell.Y)) return Fail("mountain", out reason);
                if (i > 0 && Manhattan(cells[i - 1], cell) != 1)
                    return Fail("path-must-use-four-direction-connections", out reason);
                if (HasFacilityAt(world, cell)) return Fail("occupied", out reason);
                if (HasExistingPathCell(cell)) return Fail("overlaps-existing-belt", out reason);

                string id = "planned-conveyor-" + cell.X + "-" + cell.Y;
                var plannedFacility = new FacilityState(id, FacilityKind.Conveyor, cell,
                    new InventoryStore("planned." + id), 0, 1, 1);
                routeNodes[i] = GetCandidateNode(plannedFacility, candidateNodes);
            }

            if (!TouchesFacility(cells[0], source) || !TouchesFacility(cells[cells.Count - 1], destination))
                return Fail("path-must-touch-both-endpoints", out reason);
            for (int i = 0; i < paths.Count; i++)
                if (SamePath(paths[i], sourceFacilityId, destinationFacilityId, cells))
                    return Fail("path-already-connected", out reason);

            string pathId = "planned-conveyor-path";
            ConveyorNodeState sourceNode = IsConveyor(source) ? GetCandidateNode(source, candidateNodes) : null;
            ConveyorNodeState destinationNode = IsConveyor(destination) ? GetCandidateNode(destination, candidateNodes) : null;
            var proposed = new List<ConveyorConnection>(routeNodes.Length + 1);
            for (int i = 0; i <= routeNodes.Length; i++)
            {
                ConveyorNodeState fromNode = i == 0 ? sourceNode : routeNodes[i - 1];
                FacilityState fromFacility = i == 0 && sourceNode == null ? source : null;
                ConveyorNodeState toNode = i == routeNodes.Length ? destinationNode : routeNodes[i];
                FacilityState toFacility = i == routeNodes.Length && destinationNode == null ? destination : null;
                if (!CanConnectEndpoints(fromNode, fromFacility, toNode, toFacility))
                    return Fail("connection-endpoints-must-share-a-side", out reason);
                proposed.Add(new ConveyorConnection("planned-conveyor-link", pathId,
                    fromNode, fromFacility, toNode, toFacility));
            }

            return HasConnectionCapacity(proposed, out reason);
        }

        /// <summary>Sets the allowed items for a path leaving a splitter. Null allows all items; an empty set blocks all.</summary>
        public bool SetSplitterOutputFilter(GameWorld world, string pathId, IEnumerable<ItemId> allowedItems,
            long currentMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            ConveyorPathState path = FindPath(pathId);
            if (path == null) return false;
            FacilityState source = world.FindFacility(path.SourceFacilityId);
            if (source == null || source.Kind != FacilityKind.Splitter) return false;
            ConveyorConnection output = FindConnection(path.ConnectionIds[0]);
            if (output == null) return false;
            output.AllowedItems = allowedItems == null ? null : new HashSet<ItemId>(allowedItems);
            world.Record(currentMilliseconds, "conveyor", path.Id + ":filter:" + (output.AllowedItems == null
                ? "all" : string.Join(",", output.AllowedItems)));
            return true;
        }

        public bool TryGetPathFilter(string pathId, out bool isFiltered, out ItemId[] allowedItems)
        {
            isFiltered = false;
            allowedItems = new ItemId[0];
            ConveyorPathState path = FindPath(pathId);
            if (path == null) return false;

            ConveyorConnection output = path.ConnectionIds.Count == 0 ? null : FindConnection(path.ConnectionIds[0]);
            if (output == null || output.AllowedItems == null) return true;

            isFiltered = true;
            var values = new List<ItemId>();
            foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
                if (output.AllowedItems.Contains(item)) values.Add(item);
            allowedItems = values.ToArray();
            return true;
        }

        /// <summary>Reverses the two connections on one complete ordinary belt tile and keeps its cargo.</summary>
        public bool ReverseDirection(GameWorld world, string facilityId, long currentMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (!nodesByFacilityId.TryGetValue(facilityId, out ConveyorNodeState node) ||
                node.Kind != FacilityKind.Conveyor || node.Incoming.Count != 1 || node.Outgoing.Count != 1)
                return false;

            ConveyorConnection incoming = node.Incoming[0];
            ConveyorConnection outgoing = node.Outgoing[0];
            Detach(incoming);
            Detach(outgoing);
            incoming.Reverse();
            outgoing.Reverse();
            Attach(incoming);
            Attach(outgoing);
            node.DirectionReversed = !node.DirectionReversed;
            world.Record(currentMilliseconds, "conveyor", facilityId + ":direction-reversed:" + node.DirectionReversed);
            return true;
        }

        public ConveyorNodeState GetNode(string facilityId) =>
            nodesByFacilityId.TryGetValue(facilityId, out ConveyorNodeState node) ? node : null;

        /// <summary>Returns the grid step selected by the active output route for a belt's current item.</summary>
        public bool TryGetOutputStep(GameWorld world, string facilityId, out GridPosition step)
        {
            step = default;
            if (world == null || !nodesByFacilityId.TryGetValue(facilityId, out ConveyorNodeState node) ||
                !node.Item.HasValue) return false;

            ConveyorConnection output = SelectOutput(world, node);
            if (output == null) return false;
            if (output.DestinationNode != null)
            {
                step = new GridPosition(output.DestinationNode.Position.X - node.Position.X,
                    output.DestinationNode.Position.Y - node.Position.Y);
                return step.X != 0 || step.Y != 0;
            }

            FacilityState destination = output.DestinationFacility;
            if (destination == null) return false;
            if (node.Position.X + 1 == destination.Position.X) step = new GridPosition(1, 0);
            else if (node.Position.X == destination.Position.X + destination.Width) step = new GridPosition(-1, 0);
            else if (node.Position.Y + 1 == destination.Position.Y) step = new GridPosition(0, 1);
            else if (node.Position.Y == destination.Position.Y + destination.Height) step = new GridPosition(0, -1);
            return step.X != 0 || step.Y != 0;
        }

        public ConveyorPathState FindPath(string pathId)
        {
            for (int i = 0; i < paths.Count; i++)
                if (paths[i].Id == pathId) return paths[i];
            return null;
        }

        public void Tick(GameWorld world, long currentMilliseconds, long elapsedMilliseconds)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (elapsedMilliseconds <= 0) return;
            EnsureNodes(world);

            int cellTravelMilliseconds = Math.Max(1,
                (int)Math.Ceiling(1_000d / world.Definitions.ConveyorRatePerLinePerSecond));
            for (int i = 0; i < nodes.Count; i++)
            {
                ConveyorNodeState node = nodes[i];
                if (node.Item.HasValue && IsNodeOperational(world, node))
                    node.ProgressMilliseconds = (int)Math.Min(cellTravelMilliseconds,
                        node.ProgressMilliseconds + elapsedMilliseconds);
            }

            var moved = new HashSet<ConveyorNodeState>();
            var claimed = new HashSet<ConveyorNodeState>();

            // Mergers pull from one available input at a time, rotating past empty or blocked inputs.
            for (int i = 0; i < nodes.Count; i++)
            {
                ConveyorNodeState merger = nodes[i];
                if (merger.Kind != FacilityKind.Merger || merger.Item.HasValue || !IsNodeOperational(world, merger)) continue;
                TryMergeInput(world, merger, currentMilliseconds, cellTravelMilliseconds);
            }

            for (int i = 0; i < nodes.Count; i++)
            {
                ConveyorNodeState source = nodes[i];
                if (!source.Item.HasValue || source.ProgressMilliseconds < cellTravelMilliseconds || moved.Contains(source) ||
                    !IsNodeOperational(world, source)) continue;
                ConveyorConnection output = SelectOutput(world, source);
                if (output == null) continue;
                if (output.DestinationNode != null)
                {
                    ConveyorNodeState destination = output.DestinationNode;
                    if (destination.Kind == FacilityKind.Merger || destination.Item.HasValue || claimed.Contains(destination) ||
                        !IsNodeOperational(world, destination)) continue;
                    destination.Item = source.Item;
                    destination.ProgressMilliseconds = 0;
                    claimed.Add(destination);
                    source.Item = null;
                    source.ProgressMilliseconds = 0;
                    moved.Add(source);
                    if (source.Kind == FacilityKind.Splitter)
                        source.OutputCursor = (source.Outgoing.IndexOf(output) + 1) % source.Outgoing.Count;
                    world.Record(currentMilliseconds, "conveyor", output.Id + ":moved:" + destination.FacilityId + ":" + destination.Item);
                }
                else if (CanReceive(world, output.DestinationFacility, source.Item.Value))
                {
                    ItemId item = source.Item.Value;
                    if (output.DestinationFacility.Inventory.TryAdd(item, 1))
                    {
                        source.Item = null;
                        source.ProgressMilliseconds = 0;
                        moved.Add(source);
                        if (source.Kind == FacilityKind.Splitter)
                            source.OutputCursor = (source.Outgoing.IndexOf(output) + 1) % source.Outgoing.Count;
                        world.Record(currentMilliseconds, "conveyor", output.Id + ":delivered:" + item + ":" + output.DestinationFacility.Id);
                    }
                }
            }

            // Facility inputs feed an empty first cell. Pickups are one item at a time and honor source reservations.
            for (int i = 0; i < nodes.Count; i++)
            {
                ConveyorNodeState node = nodes[i];
                if (node.Kind == FacilityKind.Merger || node.Item.HasValue || claimed.Contains(node) ||
                    !IsNodeOperational(world, node)) continue;
                TryLoadFromFacility(world, node, currentMilliseconds);
            }
        }

        private bool TryMergeInput(GameWorld world, ConveyorNodeState merger, long currentMilliseconds,
            int cellTravelMilliseconds)
        {
            int count = merger.Incoming.Count;
            if (count == 0) return false;
            for (int offset = 0; offset < count; offset++)
            {
                int index = (merger.InputCursor + offset) % count;
                ConveyorConnection input = merger.Incoming[index];
                if (input.SourceNode != null)
                {
                    ConveyorNodeState source = input.SourceNode;
                    if (!source.Item.HasValue || source.ProgressMilliseconds < cellTravelMilliseconds ||
                        !IsNodeOperational(world, source) || !Allows(input, source.Item.Value)) continue;
                    if (source.Kind == FacilityKind.Splitter && SelectOutput(world, source) != input) continue;
                    merger.Item = source.Item;
                    merger.ProgressMilliseconds = 0;
                    source.Item = null;
                    source.ProgressMilliseconds = 0;
                    if (source.Kind == FacilityKind.Splitter)
                        source.OutputCursor = (source.Outgoing.IndexOf(input) + 1) % source.Outgoing.Count;
                    merger.InputCursor = (index + 1) % count;
                    world.Record(currentMilliseconds, "conveyor", input.Id + ":merged:" + source.FacilityId + "->" + merger.FacilityId + ":" + merger.Item);
                    return true;
                }

                FacilityState sourceFacility = input.SourceFacility;
                if (!IsFacilityOperational(world, sourceFacility) ||
                    !TryTakeSourceItem(sourceFacility, input, out ItemId item)) continue;
                merger.Item = item;
                merger.ProgressMilliseconds = 0;
                merger.InputCursor = (index + 1) % count;
                world.Record(currentMilliseconds, "conveyor", input.Id + ":merged:" + sourceFacility.Id + "->" + merger.FacilityId + ":" + item);
                return true;
            }

            return false;
        }

        private bool TryLoadFromFacility(GameWorld world, ConveyorNodeState node, long currentMilliseconds)
        {
            for (int i = 0; i < node.Incoming.Count; i++)
            {
                ConveyorConnection input = node.Incoming[i];
                FacilityState source = input.SourceFacility;
                if (source == null || !IsFacilityOperational(world, source)) continue;
                if (!TryTakeSourceItem(source, input, out ItemId item)) continue;
                node.Item = item;
                node.ProgressMilliseconds = 0;
                world.Record(currentMilliseconds, "conveyor", input.Id + ":loaded:" + item + ":" + source.Id);
                return true;
            }

            return false;
        }

        private static bool TryTakeSourceItem(FacilityState source, ConveyorConnection input, out ItemId item)
        {
            Array values = Enum.GetValues(typeof(ItemId));
            foreach (ItemId candidate in values)
            {
                if (source.Inventory.GetAvailable(candidate) <= 0 || !Allows(input, candidate)) continue;
                if (!source.Inventory.TryRemove(candidate, 1)) continue;
                item = candidate;
                return true;
            }
            item = default;
            return false;
        }

        private ConveyorConnection SelectOutput(GameWorld world, ConveyorNodeState source)
        {
            int count = source.Outgoing.Count;
            if (count == 0 || !source.Item.HasValue) return null;
            int start = source.Kind == FacilityKind.Splitter ? source.OutputCursor % count : 0;
            for (int offset = 0; offset < count; offset++)
            {
                int index = (start + offset) % count;
                ConveyorConnection output = source.Outgoing[index];
                if (!Allows(output, source.Item.Value)) continue;
                if (output.DestinationNode != null)
                {
                    ConveyorNodeState destination = output.DestinationNode;
                    if (destination.Item.HasValue ||
                        !IsNodeOperational(world, destination)) continue;
                    return output;
                }
                if (CanReceive(world, output.DestinationFacility, source.Item.Value)) return output;
            }

            return null;
        }

        private static bool CanReceive(GameWorld world, FacilityState destination, ItemId item)
        {
            if (destination == null || !IsFacilityOperational(world, destination) ||
                !destination.Inventory.HasCapacity(item)) return false;
            long used = (long)destination.Inventory.GetStock(item) + destination.Inventory.GetExpectedInbound(item) +
                        destination.Inventory.GetInTransit(item);
            return destination.Inventory.GetCapacity(item) - used > 0;
        }

        private void EnsureNodes(GameWorld world)
        {
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (IsConveyor(facility)) GetOrCreateNode(facility);
            }

            // An empty node can be discarded after its facility is removed. Cargo on a removed belt remains
            // represented by its inert node so demolition cannot erase material that was on the belt.
            for (int i = nodes.Count - 1; i >= 0; i--)
            {
                ConveyorNodeState node = nodes[i];
                if (world.FindFacility(node.FacilityId) != null || node.Item.HasValue) continue;
                RemoveNode(node);
            }
        }

        private bool IsConnectedOrdinaryBelt(GameWorld world, GridPosition position)
        {
            for (int i = 0; i < paths.Count; i++)
            {
                ConveyorPathState path = paths[i];
                for (int cellIndex = 0; cellIndex < path.Cells.Count; cellIndex++)
                {
                    if (!path.Cells[cellIndex].Equals(position)) continue;
                    FacilityState facility = FindConveyorAt(world, position);
                    if (facility != null && facility.Kind == FacilityKind.Conveyor) return true;
                }
            }
            return false;
        }

        private bool HasExistingPathCell(GridPosition position)
        {
            for (int i = 0; i < paths.Count; i++)
                for (int cellIndex = 0; cellIndex < paths[i].Cells.Count; cellIndex++)
                    if (paths[i].Cells[cellIndex].Equals(position)) return true;
            return false;
        }

        private static bool HasFacilityAt(GameWorld world, GridPosition position)
        {
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (position.X >= facility.Position.X && position.X < facility.Position.X + facility.Width &&
                    position.Y >= facility.Position.Y && position.Y < facility.Position.Y + facility.Height)
                    return true;
            }
            return false;
        }

        private bool HasConnectionCapacity(List<ConveyorConnection> proposed, out string reason)
        {
            var extraInputs = new Dictionary<ConveyorNodeState, int>();
            var extraOutputs = new Dictionary<ConveyorNodeState, int>();
            for (int i = 0; i < proposed.Count; i++)
            {
                ConveyorConnection connection = proposed[i];
                if (connection.SourceNode != null)
                    Increment(extraOutputs, connection.SourceNode);
                if (connection.DestinationNode != null)
                    Increment(extraInputs, connection.DestinationNode);
            }

            foreach (KeyValuePair<ConveyorNodeState, int> pair in extraInputs)
            {
                int maximum = pair.Key.Kind == FacilityKind.Merger ? 3 : 1;
                if (pair.Key.Incoming.Count + pair.Value > maximum)
                {
                    reason = "input-capacity-exceeded:" + pair.Key.FacilityId;
                    return false;
                }
            }
            foreach (KeyValuePair<ConveyorNodeState, int> pair in extraOutputs)
            {
                int maximum = pair.Key.Kind == FacilityKind.Splitter ? 3 : 1;
                if (pair.Key.Outgoing.Count + pair.Value > maximum)
                {
                    reason = "output-capacity-exceeded:" + pair.Key.FacilityId;
                    return false;
                }
            }

            reason = string.Empty;
            return true;
        }

        private static void Increment(Dictionary<ConveyorNodeState, int> counts, ConveyorNodeState node)
        {
            counts.TryGetValue(node, out int count);
            counts[node] = count + 1;
        }

        private static bool IsFacilityOperational(GameWorld world, FacilityState facility) =>
            facility != null && world.FindFacility(facility.Id) == facility && !facility.IsUnderConstruction &&
            !facility.IsDestroyed && !facility.IsDemolishing;

        private static bool IsNodeOperational(GameWorld world, ConveyorNodeState node)
        {
            FacilityState facility = world.FindFacility(node.FacilityId);
            return facility != null && !facility.IsUnderConstruction && !facility.IsDestroyed && !facility.IsDemolishing;
        }

        private static bool Allows(ConveyorConnection connection, ItemId item) =>
            connection.AllowedItems == null || connection.AllowedItems.Contains(item);

        private static bool CanRouteBetweenRegions(GameWorld world, FacilityState source, FacilityState destination)
        {
            bool sourceCombat = source.Position.Y >= world.Definitions.ProductionHeight;
            bool destinationCombat = destination.Position.Y >= world.Definitions.ProductionHeight;
            return sourceCombat == destinationCombat || source.Kind == FacilityKind.Outpost ||
                   destination.Kind == FacilityKind.Outpost;
        }

        private static bool CanConnectEndpoints(ConveyorNodeState fromNode, FacilityState fromFacility,
            ConveyorNodeState toNode, FacilityState toFacility)
        {
            GridPosition from = fromNode != null ? fromNode.Position : fromFacility.Position;
            GridPosition to = toNode != null ? toNode.Position : toFacility.Position;
            if (fromNode != null && toNode != null) return Manhattan(from, to) == 1;
            if (fromNode != null) return TouchesFacility(from, toFacility);
            if (toNode != null) return TouchesFacility(to, fromFacility);
            return TouchesFacility(from, toFacility);
        }

        private static bool TouchesFacility(GridPosition cell, FacilityState facility)
        {
            int cellRight = cell.X + 1;
            int cellTop = cell.Y + 1;
            bool verticalOverlap = cell.Y < facility.Position.Y + facility.Height && cellTop > facility.Position.Y;
            bool horizontalOverlap = cell.X < facility.Position.X + facility.Width && cellRight > facility.Position.X;
            return (verticalOverlap && (cellRight == facility.Position.X || cell.X == facility.Position.X + facility.Width)) ||
                   (horizontalOverlap && (cellTop == facility.Position.Y || cell.Y == facility.Position.Y + facility.Height));
        }

        private static int Manhattan(GridPosition a, GridPosition b) =>
            Math.Abs(a.X - b.X) + Math.Abs(a.Y - b.Y);

        private static FacilityState FindConveyorAt(GameWorld world, GridPosition position)
        {
            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                if (IsConveyor(facility) && facility.Position.Equals(position) && facility.Width == 1 && facility.Height == 1)
                    return facility;
            }
            return null;
        }

        private static bool IsConveyor(FacilityState facility) =>
            facility != null && (facility.Kind == FacilityKind.Conveyor || facility.Kind == FacilityKind.Splitter ||
                                 facility.Kind == FacilityKind.Merger);

        private ConveyorNodeState GetOrCreateNode(FacilityState facility)
        {
            if (nodesByFacilityId.TryGetValue(facility.Id, out ConveyorNodeState node)) return node;
            node = new ConveyorNodeState(facility);
            nodesByFacilityId.Add(facility.Id, node);
            nodes.Add(node);
            return node;
        }

        private ConveyorNodeState GetCandidateNode(FacilityState facility,
            Dictionary<string, ConveyorNodeState> candidateNodes)
        {
            if (nodesByFacilityId.TryGetValue(facility.Id, out ConveyorNodeState node)) return node;
            if (candidateNodes.TryGetValue(facility.Id, out node)) return node;
            node = new ConveyorNodeState(facility);
            candidateNodes.Add(facility.Id, node);
            return node;
        }

        private void Attach(ConveyorConnection connection)
        {
            if (connection.SourceNode != null) connection.SourceNode.Outgoing.Add(connection);
            if (connection.DestinationNode != null) connection.DestinationNode.Incoming.Add(connection);
        }

        private void Detach(ConveyorConnection connection)
        {
            if (connection.SourceNode != null) connection.SourceNode.Outgoing.Remove(connection);
            if (connection.DestinationNode != null) connection.DestinationNode.Incoming.Remove(connection);
        }

        private void RemoveNode(ConveyorNodeState node)
        {
            for (int i = connections.Count - 1; i >= 0; i--)
            {
                ConveyorConnection connection = connections[i];
                if (connection.SourceNode != node && connection.DestinationNode != node) continue;
                Detach(connection);
                connections.RemoveAt(i);
            }
            nodesByFacilityId.Remove(node.FacilityId);
            nodes.Remove(node);
        }

        private ConveyorConnection FindConnection(string id)
        {
            for (int i = 0; i < connections.Count; i++)
                if (connections[i].Id == id) return connections[i];
            return null;
        }

        private static bool SamePath(ConveyorPathState path, string sourceId, string destinationId,
            IList<GridPosition> cells)
        {
            if (path.SourceFacilityId != sourceId || path.DestinationFacilityId != destinationId ||
                path.Cells.Count != cells.Count) return false;
            for (int i = 0; i < cells.Count; i++)
                if (!path.Cells[i].Equals(cells[i])) return false;
            return true;
        }

        private bool Fail(string failure, out string reason)
        {
            reason = failure;
            return false;
        }
    }
}
