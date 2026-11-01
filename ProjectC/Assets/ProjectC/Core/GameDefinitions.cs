using System;
using System.Collections.Generic;

namespace ProjectC.Core
{
    public enum ItemId
    {
        Iron,
        Plate,
        Ammunition,
        Ore,
        Crystal
    }

    public enum FacilityKind
    {
        Port,
        Ironworks,
        AmmunitionFactory,
        Outpost,
        Turret,
        Miner,
        Refinery,
        Warehouse,
        Conveyor,
        Splitter,
        Merger
    }

    public sealed class RecipeDefinition
    {
        public RecipeDefinition(ItemId input, int inputCount, ItemId output, int outputCount, int durationMilliseconds)
        {
            if (inputCount <= 0 || outputCount <= 0 || durationMilliseconds <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(inputCount), "Recipe amounts and duration must be positive.");
            }

            Input = input;
            InputCount = inputCount;
            Output = output;
            OutputCount = outputCount;
            DurationMilliseconds = durationMilliseconds;
        }

        public ItemId Input { get; }
        public int InputCount { get; }
        public ItemId Output { get; }
        public int OutputCount { get; }
        public int DurationMilliseconds { get; }
    }

    [Serializable]
    public sealed class RecipeDefinitionData
    {
        public string Id;
        public string Input;
        public int InputCount;
        public string Output;
        public int OutputCount;
        public int DurationMilliseconds;

        public RecipeDefinition ToDefinition()
        {
            if (!Enum.TryParse(Input, true, out ItemId input)) throw new InvalidOperationException("Unknown recipe input item: " + Input);
            if (!Enum.TryParse(Output, true, out ItemId output)) throw new InvalidOperationException("Unknown recipe output item: " + Output);
            return new RecipeDefinition(input, InputCount, output, OutputCount, DurationMilliseconds);
        }
    }

    [Serializable]
    public sealed class ItemQuantityData
    {
        public string Item;
        public int Quantity;
    }

    [Serializable]
    public sealed class FacilityDefinitionData
    {
        public string Id;
        public string Kind;
        public int X;
        public int Y;
        public int Width;
        public int Height;
        public int MaximumHealth;
        public ItemQuantityData[] Capacities;
        public ItemQuantityData[] StartingStock;
        public ItemQuantityData[] RestockTargets;
        public ItemQuantityData[] ConstructionCosts;
        public int ConstructionMilliseconds;
    }

    [Serializable]
    public sealed class OreNodeDefinitionData
    {
        public string Id;
        public int X;
        public int Y;
    }

    [Serializable]
    public sealed class MapRegionDefinitionData
    {
        public int X;
        public int Y;
        public int Width;
        public int Height;
    }

    [Serializable]
    public sealed class EnemyEntryPointDefinitionData
    {
        public string Id;
        public string Edge;
        public int X;
        public int Y;
    }

    [Serializable]
    public sealed class SubsidyTierData
    {
        public int ExportThreshold;
        public int Amount;
    }

    /// <summary>Definition data loaded from JSON by the Unity adapter; no Unity APIs are used here.</summary>
    [Serializable]
    public sealed class GameDefinitions
    {
        public int MapWidth;
        public int MapHeight;
        public int ProductionHeight;
        public int StartingFunds;
        public int FirstIronOrder;
        public int RegularExportOrderQuantity;
        public int IronUnitPrice;
        public int ExportGoal;
        public int ExportPricePerCrystal;
        public int ShipCargoCapacity;
        public int MatchDeadlineMilliseconds;
        public int StartingProductionDrones;
        public int StartingCombatDrones;
        public int MaximumDroneCount;
        public int DroneUnitPrice;
        public int ImportShipIntervalMilliseconds;
        public int ImportOrderLeadMilliseconds;
        public int ShipDockLimitMilliseconds;
        public int IronUnloadRatePerSecond;
        public int CrystalLoadRatePerSecond;
        public int SubsidyIntervalMilliseconds;
        public int InitialWaveMilliseconds;
        public int WaveIntervalMilliseconds;
        public int WaveCount;
        public int FirstWaveEnemyCount;
        public int AdditionalEnemiesPerWave;
        public int WaveSpawnIntervalMilliseconds;
        public int MaximumEnemiesPerEntrySpawn;
        public int DroneCarryCapacity;
        public int DroneSpeedCellsPerSecond;
        public int ConveyorCapacityPerCell;
        public int ConveyorRatePerLinePerSecond;
        public int OutpostCapacityPerItem;
        public int TurretAmmunitionCapacity;
        public int TurretHealth;
        public int OutpostHealth;
        public int TurretDamage;
        public int TurretRange;
        public int TurretRateOfFireMilliseconds;
        public int EnemyHealth;
        public int EnemyDamagePerSecond;
        public int EnemySpeedCellsPerSecond;
        public RecipeDefinitionData IronworksRecipe;
        public RecipeDefinitionData AmmunitionRecipe;
        public RecipeDefinitionData RefineryRecipe;
        public FacilityDefinitionData[] StartingFacilities;
        public FacilityDefinitionData[] BuildableFacilities;
        public OreNodeDefinitionData[] OreNodes;
        public MapRegionDefinitionData[] MountainRegions;
        public EnemyEntryPointDefinitionData[] EnemyEntryPoints;
        public SubsidyTierData[] SubsidyTiers;

        private static GameDefinitions defaultDefinitions;

        public static GameDefinitions Default => defaultDefinitions ?? (defaultDefinitions = CreateDefault());
        public int StartingDroneCount => StartingProductionDrones + StartingCombatDrones;

        public static GameDefinitions CreateDefault()
        {
            return new GameDefinitions
            {
                MapWidth = 128,
                MapHeight = 128,
                ProductionHeight = 103,
                StartingFunds = 500,
                FirstIronOrder = 100,
                RegularExportOrderQuantity = 500,
                IronUnitPrice = 1,
                ExportGoal = 2_000,
                ExportPricePerCrystal = 2,
                ShipCargoCapacity = 500,
                MatchDeadlineMilliseconds = 3_900_000,
                StartingProductionDrones = 4,
                StartingCombatDrones = 1,
                MaximumDroneCount = 30,
                DroneUnitPrice = 100,
                ImportShipIntervalMilliseconds = 180_000,
                ImportOrderLeadMilliseconds = 60_000,
                ShipDockLimitMilliseconds = 60_000,
                IronUnloadRatePerSecond = 20,
                CrystalLoadRatePerSecond = 20,
                SubsidyIntervalMilliseconds = 180_000,
                InitialWaveMilliseconds = 300_000,
                WaveIntervalMilliseconds = 120_000,
                WaveCount = 30,
                FirstWaveEnemyCount = 10,
                AdditionalEnemiesPerWave = 5,
                WaveSpawnIntervalMilliseconds = 500,
                MaximumEnemiesPerEntrySpawn = 3,
                DroneCarryCapacity = 5,
                DroneSpeedCellsPerSecond = 2,
                ConveyorCapacityPerCell = 1,
                ConveyorRatePerLinePerSecond = 20,
                OutpostCapacityPerItem = 500,
                TurretAmmunitionCapacity = 60,
                TurretHealth = 1_000,
                OutpostHealth = 5_000,
                TurretDamage = 20,
                TurretRange = 8,
                TurretRateOfFireMilliseconds = 1_000,
                EnemyHealth = 100,
                EnemyDamagePerSecond = 10,
                EnemySpeedCellsPerSecond = 1,
                IronworksRecipe = new RecipeDefinitionData
                {
                    Id = "ironworks",
                    Input = "Iron",
                    InputCount = 1,
                    Output = "Plate",
                    OutputCount = 1,
                    DurationMilliseconds = 1_000
                },
                AmmunitionRecipe = new RecipeDefinitionData
                {
                    Id = "ammunition-factory",
                    Input = "Plate",
                    InputCount = 1,
                    Output = "Ammunition",
                    OutputCount = 12,
                    DurationMilliseconds = 12_000
                },
                RefineryRecipe = new RecipeDefinitionData
                {
                    Id = "refinery",
                    Input = "Ore",
                    InputCount = 2,
                    Output = "Crystal",
                    OutputCount = 1,
                    DurationMilliseconds = 2_000
                },
                StartingFacilities = new[]
                {
                    Facility("port", "Port", 61, 2, 6, 4, 0,
                        new[] { Capacity("Iron", 500), Capacity("Crystal", 500) }),
                    Facility("ironworks", "Ironworks", 58, 52, 2, 2, 0,
                        new[] { Capacity("Iron", 60) }),
                    Facility("ammunition-factory", "AmmunitionFactory", 66, 52, 3, 3, 0,
                        new[] { Capacity("Plate", 5) }),
                    Facility("outpost", "Outpost", 62, 101, 4, 4, 5_000,
                        new[] { Capacity("Iron", 500), Capacity("Plate", 500), Capacity("Ammunition", 500) }),
                    Facility("turret", "Turret", 64, 109, 1, 1, 1_000,
                        new[] { Capacity("Ammunition", 60), Capacity("Iron", 20), Capacity("Plate", 5) },
                        new[] { Capacity("Ammunition", 60) })
                },
                BuildableFacilities = new[]
                {
                    Buildable("ironworks", "Ironworks", 2, 2, 0,
                        new[] { Capacity("Iron", 60), Capacity("Plate", 60) },
                        new[] { Capacity("Iron", 20) }, new[] { Capacity("Iron", 60) }),
                    Buildable("ammunition-factory", "AmmunitionFactory", 3, 3, 0,
                        new[] { Capacity("Plate", 60), Capacity("Ammunition", 60) },
                        new[] { Capacity("Iron", 20), Capacity("Plate", 5) }, new[] { Capacity("Plate", 5) }),
                    Buildable("turret", "Turret", 1, 1, 1_000,
                        new[] { Capacity("Ammunition", 60), Capacity("Iron", 20), Capacity("Plate", 5) },
                        new[] { Capacity("Iron", 20), Capacity("Plate", 5) }, new[] { Capacity("Ammunition", 60) }),
                    Buildable("miner", "Miner", 2, 2, 0,
                        new[] { Capacity("Ore", 60) },
                        new[] { Capacity("Iron", 20), Capacity("Plate", 5) }),
                    Buildable("refinery", "Refinery", 3, 3, 0,
                        new[] { Capacity("Ore", 60), Capacity("Crystal", 60) },
                        new[] { Capacity("Iron", 20), Capacity("Plate", 5) }, new[] { Capacity("Ore", 60) }),
                    Buildable("conveyor", "Conveyor", 1, 1, 100, new ItemQuantityData[0],
                        new[] { Capacity("Iron", 1) }, constructionMilliseconds: 100),
                    Buildable("splitter", "Splitter", 1, 1, 200, new ItemQuantityData[0],
                        new[] { Capacity("Iron", 5) }),
                    Buildable("merger", "Merger", 1, 1, 200, new ItemQuantityData[0],
                        new[] { Capacity("Iron", 5) })
                },
                OreNodes = new[]
                {
                    new OreNodeDefinitionData { Id = "ore-west", X = 20, Y = 25 },
                    new OreNodeDefinitionData { Id = "ore-east", X = 105, Y = 57 },
                    new OreNodeDefinitionData { Id = "ore-south", X = 25, Y = 87 }
                },
                MountainRegions = CreateDefaultMountainRegions(),
                EnemyEntryPoints = new[]
                {
                    new EnemyEntryPointDefinitionData { Id = "west", Edge = "West", X = 0, Y = 114 },
                    new EnemyEntryPointDefinitionData { Id = "north", Edge = "North", X = 64, Y = 127 },
                    new EnemyEntryPointDefinitionData { Id = "east", Edge = "East", X = 127, Y = 114 }
                },
                SubsidyTiers = new[]
                {
                    new SubsidyTierData { ExportThreshold = 0, Amount = 100 },
                    new SubsidyTierData { ExportThreshold = 100, Amount = 200 },
                    new SubsidyTierData { ExportThreshold = 300, Amount = 300 },
                    new SubsidyTierData { ExportThreshold = 600, Amount = 400 },
                    new SubsidyTierData { ExportThreshold = 1_000, Amount = 500 }
                }
            };
        }

        public void Validate()
        {
            RequirePositive(MapWidth, nameof(MapWidth));
            RequirePositive(MapHeight, nameof(MapHeight));
            if (ProductionHeight <= 0 || ProductionHeight >= MapHeight)
                throw new InvalidOperationException("ProductionHeight must divide the map into production and combat regions.");
            RequirePositive(StartingFunds, nameof(StartingFunds));
            RequirePositive(FirstIronOrder, nameof(FirstIronOrder));
            RequirePositive(RegularExportOrderQuantity, nameof(RegularExportOrderQuantity));
            RequirePositive(IronUnitPrice, nameof(IronUnitPrice));
            RequirePositive(ExportGoal, nameof(ExportGoal));
            RequirePositive(ExportPricePerCrystal, nameof(ExportPricePerCrystal));
            RequirePositive(ShipCargoCapacity, nameof(ShipCargoCapacity));
            RequirePositive(MaximumDroneCount, nameof(MaximumDroneCount));
            RequirePositive(DroneUnitPrice, nameof(DroneUnitPrice));
            if (FirstIronOrder > ShipCargoCapacity || RegularExportOrderQuantity > ShipCargoCapacity)
                throw new InvalidOperationException("Default regular contract quantities must fit within ship cargo capacity.");
            RequirePositive(MatchDeadlineMilliseconds, nameof(MatchDeadlineMilliseconds));
            RequirePositive(ImportShipIntervalMilliseconds, nameof(ImportShipIntervalMilliseconds));
            RequirePositive(ImportOrderLeadMilliseconds, nameof(ImportOrderLeadMilliseconds));
            RequirePositive(ShipDockLimitMilliseconds, nameof(ShipDockLimitMilliseconds));
            RequirePositive(IronUnloadRatePerSecond, nameof(IronUnloadRatePerSecond));
            RequirePositive(CrystalLoadRatePerSecond, nameof(CrystalLoadRatePerSecond));
            RequirePositive(SubsidyIntervalMilliseconds, nameof(SubsidyIntervalMilliseconds));
            RequirePositive(InitialWaveMilliseconds, nameof(InitialWaveMilliseconds));
            RequirePositive(WaveIntervalMilliseconds, nameof(WaveIntervalMilliseconds));
            RequirePositive(WaveCount, nameof(WaveCount));
            RequirePositive(FirstWaveEnemyCount, nameof(FirstWaveEnemyCount));
            RequirePositive(WaveSpawnIntervalMilliseconds, nameof(WaveSpawnIntervalMilliseconds));
            RequirePositive(MaximumEnemiesPerEntrySpawn, nameof(MaximumEnemiesPerEntrySpawn));
            RequirePositive(DroneCarryCapacity, nameof(DroneCarryCapacity));
            RequirePositive(DroneSpeedCellsPerSecond, nameof(DroneSpeedCellsPerSecond));
            RequirePositive(ConveyorCapacityPerCell, nameof(ConveyorCapacityPerCell));
            RequirePositive(ConveyorRatePerLinePerSecond, nameof(ConveyorRatePerLinePerSecond));
            RequirePositive(OutpostCapacityPerItem, nameof(OutpostCapacityPerItem));
            RequirePositive(TurretAmmunitionCapacity, nameof(TurretAmmunitionCapacity));
            RequirePositive(TurretHealth, nameof(TurretHealth));
            RequirePositive(OutpostHealth, nameof(OutpostHealth));
            RequirePositive(TurretDamage, nameof(TurretDamage));
            RequirePositive(TurretRange, nameof(TurretRange));
            RequirePositive(TurretRateOfFireMilliseconds, nameof(TurretRateOfFireMilliseconds));
            RequirePositive(EnemyHealth, nameof(EnemyHealth));
            RequirePositive(EnemyDamagePerSecond, nameof(EnemyDamagePerSecond));
            RequirePositive(EnemySpeedCellsPerSecond, nameof(EnemySpeedCellsPerSecond));
            if (StartingProductionDrones < 0 || StartingCombatDrones < 0) throw new InvalidOperationException("Starting drone counts cannot be negative.");
            if (StartingDroneCount > MaximumDroneCount) throw new InvalidOperationException("Starting drones exceed the maximum operating count.");
            if (IronworksRecipe == null || AmmunitionRecipe == null || RefineryRecipe == null) throw new InvalidOperationException("All three production recipes are required.");
            IronworksRecipe.ToDefinition();
            AmmunitionRecipe.ToDefinition();
            RefineryRecipe.ToDefinition();
            ValidateMountainRegions();
            ValidateEnemyEntryPoints();
            ValidateFacilities();
            ValidateBuildableFacilities();
            ValidateOreNodes();
            ValidateSubsidies();
        }

        public bool IsMountainCell(int x, int y)
        {
            if (MountainRegions == null) return false;
            for (int i = 0; i < MountainRegions.Length; i++)
            {
                MapRegionDefinitionData region = MountainRegions[i];
                if (x >= region.X && x < region.X + region.Width && y >= region.Y && y < region.Y + region.Height)
                    return true;
            }

            return false;
        }

        public FacilityDefinitionData FindBuildableFacility(FacilityKind kind)
        {
            if (BuildableFacilities != null)
            {
                for (int i = 0; i < BuildableFacilities.Length; i++)
                {
                    if (ParseFacilityKind(BuildableFacilities[i].Kind) == kind) return BuildableFacilities[i];
                }
            }

            return null;
        }

        public int GetWaveStartMilliseconds(int waveNumber)
        {
            ValidateWaveNumber(waveNumber);
            return checked(InitialWaveMilliseconds + ((waveNumber - 1) * WaveIntervalMilliseconds));
        }

        public int GetWaveEnemyCount(int waveNumber)
        {
            ValidateWaveNumber(waveNumber);
            return checked(FirstWaveEnemyCount + (AdditionalEnemiesPerWave * (waveNumber - 1)));
        }

        public int[] SplitWaveAcrossEntries(int waveNumber)
        {
            int total = GetWaveEnemyCount(waveNumber);
            int each = total / 3;
            int remainder = total % 3;
            return new[] { each + (remainder > 0 ? 1 : 0), each + (remainder > 1 ? 1 : 0), each };
        }

        public int GetSubsidyAmount(int exportedCrystals)
        {
            int amount = 0;
            for (int i = 0; i < SubsidyTiers.Length; i++)
            {
                if (exportedCrystals >= SubsidyTiers[i].ExportThreshold && SubsidyTiers[i].Amount > amount)
                    amount = SubsidyTiers[i].Amount;
            }

            return amount;
        }

        public static ItemId ParseItem(string item)
        {
            if (!Enum.TryParse(item, true, out ItemId parsed)) throw new InvalidOperationException("Unknown item ID: " + item);
            return parsed;
        }

        public static FacilityKind ParseFacilityKind(string kind)
        {
            if (!Enum.TryParse(kind, true, out FacilityKind parsed)) throw new InvalidOperationException("Unknown facility kind: " + kind);
            return parsed;
        }

        private void ValidateFacilities()
        {
            if (StartingFacilities == null || StartingFacilities.Length == 0) throw new InvalidOperationException("Starting facilities are required.");
            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < StartingFacilities.Length; i++)
            {
                FacilityDefinitionData facility = StartingFacilities[i];
                if (facility == null || string.IsNullOrWhiteSpace(facility.Id) || !ids.Add(facility.Id))
                    throw new InvalidOperationException("Starting facility IDs must be present and unique.");
                ParseFacilityKind(facility.Kind);
                RequirePositive(facility.Width, facility.Id + ".Width");
                RequirePositive(facility.Height, facility.Id + ".Height");
                if (facility.MaximumHealth < 0) throw new InvalidOperationException(facility.Id + ".MaximumHealth cannot be negative.");
                if (facility.X < 0 || facility.Y < 0 || facility.X + facility.Width > MapWidth ||
                    facility.Y + facility.Height > MapHeight)
                    throw new InvalidOperationException(facility.Id + " must fit inside the map.");
                for (int x = facility.X; x < facility.X + facility.Width; x++)
                    for (int y = facility.Y; y < facility.Y + facility.Height; y++)
                        if (IsMountainCell(x, y))
                            throw new InvalidOperationException(facility.Id + " cannot overlap mountain terrain.");
                ValidateItemQuantities(facility.Capacities, facility.Id + ".Capacities", true);
                ValidateItemQuantities(facility.StartingStock, facility.Id + ".StartingStock", false);
                ValidateRestockTargets(facility);
            }

            RequireFacility(ids, "port");
            RequireFacility(ids, "ironworks");
            RequireFacility(ids, "ammunition-factory");
            RequireFacility(ids, "outpost");
            RequireFacility(ids, "turret");
        }

        private void ValidateSubsidies()
        {
            if (SubsidyTiers == null || SubsidyTiers.Length == 0) throw new InvalidOperationException("At least one subsidy tier is required.");
            int previousThreshold = -1;
            int previousAmount = 0;
            for (int i = 0; i < SubsidyTiers.Length; i++)
            {
                SubsidyTierData tier = SubsidyTiers[i];
                if (tier == null || tier.ExportThreshold < 0 || tier.Amount < 0 || tier.ExportThreshold <= previousThreshold || tier.Amount < previousAmount)
                    throw new InvalidOperationException("Subsidy tiers must have increasing thresholds and nondecreasing amounts.");
                previousThreshold = tier.ExportThreshold;
                previousAmount = tier.Amount;
            }
        }

        private void ValidateBuildableFacilities()
        {
            if (BuildableFacilities == null || BuildableFacilities.Length == 0)
                throw new InvalidOperationException("Buildable facility definitions are required.");

            var kinds = new HashSet<FacilityKind>();
            for (int i = 0; i < BuildableFacilities.Length; i++)
            {
                FacilityDefinitionData facility = BuildableFacilities[i];
                if (facility == null || string.IsNullOrWhiteSpace(facility.Id))
                    throw new InvalidOperationException("Buildable facility IDs are required.");
                FacilityKind kind = ParseFacilityKind(facility.Kind);
                if (!kinds.Add(kind)) throw new InvalidOperationException("A facility kind may only have one build definition: " + kind);
                RequirePositive(facility.Width, facility.Id + ".Width");
                RequirePositive(facility.Height, facility.Id + ".Height");
                RequirePositive(facility.ConstructionMilliseconds, facility.Id + ".ConstructionMilliseconds");
                ValidateItemQuantities(facility.Capacities, facility.Id + ".Capacities", true);
                ValidateRestockTargets(facility);
                ValidateItemQuantities(facility.ConstructionCosts, facility.Id + ".ConstructionCosts", false);
                if (facility.ConstructionCosts == null || facility.ConstructionCosts.Length == 0)
                    throw new InvalidOperationException(facility.Id + ".ConstructionCosts cannot be empty.");
            }

            if (FindBuildableFacility(FacilityKind.Miner) == null || FindBuildableFacility(FacilityKind.Refinery) == null)
                throw new InvalidOperationException("Miner and refinery build definitions are required.");
        }

        private void ValidateOreNodes()
        {
            if (OreNodes == null || OreNodes.Length != 3)
                throw new InvalidOperationException("Exactly three ore nodes are required.");
            var ids = new HashSet<string>(System.StringComparer.Ordinal);
            var positions = new HashSet<GridPosition>();
            for (int i = 0; i < OreNodes.Length; i++)
            {
                OreNodeDefinitionData node = OreNodes[i];
                if (node == null || string.IsNullOrWhiteSpace(node.Id) || !ids.Add(node.Id) ||
                    node.X < 0 || node.X >= MapWidth || node.Y < 0 || node.Y >= ProductionHeight ||
                    !positions.Add(new GridPosition(node.X, node.Y)))
                    throw new InvalidOperationException("Ore node definitions must be unique and inside the production area.");
            }
        }

        private void ValidateMountainRegions()
        {
            if (MountainRegions == null || MountainRegions.Length == 0)
                throw new InvalidOperationException("Mountain regions are required for the confirmed map.");
            for (int i = 0; i < MountainRegions.Length; i++)
            {
                MapRegionDefinitionData region = MountainRegions[i];
                if (region == null || region.X < 0 || region.Y < 0 || region.Width <= 0 || region.Height <= 0 ||
                    region.X + region.Width > MapWidth || region.Y + region.Height > MapHeight)
                    throw new InvalidOperationException("Mountain regions must be non-empty rectangles inside the map.");
            }
        }

        private void ValidateEnemyEntryPoints()
        {
            if (EnemyEntryPoints == null || EnemyEntryPoints.Length != 3)
                throw new InvalidOperationException("Exactly three enemy entry points are required.");
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var positions = new HashSet<GridPosition>();
            for (int i = 0; i < EnemyEntryPoints.Length; i++)
            {
                EnemyEntryPointDefinitionData point = EnemyEntryPoints[i];
                if (point == null || string.IsNullOrWhiteSpace(point.Id) || !ids.Add(point.Id) ||
                    (point.Edge != "West" && point.Edge != "North" && point.Edge != "East") ||
                    point.X < 0 || point.X >= MapWidth || point.Y < ProductionHeight || point.Y >= MapHeight ||
                    !positions.Add(new GridPosition(point.X, point.Y)) || IsMountainCell(point.X, point.Y))
                    throw new InvalidOperationException("Enemy entry points must be unique points on the combat region boundary.");
            }
        }

        private static MapRegionDefinitionData[] CreateDefaultMountainRegions()
        {
            return new[]
            {
                // Two-cell map rim, opened for the three combat entries and the port exit.
                Region(0, 0, 58, 2), Region(68, 0, 60, 2),
                Region(0, 126, 58, 2), Region(68, 126, 60, 2),
                Region(0, 2, 2, 109), Region(0, 118, 2, 8),
                Region(126, 2, 2, 109), Region(126, 118, 2, 8),
                // Interior combat formations from the accepted map draft.
                Region(34, 113, 14, 8), Region(80, 113, 14, 8),
                Region(17, 104, 8, 5), Region(103, 104, 8, 5)
            };
        }

        private static MapRegionDefinitionData Region(int x, int y, int width, int height) =>
            new MapRegionDefinitionData { X = x, Y = y, Width = width, Height = height };

        private static void ValidateItemQuantities(ItemQuantityData[] values, string field, bool capacity)
        {
            if (values == null) return;
            var items = new HashSet<ItemId>();
            for (int i = 0; i < values.Length; i++)
            {
                ItemQuantityData entry = values[i];
                if (entry == null || entry.Quantity < 0 || (capacity && entry.Quantity == 0))
                    throw new InvalidOperationException(field + " contains an invalid quantity.");
                if (!items.Add(ParseItem(entry.Item))) throw new InvalidOperationException(field + " contains a duplicate item.");
            }
        }

        private static void ValidateRestockTargets(FacilityDefinitionData facility)
        {
            ValidateItemQuantities(facility.RestockTargets, facility.Id + ".RestockTargets", false);
            if (facility.RestockTargets == null) return;
            for (int i = 0; i < facility.RestockTargets.Length; i++)
            {
                ItemQuantityData target = facility.RestockTargets[i];
                bool hasCapacity = false;
                int capacity = 0;
                if (facility.Capacities != null)
                {
                    for (int capacityIndex = 0; capacityIndex < facility.Capacities.Length; capacityIndex++)
                    {
                        if (ParseItem(facility.Capacities[capacityIndex].Item) != ParseItem(target.Item)) continue;
                        hasCapacity = true;
                        capacity = facility.Capacities[capacityIndex].Quantity;
                        break;
                    }
                }

                if (!hasCapacity || target.Quantity > capacity)
                    throw new InvalidOperationException(facility.Id + ".RestockTargets must fit its item capacities.");
            }
        }

        private static void RequireFacility(HashSet<string> ids, string id)
        {
            if (!ids.Contains(id)) throw new InvalidOperationException("Required starting facility is missing: " + id);
        }

        private static void RequirePositive(int value, string field)
        {
            if (value <= 0) throw new InvalidOperationException(field + " must be positive.");
        }

        private void ValidateWaveNumber(int waveNumber)
        {
            if (waveNumber < 1 || waveNumber > WaveCount) throw new ArgumentOutOfRangeException(nameof(waveNumber));
        }

        private static FacilityDefinitionData Facility(string id, string kind, int x, int y, int width, int height,
            int maximumHealth, ItemQuantityData[] capacities, ItemQuantityData[] startingStock = null)
        {
            return new FacilityDefinitionData
            {
                Id = id,
                Kind = kind,
                X = x,
                Y = y,
                Width = width,
                Height = height,
                MaximumHealth = maximumHealth,
                Capacities = capacities,
                StartingStock = startingStock
            };
        }

        private static FacilityDefinitionData Buildable(string id, string kind, int width, int height,
            int maximumHealth, ItemQuantityData[] capacities, ItemQuantityData[] constructionCosts,
            ItemQuantityData[] restockTargets = null, int constructionMilliseconds = 3_000)
        {
            return new FacilityDefinitionData
            {
                Id = id,
                Kind = kind,
                Width = width,
                Height = height,
                MaximumHealth = maximumHealth,
                Capacities = capacities,
                RestockTargets = restockTargets,
                ConstructionCosts = constructionCosts,
                ConstructionMilliseconds = constructionMilliseconds
            };
        }

        private static ItemQuantityData Capacity(string item, int amount)
        {
            return new ItemQuantityData { Item = item, Quantity = amount };
        }
    }
}
