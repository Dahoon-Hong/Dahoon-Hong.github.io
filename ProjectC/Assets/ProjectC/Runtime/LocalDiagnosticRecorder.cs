using System;
using System.Globalization;
using System.IO;
using System.Text;
using ProjectC.Core;
using UnityEngine;

namespace ProjectC.Runtime
{
    /// <summary>Appends a compact JSONL record for one local match session.</summary>
    internal sealed class LocalDiagnosticRecorder
    {
        private readonly string filePath;
        private int capturedEventCount;
        private bool writeFailureReported;
        private bool sessionEnded;

        public LocalDiagnosticRecorder(GameSimulation simulation)
        {
            if (simulation == null) throw new ArgumentNullException(nameof(simulation));

            try
            {
                string directory = Path.Combine(Application.persistentDataPath, "ProjectC", "diagnostics");
                Directory.CreateDirectory(directory);
                string sessionId = DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'", CultureInfo.InvariantCulture);
                filePath = Path.Combine(directory, "session-" + sessionId + ".jsonl");
                Write(CreateStartRecord(simulation, sessionId));
                CaptureEvents(simulation.World);
            }
            catch (Exception exception)
            {
                writeFailureReported = true;
                Debug.LogWarning("Project C diagnostic recording is unavailable: " + exception.Message);
            }
        }

        public string FilePath => filePath ?? string.Empty;

        public void CaptureEvents(GameWorld world)
        {
            if (world == null) return;
            if (capturedEventCount > world.Events.Count) capturedEventCount = 0;

            var batch = new StringBuilder();
            while (capturedEventCount < world.Events.Count)
            {
                SimulationEvent simulationEvent = world.Events[capturedEventCount++];
                batch.Append(JsonUtility.ToJson(new Record
                {
                    recordType = "event",
                    gameTimeMilliseconds = simulationEvent.TimeMilliseconds,
                    category = simulationEvent.Category,
                    detail = simulationEvent.Detail
                })).Append('\n');
            }

            Append(batch.ToString());
        }

        public void RecordCommand(long gameTimeMilliseconds, string command, string details)
        {
            Write(new Record
            {
                recordType = "command",
                gameTimeMilliseconds = gameTimeMilliseconds,
                name = command ?? string.Empty,
                detail = details ?? string.Empty
            });
        }

        public void RecordMeasurement(long gameTimeMilliseconds, string name, double value, string unit)
        {
            Write(new Record
            {
                recordType = "measurement",
                gameTimeMilliseconds = gameTimeMilliseconds,
                name = name ?? string.Empty,
                value = value.ToString("R", CultureInfo.InvariantCulture),
                unit = unit ?? string.Empty
            });
        }

        public void RecordError(long gameTimeMilliseconds, Exception exception)
        {
            if (exception == null) return;
            Write(new Record
            {
                recordType = "error",
                gameTimeMilliseconds = gameTimeMilliseconds,
                name = exception.GetType().FullName,
                detail = exception.Message,
                stackTrace = exception.StackTrace ?? string.Empty
            });
        }

        public void RecordSessionEnd(GameWorld world, long gameTimeMilliseconds)
        {
            if (sessionEnded) return;
            sessionEnded = true;
            Write(new Record
            {
                recordType = "session_end",
                gameTimeMilliseconds = gameTimeMilliseconds,
                outcome = world == null ? string.Empty : world.Outcome.ToString(),
                exportedCrystals = world == null ? 0 : world.ExportedCrystals,
                highestWaveReached = world == null ? 0 : world.HighestWaveReached,
                enemiesDefeated = world == null ? 0 : world.EnemiesDefeated
            });
        }

        private static Record CreateStartRecord(GameSimulation simulation, string sessionId)
        {
            GameWorld world = simulation.World;
            GameDefinitions definitions = world.Definitions;
            var record = new Record
            {
                recordType = "session_start",
                sessionId = sessionId,
                utc = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture),
                applicationVersion = Application.version,
                unityVersion = Application.unityVersion,
                platform = Application.platform.ToString(),
                deviceModel = SystemInfo.deviceModel,
                gameTimeMilliseconds = simulation.CurrentMilliseconds,
                mapWidth = definitions.MapWidth,
                mapHeight = definitions.MapHeight,
                startingFunds = definitions.StartingFunds,
                availableFunds = world.Funds.Balance,
                outstandingPrepayments = world.Funds.OutstandingPrepayments,
                productionDrones = definitions.StartingProductionDrones,
                combatDrones = definitions.StartingCombatDrones,
                exportGoal = definitions.ExportGoal,
                deadlineMilliseconds = definitions.MatchDeadlineMilliseconds,
                regularImportContract = world.RegularImportContractQuantity,
                regularExportContract = world.RegularExportContractQuantity,
                facilities = new FacilitySnapshot[world.Facilities.Count]
            };

            for (int i = 0; i < world.Facilities.Count; i++)
            {
                FacilityState facility = world.Facilities[i];
                record.facilities[i] = new FacilitySnapshot
                {
                    id = facility.Id,
                    kind = facility.Kind.ToString(),
                    x = facility.Position.X,
                    y = facility.Position.Y,
                    width = facility.Width,
                    height = facility.Height,
                    health = facility.Health,
                    startingStock = new StockSnapshot[Enum.GetValues(typeof(ItemId)).Length]
                };

                for (int itemIndex = 0; itemIndex < record.facilities[i].startingStock.Length; itemIndex++)
                    record.facilities[i].startingStock[itemIndex] = new StockSnapshot
                    {
                        item = ((ItemId)itemIndex).ToString(),
                        quantity = facility.Inventory.GetStock((ItemId)itemIndex)
                    };
            }

            return record;
        }

        private void Write(Record record)
        {
            Append(JsonUtility.ToJson(record) + "\n");
        }

        private void Append(string contents)
        {
            if (string.IsNullOrEmpty(filePath) || string.IsNullOrEmpty(contents)) return;
            try
            {
                File.AppendAllText(filePath, contents, new UTF8Encoding(false));
            }
            catch (Exception exception)
            {
                if (writeFailureReported) return;
                writeFailureReported = true;
                Debug.LogWarning("Project C diagnostic recording stopped: " + exception.Message);
            }
        }

        [Serializable]
        private sealed class Record
        {
            public string recordType;
            public string sessionId;
            public string utc;
            public string applicationVersion;
            public string unityVersion;
            public string platform;
            public string deviceModel;
            public long gameTimeMilliseconds;
            public int mapWidth;
            public int mapHeight;
            public int startingFunds;
            public int availableFunds;
            public int outstandingPrepayments;
            public int productionDrones;
            public int combatDrones;
            public int exportGoal;
            public int deadlineMilliseconds;
            public int regularImportContract;
            public int regularExportContract;
            public FacilitySnapshot[] facilities;
            public string category;
            public string name;
            public string detail;
            public string value;
            public string unit;
            public string stackTrace;
            public string outcome;
            public int exportedCrystals;
            public int highestWaveReached;
            public int enemiesDefeated;
        }

        [Serializable]
        private sealed class FacilitySnapshot
        {
            public string id;
            public string kind;
            public int x;
            public int y;
            public int width;
            public int height;
            public int health;
            public StockSnapshot[] startingStock;
        }

        [Serializable]
        private sealed class StockSnapshot
        {
            public string item;
            public int quantity;
        }
    }
}
