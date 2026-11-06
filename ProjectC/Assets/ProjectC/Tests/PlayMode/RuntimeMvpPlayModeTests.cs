using System.Collections;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using ProjectC.Core;
using ProjectC.Runtime;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;
using UI = UnityEngine.UI;

namespace ProjectC.Runtime.PlayMode.Tests
{
    public sealed class RuntimeMvpPlayModeTests : InputTestFixture
    {
        private const string LanguageKey = "ProjectC.Settings.Language";
        private const string FullscreenKey = "ProjectC.Settings.Fullscreen";
        private const string UiScaleKey = "ProjectC.Settings.UiScale";
        private const string MasterVolumeKey = "ProjectC.Settings.Master";
        private const string BgmVolumeKey = "ProjectC.Settings.Bgm";
        private const string EffectsVolumeKey = "ProjectC.Settings.Effects";
        private const string ShakeKey = "ProjectC.Settings.CameraShake";
        private const string FlashKey = "ProjectC.Settings.ScreenFlash";
        private const string PauseKey = "ProjectC.Settings.PauseBinding";
        private const string RotateKey = "ProjectC.Settings.RotateBinding";
        private const string ConveyorBendKey = "ProjectC.Settings.ConveyorBendBinding";

        private ProjectCRuntimeBootstrap[] previousBootstraps;
        private bool[] previousBootstrapEnabled;
        private ProjectCRuntimeView[] previousViews;
        private bool[] previousViewActive;
        private Camera[] previousCameras;
        private bool[] previousCameraActive;
        private bool[] previousCameraEnabled;
        private EventSystem[] previousEventSystems;
        private bool[] previousEventSystemActive;
        private EventSystem testEventSystem;
        private GameObject testViewObject;
        private GameObject navigationTestViewObject;
        private GameObject settingsReloadObject;
        private Camera[] testCameras;
        private Light[] testLights;
        private GameSimulation simulation;
        private ProjectCRuntimeView view;
        private Mouse mouse;
        private Keyboard keyboard;
        private PreferenceSnapshot preferences;
        private LocalDiagnosticRecorder diagnosticRecorder;
        private string diagnosticFilePath;
        private int startMatchRequests;
        private float previousAudioVolume;
        private FullScreenMode previousScreenMode;
        private string expectedLanguage;

        [UnitySetUp]
        public IEnumerator SetUpRuntime()
        {
            preferences = new PreferenceSnapshot();
            startMatchRequests = 0;
            previousAudioVolume = AudioListener.volume;
            previousScreenMode = Screen.fullScreenMode;
            SetDeterministicSettings();

            previousBootstraps = Object.FindObjectsByType<ProjectCRuntimeBootstrap>(
                FindObjectsInactive.Include, FindObjectsSortMode.None);
            previousBootstrapEnabled = new bool[previousBootstraps.Length];
            for (int i = 0; i < previousBootstraps.Length; i++)
            {
                previousBootstrapEnabled[i] = previousBootstraps[i].enabled;
                previousBootstraps[i].enabled = false;
            }

            previousViews = Object.FindObjectsByType<ProjectCRuntimeView>(
                FindObjectsInactive.Include, FindObjectsSortMode.None);
            previousViewActive = new bool[previousViews.Length];
            for (int i = 0; i < previousViews.Length; i++)
            {
                previousViewActive[i] = previousViews[i].gameObject.activeSelf;
                previousViews[i].gameObject.SetActive(false);
            }

            previousCameras = Object.FindObjectsByType<Camera>(FindObjectsInactive.Include,
                FindObjectsSortMode.None);
            previousCameraActive = new bool[previousCameras.Length];
            previousCameraEnabled = new bool[previousCameras.Length];
            for (int i = 0; i < previousCameras.Length; i++)
            {
                previousCameraActive[i] = previousCameras[i].gameObject.activeSelf;
                previousCameraEnabled[i] = previousCameras[i].enabled;
                previousCameras[i].gameObject.SetActive(false);
            }

            previousEventSystems = Object.FindObjectsByType<EventSystem>(
                FindObjectsInactive.Include, FindObjectsSortMode.None);
            previousEventSystemActive = new bool[previousEventSystems.Length];
            for (int i = 0; i < previousEventSystems.Length; i++)
            {
                previousEventSystemActive[i] = previousEventSystems[i].gameObject.activeSelf;
                previousEventSystems[i].gameObject.SetActive(false);
            }

            yield return null;

            Camera[] camerasBefore = Object.FindObjectsByType<Camera>(FindObjectsSortMode.None);
            Light[] lightsBefore = Object.FindObjectsByType<Light>(FindObjectsSortMode.None);
            simulation = GameSimulation.CreateNewMatch(UnityDefinitionLoader.Load());
            testViewObject = new GameObject("Project C PlayMode Test View");
            view = testViewObject.AddComponent<ProjectCRuntimeView>();
            view.Initialize(simulation, null, () => startMatchRequests++, false);
            view.GetComponent<ProjectCOnboardingPanel>().SetVisible(false);
            testEventSystem = EventSystem.current;
            testCameras = FindNewObjects(camerasBefore, Object.FindObjectsByType<Camera>(FindObjectsSortMode.None));
            testLights = FindNewObjects(lightsBefore, Object.FindObjectsByType<Light>(FindObjectsSortMode.None));
            mouse = InputSystem.AddDevice<Mouse>();
            keyboard = InputSystem.AddDevice<Keyboard>();

            yield return null;
        }

        [UnityTearDown]
        public IEnumerator RestoreRuntime()
        {
            if (!string.IsNullOrEmpty(diagnosticFilePath) && File.Exists(diagnosticFilePath))
                File.Delete(diagnosticFilePath);
            if (settingsReloadObject != null) Object.Destroy(settingsReloadObject);
            if (navigationTestViewObject != null) Object.Destroy(navigationTestViewObject);
            if (testViewObject != null) Object.Destroy(testViewObject);
            if (testEventSystem != null && !WasPresent(testEventSystem, previousEventSystems))
                Object.Destroy(testEventSystem.gameObject);
            DestroyObjects(testCameras);
            DestroyObjects(testLights);

            yield return null;

            if (previousEventSystems != null)
                for (int i = 0; i < previousEventSystems.Length; i++)
                    if (previousEventSystems[i] != null)
                        previousEventSystems[i].gameObject.SetActive(previousEventSystemActive[i]);
            if (previousViews != null)
                for (int i = 0; i < previousViews.Length; i++)
                    if (previousViews[i] != null)
                        previousViews[i].gameObject.SetActive(previousViewActive[i]);
            if (previousCameras != null)
                for (int i = 0; i < previousCameras.Length; i++)
                    if (previousCameras[i] != null)
                    {
                        previousCameras[i].enabled = previousCameraEnabled[i];
                        previousCameras[i].gameObject.SetActive(previousCameraActive[i]);
                    }
            if (previousBootstraps != null)
                for (int i = 0; i < previousBootstraps.Length; i++)
                    if (previousBootstraps[i] != null)
                        previousBootstraps[i].enabled = previousBootstrapEnabled[i];

            preferences?.Restore();
            Screen.fullScreenMode = previousScreenMode;
            AudioListener.volume = previousAudioVolume;
            yield return null;
        }

        [UnityTest]
        [Timeout(50_000)]
        public IEnumerator RuntimeControlsConveyorSettingsAndResultWorkInOneShortSession()
        {
            StartDiagnosticRecordCoverage();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.One));
            UI.Button pauseButton = FindButton(view.transform, "Pause / Resume");
            FindButton(view.transform, "2x").onClick.Invoke();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Two));

            long beforeAdvance = simulation.CurrentMilliseconds;
            yield return new WaitForSecondsRealtime(0.15f);
            Assert.That(simulation.CurrentMilliseconds, Is.GreaterThan(beforeAdvance));

            pauseButton.onClick.Invoke();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Paused));
            long pausedAt = simulation.CurrentMilliseconds;
            yield return new WaitForSecondsRealtime(0.12f);
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(pausedAt));
            pauseButton.onClick.Invoke();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Two));
            FindButton(view.transform, "4x").onClick.Invoke();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Four));
            FindButton(view.transform, "1x").onClick.Invoke();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.One));
            yield return PauseNavigationConfirmationsCanBeCancelled();

            GuideCanBeHiddenOrSkippedWithoutChangingTheMatch();

            FindButton(view.transform, "Build Conveyor").onClick.Invoke();
            yield return DragConveyorPath(new GridPosition(60, 52), new GridPosition(65, 52));

            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(1),
                "A virtual-mouse drag between the opening Ironworks and Ammo Factory should place one connected path.");
            ConveyorPathState path = simulation.Conveyors.Paths[0];
            Assert.That(path.SourceFacilityId, Is.EqualTo("ironworks"));
            Assert.That(path.DestinationFacilityId, Is.EqualTo("ammunition-factory"));
            Assert.That(path.Cells, Is.EqualTo(new[]
            {
                new GridPosition(60, 52), new GridPosition(61, 52), new GridPosition(62, 52),
                new GridPosition(63, 52), new GridPosition(64, 52), new GridPosition(65, 52)
            }));

            yield return DuplicateConveyorPreviewIsRejected();
            yield return FacilityPlacementPreviewRotationAndCommitWork();
            yield return FacilityManagementActionsWork();
            yield return PortContractsAndOneOffOrderAreApplied();
            yield return SplitterOutputFilterUiCyclesEveryMode();
            yield return FacilityHudWarningAndMinimapNavigationWork();
            yield return SaveAndReloadSettings();
            yield return SettingsDisplayScaleAudioAndDuplicateBindingPersistInOneShortSession();

            simulation.DamageFacility("outpost", simulation.World.Definitions.OutpostHealth);
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Defeat));
            yield return new WaitForSecondsRealtime(0.25f);

            Assert.That(FindNamedObject(view.transform, "Game Menu").activeSelf, Is.True);
            string title = FindText(view.transform, "Menu Title").text;
            Assert.That(title, Is.EqualTo(expectedLanguage == "ko" ? "패배" : "DEFEAT"));
            string body = FindText(view.transform, "Menu Body").text;
            string exportedStat = expectedLanguage == "ko"
                ? string.Format("최종 수출량: {0:N0}/{1:N0} ({2}%)", simulation.World.ExportedCrystals,
                    simulation.World.Definitions.ExportGoal, simulation.World.GoalCompletionRatePercent)
                : string.Format("Final exported: {0:N0} / {1:N0} ({2}%)", simulation.World.ExportedCrystals,
                    simulation.World.Definitions.ExportGoal, simulation.World.GoalCompletionRatePercent);
            string waveStat = expectedLanguage == "ko"
                ? string.Format("도달 웨이브: {0}/{1}", simulation.World.HighestWaveReached,
                    simulation.World.Definitions.WaveCount)
                : string.Format("Highest wave started: {0}/{1}", simulation.World.HighestWaveReached,
                    simulation.World.Definitions.WaveCount);
            string enemyStat = expectedLanguage == "ko"
                ? "처치한 적: " + simulation.World.EnemiesDefeated
                : "Enemies defeated: " + simulation.World.EnemiesDefeated;
            Assert.That(body, Does.Contain(exportedStat));
            Assert.That(body, Does.Contain(expectedLanguage == "ko" ? "경과 시간: " : "Play time: "));
            Assert.That(body, Does.Contain(waveStat));
            Assert.That(body, Does.Contain(enemyStat));

            diagnosticRecorder.CaptureEvents(simulation.World);
            try
            {
                throw new System.InvalidOperationException("diagnostic test error");
            }
            catch (System.InvalidOperationException exception)
            {
                diagnosticRecorder.RecordError(simulation.CurrentMilliseconds, exception);
            }
            diagnosticRecorder.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
            int recordCountAfterEnd = File.ReadAllLines(diagnosticFilePath).Length;
            diagnosticRecorder.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
            Assert.That(File.ReadAllLines(diagnosticFilePath), Has.Length.EqualTo(recordCountAfterEnd),
                "Session end must be recorded only once.");
            AssertDiagnosticRecords();
            yield return NavigationApprovalsRunTheConfirmedAction();
        }

        private IEnumerator NavigationApprovalsRunTheConfirmedAction()
        {
            testViewObject.SetActive(false);
            GameSimulation navigationSimulation = GameSimulation.CreateNewMatch(simulation.World.Definitions);
            navigationTestViewObject = new GameObject("Project C Navigation Test View");
            ProjectCRuntimeView navigationView = navigationTestViewObject.AddComponent<ProjectCRuntimeView>();
            navigationView.Initialize(navigationSimulation, null, () => startMatchRequests++, false);
            navigationView.GetComponent<ProjectCOnboardingPanel>().SetVisible(false);

            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard.escapeKey);
            yield return null;
            Release(keyboard.escapeKey);
            yield return null;
            Assert.That(FindText(navigationView.transform, "Menu Title").text,
                Is.EqualTo(expectedLanguage == "ko" ? "게임 메뉴" : "GAME MENU"));

            FindButton(navigationView.transform, "Restart Match").onClick.Invoke();
            Assert.That(FindText(navigationView.transform, "Menu Title").text,
                Is.EqualTo(expectedLanguage == "ko" ? "경기를 재시작할까요?" : "RESTART MATCH?"));
            FindButton(navigationView.transform, "Cancel Navigation").onClick.Invoke();
            Assert.That(startMatchRequests, Is.Zero,
                "Cancelling a restart must not request a new match.");
            Assert.That(navigationSimulation.World.Outcome, Is.EqualTo(MatchOutcome.Running));

            FindButton(navigationView.transform, "Restart Match").onClick.Invoke();
            FindButton(navigationView.transform, "Confirm Navigation").onClick.Invoke();
            Assert.That(startMatchRequests, Is.EqualTo(1),
                "Approving a restart should hand off to the runtime's new-match callback exactly once.");

            // The test callback records the handoff instead of replacing the view.
            FindButton(navigationView.transform, "Cancel Navigation").onClick.Invoke();
            FindButton(navigationView.transform, "Main Menu").onClick.Invoke();
            Assert.That(FindText(navigationView.transform, "Menu Title").text,
                Is.EqualTo(expectedLanguage == "ko" ? "메인 메뉴로 돌아갈까요?" : "RETURN TO MENU?"));
            FindButton(navigationView.transform, "Confirm Navigation").onClick.Invoke();
            Assert.That(FindText(navigationView.transform, "Menu Title").text, Is.EqualTo("PROJECT C"));
            Assert.That(startMatchRequests, Is.EqualTo(1));
            Assert.That(navigationSimulation.World.Outcome, Is.EqualTo(MatchOutcome.Running));
            Assert.That(navigationSimulation.Clock.Speed, Is.EqualTo(GameSpeed.Paused));

            Object.Destroy(navigationTestViewObject);
            navigationTestViewObject = null;
            yield return null;
        }

        private void StartDiagnosticRecordCoverage()
        {
            diagnosticRecorder = new LocalDiagnosticRecorder(simulation);
            diagnosticFilePath = diagnosticRecorder.FilePath;
            Assert.That(diagnosticFilePath, Is.Not.Empty);
            Assert.That(File.Exists(diagnosticFilePath), Is.True);

            diagnosticRecorder.RecordCommand(simulation.CurrentMilliseconds, "diagnostic_test", "bounded-playmode");
            simulation.SetRegularImportContractQuantity(simulation.World.RegularImportContractQuantity);
            diagnosticRecorder.CaptureEvents(simulation.World);
            diagnosticRecorder.RecordMeasurement(simulation.CurrentMilliseconds, "diagnostic_test_value", 1.25,
                "count", "jsonl round-trip");
            diagnosticRecorder.RecordFrameSample(simulation.CurrentMilliseconds, GameSpeed.One, 60d, 16.67d,
                1d, 60, Screen.width, Screen.height);
            diagnosticRecorder.RecordFrameSample(simulation.CurrentMilliseconds, GameSpeed.Two, 30d, 33.33d,
                1d, 30, Screen.width, Screen.height);
            diagnosticRecorder.RecordFrameSample(simulation.CurrentMilliseconds, GameSpeed.Four, 15d, 66.67d,
                1d, 15, Screen.width, Screen.height);
        }

        private void AssertDiagnosticRecords()
        {
            string[] lines = File.ReadAllLines(diagnosticFilePath);
            var records = new List<DiagnosticRecordSnapshot>(lines.Length);
            for (int i = 0; i < lines.Length; i++)
                records.Add(JsonUtility.FromJson<DiagnosticRecordSnapshot>(lines[i]));

            Assert.That(records[0].recordType, Is.EqualTo("session_start"));
            Assert.That(records[0].sessionId, Is.Not.Empty);
            Assert.That(records[0].applicationVersion, Is.Not.Empty);
            Assert.That(records[0].startingFunds, Is.EqualTo(simulation.World.Definitions.StartingFunds));
            Assert.That(records[0].availableFunds, Is.EqualTo(400));
            Assert.That(records[0].exportGoal, Is.EqualTo(simulation.World.Definitions.ExportGoal));
            Assert.That(records[0].deadlineMilliseconds,
                Is.EqualTo(simulation.World.Definitions.MatchDeadlineMilliseconds));

            bool hasPrepaymentEvent = false;
            bool hasContractEvent = false;
            bool hasTestCommand = false;
            bool hasTestMeasurement = false;
            bool hasError = false;
            bool hasDefeatEvent = false;
            int sessionEndCount = 0;
            var frameSpeeds = new HashSet<string>();
            for (int i = 0; i < records.Count; i++)
            {
                DiagnosticRecordSnapshot record = records[i];
                if (record.recordType == "event" && record.category == "order" &&
                    record.detail.Contains("prepaid:100")) hasPrepaymentEvent = true;
                if (record.recordType == "event" && record.category == "contract") hasContractEvent = true;
                if (record.recordType == "command" && record.name == "diagnostic_test" &&
                    record.detail == "bounded-playmode") hasTestCommand = true;
                if (record.recordType == "measurement" && record.name == "diagnostic_test_value")
                {
                    hasTestMeasurement = true;
                    Assert.That(record.value, Is.EqualTo("1.25"));
                    Assert.That(record.unit, Is.EqualTo("count"));
                    Assert.That(record.detail, Is.EqualTo("jsonl round-trip"));
                }
                if (record.recordType == "measurement" && record.name == "render_fps")
                {
                    frameSpeeds.Add(record.gameSpeed);
                    Assert.That(record.averageFrameTimeMilliseconds, Is.Not.Empty);
                    Assert.That(record.sampleDurationSeconds, Is.EqualTo("1"));
                    Assert.That(record.screenWidth, Is.EqualTo(Screen.width));
                    Assert.That(record.screenHeight, Is.EqualTo(Screen.height));
                    switch (record.gameSpeed)
                    {
                        case "1x":
                            Assert.That(record.averageFrameTimeMilliseconds, Is.EqualTo("16.67"));
                            Assert.That(record.sampleFrameCount, Is.EqualTo(60));
                            break;
                        case "2x":
                            Assert.That(record.averageFrameTimeMilliseconds, Is.EqualTo("33.33"));
                            Assert.That(record.sampleFrameCount, Is.EqualTo(30));
                            break;
                        case "4x":
                            Assert.That(record.averageFrameTimeMilliseconds, Is.EqualTo("66.67"));
                            Assert.That(record.sampleFrameCount, Is.EqualTo(15));
                            break;
                        default:
                            Assert.Fail("Unexpected frame sample speed: " + record.gameSpeed);
                            break;
                    }
                }
                if (record.recordType == "error" && record.name == typeof(System.InvalidOperationException).FullName)
                {
                    hasError = true;
                    Assert.That(record.detail, Is.EqualTo("diagnostic test error"));
                    Assert.That(record.stackTrace, Is.Not.Empty);
                }
                if (record.recordType == "event" && record.category == "match" &&
                    record.detail == "outpost-destroyed") hasDefeatEvent = true;
                if (record.recordType == "session_end")
                {
                    sessionEndCount++;
                    Assert.That(record.outcome, Is.EqualTo("Defeat"));
                    Assert.That(record.gameTimeMilliseconds, Is.EqualTo(simulation.CurrentMilliseconds));
                    Assert.That(record.exportedCrystals, Is.EqualTo(simulation.World.ExportedCrystals));
                }
            }

            Assert.That(hasPrepaymentEvent, Is.True);
            Assert.That(hasContractEvent, Is.True);
            Assert.That(hasTestCommand, Is.True);
            Assert.That(hasTestMeasurement, Is.True);
            Assert.That(hasError, Is.True);
            Assert.That(hasDefeatEvent, Is.True);
            Assert.That(frameSpeeds, Is.EquivalentTo(new[] { "1x", "2x", "4x" }));
            Assert.That(sessionEndCount, Is.EqualTo(1));
        }

        private void GuideCanBeHiddenOrSkippedWithoutChangingTheMatch()
        {
            ProjectCOnboardingPanel guide = view.GetComponent<ProjectCOnboardingPanel>();
            int fundsBefore = simulation.World.Funds.Balance;
            int ironBefore = simulation.World.FindFacility(FacilityKind.Port).Inventory.GetStock(ItemId.Iron);
            long timeBefore = simulation.CurrentMilliseconds;

            guide.Show();
            Assert.That(guide.IsVisible, Is.True);
            Assert.That(FindText(view.transform, "Guide Title").text, Is.EqualTo("FIRST PLAY GUIDE"));
            Assert.That(FindText(view.transform, "Guide Progress").text, Does.Contain("STEP 1 / 4"));
            Assert.That(FindText(view.transform, "Guide Objective").text,
                Does.Contain("Move imported iron from the port"));
            FindButton(view.transform, "Hide Guide").onClick.Invoke();
            Assert.That(guide.IsVisible, Is.False);
            Assert.That(guide.CompletedStepCount, Is.EqualTo(0));

            guide.Show();
            FindButton(view.transform, "Skip Guide").onClick.Invoke();
            Assert.That(guide.IsVisible, Is.False);
            Assert.That(guide.CompletedStepCount, Is.EqualTo(0));
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(fundsBefore));
            Assert.That(simulation.World.FindFacility(FacilityKind.Port).Inventory.GetStock(ItemId.Iron),
                Is.EqualTo(ironBefore));
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(timeBefore));
        }

        private IEnumerator PauseNavigationConfirmationsCanBeCancelled()
        {
            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard.escapeKey);
            yield return null;
            Release(keyboard.escapeKey);
            yield return null;
            Assert.That(FindNamedObject(view.transform, "Game Menu").activeSelf, Is.True);
            Assert.That(FindText(view.transform, "Menu Title").text, Is.EqualTo("GAME MENU"));
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.One),
                "Opening the pause menu must preserve the current speed.");

            FindButton(view.transform, "Restart Match").onClick.Invoke();
            Assert.That(FindText(view.transform, "Menu Title").text, Is.EqualTo("RESTART MATCH?"));
            FindButton(view.transform, "Cancel Navigation").onClick.Invoke();
            Assert.That(FindText(view.transform, "Menu Title").text, Is.EqualTo("GAME MENU"));
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Running));

            FindButton(view.transform, "Main Menu").onClick.Invoke();
            Assert.That(FindText(view.transform, "Menu Title").text, Is.EqualTo("RETURN TO MENU?"));
            FindButton(view.transform, "Cancel Navigation").onClick.Invoke();
            Assert.That(FindText(view.transform, "Menu Title").text, Is.EqualTo("GAME MENU"));
            FindButton(view.transform, "Resume").onClick.Invoke();
            Assert.That(FindNamedObject(view.transform, "Game Menu").activeSelf, Is.False);
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.One));
        }

        private IEnumerator DuplicateConveyorPreviewIsRejected()
        {
            int facilityCount = simulation.World.Facilities.Count;
            int constructionCount = simulation.World.ConstructionSites.Count;
            int pathCount = simulation.Conveyors.Paths.Count;
            ConveyorPathState originalPath = simulation.Conveyors.Paths[0];
            var originalPathCells = new List<GridPosition>(originalPath.Cells);

            FindButton(view.transform, "Build Conveyor").onClick.Invoke();
            Vector2 startScreen = GridCellScreenPoint(new GridPosition(60, 52));
            Vector2 endScreen = GridCellScreenPoint(new GridPosition(65, 52));
            Move(mouse.position, startScreen);
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            Move(mouse.position, endScreen);
            yield return null;

            Assert.That(FindText(view.transform, "Selected Facility Text").text,
                Does.Contain("Path preview: occupied"));
            Assert.That(HasActiveNamedObject(view.transform, "Conveyor Path Preview"), Is.True);
            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(1));

            Release(mouse.leftButton);
            yield return null;
            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(1));
            Assert.That(FindText(view.transform, "Selected Facility Text").text,
                Does.Contain("Conveyor path rejected: occupied"));

            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard.escapeKey);
            yield return null;
            Release(keyboard.escapeKey);
            yield return null;
            Assert.That(FindText(view.transform, "Selected Facility Text").text, Does.Contain("Placement cancelled."));
            Assert.That(HasActiveNamedObject(view.transform, "Conveyor Path Preview"), Is.False);

            FindButton(view.transform, "Build Conveyor").onClick.Invoke();
            GridPosition mixedRouteStart = new GridPosition(60, 53);
            Vector2 mixedStartScreen = GridCellScreenPoint(mixedRouteStart);
            Vector2 mixedEndScreen = GridCellScreenPoint(new GridPosition(65, 52));
            Move(mouse.position, mixedStartScreen);
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            Move(mouse.position, mixedEndScreen);
            yield return null;

            Assert.That(FindText(view.transform, "Selected Facility Text").text,
                Does.Contain("Path preview: occupied"));
            Assert.That(HasActiveNamedObject(view.transform, "Conveyor Path Preview"), Is.True);
            Assert.That(simulation.World.Facilities, Has.Count.EqualTo(facilityCount));
            Assert.That(simulation.World.ConstructionSites, Has.Count.EqualTo(constructionCount));
            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(pathCount));

            Release(mouse.leftButton);
            yield return null;

            Assert.That(FindText(view.transform, "Selected Facility Text").text,
                Does.Contain("Conveyor path rejected: occupied"));
            Assert.That(simulation.World.Facilities, Has.Count.EqualTo(facilityCount));
            Assert.That(simulation.World.ConstructionSites, Has.Count.EqualTo(constructionCount));
            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(pathCount));
            Assert.That(simulation.Conveyors.Paths[0], Is.SameAs(originalPath));
            Assert.That(simulation.Conveyors.Paths[0].Cells, Is.EqualTo(originalPathCells));
            Assert.That(simulation.World.Facilities.Exists(facility =>
                facility.Position.Equals(mixedRouteStart)), Is.False);
            Assert.That(simulation.World.ConstructionSites.Exists(site =>
                site.Facility.Position.Equals(mixedRouteStart)), Is.False);

            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard.escapeKey);
            yield return null;
            Release(keyboard.escapeKey);
            yield return null;
            Assert.That(FindText(view.transform, "Selected Facility Text").text,
                Does.Contain("Placement cancelled."));
            Assert.That(HasActiveNamedObject(view.transform, "Conveyor Path Preview"), Is.False);
        }

        private IEnumerator FacilityHudWarningAndMinimapNavigationWork()
        {
            GameWorld world = simulation.World;
            string expectedFunds = "FUNDS  $" + world.Funds.Balance;
            string expectedExport = string.Format("EXPORT  {0:N0}/{1:N0}", world.ExportedCrystals,
                world.Definitions.ExportGoal);
            FacilityState outpost = world.FindFacility(FacilityKind.Outpost);
            string expectedOutpost = "OUTPOST  " + outpost.Health + "/" + outpost.MaximumHealth;
            string expectedWave = "WAVE  0/" + world.Definitions.WaveCount;
            UI.Text status = FindText(view.transform, "Match Status");
            Assert.That(status.text, Does.Contain(expectedFunds));
            Assert.That(status.text, Does.Contain(expectedExport));
            Assert.That(status.text, Does.Contain(expectedOutpost));
            Assert.That(status.text, Does.Contain(expectedWave));

            yield return ClickWorldFacility("ironworks");
            UI.Text details = FindText(view.transform, "Selected Facility Text");
            Assert.That(details.text, Does.Contain("ironworks"));
            Assert.That(details.text, Does.Contain("58, 52"));
            Assert.That(details.text, Does.Contain("INVENTORY"));
            Assert.That(FindNamedObject(view.transform, "ironworks Selection Marker").activeSelf, Is.True);
            Assert.That(FindNamedObject(view.transform, "outpost Selection Marker").activeSelf, Is.False);

            UI.Image outpostMarker = FindNamedObject(view.transform, "Facility outpost").GetComponent<UI.Image>();
            Color originalOutpostColor = outpostMarker.color;
            simulation.DamageFacility("outpost", 1);
            yield return new WaitForSecondsRealtime(0.25f);
            Assert.That(outpostMarker.color, Is.Not.EqualTo(originalOutpostColor));
            Assert.That(status.text, Does.Contain("OUTPOST  " + outpost.Health + "/" + outpost.MaximumHealth));

            UI.Button warnings = FindButton(view.transform, "Facility Warnings");
            Assert.That(warnings.interactable, Is.True);
            warnings.onClick.Invoke();
            yield return null;
            Assert.That(FindNamedObject(view.transform, "Warning List").activeSelf, Is.True);
            UI.Button outpostWarning = FindButton(view.transform, "Warning outpost");
            Vector3 cameraBeforeWarning = Camera.main.transform.position;
            outpostWarning.onClick.Invoke();
            Assert.That(details.text, Does.Contain("outpost"));
            Assert.That(details.text, Does.Contain(outpost.Health + " / " + outpost.MaximumHealth));
            Assert.That(Vector3.Distance(cameraBeforeWarning, Camera.main.transform.position), Is.GreaterThan(0.1f));
            FindButton(view.transform, "Close Warning List").onClick.Invoke();

            RectTransform minimap = FindNamedObject(view.transform, "Minimap").GetComponent<RectTransform>();
            Vector3 minimapTarget = minimap.TransformPoint(new Vector3(
                minimap.rect.xMax - 8f, minimap.rect.yMax - 8f, 0f));
            Vector2 minimapScreen = RectTransformUtility.WorldToScreenPoint(null, minimapTarget);
            Vector3 cameraBeforeMinimap = Camera.main.transform.position;
            yield return ClickScreenPoint(minimapScreen);
            Assert.That(Vector3.Distance(cameraBeforeMinimap, Camera.main.transform.position), Is.GreaterThan(0.1f));
            Assert.That(outpostMarker.gameObject.activeSelf, Is.True);
        }

        private IEnumerator FacilityPlacementPreviewRotationAndCommitWork()
        {
            GridPosition occupiedPathCell = new GridPosition(60, 52);
            GridPosition openProductionCell = new GridPosition(60, 60);
            int initialFacilityCount = simulation.World.Facilities.Count;
            int initialFunds = simulation.World.Funds.Balance;
            int initialPathCount = simulation.Conveyors.Paths.Count;

            FindButton(view.transform, "Build Splitter").onClick.Invoke();
            Move(mouse.position, GridCellScreenPoint(occupiedPathCell));
            yield return null;

            GameObject preview = FindNamedObject(view.transform, "Facility Placement Preview");
            Assert.That(preview.activeInHierarchy, Is.True);
            Renderer previewRenderer = preview.GetComponent<Renderer>();
            Assert.That((Color32)previewRenderer.sharedMaterial.color,
                Is.EqualTo(new Color32(226, 91, 75, 255)), "A preview over an existing path must be red.");

            Move(mouse.position, GridCellScreenPoint(openProductionCell));
            yield return null;
            Assert.That(preview.activeInHierarchy, Is.True);
            Assert.That((Color32)previewRenderer.sharedMaterial.color,
                Is.EqualTo(new Color32(65, 205, 151, 255)), "A valid open-cell preview must be green.");

            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard.rKey);
            yield return null;
            Release(keyboard.rKey);
            yield return null;
            Assert.That(FindText(view.transform, "Build Mode").text, Does.Contain("Rotation 90°"));

            Move(mouse.position, GridCellScreenPoint(openProductionCell));
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            Release(mouse.leftButton);
            yield return null;

            Assert.That(simulation.World.Facilities, Has.Count.EqualTo(initialFacilityCount + 1));
            FacilityState placed = simulation.World.Facilities[simulation.World.Facilities.Count - 1];
            Assert.That(placed.Kind, Is.EqualTo(FacilityKind.Splitter));
            Assert.That(placed.Position.Equals(openProductionCell), Is.True);
            Assert.That(placed.RotationDegrees, Is.EqualTo(90));
            Assert.That(placed.IsUnderConstruction, Is.True);
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(initialFunds));
            Assert.That(simulation.Conveyors.Paths, Has.Count.EqualTo(initialPathCount));
            Assert.That(preview.activeSelf, Is.False);

            Assert.That(placed.Inventory.TryAdd(ItemId.Iron, 1), Is.True);
            SelectFacilityForManagement(placed);
            UI.Button cancelConstruction = FindButton(view.transform, "Demolish Facility");
            Assert.That(cancelConstruction.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Cancel Construction"));
            cancelConstruction.onClick.Invoke();
            Assert.That(simulation.World.Facilities.Contains(placed), Is.False);
            Assert.That(simulation.World.ConstructionSites.Exists(site => site.Facility == placed), Is.False);
            RecoveryPile recovery = null;
            for (int i = 0; i < simulation.World.RecoveryPiles.Count; i++)
                if (simulation.World.RecoveryPiles[i].Position.Equals(openProductionCell))
                    recovery = simulation.World.RecoveryPiles[i];
            Assert.That(recovery, Is.Not.Null);
            Assert.That(recovery.Inventory.GetStock(ItemId.Iron), Is.GreaterThanOrEqualTo(1));
        }

        private IEnumerator FacilityManagementActionsWork()
        {
            FacilityState ironworks = simulation.World.FindFacility("ironworks");
            SelectFacilityForManagement(ironworks);
            UI.InputField restockTarget = FindNamedObject(view.transform, "Restock Target")
                .GetComponent<UI.InputField>();
            restockTarget.text = "23";
            FindButton(view.transform, "Apply Target").onClick.Invoke();
            Assert.That(ironworks.GetRestockTarget(ItemId.Iron), Is.EqualTo(23));
            Assert.That(FindText(view.transform, "Selected Facility Text").text,
                Does.Contain("23 target set to Iron Ironworks."));

            FacilityState startingTurret = simulation.World.FindFacility(FacilityKind.Turret);
            simulation.DamageFacility(startingTurret.Id, 100);
            Assert.That(startingTurret.Inventory.TryAdd(ItemId.Iron, 2), Is.True);
            Assert.That(startingTurret.Inventory.TryAdd(ItemId.Plate, 1), Is.True);
            SelectFacilityForManagement(startingTurret);
            UI.Button repair = FindButton(view.transform, "Repair Facility");
            repair.onClick.Invoke();
            Assert.That(simulation.Repairs.GetTask(startingTurret.Id), Is.Not.Null);
            Assert.That(repair.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Cancel Repair"));
            repair.onClick.Invoke();
            Assert.That(simulation.Repairs.GetTask(startingTurret.Id), Is.Null);
            Assert.That(startingTurret.Health, Is.EqualTo(startingTurret.MaximumHealth - 100));
            Assert.That(repair.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Repair Facility"));

            repair.onClick.Invoke();
            simulation.AdvanceGameMilliseconds(3_000);
            yield return null;
            Assert.That(startingTurret.Health, Is.EqualTo(startingTurret.MaximumHealth));
            Assert.That(simulation.Repairs.GetTask(startingTurret.Id), Is.Null);
            Assert.That(startingTurret.Inventory.GetStock(ItemId.Iron), Is.EqualTo(0));
            Assert.That(startingTurret.Inventory.GetStock(ItemId.Plate), Is.EqualTo(0));

            GridPosition newTurretPosition = new GridPosition(65, 109);
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Turret, newTurretPosition, 0,
                out FacilityState newTurret, out string placementReason), Is.True, placementReason);
            SelectFacilityForManagement(newTurret);
            UI.Text details = FindText(view.transform, "Selected Facility Text");
            Assert.That(details.text, Does.Contain("STATUS   Waiting for materials / drone"));
            UI.Button demolition = FindButton(view.transform, "Demolish Facility");
            Assert.That(demolition.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Cancel Construction"));

            Assert.That(newTurret.Inventory.TryAdd(ItemId.Iron, 20), Is.True);
            Assert.That(newTurret.Inventory.TryAdd(ItemId.Plate, 5), Is.True);
            simulation.AdvanceGameMilliseconds(5_000);
            yield return new WaitForSecondsRealtime(0.25f);
            Assert.That(newTurret.IsUnderConstruction, Is.False);
            Assert.That(details.text, Does.Not.Contain("STATUS   "));
            Assert.That(demolition.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Demolish Facility"));
            Assert.That(demolition.interactable, Is.True);

            demolition.onClick.Invoke();
            Assert.That(newTurret.IsDemolishing, Is.True);
            Assert.That(simulation.Demolitions.GetTask(newTurret.Id), Is.Not.Null);
            Assert.That(demolition.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Cancel Demolition"));
            demolition.onClick.Invoke();
            Assert.That(newTurret.IsDemolishing, Is.False);
            Assert.That(simulation.Demolitions.GetTask(newTurret.Id), Is.Null);
            Assert.That(demolition.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Demolish Facility"));
        }

        private IEnumerator PortContractsAndOneOffOrderAreApplied()
        {
            yield return ClickWorldFacility("port");
            FindButton(view.transform, "Manage Port").onClick.Invoke();
            Assert.That(FindNamedObject(view.transform, "Port Contracts").activeSelf, Is.True);

            int fundsBeforeContracts = simulation.World.Funds.Balance;
            UI.InputField regularIron = FindNamedObject(view.transform, "Regular Iron Contract Quantity")
                .GetComponent<UI.InputField>();
            UI.InputField regularCrystal = FindNamedObject(view.transform, "Regular Crystal Contract Quantity")
                .GetComponent<UI.InputField>();
            regularIron.text = "125";
            regularCrystal.text = "25";
            FindButton(view.transform, "Apply Regular Contracts").onClick.Invoke();

            Assert.That(simulation.World.RegularImportContractQuantity, Is.EqualTo(125));
            Assert.That(simulation.World.RegularExportContractQuantity, Is.EqualTo(25));
            Assert.That(FindText(view.transform, "Regular Import Label").text, Does.Contain("125"));
            Assert.That(FindText(view.transform, "Regular Export Label").text, Does.Contain("25"));
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(fundsBeforeContracts),
                "Changing regular contracts must not prepay a voyage.");

            regularIron.SetTextWithoutNotify("501");
            FindButton(view.transform, "Apply Regular Contracts").onClick.Invoke();
            Assert.That(simulation.World.RegularImportContractQuantity, Is.EqualTo(125),
                "An invalid regular contract draft must leave the active quantity unchanged.");
            regularIron.text = "125";

            UI.InputField oneOffIron = FindNamedObject(view.transform, "One Off Iron Quantity")
                .GetComponent<UI.InputField>();

            int fundsBeforeInvalidOrder = simulation.World.Funds.Balance;
            oneOffIron.SetTextWithoutNotify("501");
            FindButton(view.transform, "Confirm One Off Order").onClick.Invoke();
            Assert.That(simulation.World.Funds.Balance, Is.EqualTo(fundsBeforeInvalidOrder));
            for (int i = 0; i < simulation.PendingImportShips.Count; i++)
                Assert.That(simulation.PendingImportShips[i].OneOff, Is.False,
                    "A cargo-over-capacity order must not create a ship.");
            Assert.That(FindText(view.transform, "One Off Order Summary").text, Does.Contain("Order rejected"));

            oneOffIron.text = "1";
            FindNamedObject(view.transform, "One Off Drone Quantity").GetComponent<UI.InputField>().text = "0";
            FindNamedObject(view.transform, "One Off Export Quantity").GetComponent<UI.InputField>().text = "0";
            long orderRequestedAt = simulation.CurrentMilliseconds;
            FindButton(view.transform, "Confirm One Off Order").onClick.Invoke();

            Assert.That(simulation.World.Funds.Balance,
                Is.EqualTo(fundsBeforeContracts - simulation.World.Definitions.IronUnitPrice));
            ImportShipState oneOff = null;
            for (int i = 0; i < simulation.PendingImportShips.Count; i++)
                if (simulation.PendingImportShips[i].OneOff) oneOff = simulation.PendingImportShips[i];
            Assert.That(oneOff, Is.Not.Null);
            Assert.That(oneOff.PaidIron, Is.EqualTo(1));
            Assert.That(oneOff.DroneCount, Is.EqualTo(0));
            Assert.That(oneOff.ArrivalMilliseconds, Is.EqualTo(orderRequestedAt + 60_000));
            Assert.That(FindText(view.transform, "One Off Order Summary").text,
                Does.Contain("Order confirmed"));

            DroneState combatDrone = null;
            for (int i = 0; i < simulation.World.Drones.Count; i++)
                if (simulation.World.Drones[i].Region == DroneRegion.Combat &&
                    !simulation.World.Drones[i].PendingRegion.HasValue)
                {
                    combatDrone = simulation.World.Drones[i];
                    break;
                }
            Assert.That(combatDrone, Is.Not.Null);
            FindButton(view.transform, "Move Drone to Production").onClick.Invoke();
            Assert.That(combatDrone.Region == DroneRegion.Production ||
                        combatDrone.PendingRegion == DroneRegion.Production, Is.True,
                "The Port action must request the selected combat drone's region change.");
            FindButton(view.transform, "Close Port Contracts").onClick.Invoke();
            Assert.That(FindNamedObject(view.transform, "Port Contracts").activeSelf, Is.False);
        }

        private IEnumerator SplitterOutputFilterUiCyclesEveryMode()
        {
            Assert.That(simulation.TryPlaceFacility(FacilityKind.Splitter, new GridPosition(55, 52), 0,
                out FacilityState splitter, out string splitterReason), Is.True, splitterReason);
            var pathCells = new[] { new GridPosition(56, 52), new GridPosition(57, 52) };
            Assert.That(simulation.TryPlaceConveyorPath(splitter.Id, pathCells, "ironworks",
                out ConveyorPathState path, out string pathReason), Is.True, pathReason);

            yield return null;
            SelectFacilityForManagement(splitter);

            UI.Button filterButton = FindButton(view.transform, "Cycle Conveyor Filter");
            Assert.That(filterButton.gameObject.activeInHierarchy, Is.True);
            Assert.That(filterButton.interactable, Is.True);
            Assert.That(FindText(view.transform, "Conveyor Path Label").text, Is.EqualTo("Output 1/1"));
            Assert.That(filterButton.GetComponentInChildren<UI.Text>().text, Is.EqualTo("Filter · All items"));

            ItemId[][] expectedAllowedItems =
            {
                new[] { ItemId.Iron },
                new[] { ItemId.Plate },
                new[] { ItemId.Ammunition },
                new ItemId[0]
            };
            string[] expectedLabels =
            {
                "Filter · Only Iron",
                "Filter · Only Plate",
                "Filter · Only Ammunition",
                "Filter · Blocks all",
                "Filter · All items"
            };

            for (int i = 0; i < expectedLabels.Length; i++)
            {
                filterButton.onClick.Invoke();
                Assert.That(simulation.Conveyors.TryGetPathFilter(path.Id,
                    out bool isFiltered, out ItemId[] allowedItems), Is.True);
                Assert.That(filterButton.GetComponentInChildren<UI.Text>().text, Is.EqualTo(expectedLabels[i]));
                if (i < expectedAllowedItems.Length)
                {
                    Assert.That(isFiltered, Is.True);
                    Assert.That(allowedItems, Is.EqualTo(expectedAllowedItems[i]));
                }
                else Assert.That(isFiltered, Is.False);
            }
        }

        private IEnumerator SettingsDisplayScaleAudioAndDuplicateBindingPersistInOneShortSession()
        {
            ProjectCSettingsPanel settings = view.GetComponent<ProjectCSettingsPanel>();

            FindButton(view.transform, "2x").onClick.Invoke();
            settings.Open();
            long beforeSettings = simulation.CurrentMilliseconds;
            yield return new WaitForSecondsRealtime(0.15f);
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Two));
            Assert.That(simulation.CurrentMilliseconds, Is.GreaterThan(beforeSettings),
                "Opening settings must not stop the running match.");
            settings.Close();

            FindButton(view.transform, "Pause / Resume").onClick.Invoke();
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Paused));
            long pausedAt = simulation.CurrentMilliseconds;
            settings.Open();
            yield return new WaitForSecondsRealtime(0.1f);
            Assert.That(simulation.CurrentMilliseconds, Is.EqualTo(pausedAt),
                "Opening settings must not resume a paused match.");
            Assert.That(simulation.Clock.Speed, Is.EqualTo(GameSpeed.Paused));
            settings.Close();
            FindButton(view.transform, "Pause / Resume").onClick.Invoke();
            FindButton(view.transform, "1x").onClick.Invoke();

            string expectedLanguage = settings.Language;
            Key expectedPauseBinding = settings.PauseBinding;
            settings.Open();
            Canvas canvas = view.GetComponentInChildren<Canvas>(true);
            UI.CanvasScaler scaler = canvas.GetComponent<UI.CanvasScaler>();
            Vector2 baseResolution = scaler.referenceResolution;

            int[] scales = { 125, 150, 75, 100 };
            for (int i = 0; i < scales.Length; i++)
            {
                FindButton(view.transform, "Next UI Scale").onClick.Invoke();
                Assert.That(settings.UiScalePercent, Is.EqualTo(scales[i]));
                Assert.That(PlayerPrefs.GetInt(UiScaleKey), Is.EqualTo(scales[i]));
                float divisor = scales[i] / 100f;
                Assert.That(scaler.referenceResolution.x, Is.EqualTo(baseResolution.x / divisor).Within(0.01f));
                Assert.That(scaler.referenceResolution.y, Is.EqualTo(baseResolution.y / divisor).Within(0.01f));
            }

            FindButton(view.transform, "Toggle Screen Mode").onClick.Invoke();
            Assert.That(PlayerPrefs.GetInt(FullscreenKey), Is.EqualTo(1));
            Assert.That(FindText(view.transform, "Screen Mode Value").text,
                Is.EqualTo(expectedLanguage == "ko" ? "전체 화면" : "Fullscreen"));

            SetSlider(view.transform, "Master Volume", 0.35f);
            SetSlider(view.transform, "BGM Volume", 0.45f);
            SetSlider(view.transform, "Effects Volume", 0.55f);
            Assert.That(AudioListener.volume, Is.EqualTo(0.35f).Within(0.001f));
            Assert.That(PlayerPrefs.GetFloat(MasterVolumeKey), Is.EqualTo(0.35f).Within(0.001f));
            Assert.That(PlayerPrefs.GetFloat(BgmVolumeKey), Is.EqualTo(0.45f).Within(0.001f));
            Assert.That(PlayerPrefs.GetFloat(EffectsVolumeKey), Is.EqualTo(0.55f).Within(0.001f));

            FindButton(view.transform, "Rebind Rotate").onClick.Invoke();
            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard[expectedPauseBinding]);
            yield return null;
            Release(keyboard[expectedPauseBinding]);
            yield return null;
            Assert.That(settings.PauseBinding, Is.EqualTo(expectedPauseBinding));
            Assert.That(settings.RotateBinding, Is.EqualTo(Key.R), "A key assigned to Pause must not overwrite Rotate.");
            Assert.That(PlayerPrefs.GetInt(PauseKey), Is.EqualTo((int)expectedPauseBinding));
            Assert.That(PlayerPrefs.GetInt(RotateKey), Is.EqualTo((int)Key.R));
            Assert.That(FindText(view.transform, "Settings Feedback").text,
                Does.Contain(expectedLanguage == "ko" ? "이미" : "already assigned"));

            settingsReloadObject = new GameObject("Project C Settings Reload Probe", typeof(Canvas), typeof(UI.CanvasScaler));
            Canvas reloadCanvas = settingsReloadObject.GetComponent<Canvas>();
            reloadCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            UI.CanvasScaler reloadScaler = settingsReloadObject.GetComponent<UI.CanvasScaler>();
            ProjectCSettingsPanel reloaded = settingsReloadObject.AddComponent<ProjectCSettingsPanel>();
            reloaded.Initialize(reloadCanvas, reloadScaler, null);
            Assert.That(reloaded.Language, Is.EqualTo(expectedLanguage));
            Assert.That(reloaded.UiScalePercent, Is.EqualTo(100));
            Assert.That(reloaded.MasterVolume, Is.EqualTo(0.35f).Within(0.001f));
            Assert.That(reloaded.BgmVolume, Is.EqualTo(0.45f).Within(0.001f));
            Assert.That(reloaded.EffectsVolume, Is.EqualTo(0.55f).Within(0.001f));
            Assert.That(reloaded.PauseBinding, Is.EqualTo(expectedPauseBinding));
            Assert.That(reloaded.RotateBinding, Is.EqualTo(Key.R));

            FindButton(view.transform, "Restore Display").onClick.Invoke();
            FindButton(view.transform, "Restore Audio").onClick.Invoke();
            Assert.That(settings.UiScalePercent, Is.EqualTo(100));
            Assert.That(scaler.referenceResolution.x, Is.EqualTo(baseResolution.x).Within(0.01f));
            Assert.That(scaler.referenceResolution.y, Is.EqualTo(baseResolution.y).Within(0.01f));
            Assert.That(PlayerPrefs.GetInt(FullscreenKey), Is.EqualTo(0));
            Assert.That(AudioListener.volume, Is.EqualTo(0.8f).Within(0.001f));
            Assert.That(settings.MasterVolume, Is.EqualTo(0.8f).Within(0.001f));
            Assert.That(settings.BgmVolume, Is.EqualTo(0.8f).Within(0.001f));
            Assert.That(settings.EffectsVolume, Is.EqualTo(0.9f).Within(0.001f));
        }

        private IEnumerator SaveAndReloadSettings()
        {
            ProjectCSettingsPanel settings = view.GetComponent<ProjectCSettingsPanel>();
            settings.Open();

            expectedLanguage = settings.Language == "ko" ? "en" : "ko";
            Key expectedPauseBinding = GetUnassignedKey(settings);
            FindButton(view.transform, "Next Language").onClick.Invoke();
            FindButton(view.transform, "Apply Language").onClick.Invoke();
            bool expectedShake = !settings.CameraShakeEnabled;
            bool expectedFlash = !settings.ScreenFlashEnabled;
            FindButton(view.transform, "Toggle Camera Shake").onClick.Invoke();
            FindButton(view.transform, "Toggle Screen Flash").onClick.Invoke();
            FindButton(view.transform, "Rebind Pause").onClick.Invoke();
            keyboard = InputSystem.AddDevice<Keyboard>();
            Press(keyboard[expectedPauseBinding]);
            yield return null;
            Release(keyboard[expectedPauseBinding]);
            yield return null;
            settings.Close();

            Assert.That(settings.Language, Is.EqualTo(expectedLanguage));
            Assert.That(settings.CameraShakeEnabled, Is.EqualTo(expectedShake));
            Assert.That(settings.ScreenFlashEnabled, Is.EqualTo(expectedFlash));
            Assert.That(settings.PauseBinding, Is.EqualTo(expectedPauseBinding));

            settingsReloadObject = new GameObject("Project C Settings Reload Probe", typeof(Canvas), typeof(UI.CanvasScaler));
            Canvas reloadCanvas = settingsReloadObject.GetComponent<Canvas>();
            reloadCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            ProjectCSettingsPanel reloaded = settingsReloadObject.AddComponent<ProjectCSettingsPanel>();
            reloaded.Initialize(reloadCanvas, settingsReloadObject.GetComponent<UI.CanvasScaler>(), null);
            Assert.That(reloaded.Language, Is.EqualTo(expectedLanguage));
            Assert.That(reloaded.CameraShakeEnabled, Is.EqualTo(expectedShake));
            Assert.That(reloaded.ScreenFlashEnabled, Is.EqualTo(expectedFlash));
            Assert.That(reloaded.PauseBinding, Is.EqualTo(expectedPauseBinding));
        }

        private IEnumerator DragConveyorPath(GridPosition start, GridPosition end)
        {
            mouse = InputSystem.AddDevice<Mouse>();
            Vector2 startScreen = GridCellScreenPoint(start);
            Vector2 endScreen = GridCellScreenPoint(end);
            Move(mouse.position, startScreen);
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            Move(mouse.position, endScreen);
            yield return null;
            Release(mouse.leftButton);
            yield return null;
        }

        private IEnumerator ClickWorldFacility(string facilityId)
        {
            GameObject facility = FindNamedObject(view.transform, facilityId);
            Camera camera = Camera.main;
            Assert.That(camera, Is.Not.Null, "The runtime view must provide the map camera.");
            Vector2 screenPosition = camera.WorldToScreenPoint(facility.transform.position);
            Mouse activeMouse = GetTestMouse();
            Move(activeMouse.position, screenPosition);
            yield return null;
            Press(activeMouse.leftButton);
            yield return null;
            Release(activeMouse.leftButton);
            yield return null;
        }

        private IEnumerator ClickScreenPoint(Vector2 screenPosition)
        {
            Mouse activeMouse = GetTestMouse();
            Move(activeMouse.position, screenPosition);
            yield return null;
            Press(activeMouse.leftButton);
            yield return null;
            Release(activeMouse.leftButton);
            yield return null;
        }

        private Mouse GetTestMouse()
        {
            if (mouse == null || !mouse.added) mouse = InputSystem.AddDevice<Mouse>();
            return mouse;
        }

        private void SelectFacilityForManagement(FacilityState facility)
        {
            var select = typeof(ProjectCRuntimeView).GetMethod("SelectFacility",
                System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
            Assert.That(select, Is.Not.Null, "Runtime facility selection callback should remain available.");
            select.Invoke(view, new object[] { facility });
        }

        private static Vector2 GridCellScreenPoint(GridPosition position)
        {
            Camera camera = Camera.main;
            Assert.That(camera, Is.Not.Null, "The runtime view must provide the map camera.");
            return camera.WorldToScreenPoint(new Vector3(position.X + 0.5f, 0.01f, position.Y + 0.5f));
        }

        private static bool HasActiveNamedObject(Transform root, string objectName)
        {
            Transform[] transforms = root.GetComponentsInChildren<Transform>(true);
            for (int i = 0; i < transforms.Length; i++)
                if (transforms[i].gameObject.name == objectName && transforms[i].gameObject.activeInHierarchy)
                    return true;
            return false;
        }

        [System.Serializable]
        private sealed class DiagnosticRecordSnapshot
        {
            public string recordType;
            public string sessionId;
            public string applicationVersion;
            public long gameTimeMilliseconds;
            public int startingFunds;
            public int availableFunds;
            public int exportGoal;
            public int deadlineMilliseconds;
            public string category;
            public string name;
            public string detail;
            public string value;
            public string unit;
            public string gameSpeed;
            public string averageFrameTimeMilliseconds;
            public string sampleDurationSeconds;
            public int sampleFrameCount;
            public int screenWidth;
            public int screenHeight;
            public string stackTrace;
            public string outcome;
            public int exportedCrystals;
        }

        private static UI.Button FindButton(Transform root, string objectName)
        {
            UI.Button[] buttons = root.GetComponentsInChildren<UI.Button>(true);
            string buttonGameObjectName = objectName.EndsWith(" Button") ? objectName : objectName + " Button";
            for (int i = 0; i < buttons.Length; i++)
                if (buttons[i].gameObject.name == objectName ||
                    buttons[i].gameObject.name == buttonGameObjectName) return buttons[i];
            Assert.Fail("Button not found: " + objectName);
            return null;
        }

        private static void SetSlider(Transform root, string objectName, float value)
        {
            GameObject target = FindNamedObject(root, objectName);
            UI.Slider slider = target.GetComponent<UI.Slider>();
            Assert.That(slider, Is.Not.Null, "Slider component not found on " + objectName + ".");
            slider.value = value;
        }

        private static void SetDeterministicSettings()
        {
            PlayerPrefs.SetString(LanguageKey, "en");
            PlayerPrefs.SetInt(FullscreenKey, 0);
            PlayerPrefs.SetInt(UiScaleKey, 100);
            PlayerPrefs.SetFloat(MasterVolumeKey, 0.8f);
            PlayerPrefs.SetFloat(BgmVolumeKey, 0.8f);
            PlayerPrefs.SetFloat(EffectsVolumeKey, 0.9f);
            PlayerPrefs.SetInt(ShakeKey, 1);
            PlayerPrefs.SetInt(FlashKey, 1);
            PlayerPrefs.SetInt(PauseKey, (int)Key.Space);
            PlayerPrefs.SetInt(RotateKey, (int)Key.R);
            PlayerPrefs.SetInt(ConveyorBendKey, (int)Key.Q);
            PlayerPrefs.Save();
        }

        private static Key GetUnassignedKey(ProjectCSettingsPanel settings)
        {
            for (int value = (int)Key.A; value <= (int)Key.Z; value++)
            {
                Key candidate = (Key)value;
                if (candidate != settings.PauseBinding && candidate != settings.RotateBinding &&
                    candidate != settings.ConveyorBendBinding)
                    return candidate;
            }
            Assert.Fail("No unassigned letter key is available for the pause-binding persistence check.");
            return Key.None;
        }

        private static GameObject FindNamedObject(Transform root, string objectName)
        {
            Transform[] transforms = root.GetComponentsInChildren<Transform>(true);
            for (int i = 0; i < transforms.Length; i++)
                if (transforms[i].gameObject.name == objectName) return transforms[i].gameObject;
            Assert.Fail("GameObject not found: " + objectName);
            return null;
        }

        private static UI.Text FindText(Transform root, string objectName)
        {
            UI.Text[] texts = root.GetComponentsInChildren<UI.Text>(true);
            for (int i = 0; i < texts.Length; i++)
                if (texts[i].gameObject.name == objectName) return texts[i];
            Assert.Fail("Text not found: " + objectName);
            return null;
        }

        private static T[] FindNewObjects<T>(T[] before, T[] after) where T : Component
        {
            var result = new List<T>();
            for (int i = 0; i < after.Length; i++)
            {
                bool existed = false;
                for (int j = 0; j < before.Length; j++)
                    if (after[i] == before[j]) { existed = true; break; }
                if (!existed) result.Add(after[i]);
            }
            return result.ToArray();
        }

        private static bool WasPresent<T>(T candidate, T[] values) where T : Object
        {
            if (values == null) return false;
            for (int i = 0; i < values.Length; i++)
                if (candidate == values[i]) return true;
            return false;
        }

        private static void DestroyObjects<T>(T[] objects) where T : Component
        {
            if (objects == null) return;
            for (int i = 0; i < objects.Length; i++)
                if (objects[i] != null) Object.Destroy(objects[i].gameObject);
        }

        private sealed class PreferenceSnapshot
        {
            private readonly bool hadLanguage = PlayerPrefs.HasKey(LanguageKey);
            private readonly bool hadFullscreen = PlayerPrefs.HasKey(FullscreenKey);
            private readonly bool hadUiScale = PlayerPrefs.HasKey(UiScaleKey);
            private readonly bool hadMasterVolume = PlayerPrefs.HasKey(MasterVolumeKey);
            private readonly bool hadBgmVolume = PlayerPrefs.HasKey(BgmVolumeKey);
            private readonly bool hadEffectsVolume = PlayerPrefs.HasKey(EffectsVolumeKey);
            private readonly bool hadShake = PlayerPrefs.HasKey(ShakeKey);
            private readonly bool hadFlash = PlayerPrefs.HasKey(FlashKey);
            private readonly bool hadPause = PlayerPrefs.HasKey(PauseKey);
            private readonly bool hadRotate = PlayerPrefs.HasKey(RotateKey);
            private readonly bool hadConveyorBend = PlayerPrefs.HasKey(ConveyorBendKey);
            private readonly string language = PlayerPrefs.GetString(LanguageKey, "en");
            private readonly int fullscreen = PlayerPrefs.GetInt(FullscreenKey, 0);
            private readonly int uiScale = PlayerPrefs.GetInt(UiScaleKey, 100);
            private readonly float masterVolume = PlayerPrefs.GetFloat(MasterVolumeKey, 0.8f);
            private readonly float bgmVolume = PlayerPrefs.GetFloat(BgmVolumeKey, 0.8f);
            private readonly float effectsVolume = PlayerPrefs.GetFloat(EffectsVolumeKey, 0.9f);
            private readonly int shake = PlayerPrefs.GetInt(ShakeKey, 1);
            private readonly int flash = PlayerPrefs.GetInt(FlashKey, 1);
            private readonly int pause = PlayerPrefs.GetInt(PauseKey, (int)Key.Space);
            private readonly int rotate = PlayerPrefs.GetInt(RotateKey, (int)Key.R);
            private readonly int conveyorBend = PlayerPrefs.GetInt(ConveyorBendKey, (int)Key.Q);

            public void Restore()
            {
                RestoreString(LanguageKey, hadLanguage, language);
                RestoreInt(FullscreenKey, hadFullscreen, fullscreen);
                RestoreInt(UiScaleKey, hadUiScale, uiScale);
                RestoreFloat(MasterVolumeKey, hadMasterVolume, masterVolume);
                RestoreFloat(BgmVolumeKey, hadBgmVolume, bgmVolume);
                RestoreFloat(EffectsVolumeKey, hadEffectsVolume, effectsVolume);
                RestoreInt(ShakeKey, hadShake, shake);
                RestoreInt(FlashKey, hadFlash, flash);
                RestoreInt(PauseKey, hadPause, pause);
                RestoreInt(RotateKey, hadRotate, rotate);
                RestoreInt(ConveyorBendKey, hadConveyorBend, conveyorBend);
                PlayerPrefs.Save();
            }

            private static void RestoreString(string key, bool existed, string value)
            {
                if (existed) PlayerPrefs.SetString(key, value);
                else PlayerPrefs.DeleteKey(key);
            }

            private static void RestoreInt(string key, bool existed, int value)
            {
                if (existed) PlayerPrefs.SetInt(key, value);
                else PlayerPrefs.DeleteKey(key);
            }

            private static void RestoreFloat(string key, bool existed, float value)
            {
                if (existed) PlayerPrefs.SetFloat(key, value);
                else PlayerPrefs.DeleteKey(key);
            }
        }
    }
}
