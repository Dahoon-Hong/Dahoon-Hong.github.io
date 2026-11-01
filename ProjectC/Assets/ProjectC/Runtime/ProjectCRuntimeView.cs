using System;
using System.Collections.Generic;
using System.Text;
using ProjectC.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UI = UnityEngine.UI;

namespace ProjectC.Runtime
{
    /// <summary>Temporary blockout scene, input, and status HUD driven by the authoritative core.</summary>
    internal sealed class ProjectCRuntimeView : MonoBehaviour
    {
        private static bool onboardingCompletedOrSkippedThisSession;

        private enum MenuState
        {
            Closed,
            PauseMenu,
            ConfirmRestart,
            ConfirmMainMenu,
            MainMenu,
            Result
        }

        private const int RequestedTransferBatch = 5;
        private static readonly Color Navy = new Color32(12, 24, 39, 238);
        private static readonly Color Panel = new Color32(18, 36, 54, 244);
        private static readonly Color Teal = new Color32(46, 197, 186, 255);
        private static readonly Color TextColor = new Color32(221, 235, 241, 255);
        private static readonly Color Muted = new Color32(142, 168, 180, 255);
        private static readonly Color Warning = new Color32(246, 178, 70, 255);
        private static Material runtimeMaterialTemplate;

        private readonly Dictionary<string, GameObject> facilityVisuals = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, GameObject> selectionMarkers = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, GameObject> recoveryPileVisuals = new Dictionary<string, GameObject>(StringComparer.Ordinal);
        private readonly Dictionary<string, string> facilityProblemSignatures = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, List<GameObject>> facilityProblemIcons = new Dictionary<string, List<GameObject>>(StringComparer.Ordinal);
        private readonly Dictionary<string, GameObject> enemyVisuals = new Dictionary<string, GameObject>();
        private readonly Dictionary<string, UI.Image> miniMapFacilityMarkers = new Dictionary<string, UI.Image>(StringComparer.Ordinal);
        private readonly Dictionary<string, UI.Image> miniMapEnemyMarkers = new Dictionary<string, UI.Image>(StringComparer.Ordinal);
        private readonly Dictionary<string, UI.Image> miniMapEntryWarnings = new Dictionary<string, UI.Image>(StringComparer.Ordinal);
        private readonly Dictionary<string, GameObject> conveyorCargoVisuals = new Dictionary<string, GameObject>(StringComparer.Ordinal);
        private readonly List<RectTransform> miniMapCameraBorders = new List<RectTransform>();
        private readonly List<Transform> droneMarkers = new List<Transform>();
        private readonly List<ImportShipState> oneOffShipOrders = new List<ImportShipState>();
        private readonly List<GameObject> waveEntryWarningMarkers = new List<GameObject>();
        private readonly List<Material> terrainMaterials = new List<Material>();
        private readonly Dictionary<Color, Material> materials = new Dictionary<Color, Material>();
        private readonly List<GameObject> conveyorPreviewTiles = new List<GameObject>();
        private readonly List<GridPosition> conveyorPreviewCells = new List<GridPosition>();

        private GameSimulation simulation;
        private LocalDiagnosticRecorder diagnostics;
        private Camera worldCamera;
        private Canvas canvas;
        private UI.Text statusText;
        private UI.Image screenFlashImage;
        private UI.Button warningButton;
        private UI.Text warningButtonLabel;
        private GameObject warningPanelObject;
        private RectTransform warningListContent;
        private string warningListSignature;
        private int warningFacilityCount;
        private UI.Text detailText;
        private UI.Text speedText;
        private UI.Text transferButtonLabel;
        private UI.Button transferButton;
        private UI.Text restockItemLabel;
        private UI.InputField restockTargetInput;
        private UI.Button applyRestockButton;
        private UI.Text repairButtonLabel;
        private UI.Button repairButton;
        private UI.Button demolitionButton;
        private UI.Text demolitionButtonLabel;
        private UI.Button conveyorReverseButton;
        private UI.Text conveyorReverseButtonLabel;
        private UI.Button conveyorFilterButton;
        private UI.Text conveyorFilterButtonLabel;
        private UI.Text conveyorPathLabel;
        private UI.Button conveyorPreviousPathButton;
        private UI.Button conveyorNextPathButton;
        private UI.Button restockPreviousButton;
        private UI.Button restockNextButton;
        private UI.Text facilityPriorityText;
        private readonly List<UI.Button> facilityPriorityButtons = new List<UI.Button>();
        private UI.Button portManagementButton;
        private GameObject portPanelObject;
        private UI.Text portSummaryText;
        private UI.Text portShipStatusText;
        private UI.Text portHistoryText;
        private UI.Text regularImportLabel;
        private UI.Text regularExportLabel;
        private UI.InputField regularImportInput;
        private UI.InputField regularExportInput;
        private UI.InputField oneOffIronInput;
        private UI.InputField oneOffDroneInput;
        private UI.InputField oneOffExportInput;
        private UI.Slider regularImportSlider;
        private UI.Slider regularExportSlider;
        private UI.Slider oneOffIronSlider;
        private UI.Slider oneOffDroneSlider;
        private UI.Slider oneOffExportSlider;
        private GameObject menuPanelObject;
        private GameObject statusHeaderObject;
        private GameObject facilityDetailsObject;
        private GameObject constructionPaletteObject;
        private GameObject timeControlsObject;
        private GameObject buildGridVisual;
        private GameObject facilityPlacementPreview;
        private GameObject selectedHealthBarBackground;
        private GameObject selectedHealthBarFill;
        private GameObject turretRangeVisual;
        private LineRenderer turretRangeLine;
        private UI.Text menuTitleText;
        private UI.Text menuBodyText;
        private UI.Button menuResumeButton;
        private UI.Button menuSettingsButton;
        private UI.Button menuRestartButton;
        private UI.Button menuMainMenuButton;
        private UI.Button menuGuideButton;
        private UI.Button menuStartButton;
        private UI.Button menuConfirmButton;
        private UI.Button menuCancelButton;
        private ProjectCSettingsPanel settingsPanel;
        private ProjectCOnboardingPanel onboardingPanel;
        private ProjectCAudioFeedback audioFeedback;
        private RectTransform miniMapRect;
        private Font runtimeFont;
        private Action startNewMatch;
        private FacilityState selectedFacility;
        private RecoveryPile selectedRecoveryPile;
        private FacilityKind? pendingBuildKind;
        private int pendingBuildRotation;
        private UI.Text buildModeText;
        private string transferSourceFacilityId;
        private string transferDestinationFacilityId;
        private ItemId transferItem;
        private int transferQuantity;
        private ItemId selectedRestockItem;
        private string transferFeedback;
        private string highlightedOnboardingFacilityId;
        private string selectedConveyorPathId;
        private Vector3 cameraTarget = new Vector3(64f, 0f, 64f);
        private Vector2 previousPanPointer;
        private GridPosition conveyorDragStart;
        private GridPosition conveyorPreviewEnd;
        private float hudRefreshSeconds;
        private float cameraShakeRemaining;
        private float cameraShakeElapsed;
        private float screenFlashRemaining;
        private int visualEventIndex;
        private bool isPanning;
        private bool isDraggingConveyorPath;
        private bool hasConveyorPreviewEnd;
        private bool conveyorHorizontalFirst = true;
        private bool portPanelOpen;
        private MenuState menuState;
        private MenuState menuStateBeforeSettings;
        private bool onboardingWasVisibleBeforeMenu;
        private bool runtimeFaulted;

        public void Initialize(GameSimulation gameSimulation, LocalDiagnosticRecorder diagnosticRecorder,
            Action startMatch, bool showMainMenu)
        {
            simulation = gameSimulation ?? throw new ArgumentNullException(nameof(gameSimulation));
            diagnostics = diagnosticRecorder;
            startNewMatch = startMatch;
            CreateWorld();
            CreateInterface();
            CreateScreenFlashOverlay();
            audioFeedback = gameObject.AddComponent<ProjectCAudioFeedback>();
            audioFeedback.Initialize(simulation.World);
            visualEventIndex = simulation.World.Events.Count;
            CreateSelectionHealthBar();
            CreateTurretRangeVisual();
            CreateWaveEntryWarningMarkers();
            if (!showMainMenu && !onboardingCompletedOrSkippedThisSession)
                onboardingPanel.Show();
            if (showMainMenu) ShowMainMenu();
            RefreshHud();
        }

        private void Update()
        {
            if (simulation == null || worldCamera == null || runtimeFaulted) return;

            try
            {
                simulation.AdvanceRealSeconds(Time.unscaledDeltaTime);
                RefreshFacilityViews();
                UpdateDroneMarkers();
                UpdateEnemyMarkers();
                HandleKeyboard();
                HandleMapInput();
                UpdateVisualEventFeedback();
                UpdateWaveEntryWarnings();
                UpdateScreenFeedback();
                UpdateSelectionVisualFeedback();
                bool buildPreviewVisible = pendingBuildKind.HasValue &&
                    pendingBuildKind != FacilityKind.Conveyor && menuState == MenuState.Closed &&
                    (settingsPanel == null || !settingsPanel.IsOpen);
                if (buildGridVisual != null) buildGridVisual.SetActive(buildPreviewVisible);
                if (!buildPreviewVisible && facilityPlacementPreview != null)
                    facilityPlacementPreview.SetActive(false);
                audioFeedback?.UpdateFeedback(simulation.World, selectedFacility, simulation.Production,
                    settingsPanel == null ? AudioListener.volume : settingsPanel.MasterVolume,
                    settingsPanel == null ? 0.8f : settingsPanel.BgmVolume,
                    settingsPanel == null ? 0.9f : settingsPanel.EffectsVolume);

                hudRefreshSeconds -= Time.unscaledDeltaTime;
                if (hudRefreshSeconds <= 0f)
                {
                    hudRefreshSeconds = 0.2f;
                    RefreshHud();
                }
            }
            catch (Exception exception)
            {
                runtimeFaulted = true;
                simulation.Clock.SetPaused(true);
                diagnostics?.RecordError(simulation.CurrentMilliseconds, exception);
                Debug.LogException(exception);
            }
            finally
            {
                diagnostics?.CaptureEvents(simulation.World);
            }
        }

        private void OnDestroy()
        {
            if (simulation != null && diagnostics != null)
            {
                diagnostics.CaptureEvents(simulation.World);
                diagnostics.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
            }
            foreach (Material material in materials.Values) Destroy(material);
            materials.Clear();
            for (int i = 0; i < terrainMaterials.Count; i++) Destroy(terrainMaterials[i]);
            terrainMaterials.Clear();
            if (runtimeFont != null) Destroy(runtimeFont);
        }

        private void CreateWorld()
        {
            worldCamera = Camera.main;
            if (worldCamera == null)
            {
                var cameraObject = new GameObject("Main Camera");
                cameraObject.tag = "MainCamera";
                worldCamera = cameraObject.AddComponent<Camera>();
            }

            worldCamera.orthographic = true;
            worldCamera.orthographicSize = 86f;
            worldCamera.nearClipPlane = 0.1f;
            worldCamera.farClipPlane = 300f;
            worldCamera.backgroundColor = new Color32(24, 36, 45, 255);
            worldCamera.clearFlags = CameraClearFlags.SolidColor;
            PositionCamera();

            if (FindFirstObjectByType<Light>() == null)
            {
                var lightObject = new GameObject("Project C Key Light");
                var keyLight = lightObject.AddComponent<Light>();
                keyLight.type = LightType.Directional;
                keyLight.intensity = 1.2f;
                lightObject.transform.rotation = Quaternion.Euler(45f, -35f, 0f);
            }

            GameDefinitions definitions = simulation.World.Definitions;
            CreateMapTerrain(definitions);
            CreateBuildGridVisual(definitions);
            for (int i = 0; i < definitions.OreNodes.Length; i++)
            {
                OreNodeDefinitionData node = definitions.OreNodes[i];
                CreateBlock(node.Id, new Vector3(node.X + 0.5f, 0.28f, node.Y + 0.5f),
                    new Vector3(1.2f, 0.56f, 1.2f), new Color32(91, 101, 104, 255), false);
            }

            RefreshFacilityViews();

            CreateDroneMarkers();
            selectedFacility = simulation.World.FindFacility(FacilityKind.Outpost);
            SelectFacility(selectedFacility);
        }

        private void CreateInterface()
        {
            EnsureEventSystem();
            runtimeFont = Font.CreateDynamicFontFromOSFont(new[] { "Malgun Gothic", "Arial" }, 18);

            var canvasObject = new GameObject("Project C HUD", typeof(RectTransform), typeof(Canvas),
                typeof(UI.CanvasScaler), typeof(UI.GraphicRaycaster));
            canvasObject.transform.SetParent(transform, false);
            canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 20;
            UI.CanvasScaler scaler = canvasObject.GetComponent<UI.CanvasScaler>();
            scaler.uiScaleMode = UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            RectTransform top = CreatePanel(canvas.transform, "Status Header", new Vector2(0.5f, 1f),
                new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -16f), new Vector2(980f, 104f), Navy);
            statusHeaderObject = top.gameObject;
            statusText = CreateText(top, "Match Status", new Vector2(0f, 0f), new Vector2(1f, 1f),
                new Vector2(34f, 22f), new Vector2(-34f, -22f), TextColor, 20, TextAnchor.MiddleLeft);

            RectTransform right = CreatePanel(canvas.transform, "Facility Details", new Vector2(1f, 0.5f),
                new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-18f, 0f), new Vector2(360f, 710f), Panel);
            facilityDetailsObject = right.gameObject;
            detailText = CreateScrollablePortText(right, "Selected Facility", new Vector2(16f, 375f),
                new Vector2(328f, 315f), 14);
            portManagementButton = CreateButton(right, "Manage Port", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 340f), new Vector2(300f, 36f), OpenPortManagement);
            portManagementButton.gameObject.SetActive(false);
            restockPreviousButton = CreateButton(right, "Previous Item", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(-156f, 292f), new Vector2(42f, 34f), () => CycleRestockItem(-1));
            restockItemLabel = CreateText(right, "Restock Item", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(-106f, 286f), new Vector2(106f, 324f), TextColor, 14, TextAnchor.MiddleCenter);
            restockNextButton = CreateButton(right, "Next Item", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(156f, 292f), new Vector2(42f, 34f), () => CycleRestockItem(1));
            restockTargetInput = CreateIntegerInput(right, "Restock Target", new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 250f), new Vector2(160f, 36f));
            applyRestockButton = CreateButton(right, "Apply Target", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 207f), new Vector2(300f, 36f), ApplyRestockTarget);
            repairButton = CreateButton(right, "Repair Facility", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 164f), new Vector2(300f, 36f), ToggleRepair);
            repairButtonLabel = repairButton.GetComponentInChildren<UI.Text>();
            facilityPriorityText = CreateText(right, "Facility Priority", new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(-160f, 134f), new Vector2(160f, 158f),
                Muted, 13, TextAnchor.MiddleCenter);
            for (int priority = 1; priority <= 5; priority++)
            {
                int selectedPriority = priority;
                float x = (priority - 3) * 58f;
                UI.Button priorityButton = CreateButton(right, "Priority " + priority,
                    new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                    new Vector2(x, 105f), new Vector2(48f, 36f), () => SetFacilityPriority(selectedPriority));
                priorityButton.GetComponentInChildren<UI.Text>().text = priority.ToString();
                facilityPriorityButtons.Add(priorityButton);
            }
            conveyorReverseButton = CreateButton(right, "Reverse Conveyor Direction",
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0f, 340f), new Vector2(300f, 36f), ReverseSelectedConveyor);
            conveyorReverseButtonLabel = conveyorReverseButton.GetComponentInChildren<UI.Text>();
            conveyorPreviousPathButton = CreateButton(right, "Previous Conveyor Path",
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(-156f, 292f), new Vector2(42f, 34f), () => SelectConveyorPath(-1));
            conveyorPreviousPathButton.GetComponentInChildren<UI.Text>().text = "‹";
            conveyorPathLabel = CreateText(right, "Conveyor Path Label", new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(-106f, 286f), new Vector2(106f, 324f),
                TextColor, 14, TextAnchor.MiddleCenter);
            conveyorNextPathButton = CreateButton(right, "Next Conveyor Path",
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(156f, 292f), new Vector2(42f, 34f), () => SelectConveyorPath(1));
            conveyorNextPathButton.GetComponentInChildren<UI.Text>().text = "›";
            conveyorFilterButton = CreateButton(right, "Cycle Conveyor Filter",
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0f, 250f), new Vector2(300f, 36f), CycleConveyorFilter);
            conveyorFilterButtonLabel = conveyorFilterButton.GetComponentInChildren<UI.Text>();
            demolitionButton = CreateButton(right, "Demolish Facility", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 58f), new Vector2(300f, 36f), ToggleDemolition);
            demolitionButtonLabel = demolitionButton.GetComponentInChildren<UI.Text>();
            transferButton = CreateButton(right, "Queue Transfer", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 12f), new Vector2(300f, 42f), QueueSelectedTransfer);
            transferButtonLabel = transferButton.GetComponentInChildren<UI.Text>();
            RefreshTransferAction();

            RectTransform buildPanel = CreatePanel(canvas.transform, "Construction Palette", new Vector2(0f, 0.5f),
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(18f, 0f), new Vector2(270f, 420f), Panel);
            constructionPaletteObject = buildPanel.gameObject;
            buildModeText = CreateText(buildPanel, "Build Mode", new Vector2(0f, 0f), new Vector2(1f, 0f),
                new Vector2(14f, 12f), new Vector2(-14f, 68f), TextColor, 14, TextAnchor.LowerLeft);
            CreateButton(buildPanel, "Build Miner", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(18f, -42f), new Vector2(234f, 44f), () => BeginPlacement(FacilityKind.Miner));
            CreateButton(buildPanel, "Build Refinery", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(18f, -94f), new Vector2(234f, 44f), () => BeginPlacement(FacilityKind.Refinery));
            CreateButton(buildPanel, "Build Turret", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(18f, -146f), new Vector2(234f, 44f), () => BeginPlacement(FacilityKind.Turret));
            CreateButton(buildPanel, "Build Conveyor", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(18f, -198f), new Vector2(234f, 44f), () => BeginPlacement(FacilityKind.Conveyor));
            CreateButton(buildPanel, "Build Splitter", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(18f, -250f), new Vector2(234f, 44f), () => BeginPlacement(FacilityKind.Splitter));
            CreateButton(buildPanel, "Build Merger", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(18f, -302f), new Vector2(234f, 44f), () => BeginPlacement(FacilityKind.Merger));
            RefreshBuildModeText();

            RectTransform controls = CreatePanel(canvas.transform, "Time Controls", new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 18f), new Vector2(480f, 72f), Navy);
            timeControlsObject = controls.gameObject;
            CreateButton(controls, "Pause / Resume", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(74f, -36f), new Vector2(126f, 48f), TogglePause);
            CreateButton(controls, "1x", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(211f, -36f), new Vector2(62f, 48f), () => SetSpeed(GameSpeed.One));
            CreateButton(controls, "2x", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(281f, -36f), new Vector2(62f, 48f), () => SetSpeed(GameSpeed.Two));
            CreateButton(controls, "4x", new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, 1f),
                new Vector2(351f, -36f), new Vector2(62f, 48f), () => SetSpeed(GameSpeed.Four));
            speedText = CreateText(controls, "Current Speed", new Vector2(0f, 0f), new Vector2(1f, 1f),
                new Vector2(12f, 12f), new Vector2(-12f, -12f), Muted, 14, TextAnchor.LowerRight);
            CreatePortManagementPanel();
            CreateGameMenuPanel();
            settingsPanel = gameObject.AddComponent<ProjectCSettingsPanel>();
            settingsPanel.Initialize(canvas, scaler, CloseSettings);
            settingsPanel.LanguageApplied += OnLanguageApplied;
            CreateMinimap(simulation.World.Definitions);
            CreateWarningList();
            onboardingPanel = gameObject.AddComponent<ProjectCOnboardingPanel>();
            onboardingPanel.Initialize(canvas, runtimeFont);
            onboardingPanel.SetLanguage(IsKorean ? "ko" : "en");
            onboardingPanel.SkipRequested += OnboardingSkipped;
            onboardingPanel.HideRequested += OnboardingHidden;
            onboardingPanel.ActiveStepChanged += OnboardingActiveStepChanged;
            onboardingPanel.SetVisible(false);
            ApplyLocalizedLabels();
        }

        private void CreateWarningList()
        {
            warningButton = CreateButton(canvas.transform, "Facility Warnings", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(18f, 210f), new Vector2(184f, 38f), ToggleWarningList);
            warningButtonLabel = warningButton.GetComponentInChildren<UI.Text>();

            RectTransform panel = CreatePanel(canvas.transform, "Warning List", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(18f, 254f), new Vector2(390f, 470f), Navy);
            warningPanelObject = panel.gameObject;
            CreateText(panel, "Warning List Title", new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(16f, -54f), new Vector2(-58f, -12f), TextColor, 20, TextAnchor.MiddleLeft)
                .text = Localize("FACILITY WARNINGS", "시설 경고");
            CreateButton(panel, "Close Warning List", new Vector2(1f, 1f), new Vector2(1f, 1f),
                new Vector2(1f, 1f), new Vector2(-12f, -12f), new Vector2(36f, 32f), CloseWarningList)
                .GetComponentInChildren<UI.Text>().text = "×";
            warningListContent = CreateScrollableList(panel, "Warning Entries",
                new Vector2(12f, 12f), new Vector2(366f, 390f));
            warningPanelObject.SetActive(false);
        }

        private RectTransform CreateScrollableList(Transform parent, string name, Vector2 position, Vector2 size)
        {
            var scrollObject = new GameObject(name, typeof(RectTransform), typeof(UI.ScrollRect));
            scrollObject.transform.SetParent(parent, false);
            RectTransform scrollRect = scrollObject.GetComponent<RectTransform>();
            scrollRect.anchorMin = Vector2.zero;
            scrollRect.anchorMax = Vector2.zero;
            scrollRect.pivot = Vector2.zero;
            scrollRect.anchoredPosition = position;
            scrollRect.sizeDelta = size;

            var viewportObject = new GameObject(name + " Viewport", typeof(RectTransform), typeof(UI.Image), typeof(UI.Mask));
            viewportObject.transform.SetParent(scrollObject.transform, false);
            RectTransform viewport = viewportObject.GetComponent<RectTransform>();
            viewport.anchorMin = Vector2.zero;
            viewport.anchorMax = Vector2.one;
            viewport.offsetMin = Vector2.zero;
            viewport.offsetMax = Vector2.zero;
            viewportObject.GetComponent<UI.Image>().color = new Color32(8, 20, 30, 220);
            viewportObject.GetComponent<UI.Mask>().showMaskGraphic = false;

            var contentObject = new GameObject(name + " Content", typeof(RectTransform), typeof(UI.ContentSizeFitter));
            contentObject.transform.SetParent(viewportObject.transform, false);
            RectTransform content = contentObject.GetComponent<RectTransform>();
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = new Vector2(1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.anchoredPosition = Vector2.zero;
            UI.ContentSizeFitter fitter = contentObject.GetComponent<UI.ContentSizeFitter>();
            fitter.horizontalFit = UI.ContentSizeFitter.FitMode.Unconstrained;
            fitter.verticalFit = UI.ContentSizeFitter.FitMode.PreferredSize;
            UI.VerticalLayoutGroup layout = contentObject.AddComponent<UI.VerticalLayoutGroup>();
            layout.padding = new RectOffset(8, 8, 8, 8);
            layout.spacing = 5f;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;

            UI.ScrollRect scroll = scrollObject.GetComponent<UI.ScrollRect>();
            scroll.viewport = viewport;
            scroll.content = content;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = UI.ScrollRect.MovementType.Clamped;
            return content;
        }

        private void ToggleWarningList()
        {
            if (warningPanelObject == null) return;
            warningPanelObject.SetActive(!warningPanelObject.activeSelf);
            RefreshWarningList(true);
        }

        private void CloseWarningList()
        {
            if (warningPanelObject != null) warningPanelObject.SetActive(false);
        }

        private void RefreshWarningList(bool force)
        {
            if (simulation == null) return;

            var warnedFacilities = new List<FacilityState>();
            var groupedFacilities = new Dictionary<string, List<FacilityState>>(StringComparer.Ordinal);
            var builder = new StringBuilder();
            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState facility = simulation.World.Facilities[i];
                List<string> problems = GetFacilityProblems(facility);
                string problemSignature = string.Join("|", problems);
                if (!facilityProblemSignatures.TryGetValue(facility.Id, out string previousSignature) ||
                    previousSignature != problemSignature)
                {
                    facilityProblemSignatures[facility.Id] = problemSignature;
                    UpdateFacilityWarningIcons(facility, problems.Count);
                }
                if (problems.Count == 0) continue;

                warnedFacilities.Add(facility);
                builder.Append(facility.Id).Append(':').Append(problemSignature).Append(';');
                for (int problemIndex = 0; problemIndex < problems.Count; problemIndex++)
                {
                    string problem = problems[problemIndex];
                    if (!groupedFacilities.TryGetValue(problem, out List<FacilityState> facilities))
                    {
                        facilities = new List<FacilityState>();
                        groupedFacilities.Add(problem, facilities);
                    }
                    facilities.Add(facility);
                }
            }

            warningFacilityCount = warnedFacilities.Count;
            if (warningButtonLabel != null)
                warningButtonLabel.text = string.Format(Localize("Warnings ({0})", "경고 ({0})"), warningFacilityCount);
            if (warningButton != null) warningButton.interactable = warningFacilityCount > 0;

            string nextSignature = builder.ToString();
            if (!force && nextSignature == warningListSignature) return;
            warningListSignature = nextSignature;
            for (int i = warningListContent.childCount - 1; i >= 0; i--)
                Destroy(warningListContent.GetChild(i).gameObject);

            if (warnedFacilities.Count == 0)
            {
                UI.Text emptyText = CreateText(warningListContent, "No Warnings", Vector2.zero, Vector2.one,
                    Vector2.zero, Vector2.zero, Muted, 15, TextAnchor.MiddleCenter);
                UI.LayoutElement emptyLayout = emptyText.gameObject.AddComponent<UI.LayoutElement>();
                emptyLayout.minHeight = 42f;
                emptyLayout.preferredHeight = 42f;
                return;
            }

            var problemTypes = new List<string>(groupedFacilities.Keys);
            problemTypes.Sort(CompareWarningTypes);
            for (int typeIndex = 0; typeIndex < problemTypes.Count; typeIndex++)
            {
                string problem = problemTypes[typeIndex];
                List<FacilityState> facilities = groupedFacilities[problem];
                CreateWarningGroupHeading(problem, facilities.Count);
                facilities.Sort((left, right) => string.Compare(left.Id, right.Id, StringComparison.Ordinal));
                for (int facilityIndex = 0; facilityIndex < facilities.Count; facilityIndex++)
                    CreateWarningEntry(facilities[facilityIndex], problem);
            }
        }

        private int CompareWarningTypes(string left, string right)
        {
            int urgency = GetWarningUrgency(left).CompareTo(GetWarningUrgency(right));
            return urgency != 0 ? urgency : string.Compare(left, right, StringComparison.Ordinal);
        }

        private int GetWarningUrgency(string problem)
        {
            // Order known operational impacts from immediate combat/infrastructure risk to production blockage.
            if (problem.IndexOf("destroyed", StringComparison.OrdinalIgnoreCase) >= 0 || problem.Contains("파괴")) return 0;
            if (problem.IndexOf("ammunition", StringComparison.OrdinalIgnoreCase) >= 0 || problem.Contains("탄약 없음")) return 1;
            if (problem.IndexOf("damaged", StringComparison.OrdinalIgnoreCase) >= 0 || problem.Contains("손상")) return 2;
            if (problem.IndexOf("input low", StringComparison.OrdinalIgnoreCase) >= 0 || problem.Contains("투입 부족")) return 3;
            if (problem.IndexOf("output blocked", StringComparison.OrdinalIgnoreCase) >= 0 || problem.Contains("출력 막힘")) return 4;
            return 5;
        }

        private void CreateWarningGroupHeading(string problem, int facilityCount)
        {
            UI.Text heading = CreateText(warningListContent, "Warning Group " + problem, Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero, Warning, 14, TextAnchor.MiddleLeft);
            heading.text = string.Format("{0}  ({1})", problem, facilityCount);
            UI.LayoutElement layout = heading.gameObject.AddComponent<UI.LayoutElement>();
            layout.minHeight = 26f;
            layout.preferredHeight = 26f;
        }

        private void CreateWarningEntry(FacilityState facility, string problem)
        {
            string rowName = "Warning " + facility.Id;
            UI.Button entry = CreateButton(warningListContent, rowName, Vector2.zero, Vector2.zero,
                Vector2.zero, Vector2.zero, Vector2.zero, () => { });
            RectTransform rect = entry.GetComponent<RectTransform>();
            rect.sizeDelta = Vector2.zero;
            UI.Image image = entry.GetComponent<UI.Image>();
            image.color = new Color32(88, 64, 35, 255);
            UI.LayoutElement layout = entry.gameObject.AddComponent<UI.LayoutElement>();
            layout.minHeight = 44f;
            layout.preferredHeight = layout.minHeight;
            UI.Text label = entry.GetComponentInChildren<UI.Text>();
            label.text = GetFacilityDisplayName(facility.Kind) + "  ·  " + facility.Id;
            label.fontSize = 14;
            label.alignment = TextAnchor.MiddleLeft;
            RectTransform labelRect = label.rectTransform;
            labelRect.offsetMin = new Vector2(10f, 5f);
            labelRect.offsetMax = new Vector2(-10f, -5f);
            entry.onClick.AddListener(() =>
            {
                SelectFacility(facility);
                cameraTarget = new Vector3(facility.Position.X + facility.Width * 0.5f, 0f,
                    facility.Position.Y + facility.Height * 0.5f);
                PositionCamera();
            });
        }

        private void UpdateFacilityWarningIcons(FacilityState facility, int problemCount)
        {
            if (!facilityProblemIcons.TryGetValue(facility.Id, out List<GameObject> icons))
            {
                icons = new List<GameObject>();
                facilityProblemIcons.Add(facility.Id, icons);
            }

            GameObject building = facilityVisuals.TryGetValue(facility.Id, out GameObject value) ? value : null;
            if (building == null) return;
            Vector3 basePosition = building.transform.position + Vector3.up * (FacilityHeight(facility.Kind) * 0.5f + 0.45f);
            while (icons.Count < problemCount)
            {
                GameObject icon = GameObject.CreatePrimitive(PrimitiveType.Cube);
                icon.name = facility.Id + " Warning " + icons.Count;
                icon.transform.SetParent(transform, false);
                icon.transform.localScale = new Vector3(0.34f, 0.34f, 0.34f);
                icon.GetComponent<Renderer>().sharedMaterial = CreateMaterial(Warning);
                Collider collider = icon.GetComponent<Collider>();
                if (collider != null) Destroy(collider);
                icons.Add(icon);
            }

            for (int i = 0; i < icons.Count; i++)
            {
                bool visible = i < problemCount;
                icons[i].SetActive(visible);
                if (!visible) continue;
                icons[i].transform.position = basePosition + new Vector3((i - (problemCount - 1) * 0.5f) * 0.42f, 0f, 0f);
            }
        }

        private void CreateGameMenuPanel()
        {
            RectTransform panel = CreatePanel(canvas.transform, "Game Menu", new Vector2(0.5f, 0.5f),
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(500f, 520f), Navy);
            menuPanelObject = panel.gameObject;
            menuTitleText = CreateText(panel, "Menu Title", new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(28f, -74f), new Vector2(-28f, -22f), TextColor, 24, TextAnchor.MiddleCenter);
            menuBodyText = CreateText(panel, "Menu Body", new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(30f, -282f), new Vector2(-30f, -90f), TextColor, 16, TextAnchor.UpperLeft);
            menuResumeButton = CreateButton(panel, "Resume", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 318f), new Vector2(360f, 48f), CloseGameMenu);
            menuSettingsButton = CreateButton(panel, "Settings", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 258f), new Vector2(360f, 48f), OpenSettings);
            menuRestartButton = CreateButton(panel, "Restart Match", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 198f), new Vector2(360f, 48f), RequestRestart);
            menuMainMenuButton = CreateButton(panel, "Main Menu", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 138f), new Vector2(360f, 48f), RequestMainMenu);
            menuGuideButton = CreateButton(panel, "First Play Guide", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 78f), new Vector2(360f, 48f), ShowGuideFromMenu);
            menuStartButton = CreateButton(panel, "Start Match", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(0f, 318f), new Vector2(360f, 48f), StartNewMatch);
            menuConfirmButton = CreateButton(panel, "Confirm Navigation", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(-96f, 52f), new Vector2(190f, 48f), ConfirmNavigation);
            menuCancelButton = CreateButton(panel, "Cancel Navigation", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0.5f, 0f), new Vector2(102f, 52f), new Vector2(190f, 48f), CancelNavigation);
            menuPanelObject.SetActive(false);
        }

        private void CreateMinimap(GameDefinitions definitions)
        {
            miniMapRect = CreatePanel(canvas.transform, "Minimap", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(18f, 18f), new Vector2(180f, 180f),
                new Color32(58, 119, 83, 255));
            UI.Image background = miniMapRect.GetComponent<UI.Image>();
            background.raycastTarget = true;
            float boundary = definitions.ProductionHeight / (float)definitions.MapHeight;
            CreateMinimapImage("Combat Region", new Vector2(0f, boundary), Vector2.one,
                new Color32(142, 80, 59, 255));

            if (definitions.MountainRegions != null)
            {
                for (int i = 0; i < definitions.MountainRegions.Length; i++)
                {
                    MapRegionDefinitionData region = definitions.MountainRegions[i];
                    Vector2 min = new Vector2(region.X / (float)definitions.MapWidth,
                        region.Y / (float)definitions.MapHeight);
                    Vector2 max = new Vector2((region.X + region.Width) / (float)definitions.MapWidth,
                        (region.Y + region.Height) / (float)definitions.MapHeight);
                    CreateMinimapImage("Mountain " + i, min, max, new Color32(143, 149, 144, 255));
                }
            }

            if (definitions.EnemyEntryPoints != null)
            {
                for (int i = 0; i < definitions.EnemyEntryPoints.Length; i++)
                {
                    EnemyEntryPointDefinitionData entry = definitions.EnemyEntryPoints[i];
                    UI.Image marker = CreateMinimapImage("Wave Entry " + entry.Id, Vector2.zero,
                        Vector2.zero, Warning);
                    marker.rectTransform.sizeDelta = new Vector2(11f, 11f);
                    miniMapEntryWarnings.Add(entry.Id, marker);
                }
            }

            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState facility = simulation.World.Facilities[i];
                UI.Image marker = CreateMinimapImage("Facility " + facility.Id, Vector2.zero,
                    Vector2.zero, FacilityColor(facility.Kind));
                miniMapFacilityMarkers.Add(facility.Id, marker);
            }

            for (int i = 0; i < 4; i++)
            {
                UI.Image border = CreateMinimapImage("Camera Extent " + i, Vector2.zero, Vector2.zero,
                    new Color32(235, 244, 238, 255));
                miniMapCameraBorders.Add(border.rectTransform);
            }
            RefreshMinimap();
        }

        private UI.Image CreateMinimapImage(string name, Vector2 anchorMin, Vector2 anchorMax, Color color)
        {
            var markerObject = new GameObject(name, typeof(RectTransform), typeof(UI.Image));
            markerObject.transform.SetParent(miniMapRect, false);
            RectTransform rect = markerObject.GetComponent<RectTransform>();
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = Vector2.zero;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
            rect.sizeDelta = anchorMin == anchorMax ? new Vector2(5f, 5f) : Vector2.zero;
            UI.Image image = markerObject.GetComponent<UI.Image>();
            image.color = color;
            image.raycastTarget = false;
            return image;
        }

        private void RefreshMinimap()
        {
            if (miniMapRect == null || simulation == null) return;
            GameDefinitions definitions = simulation.World.Definitions;
            float width = miniMapRect.rect.width;
            float height = miniMapRect.rect.height;
            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState facility = simulation.World.Facilities[i];
                if (!miniMapFacilityMarkers.TryGetValue(facility.Id, out UI.Image marker))
                {
                    marker = CreateMinimapImage("Facility " + facility.Id, Vector2.zero, Vector2.zero,
                        FacilityColor(facility.Kind));
                    miniMapFacilityMarkers.Add(facility.Id, marker);
                }
                float x = (float)(facility.Position.X + facility.Width * 0.5f) / definitions.MapWidth * width;
                float y = (float)(facility.Position.Y + facility.Height * 0.5f) / definitions.MapHeight * height;
                marker.rectTransform.anchoredPosition = new Vector2(x - 2.5f, y - 2.5f);
                marker.color = GetFacilityProblems(facility).Count > 0 ? Warning : FacilityColor(facility.Kind);
                marker.gameObject.SetActive(true);
            }

            for (int i = 0; i < simulation.World.Enemies.Count; i++)
            {
                EnemyState enemy = simulation.World.Enemies[i];
                if (!miniMapEnemyMarkers.TryGetValue(enemy.Id, out UI.Image marker))
                {
                    marker = CreateMinimapImage("Enemy " + enemy.Id, Vector2.zero, Vector2.zero, Warning);
                    miniMapEnemyMarkers.Add(enemy.Id, marker);
                }
                marker.rectTransform.anchoredPosition = new Vector2(
                    (float)enemy.X / definitions.MapWidth * width - 2.5f,
                    (float)enemy.Y / definitions.MapHeight * height - 2.5f);
                marker.gameObject.SetActive(enemy.IsAlive);
            }

            bool showEntryWarnings = IsNextWaveWarningActive();
            if (definitions.EnemyEntryPoints != null)
            {
                for (int i = 0; i < definitions.EnemyEntryPoints.Length; i++)
                {
                    EnemyEntryPointDefinitionData entry = definitions.EnemyEntryPoints[i];
                    if (!miniMapEntryWarnings.TryGetValue(entry.Id, out UI.Image marker)) continue;
                    marker.rectTransform.anchoredPosition = new Vector2(
                        (entry.X + 0.5f) / definitions.MapWidth * width - marker.rectTransform.sizeDelta.x * 0.5f,
                        (entry.Y + 0.5f) / definitions.MapHeight * height - marker.rectTransform.sizeDelta.y * 0.5f);
                    marker.color = new Color(Warning.r, Warning.g, Warning.b,
                        0.7f + 0.3f * Mathf.Sin(Time.unscaledTime * 5f));
                    marker.gameObject.SetActive(showEntryWarnings);
                }
            }

            Vector2[] corners = new Vector2[4];
            int index = 0;
            for (int x = 0; x <= 1; x++)
            {
                for (int y = 0; y <= 1; y++)
                {
                    Ray ray = worldCamera.ViewportPointToRay(new Vector3(x, y, 0f));
                    if (new Plane(Vector3.up, Vector3.zero).Raycast(ray, out float distance))
                    {
                        Vector3 point = ray.GetPoint(distance);
                        corners[index++] = new Vector2(
                            Mathf.Clamp(point.x / definitions.MapWidth * width, 0f, width),
                            Mathf.Clamp(point.z / definitions.MapHeight * height, 0f, height));
                    }
                }
            }
            if (index < 4) return;
            float minX = Mathf.Min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
            float maxX = Mathf.Max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
            float minY = Mathf.Min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
            float maxY = Mathf.Max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
            SetMinimapBorder(miniMapCameraBorders[0], new Vector2(minX, maxY - 2f), new Vector2(maxX - minX, 2f));
            SetMinimapBorder(miniMapCameraBorders[1], new Vector2(minX, minY), new Vector2(maxX - minX, 2f));
            SetMinimapBorder(miniMapCameraBorders[2], new Vector2(minX, minY), new Vector2(2f, maxY - minY));
            SetMinimapBorder(miniMapCameraBorders[3], new Vector2(maxX - 2f, minY), new Vector2(2f, maxY - minY));
        }

        private static void SetMinimapBorder(RectTransform border, Vector2 position, Vector2 size)
        {
            border.anchorMin = Vector2.zero;
            border.anchorMax = Vector2.zero;
            border.pivot = Vector2.zero;
            border.anchoredPosition = position;
            border.sizeDelta = size;
        }

        private void SetMenuState(MenuState state)
        {
            bool wasVisible = menuState != MenuState.Closed;
            bool willBeVisible = state != MenuState.Closed;
            if (!wasVisible && willBeVisible)
            {
                onboardingWasVisibleBeforeMenu = onboardingPanel != null && onboardingPanel.IsVisible;
                onboardingPanel?.SetVisible(false);
            }
            else if (wasVisible && !willBeVisible)
            {
                bool restoreGuide = onboardingWasVisibleBeforeMenu;
                onboardingWasVisibleBeforeMenu = false;
                if (restoreGuide) onboardingPanel?.Show();
            }

            menuState = state;
            bool visible = state != MenuState.Closed;
            menuPanelObject.SetActive(visible);
            menuResumeButton.gameObject.SetActive(state == MenuState.PauseMenu);
            menuRestartButton.gameObject.SetActive(state == MenuState.PauseMenu || state == MenuState.Result);
            menuMainMenuButton.gameObject.SetActive(state == MenuState.PauseMenu || state == MenuState.Result);
            menuGuideButton.gameObject.SetActive(state == MenuState.PauseMenu || state == MenuState.MainMenu || state == MenuState.Result);
            menuStartButton.gameObject.SetActive(state == MenuState.MainMenu);
            menuSettingsButton.gameObject.SetActive(state == MenuState.MainMenu || state == MenuState.PauseMenu);
            menuConfirmButton.gameObject.SetActive(state == MenuState.ConfirmRestart || state == MenuState.ConfirmMainMenu);
            menuCancelButton.gameObject.SetActive(state == MenuState.ConfirmRestart || state == MenuState.ConfirmMainMenu);

            bool showGameplayHud = state != MenuState.MainMenu && state != MenuState.Result;
            if (statusHeaderObject != null) statusHeaderObject.SetActive(showGameplayHud);
            if (facilityDetailsObject != null) facilityDetailsObject.SetActive(showGameplayHud);
            if (constructionPaletteObject != null) constructionPaletteObject.SetActive(showGameplayHud);
            if (timeControlsObject != null) timeControlsObject.SetActive(showGameplayHud);
            if (warningButton != null) warningButton.gameObject.SetActive(showGameplayHud);
            if (!showGameplayHud && warningPanelObject != null) warningPanelObject.SetActive(false);
            if (miniMapRect != null) miniMapRect.gameObject.SetActive(showGameplayHud);
            if (!showGameplayHud && portPanelOpen) ClosePortManagement();

            switch (state)
            {
                case MenuState.PauseMenu:
                    menuTitleText.text = Localize("GAME MENU", "게임 메뉴");
                    menuBodyText.text = Localize("The match continues at its current speed while this menu is open.",
                        "메뉴가 열린 동안에도 현재 배속으로 경기가 계속됩니다.");
                    menuResumeButton.interactable = true;
                    menuRestartButton.interactable = true;
                    menuMainMenuButton.interactable = true;
                    break;
                case MenuState.MainMenu:
                    menuTitleText.text = "PROJECT C";
                    menuBodyText.text = Localize("Offline logistics and defense simulation.", "오프라인 물류·방어 시뮬레이션");
                    break;
                case MenuState.ConfirmRestart:
                    menuTitleText.text = Localize("RESTART MATCH?", "경기를 재시작할까요?");
                    menuBodyText.text = Localize("The current match progress will be lost. Restart from the confirmed opening state?",
                        "현재 경기 진행이 사라집니다. 시작 상태부터 다시 시작할까요?");
                    menuConfirmButton.GetComponentInChildren<UI.Text>().text = Localize("Restart", "재시작");
                    menuCancelButton.GetComponentInChildren<UI.Text>().text = Localize("Cancel", "취소");
                    break;
                case MenuState.ConfirmMainMenu:
                    menuTitleText.text = Localize("RETURN TO MENU?", "메인 메뉴로 돌아갈까요?");
                    menuBodyText.text = Localize("The current match progress will be lost. Return to the main menu?",
                        "현재 경기 진행이 사라집니다. 메인 메뉴로 돌아갈까요?");
                    menuConfirmButton.GetComponentInChildren<UI.Text>().text = Localize("Return", "돌아가기");
                    menuCancelButton.GetComponentInChildren<UI.Text>().text = Localize("Cancel", "취소");
                    break;
                case MenuState.Result:
                    menuTitleText.text = simulation.World.Outcome == MatchOutcome.Victory
                        ? Localize("VICTORY", "승리") : Localize("DEFEAT", "패배");
                    menuBodyText.text = IsKorean
                        ? string.Format("최종 수출량: {0:N0}/{1:N0} ({2}%)\n경과 시간: {3}\n도달 웨이브: {4}/{5}\n처치한 적: {6}",
                            simulation.World.ExportedCrystals, simulation.World.Definitions.ExportGoal,
                            simulation.World.GoalCompletionRatePercent, FormatGameTime(simulation.CurrentMilliseconds),
                            simulation.World.HighestWaveReached, simulation.World.Definitions.WaveCount,
                            simulation.World.EnemiesDefeated)
                        : string.Format(
                            "Final exported: {0:N0} / {1:N0} ({2}%)\nPlay time: {3}\nHighest wave started: {4}/{5}\nEnemies defeated: {6}",
                            simulation.World.ExportedCrystals, simulation.World.Definitions.ExportGoal,
                            simulation.World.GoalCompletionRatePercent, FormatGameTime(simulation.CurrentMilliseconds),
                            simulation.World.HighestWaveReached, simulation.World.Definitions.WaveCount,
                            simulation.World.EnemiesDefeated);
                    menuRestartButton.GetComponentInChildren<UI.Text>().text = Localize("Play Again", "다시 시작");
                    menuMainMenuButton.GetComponentInChildren<UI.Text>().text = Localize("Main Menu", "메인 메뉴");
                    break;
            }
        }

        private void OpenPauseMenu() => SetMenuState(MenuState.PauseMenu);

        private void ShowGuideFromMenu()
        {
            onboardingWasVisibleBeforeMenu = true;
            onboardingPanel?.Show();
        }

        private void OnboardingSkipped()
        {
            onboardingWasVisibleBeforeMenu = false;
            onboardingCompletedOrSkippedThisSession = true;
        }

        private void OnboardingHidden()
        {
            onboardingWasVisibleBeforeMenu = false;
        }

        private void OnboardingActiveStepChanged(int step)
        {
            if (step < 0 || step >= 4 || onboardingPanel == null || onboardingPanel.IsComplete) return;
            FacilityKind kind = step < 2 ? FacilityKind.Ironworks
                : step == 2 ? FacilityKind.AmmunitionFactory : FacilityKind.Turret;
            FacilityState target = simulation.World.FindFacility(kind);
            if (target == null) return;

            highlightedOnboardingFacilityId = target.Id;
            cameraTarget = new Vector3(target.Position.X + target.Width * 0.5f, 0f,
                target.Position.Y + target.Height * 0.5f);
            PositionCamera();
            SelectFacility(target);
        }

        private void RefreshOnboardingProgress()
        {
            if (onboardingPanel == null) return;

            bool ironDelivered = HasTransportDelivery(ItemId.Iron, FacilityKind.Ironworks,
                FacilityKind.Port) || HasConveyorDelivery(ItemId.Iron, FacilityKind.Ironworks);
            bool plateProduced = HasProductionEvent(FacilityKind.Ironworks, ItemId.Plate);
            bool plateDelivered = HasTransportDelivery(ItemId.Plate, FacilityKind.AmmunitionFactory) ||
                                  HasConveyorDelivery(ItemId.Plate, FacilityKind.AmmunitionFactory);
            bool ammunitionProduced = HasProductionEvent(FacilityKind.AmmunitionFactory, ItemId.Ammunition);
            bool ammunitionDelivered = HasTransportDelivery(ItemId.Ammunition, FacilityKind.Turret) ||
                                       HasConveyorDelivery(ItemId.Ammunition, FacilityKind.Turret);

            int completed = 0;
            if (ironDelivered) completed = 1;
            if (completed == 1 && plateProduced) completed = 2;
            if (completed == 2 && plateDelivered && ammunitionProduced) completed = 3;
            if (completed == 3 && ammunitionDelivered) completed = 4;

            onboardingPanel.SetCompletedStepCount(completed);
            if (completed >= 4) onboardingCompletedOrSkippedThisSession = true;
        }

        private bool HasTransportDelivery(ItemId item, FacilityKind destinationKind,
            FacilityKind? sourceKind = null)
        {
            string destinationPrefix = GetFacilityIdPrefix(destinationKind);
            string sourcePrefix = sourceKind.HasValue ? GetFacilityIdPrefix(sourceKind.Value) : null;
            List<TransportOrder> orders = simulation.World.TransportOrders;
            for (int i = 0; i < orders.Count; i++)
            {
                TransportOrder order = orders[i];
                if (order.Item != item || order.DeliveredQuantity <= 0 ||
                    !order.DestinationFacilityId.StartsWith(destinationPrefix, StringComparison.Ordinal)) continue;
                if (sourcePrefix == null || (order.SourceFacilityId != null &&
                    order.SourceFacilityId.StartsWith(sourcePrefix, StringComparison.Ordinal))) return true;
            }
            return false;
        }

        private bool HasConveyorDelivery(ItemId item, FacilityKind destinationKind)
        {
            string target = ":delivered:" + item + ":" + GetFacilityIdPrefix(destinationKind);
            List<SimulationEvent> events = simulation.World.Events;
            for (int i = 0; i < events.Count; i++)
            {
                SimulationEvent itemEvent = events[i];
                if (itemEvent.Category == "conveyor" &&
                    itemEvent.Detail.IndexOf(target, StringComparison.Ordinal) >= 0) return true;
            }
            return false;
        }

        private bool HasProductionEvent(FacilityKind kind, ItemId output)
        {
            string facilityPrefix = GetFacilityIdPrefix(kind);
            string outputToken = ":" + output + ":";
            List<SimulationEvent> events = simulation.World.Events;
            for (int i = 0; i < events.Count; i++)
            {
                SimulationEvent itemEvent = events[i];
                if (itemEvent.Category == "production" &&
                    itemEvent.Detail.StartsWith(facilityPrefix, StringComparison.Ordinal) &&
                    itemEvent.Detail.Contains(":completed:") &&
                    itemEvent.Detail.IndexOf(outputToken, StringComparison.Ordinal) >= 0) return true;
            }
            return false;
        }

        private static string GetFacilityIdPrefix(FacilityKind kind) =>
            "facility-" + kind.ToString().ToLowerInvariant() + "-";

        private void CloseGameMenu()
        {
            menuRestartButton.GetComponentInChildren<UI.Text>().text = Localize("Restart Match", "경기 재시작");
            SetMenuState(MenuState.Closed);
        }

        private void ShowMainMenu()
        {
            ClosePortManagement();
            simulation.Clock.SetPaused(true);
            diagnostics?.CaptureEvents(simulation.World);
            diagnostics?.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
            SetMenuState(MenuState.MainMenu);
        }

        private void RequestRestart()
        {
            if (simulation.World.Outcome != MatchOutcome.Running)
            {
                StartNewMatch();
                return;
            }
            SetMenuState(MenuState.ConfirmRestart);
        }

        private void RequestMainMenu()
        {
            if (simulation.World.Outcome != MatchOutcome.Running)
            {
                ShowMainMenu();
                return;
            }
            SetMenuState(MenuState.ConfirmMainMenu);
        }

        private void ConfirmNavigation()
        {
            if (menuState == MenuState.ConfirmRestart) StartNewMatch();
            else if (menuState == MenuState.ConfirmMainMenu) ShowMainMenu();
        }

        private void CancelNavigation()
        {
            SetMenuState(simulation.World.Outcome == MatchOutcome.Running
                ? MenuState.PauseMenu
                : MenuState.Result);
        }

        private void StartNewMatch()
        {
            if (startNewMatch == null) return;
            diagnostics?.CaptureEvents(simulation.World);
            diagnostics?.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
            startNewMatch();
        }

        private void OpenSettings()
        {
            if (settingsPanel == null) return;
            menuStateBeforeSettings = menuState;
            menuPanelObject.SetActive(false);
            settingsPanel.Open();
        }

        private void CloseSettings()
        {
            if (menuStateBeforeSettings == MenuState.Closed)
                menuStateBeforeSettings = MenuState.PauseMenu;
            SetMenuState(menuStateBeforeSettings);
        }

        private bool IsKorean => settingsPanel != null && settingsPanel.Language == "ko";

        private string Localize(string english, string korean) => IsKorean ? korean : english;

        private void OnLanguageApplied(string language)
        {
            onboardingPanel?.SetLanguage(language);
            ApplyLocalizedLabels();
            RefreshTransferAction();
            if (menuState != MenuState.Closed) SetMenuState(menuState);
            RefreshHud();
        }

        private void ApplyLocalizedLabels()
        {
            SetButtonLabel("Build Miner", Localize("Build Miner", "채취기 건설"));
            SetButtonLabel("Build Refinery", Localize("Build Refinery", "정제기 건설"));
            SetButtonLabel("Build Turret", Localize("Build Turret", "터렛 건설"));
            SetButtonLabel("Build Conveyor", Localize("Build Conveyor Path", "컨베이어 경로 건설"));
            SetButtonLabel("Build Splitter", Localize("Build Splitter", "분배기 건설"));
            SetButtonLabel("Build Merger", Localize("Build Merger", "합류기 건설"));
            SetButtonLabel("Facility Warnings", string.Format(Localize("Warnings ({0})", "경고 ({0})"), warningFacilityCount));
            SetButtonLabel("Close Warning List", Localize("Close", "닫기"));
            SetButtonLabel("Demolish Facility", Localize("Demolish Facility", "시설 철거"));
            SetButtonLabel("Pause / Resume", Localize("Pause / Resume", "일시정지 / 재개"));
            SetButtonLabel("Manage Port", Localize("Manage Port", "항구 관리"));
            SetButtonLabel("Previous Item", Localize("Previous Item", "이전 품목"));
            SetButtonLabel("Next Item", Localize("Next Item", "다음 품목"));
            SetButtonLabel("Apply Target", Localize("Apply Target", "목표 적용"));
            SetButtonLabel("Repair Facility", Localize("Repair Facility", "시설 수리"));
            SetButtonLabel("Reverse Conveyor Direction", Localize("Reverse Belt Flow", "벨트 흐름 전환"));
            SetButtonLabel("Cycle Conveyor Filter", Localize("Cycle Splitter Filter", "분배기 필터 변경"));
            SetButtonLabel("Queue Transfer", Localize("Queue Transfer", "운반 요청"));
            SetButtonLabel("Apply Regular Contracts", Localize("Apply contracts", "계약 적용"));
            SetButtonLabel("Confirm One Off Order", Localize("Confirm order", "주문 확정"));
            SetButtonLabel("Resume", Localize("Resume", "게임으로 돌아가기"));
            SetButtonLabel("Settings", Localize("Settings", "설정"));
            SetButtonLabel("First Play Guide", Localize("First Play Guide", "첫 플레이 안내"));
            SetButtonLabel("Restart Match", Localize("Restart Match", "경기 재시작"));
            SetButtonLabel("Main Menu", Localize("Main Menu", "메인 메뉴"));
            SetButtonLabel("Start Match", Localize("Start Match", "게임 시작"));
            SetButtonLabel("Confirm Navigation", Localize("Confirm", "확인"));
            SetButtonLabel("Cancel Navigation", Localize("Cancel", "취소"));

            SetObjectText("Regular Contract Header", Localize("REGULAR CONTRACTS   ·   Apply changes to unconfirmed voyages",
                "정기 계약   ·   미확정 항차에 적용"));
            SetObjectText("Regular Import Label", Localize("Iron import", "철 수입"));
            SetObjectText("Regular Export Label", Localize("Crystal export", "결정 수출"));
            SetObjectText("One Off Header", Localize("ONE-OFF ORDER   ·   Non-cancellable after confirmation",
                "단발 주문   ·   확정 후 취소 불가"));
            SetObjectText("One Off Iron Label", Localize("Iron", "철"));
            SetObjectText("One Off Drone Label", Localize("Drones", "드론"));
            SetObjectText("One Off Export Label", Localize("Crystal export contract", "결정 수출 계약"));
            SetObjectText("Ships Header", Localize("SHIP STATUS", "선박 상태"));
            SetObjectText("Trade History Header", Localize("MATCH TRADE HISTORY", "이번 판 거래 내역"));
            SetObjectText("Port Contracts Title", Localize("PORT CONTRACTS", "항구 계약"));
            SetObjectText("Warning List Title", Localize("FACILITY WARNINGS", "시설 경고"));
            SetObjectText("Facility Priority", Localize("DRONE PRIORITY · 5 HIGHEST", "드론 우선순위 · 5 최고"));
            SetObjectText("Restock Target Placeholder", Localize("Target quantity", "목표 수량"));
        }

        private void SetButtonLabel(string buttonName, string label)
        {
            UI.Button button = FindButton(canvas.transform, buttonName + " Button");
            if (button == null) return;
            UI.Text text = button.GetComponentInChildren<UI.Text>();
            if (text != null) text.text = label;
        }

        private void SetObjectText(string objectName, string value)
        {
            UI.Text[] texts = canvas.GetComponentsInChildren<UI.Text>(true);
            for (int i = 0; i < texts.Length; i++)
                if (texts[i].gameObject.name == objectName) texts[i].text = value;
        }

        private string GetFacilityDisplayName(FacilityKind kind)
        {
            switch (kind)
            {
                case FacilityKind.Port: return Localize("Port", "항구");
                case FacilityKind.Outpost: return Localize("Outpost", "전초기지");
                case FacilityKind.Ironworks: return Localize("Ironworks", "철판 공장");
                case FacilityKind.AmmunitionFactory: return Localize("Ammunition Factory", "탄약 공장");
                case FacilityKind.Miner: return Localize("Miner", "채취기");
                case FacilityKind.Refinery: return Localize("Refinery", "정제기");
                case FacilityKind.Conveyor: return Localize("Conveyor", "컨베이어");
                case FacilityKind.Splitter: return Localize("Splitter", "분배기");
                case FacilityKind.Merger: return Localize("Merger", "합류기");
                case FacilityKind.Turret: return Localize("Turret", "터렛");
                default: return kind.ToString();
            }
        }

        private List<string> GetFacilityProblems(FacilityState facility)
        {
            var problems = new List<string>();
            if (facility == null || facility.IsUnderConstruction) return problems;
            if (facility.IsDemolishing)
                problems.Add(Localize("Demolition in progress", "철거 진행 중"));
            if (facility.IsDestroyed)
                problems.Add(Localize("Facility destroyed", "시설 파괴됨"));
            else if (facility.MaximumHealth > 0 && facility.Health < facility.MaximumHealth)
                problems.Add(Localize("Damaged · repair available", "손상됨 · 수리 가능"));

            if (facility.Kind == FacilityKind.Turret && facility.Inventory.GetStock(ItemId.Ammunition) <= 0)
                problems.Add(Localize("No ammunition", "탄약 없음"));
            if (facility.Kind == FacilityKind.Miner && facility.Inventory.GetFreeCapacity(ItemId.Ore) < 1)
                problems.Add(Localize("Ore output full", "원석 출력이 가득 참"));

            RecipeDefinitionData recipeData = null;
            switch (facility.Kind)
            {
                case FacilityKind.Ironworks: recipeData = simulation.World.Definitions.IronworksRecipe; break;
                case FacilityKind.AmmunitionFactory: recipeData = simulation.World.Definitions.AmmunitionRecipe; break;
                case FacilityKind.Refinery: recipeData = simulation.World.Definitions.RefineryRecipe; break;
            }
            if (recipeData == null) return problems;

            MachineProgress progress = simulation.Production.GetProgress(facility.Id);
            if (progress.ProgressMilliseconds > 0) return problems;
            RecipeDefinition recipe = recipeData.ToDefinition();
            if (facility.Inventory.GetAvailable(recipe.Input) < recipe.InputCount)
                problems.Add(string.Format(Localize("Input low · {0}", "투입 부족 · {0}"), GetItemDisplayName(recipe.Input)));
            if (facility.Inventory.GetFreeCapacity(recipe.Output) < recipe.OutputCount)
                problems.Add(string.Format(Localize("Output blocked · {0}", "출력 막힘 · {0}"), GetItemDisplayName(recipe.Output)));
            return problems;
        }

        private string GetItemDisplayName(ItemId item)
        {
            switch (item)
            {
                case ItemId.Iron: return Localize("Iron", "철");
                case ItemId.Plate: return Localize("Plate", "철판");
                case ItemId.Ammunition: return Localize("Ammunition", "탄약");
                case ItemId.Ore: return Localize("Ore", "원석");
                case ItemId.Crystal: return Localize("Crystal", "결정");
                default: return item.ToString();
            }
        }

        private void CreatePortManagementPanel()
        {
            RectTransform panel = CreatePanel(canvas.transform, "Port Contracts", new Vector2(0.5f, 0.5f),
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(980f, 680f), Navy);
            portPanelObject = panel.gameObject;
            CreatePortText(panel, "Port Contracts Title", "PORT CONTRACTS", 28f, 632f, 660f, 32f, TextColor, 22);
            CreateButton(panel, "Close Port Contracts", Vector2.zero, Vector2.zero, Vector2.zero,
                new Vector2(920f, 632f), new Vector2(38f, 32f), ClosePortManagement).GetComponentInChildren<UI.Text>().text = "×";

            CreatePortText(panel, "Regular Contract Header", "REGULAR CONTRACTS   ·   Apply changes to unconfirmed voyages", 30f, 590f, 780f, 25f, Teal, 16);
            regularImportLabel = CreatePortText(panel, "Regular Import Label", "Iron import", 30f, 548f, 170f, 30f, TextColor, 14);
            regularImportSlider = CreatePortSlider(panel, "Regular Iron Contract Slider", new Vector2(215f, 545f), 420f, 500f, 100f);
            regularImportInput = CreateIntegerInput(panel, "Regular Iron Contract Quantity", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(650f, 543f), new Vector2(82f, 32f));
            regularExportLabel = CreatePortText(panel, "Regular Export Label", "Crystal export", 30f, 506f, 170f, 30f, TextColor, 14);
            regularExportSlider = CreatePortSlider(panel, "Regular Crystal Contract Slider", new Vector2(215f, 503f), 420f, 500f, 500f);
            regularExportInput = CreateIntegerInput(panel, "Regular Crystal Contract Quantity", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(650f, 501f), new Vector2(82f, 32f));
            CreateButton(panel, "Apply Regular Contracts", Vector2.zero, Vector2.zero, Vector2.zero,
                new Vector2(760f, 490f), new Vector2(185f, 48f), ApplyRegularContracts);

            CreatePortText(panel, "One Off Header", "ONE-OFF ORDER   ·   Non-cancellable after confirmation", 30f, 458f, 780f, 25f, Teal, 16);
            CreatePortText(panel, "One Off Iron Label", "Iron", 30f, 418f, 170f, 28f, TextColor, 14);
            oneOffIronSlider = CreatePortSlider(panel, "One Off Iron Slider", new Vector2(215f, 415f), 420f, 500f, 0f);
            oneOffIronInput = CreateIntegerInput(panel, "One Off Iron Quantity", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(650f, 413f), new Vector2(82f, 32f));
            CreatePortText(panel, "One Off Drone Label", "Drones", 30f, 378f, 170f, 28f, TextColor, 14);
            oneOffDroneSlider = CreatePortSlider(panel, "One Off Drone Slider", new Vector2(215f, 375f), 420f, 5f, 0f);
            oneOffDroneInput = CreateIntegerInput(panel, "One Off Drone Quantity", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(650f, 373f), new Vector2(82f, 32f));
            CreatePortText(panel, "One Off Export Label", "Crystal export contract", 30f, 338f, 180f, 28f, TextColor, 14);
            oneOffExportSlider = CreatePortSlider(panel, "One Off Export Slider", new Vector2(215f, 335f), 420f, 500f, 0f);
            oneOffExportInput = CreateIntegerInput(panel, "One Off Export Quantity", Vector2.zero, Vector2.zero,
                Vector2.zero, new Vector2(650f, 333f), new Vector2(82f, 32f));
            CreateButton(panel, "Confirm One Off Order", Vector2.zero, Vector2.zero, Vector2.zero,
                new Vector2(760f, 360f), new Vector2(185f, 68f), ConfirmOneOffOrder);
            portSummaryText = CreatePortText(panel, "One Off Order Summary", string.Empty,
                30f, 270f, 915f, 68f, TextColor, 13);

            CreatePortText(panel, "Ships Header", "SHIP STATUS", 30f, 244f, 430f, 22f, Teal, 13);
            CreatePortText(panel, "Trade History Header", "MATCH TRADE HISTORY", 500f, 244f, 440f, 22f, Teal, 13);
            portShipStatusText = CreateScrollablePortText(panel, "Ship Status List", new Vector2(30f, 22f), new Vector2(440f, 212f));
            portHistoryText = CreateScrollablePortText(panel, "Trade History List", new Vector2(500f, 22f), new Vector2(450f, 212f));

            regularImportSlider.onValueChanged.AddListener(value => SetContractInput(regularImportInput, value));
            regularExportSlider.onValueChanged.AddListener(value => SetContractInput(regularExportInput, value));
            oneOffIronSlider.onValueChanged.AddListener(value => SetContractInput(oneOffIronInput, value));
            oneOffDroneSlider.onValueChanged.AddListener(value => SetContractInput(oneOffDroneInput, value));
            oneOffExportSlider.onValueChanged.AddListener(value => SetContractInput(oneOffExportInput, value));
            regularImportInput.onValueChanged.AddListener(value => SetContractSlider(regularImportSlider, value));
            regularExportInput.onValueChanged.AddListener(value => SetContractSlider(regularExportSlider, value));
            oneOffIronInput.onValueChanged.AddListener(value => SetContractSlider(oneOffIronSlider, value));
            oneOffDroneInput.onValueChanged.AddListener(value => SetContractSlider(oneOffDroneSlider, value));
            oneOffExportInput.onValueChanged.AddListener(value => SetContractSlider(oneOffExportSlider, value));
            portPanelObject.SetActive(false);
        }

        private UI.Text CreatePortText(Transform parent, string name, string value, float x, float y,
            float width, float height, Color color, int fontSize)
        {
            var textObject = new GameObject(name, typeof(RectTransform), typeof(UI.Text));
            textObject.transform.SetParent(parent, false);
            RectTransform rect = textObject.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.zero;
            rect.pivot = Vector2.zero;
            rect.anchoredPosition = new Vector2(x, y);
            rect.sizeDelta = new Vector2(width, height);
            UI.Text text = textObject.GetComponent<UI.Text>();
            text.font = runtimeFont;
            text.fontSize = fontSize;
            text.color = color;
            text.alignment = TextAnchor.MiddleLeft;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.raycastTarget = false;
            text.text = value;
            return text;
        }

        private UI.Slider CreatePortSlider(Transform parent, string name, Vector2 position,
            float width, float maximum, float initialValue)
        {
            var sliderObject = new GameObject(name, typeof(RectTransform), typeof(UI.Image), typeof(UI.Slider));
            sliderObject.transform.SetParent(parent, false);
            RectTransform rect = sliderObject.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.zero;
            rect.pivot = Vector2.zero;
            rect.anchoredPosition = position;
            rect.sizeDelta = new Vector2(width, 26f);
            sliderObject.GetComponent<UI.Image>().color = new Color32(52, 74, 86, 255);
            var handleObject = new GameObject(name + " Handle", typeof(RectTransform), typeof(UI.Image));
            handleObject.transform.SetParent(sliderObject.transform, false);
            RectTransform handle = handleObject.GetComponent<RectTransform>();
            handle.anchorMin = new Vector2(0f, 0.5f);
            handle.anchorMax = new Vector2(0f, 0.5f);
            handle.pivot = new Vector2(0.5f, 0.5f);
            handle.sizeDelta = new Vector2(18f, 26f);
            UI.Image handleImage = handleObject.GetComponent<UI.Image>();
            handleImage.color = Teal;
            UI.Slider slider = sliderObject.GetComponent<UI.Slider>();
            slider.direction = UI.Slider.Direction.LeftToRight;
            slider.minValue = 0f;
            slider.maxValue = maximum;
            slider.wholeNumbers = true;
            slider.handleRect = handle;
            slider.targetGraphic = handleImage;
            slider.value = Mathf.Clamp(initialValue, 0f, maximum);
            return slider;
        }

        private UI.Text CreateScrollablePortText(Transform parent, string name, Vector2 position, Vector2 size,
            int fontSize = 12)
        {
            var scrollObject = new GameObject(name, typeof(RectTransform), typeof(UI.ScrollRect));
            scrollObject.transform.SetParent(parent, false);
            RectTransform scrollRect = scrollObject.GetComponent<RectTransform>();
            scrollRect.anchorMin = Vector2.zero;
            scrollRect.anchorMax = Vector2.zero;
            scrollRect.pivot = Vector2.zero;
            scrollRect.anchoredPosition = position;
            scrollRect.sizeDelta = size;

            var viewportObject = new GameObject(name + " Viewport", typeof(RectTransform), typeof(UI.Image), typeof(UI.Mask));
            viewportObject.transform.SetParent(scrollObject.transform, false);
            RectTransform viewport = viewportObject.GetComponent<RectTransform>();
            viewport.anchorMin = Vector2.zero;
            viewport.anchorMax = Vector2.one;
            viewport.offsetMin = Vector2.zero;
            viewport.offsetMax = Vector2.zero;
            viewportObject.GetComponent<UI.Image>().color = new Color32(8, 20, 30, 220);
            viewportObject.GetComponent<UI.Mask>().showMaskGraphic = false;

            var contentObject = new GameObject(name + " Content", typeof(RectTransform), typeof(UI.ContentSizeFitter));
            contentObject.transform.SetParent(viewportObject.transform, false);
            RectTransform content = contentObject.GetComponent<RectTransform>();
            content.anchorMin = new Vector2(0f, 1f);
            content.anchorMax = new Vector2(1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.anchoredPosition = Vector2.zero;
            content.sizeDelta = new Vector2(0f, 0f);
            UI.ContentSizeFitter fitter = contentObject.GetComponent<UI.ContentSizeFitter>();
            fitter.horizontalFit = UI.ContentSizeFitter.FitMode.Unconstrained;
            fitter.verticalFit = UI.ContentSizeFitter.FitMode.PreferredSize;
            UI.VerticalLayoutGroup layout = contentObject.AddComponent<UI.VerticalLayoutGroup>();
            layout.padding = new RectOffset(7, 7, 5, 5);
            layout.spacing = 2f;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = true;
            layout.childForceExpandHeight = false;
            UI.Text text = CreateText(content, name + " Text", Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero, TextColor, fontSize, TextAnchor.UpperLeft);
            text.verticalOverflow = VerticalWrapMode.Overflow;
            UI.LayoutElement layoutElement = text.gameObject.AddComponent<UI.LayoutElement>();
            layoutElement.flexibleWidth = 1f;
            UI.ScrollRect scroll = scrollObject.GetComponent<UI.ScrollRect>();
            scroll.viewport = viewport;
            scroll.content = content;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = UI.ScrollRect.MovementType.Clamped;
            return text;
        }

        private static void SetContractInput(UI.InputField input, float value)
        {
            if (input != null && !input.isFocused) input.text = Mathf.RoundToInt(value).ToString();
        }

        private static void SetContractSlider(UI.Slider slider, string value)
        {
            if (slider != null && int.TryParse(value, out int quantity))
                slider.value = Mathf.Clamp(quantity, (int)slider.minValue, (int)slider.maxValue);
        }

        private void OpenPortManagement()
        {
            if (selectedFacility == null || selectedFacility.Kind != FacilityKind.Port || portPanelObject == null) return;
            portPanelOpen = true;
            portPanelObject.SetActive(true);
            SetContractDraft(regularImportSlider, regularImportInput, simulation.World.RegularImportContractQuantity);
            SetContractDraft(regularExportSlider, regularExportInput, simulation.World.RegularExportContractQuantity);
            SetContractDraft(oneOffIronSlider, oneOffIronInput, 0);
            SetContractDraft(oneOffDroneSlider, oneOffDroneInput, 0);
            SetContractDraft(oneOffExportSlider, oneOffExportInput, 0);
            RefreshPortManagementPanel();
        }

        private void ClosePortManagement()
        {
            portPanelOpen = false;
            if (portPanelObject != null) portPanelObject.SetActive(false);
        }

        private static void SetContractDraft(UI.Slider slider, UI.InputField input, int value)
        {
            slider.SetValueWithoutNotify(value);
            input.SetTextWithoutNotify(value.ToString());
        }

        private void ApplyRegularContracts()
        {
            if (simulation.World.Outcome != MatchOutcome.Running) return;
            if (!int.TryParse(regularImportInput.text, out int importQuantity) ||
                !int.TryParse(regularExportInput.text, out int exportQuantity))
            {
                transferFeedback = "Enter whole numbers for both regular contracts.";
                RefreshHud();
                return;
            }
            int contractCapacity = simulation.World.Definitions.ShipCargoCapacity;
            if (importQuantity < 0 || importQuantity > contractCapacity ||
                exportQuantity < 0 || exportQuantity > contractCapacity)
            {
                transferFeedback = "Contract quantities must be from 0 to " + contractCapacity + ".";
                RefreshPortManagementPanel();
                return;
            }

            try
            {
                simulation.SetRegularImportContractQuantity(importQuantity);
                simulation.SetRegularExportContractQuantity(exportQuantity);
                transferFeedback = "Regular contracts applied to unconfirmed voyages.";
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "apply_regular_contracts",
                    "import-iron:" + importQuantity + ":export-crystal:" + exportQuantity);
            }
            catch (Exception exception)
            {
                transferFeedback = "Contract rejected: " + exception.Message;
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "apply_regular_contracts",
                    "rejected:" + exception.Message);
            }

            diagnostics?.CaptureEvents(simulation.World);
            RefreshPortManagementPanel();
            RefreshHud();
        }

        private void ConfirmOneOffOrder()
        {
            if (simulation.World.Outcome != MatchOutcome.Running) return;
            if (!int.TryParse(oneOffIronInput.text, out int ironQuantity) ||
                !int.TryParse(oneOffDroneInput.text, out int droneCount) ||
                !int.TryParse(oneOffExportInput.text, out int exportQuantity))
            {
                transferFeedback = "Enter whole numbers for the one-off order.";
                RefreshHud();
                return;
            }

            try
            {
                ImportShipState ship = simulation.PlaceOneOffOrder(ironQuantity, droneCount, exportQuantity);
                oneOffShipOrders.Add(ship);
                transferFeedback = "Order confirmed. It cannot be cancelled; arrival takes at least 60 game seconds.";
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_one_off_order",
                    ship.OrderId + ":iron:" + ironQuantity + ":drones:" + droneCount + ":export:" + exportQuantity);
                SetContractDraft(oneOffIronSlider, oneOffIronInput, 0);
                SetContractDraft(oneOffDroneSlider, oneOffDroneInput, 0);
                SetContractDraft(oneOffExportSlider, oneOffExportInput, 0);
            }
            catch (Exception exception)
            {
                transferFeedback = "Order rejected: " + exception.Message;
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_one_off_order",
                    "rejected:" + exception.Message);
            }

            diagnostics?.CaptureEvents(simulation.World);
            RefreshPortManagementPanel();
            RefreshHud();
        }

        private void RefreshPortManagementPanel()
        {
            if (!portPanelOpen || simulation == null) return;
            bool running = simulation.World.Outcome == MatchOutcome.Running;
            regularImportLabel.text = Localize("Iron import · active ", "철 수입 · 적용 ") + simulation.World.RegularImportContractQuantity;
            regularExportLabel.text = Localize("Crystal export · active ", "결정 수출 · 적용 ") + simulation.World.RegularExportContractQuantity;
            regularImportInput.interactable = regularExportInput.interactable = running;
            regularImportSlider.interactable = regularExportSlider.interactable = running;
            oneOffIronInput.interactable = oneOffDroneInput.interactable = oneOffExportInput.interactable = running;
            oneOffIronSlider.interactable = oneOffDroneSlider.interactable = oneOffExportSlider.interactable = running;

            bool ironValid = int.TryParse(oneOffIronInput.text, out int ironQuantity);
            bool dronesValid = int.TryParse(oneOffDroneInput.text, out int droneCount);
            bool exportValid = int.TryParse(oneOffExportInput.text, out int exportQuantity);
            long cargo = (long)ironQuantity + (long)droneCount * 100L;
            long cost = (long)ironQuantity * simulation.World.Definitions.IronUnitPrice +
                        (long)droneCount * simulation.World.Definitions.DroneUnitPrice;
            bool valid = ironValid && dronesValid && exportValid && ironQuantity >= 0 && droneCount >= 0 && exportQuantity >= 0 &&
                         cargo > 0 && cargo <= simulation.World.Definitions.ShipCargoCapacity &&
                         droneCount <= simulation.AvailableDronePurchaseCount &&
                         exportQuantity <= simulation.World.Definitions.ShipCargoCapacity &&
                         cost <= simulation.World.Funds.Balance && running;
            string validation = Localize("Ready to confirm.", "주문을 확정할 수 있습니다.");
            if (!ironValid || !dronesValid || !exportValid) validation = Localize("Enter whole numbers in every quantity field.", "모든 수량을 정수로 입력하세요.");
            else if (cargo <= 0) validation = Localize("Add iron or at least one drone to make an order.", "철 또는 드론을 하나 이상 주문하세요.");
            else if (cargo > simulation.World.Definitions.ShipCargoCapacity)
                validation = Localize("Cargo exceeds ship capacity; reduce the selected import quantities.", "선박 적재량을 초과했습니다. 수량을 줄이세요.");
            else if (droneCount > simulation.AvailableDronePurchaseCount)
                validation = Localize("Drone limit exceeded; at most ", "드론 한도를 초과했습니다. 최대 ") +
                             simulation.AvailableDronePurchaseCount + Localize(" more can be ordered.", "대 더 주문할 수 있습니다.");
            else if (exportQuantity > simulation.World.Definitions.ShipCargoCapacity)
                validation = Localize("Export contract exceeds the ship capacity.", "수출 계약이 선박 적재량을 초과합니다.");
            else if ((long)droneCount * simulation.World.Definitions.DroneUnitPrice > simulation.World.Funds.Balance)
                validation = Localize("Drone cost alone exceeds current available funds.", "드론 비용만으로 현재 자금을 초과합니다.");
            else if (cost > simulation.World.Funds.Balance)
            {
                int affordableIron = simulation.World.Definitions.IronUnitPrice <= 0 ? 0 :
                    (int)Math.Min(simulation.World.Definitions.ShipCargoCapacity - (long)droneCount * 100L,
                        simulation.World.Funds.Balance / simulation.World.Definitions.IronUnitPrice);
                validation = Localize("Insufficient funds; with this drone count, at most ",
                    "자금이 부족합니다. 현재 드론 수 기준 최대 철 주문량은 ") + Math.Max(0, affordableIron) +
                    Localize(" iron is affordable.", "개입니다.");
            }
            else if (!running) validation = Localize("The match has ended.", "경기가 종료되었습니다.");
            portSummaryText.text = IsKorean
                ? string.Format("주문: 철 {0} + 드론 {1}  |  적재량 {2}/{3}  |  비용 ${4} / 보유 ${5}  |  결정 수출 계약 {6}\n" +
                                "추가 가능 드론 {7} / 최대 {8}. {9}{10}",
                    ironQuantity, droneCount, cargo, simulation.World.Definitions.ShipCargoCapacity, cost,
                    simulation.World.Funds.Balance, exportQuantity, simulation.AvailableDronePurchaseCount,
                    simulation.World.Definitions.MaximumDroneCount, validation,
                    string.IsNullOrEmpty(transferFeedback) ? string.Empty : "\n" + transferFeedback)
                : string.Format(
                    "Order: iron {0} + drones {1}  |  cargo {2}/{3}  |  cost ${4} / available ${5}  |  crystal export contract {6}\n" +
                    "Available drone capacity: {7} of {8}. {9}{10}",
                    ironQuantity, droneCount, cargo, simulation.World.Definitions.ShipCargoCapacity, cost,
                    simulation.World.Funds.Balance, exportQuantity, simulation.AvailableDronePurchaseCount,
                    simulation.World.Definitions.MaximumDroneCount, validation,
                    string.IsNullOrEmpty(transferFeedback) ? string.Empty : "\n" + transferFeedback);
            var confirmButton = FindButton(portPanelObject.transform, "Confirm One Off Order Button");
            if (confirmButton != null) confirmButton.interactable = valid;
            var applyButton = FindButton(portPanelObject.transform, "Apply Regular Contracts Button");
            if (applyButton != null) applyButton.interactable = running;
            RefreshPortShipStatus();
            RefreshPortTradeHistory();
        }

        private void RefreshPortShipStatus()
        {
            var builder = new StringBuilder();
            long now = simulation.CurrentMilliseconds;
            long nextRegularConfirmation = (long)simulation.World.Definitions.ImportShipIntervalMilliseconds -
                                           simulation.World.Definitions.ImportOrderLeadMilliseconds;
            if (now >= nextRegularConfirmation)
                nextRegularConfirmation += ((now - nextRegularConfirmation) /
                    simulation.World.Definitions.ImportShipIntervalMilliseconds + 1L) *
                    simulation.World.Definitions.ImportShipIntervalMilliseconds;
            long nextArrival = nextRegularConfirmation + simulation.World.Definitions.ImportOrderLeadMilliseconds;
            builder.AppendLine(string.Format(Localize("Next regular voyage: confirmation in {0}, arrival in {1} (iron {2})",
                "다음 정기 항차: 확정까지 {0}, 도착까지 {1} (철 {2})"),
                FormatGameTime(Math.Max(0L, nextRegularConfirmation - now)),
                FormatGameTime(Math.Max(0L, nextArrival - now)), simulation.World.RegularImportContractQuantity));

            var shown = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < simulation.PendingImportShips.Count; i++)
                AppendShipStatus(builder, simulation.PendingImportShips[i], now, shown);
            for (int i = 0; i < simulation.World.ImportShips.Count; i++)
                AppendShipStatus(builder, simulation.World.ImportShips[i], now, shown);
            for (int i = 0; i < oneOffShipOrders.Count; i++)
                AppendShipStatus(builder, oneOffShipOrders[i], now, shown);
            if (shown.Count == 0) builder.AppendLine(Localize("No ships have reached the manifest yet.", "항구 목록에 등록된 선박이 없습니다."));
            portShipStatusText.text = builder.ToString();
        }

        private void AppendShipStatus(StringBuilder builder, ImportShipState ship, long now, HashSet<string> shown)
        {
            if (ship == null || !shown.Add(ship.Id)) return;
            string state;
            if (ship.Phase == ImportShipPhase.Departed)
                state = Localize("DEPARTED", "출항 완료");
            else if (ship.Phase == ImportShipPhase.Docked)
                state = Localize("DOCKED · leaves in ", "접안 · 출항까지 ") + FormatGameTime(Math.Max(0L,
                    simulation.World.Definitions.ShipDockLimitMilliseconds - (now - ship.DockedAtMilliseconds)));
            else if (ship.ArrivalMilliseconds > now)
                state = Localize("IN TRANSIT · arrives in ", "배송 중 · 도착까지 ") + FormatGameTime(ship.ArrivalMilliseconds - now);
            else
            {
                int queuePosition = GetShipQueuePosition(ship, now);
                state = string.Format(Localize("WAITING · queue #{0} · arrived ", "대기 순번 #{0} · 도착 후 "),
                    queuePosition) + FormatGameTime(now - ship.ArrivalMilliseconds) + Localize(" ago", " 경과");
            }
            builder.AppendLine(IsKorean
                ? string.Format("{0} | {1} | 철 {2}/{3}, 결정 적재 {4}, 드론 {5}",
                    ship.Id, state, ship.UnloadedIron, ship.PaidIron, ship.LoadedCrystal, ship.DroneCount)
                : string.Format("{0} | {1} | iron {2}/{3}, loaded crystal {4}, drones {5}",
                    ship.Id, state, ship.UnloadedIron, ship.PaidIron, ship.LoadedCrystal, ship.DroneCount));
        }

        private int GetShipQueuePosition(ImportShipState target, long now)
        {
            var candidates = new List<ImportShipState>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            AddWaitingShips(candidates, seen, simulation.World.ImportShips, now);
            AddWaitingShips(candidates, seen, simulation.PendingImportShips, now);
            AddWaitingShips(candidates, seen, oneOffShipOrders, now);
            int position = 1;
            for (int i = 0; i < candidates.Count; i++)
            {
                ImportShipState candidate = candidates[i];
                if (candidate.Id == target.Id) return position;
                if (candidate.ArrivalMilliseconds < target.ArrivalMilliseconds ||
                    (candidate.ArrivalMilliseconds == target.ArrivalMilliseconds && target.OneOff && !candidate.OneOff))
                    position++;
            }
            return position;
        }

        private static void AddWaitingShips(List<ImportShipState> target, HashSet<string> seen,
            IReadOnlyList<ImportShipState> ships, long now)
        {
            for (int i = 0; i < ships.Count; i++)
            {
                ImportShipState ship = ships[i];
                if (ship == null || ship.Phase != ImportShipPhase.Waiting || ship.ArrivalMilliseconds > now ||
                    !seen.Add(ship.Id)) continue;
                target.Add(ship);
            }
        }

        private void RefreshPortTradeHistory()
        {
            var builder = new StringBuilder();
            List<SimulationEvent> events = simulation.World.Events;
            for (int i = 0; i < events.Count; i++)
            {
                SimulationEvent item = events[i];
                if (item.Category != "contract" && item.Category != "order" && item.Category != "ship" &&
                    item.Category != "export" && item.Category != "economy" && item.Category != "refund") continue;
                builder.Append(FormatGameTime(item.TimeMilliseconds)).Append("  ")
                    .Append(item.Category.ToUpperInvariant()).Append("  ").AppendLine(item.Detail);
            }
            if (builder.Length == 0) builder.AppendLine(Localize("No trade activity yet.", "거래 내역이 아직 없습니다."));
            portHistoryText.text = builder.ToString();
        }

        private static UI.Button FindButton(Transform parent, string objectName)
        {
            UI.Button[] buttons = parent.GetComponentsInChildren<UI.Button>(true);
            for (int i = 0; i < buttons.Length; i++)
                if (buttons[i].gameObject.name == objectName) return buttons[i];
            return null;
        }

        private void RefreshHud()
        {
            if (simulation == null || statusText == null) return;

            GameWorld world = simulation.World;
            RefreshOnboardingProgress();
            RefreshWarningList(false);
            FacilityState outpost = world.FindFacility(FacilityKind.Outpost);
            int wave = GetCurrentWave(simulation.CurrentMilliseconds, world.Definitions);
            long nextWave = GetMillisecondsUntilNextWave(simulation.CurrentMilliseconds, wave, world.Definitions);
            string time = FormatGameTime(simulation.CurrentMilliseconds);
            statusText.text = IsKorean
                ? string.Format("프로젝트 C     {0}     자금 ${1}     지원금 ${2}\n수출 {3:N0}/{4:N0}     전초기지 {5}/{6}     웨이브 {7}/{8}  다음 {9}",
                    time, world.Funds.Balance, GetNextSupport(world), world.ExportedCrystals,
                    world.Definitions.ExportGoal, outpost == null ? 0 : outpost.Health,
                    outpost == null ? 0 : outpost.MaximumHealth, wave, world.Definitions.WaveCount,
                    wave >= world.Definitions.WaveCount ? "--" : FormatGameTime(nextWave))
                : string.Format("PROJECT C     {0}     FUNDS  ${1}     SUPPORT  ${2}\nEXPORT  {3:N0}/{4:N0}     OUTPOST  {5}/{6}     WAVE  {7}/{8}  NEXT {9}",
                    time, world.Funds.Balance, GetNextSupport(world), world.ExportedCrystals,
                    world.Definitions.ExportGoal, outpost == null ? 0 : outpost.Health,
                    outpost == null ? 0 : outpost.MaximumHealth, wave, world.Definitions.WaveCount,
                    wave >= world.Definitions.WaveCount ? "--" : FormatGameTime(nextWave));

            Key pauseKey = settingsPanel == null ? Key.Space : settingsPanel.PauseBinding;
            speedText.text = string.Format("{0}     {1} {2}     ESC {3}     F1 / F2 / F3 {4}",
                simulation.Clock.Speed == GameSpeed.Paused ? Localize("PAUSED", "일시정지") : (int)simulation.Clock.Speed + "x",
                pauseKey, Localize("pause", "정지"), Localize("menu", "메뉴"), Localize("speed", "배속"));
            RefreshMinimap();
            if (selectedFacility != null)
            {
                var builder = new StringBuilder();
                builder.AppendLine(GetFacilityDisplayName(selectedFacility.Kind).ToUpperInvariant());
                builder.AppendLine(selectedFacility.Id);
                builder.AppendLine(string.Format("{0}   {1}, {2}", Localize("GRID", "좌표"),
                    selectedFacility.Position.X, selectedFacility.Position.Y));
                builder.AppendLine();
                if (selectedFacility.IsUnderConstruction)
                    AppendConstructionStatus(builder, world, selectedFacility);
                if (selectedFacility.IsDemolishing)
                    AppendDemolitionStatus(builder, selectedFacility);
                if (selectedFacility.MaximumHealth > 0)
                {
                    builder.AppendLine(string.Format("{0}   {1} / {2}", Localize("HEALTH", "체력"),
                        selectedFacility.Health, selectedFacility.MaximumHealth));
                    builder.AppendLine();
                    RepairTask repairTask = simulation.Repairs.GetTask(selectedFacility.Id);
                    if (repairTask != null)
                    {
                        builder.AppendLine(string.Format("{0}   {1}  +{2}/{3} HP", Localize("REPAIR", "수리"),
                            repairTask.Status.ToString().ToUpperInvariant(),
                            repairTask.RestoredHitPoints, repairTask.PlannedRecoveryHitPoints));
                        builder.AppendLine();
                    }
                }
                List<string> problems = GetFacilityProblems(selectedFacility);
                if (problems.Count > 0)
                {
                    builder.AppendLine(Localize("PROBLEMS", "문제"));
                    for (int i = 0; i < problems.Count; i++) builder.AppendLine("! " + problems[i]);
                    builder.AppendLine();
                }
                if (IsConveyorKind(selectedFacility.Kind))
                    AppendConveyorStatus(builder, selectedFacility);
                else
                {
                    builder.AppendLine(Localize("INVENTORY", "재고"));
                    AppendItem(builder, selectedFacility.Inventory, ItemId.Iron);
                    AppendItem(builder, selectedFacility.Inventory, ItemId.Plate);
                    AppendItem(builder, selectedFacility.Inventory, ItemId.Ammunition);
                    AppendItem(builder, selectedFacility.Inventory, ItemId.Ore);
                    AppendItem(builder, selectedFacility.Inventory, ItemId.Crystal);
                }
                if (selectedFacility.Kind == FacilityKind.Turret)
                    builder.AppendLine(string.Format("\n{0}   {1}{2}", Localize("RANGE", "사거리"),
                        world.Definitions.TurretRange, Localize(" cells", "칸")));
                AppendTransfers(builder, world, selectedFacility);
                AppendRecoveryPiles(builder, world, selectedFacility.Position);
                if (!string.IsNullOrEmpty(transferFeedback))
                    builder.AppendLine("\n" + transferFeedback);
                detailText.text = builder.ToString();
            }
            else if (selectedRecoveryPile != null)
            {
                var builder = new StringBuilder();
                builder.AppendLine(Localize("RECOVERY PILE", "회수 더미").ToUpperInvariant());
                builder.AppendLine(selectedRecoveryPile.Id);
                builder.AppendLine(string.Format("{0}   {1}, {2}", Localize("GRID", "좌표"),
                    selectedRecoveryPile.Position.X, selectedRecoveryPile.Position.Y));
                builder.AppendLine();
                AppendRecoveryPileInventory(builder, selectedRecoveryPile);
                builder.AppendLine("\n" + Localize("Drones automatically recover available materials.",
                    "드론이 회수 가능한 자재를 자동으로 운반합니다."));
                detailText.text = builder.ToString();
            }
            else if (detailText != null)
            {
                detailText.text = Localize("Select a facility or recovery pile.", "시설 또는 회수 더미를 선택하세요.");
            }

            RefreshRestockControls();
            RefreshRepairControls();
            RefreshFacilityActions();
            if (portManagementButton != null)
            {
                bool selectedPort = selectedFacility != null && selectedFacility.Kind == FacilityKind.Port;
                portManagementButton.gameObject.SetActive(selectedPort);
                portManagementButton.interactable = selectedPort;
            }
            if (portPanelOpen) RefreshPortManagementPanel();

            if (world.Outcome != MatchOutcome.Running)
            {
                detailText.text = IsKorean
                    ? string.Format("경기 {0}\n\n수출 결정: {1:N0}\n목표: {2:N0}\n경과 시간: {3}\n도달 웨이브: {4}\n처치한 적: {5}",
                        world.Outcome == MatchOutcome.Victory ? "승리" : "패배", world.ExportedCrystals,
                        world.Definitions.ExportGoal, time, world.HighestWaveReached, world.EnemiesDefeated)
                    : string.Format("MATCH {0}\n\nExported crystals: {1:N0}\nGoal: {2:N0}\nElapsed: {3}\nHighest wave: {4}\nEnemies defeated: {5}",
                        world.Outcome, world.ExportedCrystals, world.Definitions.ExportGoal, time,
                        world.HighestWaveReached, world.EnemiesDefeated);
                if (menuState == MenuState.Closed || menuState == MenuState.PauseMenu)
                    SetMenuState(MenuState.Result);
            }
        }

        private void HandleKeyboard()
        {
            if (settingsPanel != null && settingsPanel.IsOpen) return;
            Keyboard keyboard = Keyboard.current;
            if (keyboard == null) return;

            bool editingText = EventSystem.current != null && EventSystem.current.currentSelectedGameObject != null &&
                               EventSystem.current.currentSelectedGameObject.GetComponent<UI.InputField>() != null;
            if (keyboard.escapeKey.wasPressedThisFrame)
            {
                if (editingText)
                {
                    EventSystem.current.SetSelectedGameObject(null);
                    return;
                }
                if (portPanelOpen)
                {
                    ClosePortManagement();
                    return;
                }
                if (warningPanelObject != null && warningPanelObject.activeSelf)
                {
                    CloseWarningList();
                    return;
                }
                if (menuState == MenuState.PauseMenu || menuState == MenuState.ConfirmRestart ||
                    menuState == MenuState.ConfirmMainMenu)
                {
                    if (menuState == MenuState.PauseMenu) CloseGameMenu();
                    else CancelNavigation();
                    return;
                }
                if (menuState == MenuState.Closed && !pendingBuildKind.HasValue)
                {
                    OpenPauseMenu();
                    return;
                }
            }
            if (editingText) return;

            Key pauseKey = settingsPanel == null ? Key.Space : settingsPanel.PauseBinding;
            Key rotateKey = settingsPanel == null ? Key.R : settingsPanel.RotateBinding;
            Key bendKey = settingsPanel == null ? Key.Q : settingsPanel.ConveyorBendBinding;
            if (keyboard[pauseKey].wasPressedThisFrame) TogglePause();
            if (keyboard.f1Key.wasPressedThisFrame) SetSpeed(GameSpeed.One);
            if (keyboard.f2Key.wasPressedThisFrame) SetSpeed(GameSpeed.Two);
            if (keyboard.f3Key.wasPressedThisFrame) SetSpeed(GameSpeed.Four);
            if (pendingBuildKind == FacilityKind.Conveyor && keyboard[bendKey].wasPressedThisFrame)
            {
                conveyorHorizontalFirst = !conveyorHorizontalFirst;
                if (isDraggingConveyorPath) UpdateConveyorRoutePreview(conveyorPreviewEnd, true);
                RefreshBuildModeText();
            }
            if (pendingBuildKind.HasValue && pendingBuildKind != FacilityKind.Conveyor &&
                keyboard[rotateKey].wasPressedThisFrame)
            {
                pendingBuildRotation = (pendingBuildRotation + 90) % 360;
                RefreshBuildModeText();
            }
            if (pendingBuildKind.HasValue && keyboard.escapeKey.wasPressedThisFrame)
            {
                CancelPlacement();
            }
        }

        private void HandleMapInput()
        {
            if (portPanelOpen || (warningPanelObject != null && warningPanelObject.activeSelf) ||
                menuState != MenuState.Closed || (settingsPanel != null && settingsPanel.IsOpen)) return;
            Mouse mouse = Mouse.current;
            if (mouse == null) return;
            bool pointerOverUi = EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();

            if (mouse.leftButton.wasPressedThisFrame && miniMapRect != null &&
                RectTransformUtility.RectangleContainsScreenPoint(miniMapRect, mouse.position.ReadValue(), null) &&
                RectTransformUtility.ScreenPointToLocalPointInRectangle(miniMapRect,
                    mouse.position.ReadValue(), null, out Vector2 mapPoint))
            {
                Rect mapBounds = miniMapRect.rect;
                float mapX = Mathf.Clamp01((mapPoint.x - mapBounds.xMin) / mapBounds.width);
                float mapY = Mathf.Clamp01((mapPoint.y - mapBounds.yMin) / mapBounds.height);
                cameraTarget = new Vector3(mapX * simulation.World.Definitions.MapWidth, 0f,
                    mapY * simulation.World.Definitions.MapHeight);
                PositionCamera();
                return;
            }

            if (mouse.rightButton.wasPressedThisFrame && pendingBuildKind.HasValue && !pointerOverUi)
            {
                CancelPlacement();
                return;
            }

            if (pendingBuildKind.HasValue && pendingBuildKind != FacilityKind.Conveyor)
            {
                GridPosition position = default;
                bool hasGridPosition = !pointerOverUi && TryGetGridPosition(mouse.position.ReadValue(), out position);
                if (hasGridPosition) UpdateFacilityPlacementPreview(position);
                else if (facilityPlacementPreview != null) facilityPlacementPreview.SetActive(false);

                if (mouse.leftButton.wasPressedThisFrame && hasGridPosition)
                    CommitFacilityPlacement(position);
                return;
            }

            if (pendingBuildKind == FacilityKind.Conveyor)
            {
                if (mouse.leftButton.wasPressedThisFrame && !pointerOverUi &&
                    TryGetGridPosition(mouse.position.ReadValue(), out GridPosition start))
                {
                    isDraggingConveyorPath = true;
                    conveyorDragStart = start;
                    UpdateConveyorRoutePreview(start);
                    return;
                }
                if (isDraggingConveyorPath && mouse.leftButton.isPressed && !pointerOverUi &&
                    TryGetGridPosition(mouse.position.ReadValue(), out GridPosition current))
                {
                    UpdateConveyorRoutePreview(current);
                    return;
                }
                if (isDraggingConveyorPath && mouse.leftButton.wasReleasedThisFrame)
                {
                    if (pointerOverUi || !TryGetGridPosition(mouse.position.ReadValue(), out GridPosition end))
                    {
                        isDraggingConveyorPath = false;
                        HideConveyorPreview();
                        transferFeedback = Localize("Conveyor path cancelled.", "컨베이어 경로 배치를 취소했습니다.");
                        RefreshHud();
                    }
                    else FinishConveyorRoute(end);
                    return;
                }
                if (isDraggingConveyorPath) return;
            }

            if (mouse.middleButton.wasPressedThisFrame && !pointerOverUi)
            {
                isPanning = true;
                previousPanPointer = mouse.position.ReadValue();
            }
            if (mouse.middleButton.wasReleasedThisFrame) isPanning = false;
            if (isPanning && mouse.middleButton.isPressed && !pointerOverUi)
            {
                Vector2 current = mouse.position.ReadValue();
                Vector2 delta = current - previousPanPointer;
                float worldPerPixel = (worldCamera.orthographicSize * 2f) / Mathf.Max(1f, Screen.height);
                Vector3 right = Vector3.ProjectOnPlane(worldCamera.transform.right, Vector3.up).normalized;
                Vector3 up = Vector3.ProjectOnPlane(worldCamera.transform.up, Vector3.up).normalized;
                cameraTarget += (-right * delta.x + up * delta.y) * worldPerPixel;
                cameraTarget.x = Mathf.Clamp(cameraTarget.x, 0f, 128f);
                cameraTarget.z = Mathf.Clamp(cameraTarget.z, 0f, 128f);
                previousPanPointer = current;
                PositionCamera();
            }

            float scroll = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) > 0.01f && !pointerOverUi)
            {
                worldCamera.orthographicSize = Mathf.Clamp(worldCamera.orthographicSize - scroll * 0.025f, 24f, 105f);
            }

            if (pendingBuildKind == FacilityKind.Conveyor) return;

            if (mouse.leftButton.wasPressedThisFrame && (EventSystem.current == null || !EventSystem.current.IsPointerOverGameObject()))
            {
                Ray ray = worldCamera.ScreenPointToRay(mouse.position.ReadValue());
                if (Physics.Raycast(ray, out RaycastHit hit, 300f))
                {
                    RecoveryPileViewTarget pileTarget = hit.collider.GetComponent<RecoveryPileViewTarget>();
                    if (!pendingBuildKind.HasValue && pileTarget != null)
                    {
                        for (int i = 0; i < simulation.World.RecoveryPiles.Count; i++)
                        {
                            RecoveryPile pile = simulation.World.RecoveryPiles[i];
                            if (pile.Id != pileTarget.RecoveryPileId) continue;
                            SelectRecoveryPile(pile);
                            return;
                        }
                    }
                    FacilityViewTarget target = hit.collider.GetComponent<FacilityViewTarget>();
                    if (pendingBuildKind.HasValue)
                    {
                        GridPosition position = new GridPosition(Mathf.FloorToInt(hit.point.x), Mathf.FloorToInt(hit.point.z));
                        if (simulation.TryPlaceFacility(pendingBuildKind.Value, position, pendingBuildRotation,
                            out FacilityState facility, out string reason))
                        {
                            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_facility",
                                facility.Id + ":" + facility.Kind + ":" + position.X + "," + position.Y + ":rotation:" + pendingBuildRotation);
                            transferFeedback = "Placed " + facility.Kind + " site at " + position.X + ", " + position.Y;
                            pendingBuildKind = null;
                            pendingBuildRotation = 0;
                            RefreshFacilityViews();
                            SelectFacility(facility);
                        }
                        else
                        {
                            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_facility",
                                "rejected:" + pendingBuildKind.Value + ":" + position.X + "," + position.Y + ":" + reason);
                            transferFeedback = "Build rejected: " + reason;
                        }
                        RefreshBuildModeText();
                        RefreshHud();
                        return;
                    }

                    SelectFacility(target == null ? null : simulation.World.FindFacility(target.FacilityId));
                }
            }
        }

        private void SelectFacility(FacilityState facility)
        {
            if (selectedFacility != facility) transferFeedback = null;
            selectedFacility = facility;
            selectedRecoveryPile = null;
            foreach (GameObject selectionMarker in selectionMarkers.Values) selectionMarker.SetActive(false);
            RefreshTransferAction();
            RefreshFacilityActions();
            if (portManagementButton != null)
            {
                bool selectedPort = facility != null && facility.Kind == FacilityKind.Port;
                portManagementButton.gameObject.SetActive(selectedPort);
            }
            if (facility == null) return;

            selectedRestockItem = GetDefaultRestockItem(facility);

            if (selectionMarkers.TryGetValue(facility.Id, out GameObject marker)) marker.SetActive(true);
            if (detailText != null) RefreshHud();
        }

        private void SelectRecoveryPile(RecoveryPile pile)
        {
            selectedFacility = null;
            selectedRecoveryPile = pile;
            foreach (GameObject selectionMarker in selectionMarkers.Values) selectionMarker.SetActive(false);
            RefreshTransferAction();
            RefreshFacilityActions();
            if (detailText != null) RefreshHud();
        }

        private void CycleRestockItem(int direction)
        {
            if (selectedFacility == null || direction == 0) return;
            var supportedItems = new List<ItemId>();
            Array values = Enum.GetValues(typeof(ItemId));
            foreach (ItemId item in values)
                if (selectedFacility.Inventory.HasCapacity(item)) supportedItems.Add(item);
            if (supportedItems.Count == 0) return;

            int index = supportedItems.IndexOf(selectedRestockItem);
            if (index < 0) index = 0;
            index = (index + direction + supportedItems.Count) % supportedItems.Count;
            selectedRestockItem = supportedItems[index];
            if (restockTargetInput != null && !restockTargetInput.isFocused)
                restockTargetInput.text = selectedFacility.GetRestockTarget(selectedRestockItem).ToString();
            RefreshRestockControls();
        }

        private void ApplyRestockTarget()
        {
            if (selectedFacility == null || restockTargetInput == null) return;
            if (!int.TryParse(restockTargetInput.text, out int quantity) || quantity < 0 ||
                quantity > selectedFacility.Inventory.GetCapacity(selectedRestockItem))
            {
                transferFeedback = "Target must be a whole number within facility capacity.";
                RefreshHud();
                return;
            }

            try
            {
                simulation.SetRestockTarget(selectedFacility.Id, selectedRestockItem, quantity);
                transferFeedback = string.Format("{0} target set to {1} {2}.", quantity,
                    selectedRestockItem, selectedFacility.Kind);
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "set_restock_target",
                    selectedFacility.Id + ":" + selectedRestockItem + ":" + quantity);
            }
            catch (Exception exception)
            {
                transferFeedback = "Target rejected: " + exception.Message;
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "set_restock_target",
                    "rejected:" + exception.Message);
            }

            diagnostics?.CaptureEvents(simulation.World);
            RefreshHud();
        }

        private void ToggleRepair()
        {
            if (selectedFacility == null) return;
            RepairTask task = simulation.Repairs.GetTask(selectedFacility.Id);
            bool succeeded;
            string command;
            if (task != null)
            {
                succeeded = simulation.CancelRepair(selectedFacility.Id);
                command = "cancel_repair";
                transferFeedback = succeeded ? "Repair order cancelled." : "No repair order to cancel.";
            }
            else
            {
                succeeded = simulation.RequestRepair(selectedFacility.Id);
                command = "request_repair";
                transferFeedback = succeeded ? "Repair order queued." : "Repair unavailable or facility is fully healthy.";
            }

            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, command,
                selectedFacility.Id + (succeeded ? ":accepted" : ":rejected"));
            diagnostics?.CaptureEvents(simulation.World);
            RefreshHud();
        }

        private void ToggleDemolition()
        {
            if (selectedFacility == null) return;
            bool succeeded;
            string command;
            if (selectedFacility.IsUnderConstruction)
            {
                command = "cancel_construction";
                succeeded = simulation.CancelConstruction(selectedFacility.Id);
                transferFeedback = succeeded
                    ? Localize("Construction cancelled; materials are in a recovery pile.", "건설을 취소했습니다. 자재는 회수 더미에 보관됩니다.")
                    : Localize("Construction could not be cancelled.", "건설을 취소할 수 없습니다.");
            }
            else if (simulation.Demolitions.GetTask(selectedFacility.Id) != null)
            {
                command = "cancel_demolition";
                succeeded = simulation.CancelDemolition(selectedFacility.Id);
                transferFeedback = succeeded
                    ? Localize("Demolition cancelled.", "철거를 취소했습니다.")
                    : Localize("Demolition could not be cancelled.", "철거를 취소할 수 없습니다.");
            }
            else
            {
                command = "request_demolition";
                succeeded = simulation.RequestDemolition(selectedFacility.Id);
                transferFeedback = succeeded
                    ? Localize("Demolition order started.", "철거를 시작했습니다.")
                    : Localize("This facility cannot be demolished.", "이 시설은 철거할 수 없습니다.");
            }

            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, command,
                selectedFacility.Id + (succeeded ? ":accepted" : ":rejected"));
            diagnostics?.CaptureEvents(simulation.World);
            RefreshFacilityViews();
            RefreshHud();
        }

        private void SetFacilityPriority(int priority)
        {
            if (selectedFacility == null || simulation.World.Outcome != MatchOutcome.Running) return;
            try
            {
                simulation.SetFacilityPriority(selectedFacility.Id, priority);
                transferFeedback = string.Format(Localize("Drone priority set to {0}.", "드론 우선순위를 {0}(으)로 설정했습니다."), priority);
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "set_facility_priority",
                    selectedFacility.Id + ":" + priority);
            }
            catch (Exception exception)
            {
                transferFeedback = Localize("Priority could not be changed.", "우선순위를 변경하지 못했습니다.") + " " + exception.Message;
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "set_facility_priority",
                    "rejected:" + selectedFacility.Id + ":" + priority + ":" + exception.Message);
            }
            diagnostics?.CaptureEvents(simulation.World);
            RefreshHud();
        }

        private void RefreshFacilityActions()
        {
            bool selected = selectedFacility != null;
            bool running = selected && simulation.World.Outcome == MatchOutcome.Running;
            for (int i = 0; i < facilityPriorityButtons.Count; i++)
            {
                UI.Button button = facilityPriorityButtons[i];
                button.interactable = running;
                UI.Image buttonImage = button.GetComponent<UI.Image>();
                buttonImage.color = selected && selectedFacility.Priority == i + 1
                    ? Teal
                    : new Color32(30, 93, 103, 255);
            }
            if (facilityPriorityText != null)
                facilityPriorityText.text = Localize("DRONE PRIORITY · 5 HIGHEST", "드론 우선순위 · 5 최고") +
                    (selected ? "   " + selectedFacility.Priority : string.Empty);

            bool isOrdinaryBelt = selected && selectedFacility.Kind == FacilityKind.Conveyor;
            if (conveyorReverseButton != null)
            {
                conveyorReverseButton.gameObject.SetActive(isOrdinaryBelt);
                conveyorReverseButton.interactable = isOrdinaryBelt && running && !selectedFacility.IsUnderConstruction &&
                    IsConnectedConveyor(selectedFacility);
            }
            RefreshConveyorFilterControls();

            if (demolitionButton == null) return;
            demolitionButton.gameObject.SetActive(selected);
            if (!selected) return;
            bool fixedFacility = selectedFacility.Kind == FacilityKind.Port || selectedFacility.Kind == FacilityKind.Outpost;
            bool hasTask = simulation.Demolitions.GetTask(selectedFacility.Id) != null;
            bool available = running && !selectedFacility.IsDestroyed &&
                (selectedFacility.IsUnderConstruction || hasTask || simulation.Demolitions.CanRequest(simulation.World, selectedFacility.Id));
            demolitionButton.interactable = available;
            if (demolitionButtonLabel != null)
            {
                if (selectedFacility.IsUnderConstruction)
                    demolitionButtonLabel.text = Localize("Cancel Construction", "건설 취소");
                else if (hasTask)
                    demolitionButtonLabel.text = Localize("Cancel Demolition", "철거 취소");
                else if (fixedFacility)
                    demolitionButtonLabel.text = Localize("Fixed Facility", "고정 시설");
                else
                    demolitionButtonLabel.text = Localize("Demolish Facility", "시설 철거");
            }
        }

        private void RefreshRestockControls()
        {
            bool available = selectedFacility != null && selectedFacility.Inventory.HasCapacity(selectedRestockItem);
            if (restockPreviousButton != null) restockPreviousButton.gameObject.SetActive(available);
            if (restockNextButton != null) restockNextButton.gameObject.SetActive(available);
            if (restockItemLabel != null) restockItemLabel.gameObject.SetActive(available);
            if (restockTargetInput != null) restockTargetInput.gameObject.SetActive(available);
            if (applyRestockButton != null) applyRestockButton.gameObject.SetActive(available);
            if (restockItemLabel != null)
                restockItemLabel.text = available
                    ? string.Format("{0} {1}  ({2} {3}/{4})", GetItemDisplayName(selectedRestockItem).ToUpperInvariant(),
                        Localize("target", "목표"), Localize("stock", "보유"),
                        selectedFacility.Inventory.GetStock(selectedRestockItem),
                        selectedFacility.Inventory.GetCapacity(selectedRestockItem))
                    : Localize("No configurable stock", "설정 가능한 재고 없음");
            if (restockTargetInput != null)
            {
                restockTargetInput.interactable = available && simulation.World.Outcome == MatchOutcome.Running;
                if (!restockTargetInput.isFocused)
                    restockTargetInput.text = available
                        ? selectedFacility.GetRestockTarget(selectedRestockItem).ToString()
                        : string.Empty;
            }
            if (applyRestockButton != null)
                applyRestockButton.interactable = available && simulation.World.Outcome == MatchOutcome.Running;
        }

        private List<ConveyorPathState> GetSelectedSplitterPaths()
        {
            var result = new List<ConveyorPathState>();
            if (selectedFacility == null || selectedFacility.Kind != FacilityKind.Splitter) return result;
            IReadOnlyList<ConveyorPathState> paths = simulation.Conveyors.Paths;
            for (int i = 0; i < paths.Count; i++)
                if (paths[i].SourceFacilityId == selectedFacility.Id) result.Add(paths[i]);
            return result;
        }

        private void RefreshConveyorFilterControls()
        {
            bool splitterSelected = selectedFacility != null && selectedFacility.Kind == FacilityKind.Splitter;
            List<ConveyorPathState> paths = GetSelectedSplitterPaths();
            int pathIndex = -1;
            for (int i = 0; i < paths.Count; i++)
                if (paths[i].Id == selectedConveyorPathId) pathIndex = i;
            if (pathIndex < 0 && paths.Count > 0)
            {
                pathIndex = 0;
                selectedConveyorPathId = paths[0].Id;
            }
            else if (paths.Count == 0) selectedConveyorPathId = null;

            bool editable = splitterSelected && paths.Count > 0 && simulation.World.Outcome == MatchOutcome.Running;
            if (conveyorPreviousPathButton != null) conveyorPreviousPathButton.gameObject.SetActive(splitterSelected);
            if (conveyorNextPathButton != null) conveyorNextPathButton.gameObject.SetActive(splitterSelected);
            if (conveyorPathLabel != null)
            {
                conveyorPathLabel.gameObject.SetActive(splitterSelected);
                conveyorPathLabel.text = paths.Count == 0
                    ? Localize("No connected output", "연결된 출력 경로 없음")
                    : string.Format(Localize("Output {0}/{1}", "출력 {0}/{1}"), pathIndex + 1, paths.Count);
            }
            if (conveyorPreviousPathButton != null) conveyorPreviousPathButton.interactable = paths.Count > 1;
            if (conveyorNextPathButton != null) conveyorNextPathButton.interactable = paths.Count > 1;
            if (conveyorFilterButton != null)
            {
                conveyorFilterButton.gameObject.SetActive(splitterSelected);
                conveyorFilterButton.interactable = editable;
            }
            if (paths.Count == 0 || !simulation.Conveyors.TryGetPathFilter(selectedConveyorPathId,
                out bool isFiltered, out ItemId[] allowedItems))
            {
                if (conveyorFilterButtonLabel != null)
                    conveyorFilterButtonLabel.text = Localize("Connect an output to edit its filter", "출력을 연결하면 필터를 설정할 수 있습니다.");
                return;
            }

            string filter = !isFiltered ? Localize("All items", "모든 품목")
                : allowedItems.Length == 0 ? Localize("Blocks all", "모두 차단")
                : allowedItems.Length == 1 ? Localize("Only ", "허용: ") + GetItemDisplayName(allowedItems[0])
                : Localize("Selected items", "선택 품목");
            if (conveyorFilterButtonLabel != null)
                conveyorFilterButtonLabel.text = Localize("Filter · ", "필터 · ") + filter;
        }

        private void SelectConveyorPath(int delta)
        {
            List<ConveyorPathState> paths = GetSelectedSplitterPaths();
            if (paths.Count == 0) return;
            int current = 0;
            for (int i = 0; i < paths.Count; i++)
                if (paths[i].Id == selectedConveyorPathId) current = i;
            current = (current + delta + paths.Count) % paths.Count;
            selectedConveyorPathId = paths[current].Id;
            RefreshConveyorFilterControls();
        }

        private void CycleConveyorFilter()
        {
            if (string.IsNullOrEmpty(selectedConveyorPathId) ||
                !simulation.Conveyors.TryGetPathFilter(selectedConveyorPathId,
                    out bool isFiltered, out ItemId[] allowedItems)) return;

            ItemId[] filterItems = { ItemId.Iron, ItemId.Plate, ItemId.Ammunition };
            int mode = !isFiltered ? 0
                : allowedItems.Length == 0 ? 4
                : allowedItems.Length == 1 && Array.IndexOf(filterItems, allowedItems[0]) >= 0
                    ? Array.IndexOf(filterItems, allowedItems[0]) + 1
                    : 4;
            int nextMode = (mode + 1) % 5;
            IEnumerable<ItemId> nextFilter = nextMode == 0 ? null
                : nextMode == 4 ? Array.Empty<ItemId>()
                : new[] { filterItems[nextMode - 1] };
            bool changed = simulation.SetConveyorOutputFilter(selectedConveyorPathId, nextFilter);
            transferFeedback = changed
                ? Localize("Splitter output filter changed.", "분배기 출력 필터를 변경했습니다.")
                : Localize("Splitter filter could not be changed.", "분배기 필터를 변경하지 못했습니다.");
            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "set_conveyor_filter",
                selectedConveyorPathId + ":" + (nextMode == 0 ? "all" : nextMode == 4 ? "blocked" : filterItems[nextMode - 1].ToString()));
            RefreshConveyorFilterControls();
            RefreshHud();
        }

        private bool IsConnectedConveyor(FacilityState facility)
        {
            if (facility == null) return false;
            IReadOnlyList<ConveyorPathState> paths = simulation.Conveyors.Paths;
            for (int i = 0; i < paths.Count; i++)
                for (int j = 0; j < paths[i].Cells.Count; j++)
                    if (paths[i].Cells[j].Equals(facility.Position)) return true;
            return false;
        }

        private void ReverseSelectedConveyor()
        {
            if (selectedFacility == null || selectedFacility.Kind != FacilityKind.Conveyor) return;
            bool reversed = simulation.ReverseConveyorDirection(selectedFacility.Id);
            transferFeedback = reversed
                ? Localize("Belt flow reversed. Items on it were preserved.", "벨트 흐름을 전환했습니다. 운반 중인 물자는 보존됩니다.")
                : Localize("This belt cannot reverse while it has branching connections.", "분기 연결된 벨트는 방향을 전환할 수 없습니다.");
            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "reverse_conveyor",
                selectedFacility.Id + (reversed ? ":accepted" : ":rejected"));
            RefreshFacilityActions();
            RefreshHud();
        }

        private void RefreshRepairControls()
        {
            if (repairButton == null) return;
            RepairTask task = selectedFacility == null ? null : simulation.Repairs.GetTask(selectedFacility.Id);
            bool hasHealth = selectedFacility != null && selectedFacility.MaximumHealth > 0;
            repairButton.gameObject.SetActive(hasHealth);
            repairButton.interactable = hasHealth && !selectedFacility.IsDemolishing && simulation.World.Outcome == MatchOutcome.Running &&
                (task != null || (!selectedFacility.IsDestroyed && selectedFacility.Health < selectedFacility.MaximumHealth));
            if (repairButtonLabel != null)
                repairButtonLabel.text = selectedFacility != null && selectedFacility.IsDemolishing
                    ? Localize("Cancel demolition first", "먼저 철거를 취소하세요")
                    : task == null ? Localize("Repair Facility", "시설 수리") : Localize("Cancel Repair", "수리 취소");
        }

        private static ItemId GetDefaultRestockItem(FacilityState facility)
        {
            Array values = Enum.GetValues(typeof(ItemId));
            foreach (ItemId item in values)
                if (facility.Inventory.HasCapacity(item) && facility.GetRestockTarget(item) > 0) return item;
            foreach (ItemId item in values)
                if (facility.Inventory.HasCapacity(item)) return item;
            return ItemId.Iron;
        }

        private void RefreshFacilityViews()
        {
            if (simulation == null) return;
            var liveFacilityIds = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState facility = simulation.World.Facilities[i];
                liveFacilityIds.Add(facility.Id);
                if (!facilityVisuals.TryGetValue(facility.Id, out GameObject building))
                {
                    CreateFacilityView(facility);
                    continue;
                }

                Renderer renderer = building.GetComponent<Renderer>();
                if (renderer != null)
                    renderer.sharedMaterial = CreateMaterial(facility.IsUnderConstruction
                        ? Color.Lerp(FacilityColor(facility.Kind), Muted, 0.48f)
                        : FacilityColor(facility.Kind));
                RefreshConveyorCargoView(facility);
            }

            var removedIds = new List<string>();
            foreach (string facilityId in facilityVisuals.Keys)
                if (!liveFacilityIds.Contains(facilityId)) removedIds.Add(facilityId);
            for (int i = 0; i < removedIds.Count; i++) RemoveFacilityView(removedIds[i]);

            if (selectedFacility != null && !liveFacilityIds.Contains(selectedFacility.Id))
            {
                selectedFacility = simulation.World.FindFacility(FacilityKind.Outpost);
                selectedRecoveryPile = null;
                foreach (GameObject marker in selectionMarkers.Values) marker.SetActive(false);
                if (selectedFacility != null && selectionMarkers.TryGetValue(selectedFacility.Id, out GameObject selectedMarker))
                    selectedMarker.SetActive(true);
                RefreshTransferAction();
                RefreshFacilityActions();
            }

            RefreshRecoveryPileViews();
        }

        private void RefreshConveyorCargoView(FacilityState facility)
        {
            if (facility.Kind != FacilityKind.Conveyor && facility.Kind != FacilityKind.Splitter &&
                facility.Kind != FacilityKind.Merger) return;
            ConveyorNodeState node = simulation.Conveyors.GetNode(facility.Id);
            bool hasItem = node != null && node.Item.HasValue;
            if (!conveyorCargoVisuals.TryGetValue(facility.Id, out GameObject marker))
            {
                if (!hasItem) return;
                marker = CreateBlock("Conveyor Cargo " + facility.Id, Vector3.zero,
                    new Vector3(0.34f, 0.22f, 0.34f), ItemColor(node.Item.Value), false);
                conveyorCargoVisuals.Add(facility.Id, marker);
            }

            marker.SetActive(hasItem);
            if (!hasItem) return;
            marker.GetComponent<Renderer>().sharedMaterial = CreateMaterial(ItemColor(node.Item.Value));
            float cellMilliseconds = 1_000f / Mathf.Max(1, simulation.World.Definitions.ConveyorRatePerLinePerSecond);
            float progress = Mathf.Clamp01(node.ProgressMilliseconds / cellMilliseconds);
            float x = facility.Position.X + 0.5f;
            float z = facility.Position.Y + 0.5f;
            if (simulation.Conveyors.TryGetOutputStep(simulation.World, facility.Id, out GridPosition step))
            {
                x += step.X * progress;
                z += step.Y * progress;
            }
            marker.transform.position = new Vector3(x, 0.48f, z);
        }

        private void RemoveFacilityView(string facilityId)
        {
            Destroy(facilityVisuals[facilityId]);
            facilityVisuals.Remove(facilityId);
            if (selectionMarkers.TryGetValue(facilityId, out GameObject selectionMarker))
            {
                Destroy(selectionMarker);
                selectionMarkers.Remove(facilityId);
            }
            if (facilityProblemIcons.TryGetValue(facilityId, out List<GameObject> icons))
            {
                for (int i = 0; i < icons.Count; i++) Destroy(icons[i]);
                facilityProblemIcons.Remove(facilityId);
            }
            facilityProblemSignatures.Remove(facilityId);
            if (miniMapFacilityMarkers.TryGetValue(facilityId, out UI.Image miniMapMarker))
            {
                Destroy(miniMapMarker.gameObject);
                miniMapFacilityMarkers.Remove(facilityId);
            }
            if (conveyorCargoVisuals.TryGetValue(facilityId, out GameObject cargoVisual))
            {
                Destroy(cargoVisual);
                conveyorCargoVisuals.Remove(facilityId);
            }
        }

        private void RefreshRecoveryPileViews()
        {
            var liveIds = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < simulation.World.RecoveryPiles.Count; i++)
            {
                RecoveryPile pile = simulation.World.RecoveryPiles[i];
                if (!HasRecoveryPileMaterials(pile)) continue;
                liveIds.Add(pile.Id);
                if (!recoveryPileVisuals.TryGetValue(pile.Id, out GameObject marker))
                {
                    marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    marker.name = "Recovery Pile " + pile.Id;
                    marker.transform.SetParent(transform, false);
                    marker.transform.localScale = new Vector3(0.72f, 0.72f, 0.72f);
                    marker.GetComponent<Renderer>().sharedMaterial = CreateMaterial(new Color32(184, 127, 60, 255));
                    RecoveryPileViewTarget target = marker.AddComponent<RecoveryPileViewTarget>();
                    target.RecoveryPileId = pile.Id;
                    recoveryPileVisuals.Add(pile.Id, marker);
                }

                FacilityState facilityAtPile = null;
                for (int facilityIndex = 0; facilityIndex < simulation.World.Facilities.Count; facilityIndex++)
                {
                    FacilityState candidate = simulation.World.Facilities[facilityIndex];
                    if (candidate.Position.Equals(pile.Position))
                    {
                        facilityAtPile = candidate;
                        break;
                    }
                }
                marker.transform.position = facilityAtPile == null
                    ? new Vector3(pile.Position.X + 0.5f, 0.38f, pile.Position.Y + 0.5f)
                    : new Vector3(facilityAtPile.Position.X + facilityAtPile.Width * 0.5f,
                        FacilityHeight(facilityAtPile.Kind) + 0.72f,
                        facilityAtPile.Position.Y + facilityAtPile.Height * 0.5f);
            }

            var removedIds = new List<string>();
            foreach (string pileId in recoveryPileVisuals.Keys)
                if (!liveIds.Contains(pileId)) removedIds.Add(pileId);
            for (int i = 0; i < removedIds.Count; i++)
            {
                Destroy(recoveryPileVisuals[removedIds[i]]);
                recoveryPileVisuals.Remove(removedIds[i]);
            }
        }

        private static bool HasRecoveryPileMaterials(RecoveryPile pile)
        {
            foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
                if (pile.Inventory.GetStock(item) > 0) return true;
            return false;
        }

        private void CreateFacilityView(FacilityState facility)
        {
            Vector3 center = new Vector3(facility.Position.X + facility.Width * 0.5f, 0f,
                facility.Position.Y + facility.Height * 0.5f);
            Vector3 size = new Vector3(Mathf.Max(0.8f, facility.Width * 0.86f),
                FacilityHeight(facility.Kind), Mathf.Max(0.8f, facility.Height * 0.86f));
            Color color = facility.IsUnderConstruction
                ? Color.Lerp(FacilityColor(facility.Kind), Muted, 0.48f)
                : FacilityColor(facility.Kind);
            GameObject building = CreateBlock(facility.Id, center + Vector3.up * (size.y * 0.5f), size, color, true);
            building.transform.rotation = Quaternion.Euler(0f, facility.RotationDegrees, 0f);
            var target = building.AddComponent<FacilityViewTarget>();
            target.FacilityId = facility.Id;
            facilityVisuals.Add(facility.Id, building);

            GameObject marker = CreateBlock(facility.Id + " Selection Marker", center + Vector3.up * 0.04f,
                new Vector3(size.x + 0.42f, 0.06f, size.z + 0.42f), Teal, false);
            marker.SetActive(false);
            selectionMarkers.Add(facility.Id, marker);
        }

        private void CreateDroneMarkers()
        {
            for (int i = 0; i < simulation.World.Drones.Count; i++)
            {
                DroneState drone = simulation.World.Drones[i];
                GameObject marker = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                marker.name = drone.Id;
                marker.transform.SetParent(transform, false);
                marker.transform.localScale = new Vector3(0.9f, 0.48f, 0.9f);
                marker.GetComponent<Renderer>().sharedMaterial = CreateMaterial(
                    drone.Region == DroneRegion.Production ? Teal : Warning);
                Collider collider = marker.GetComponent<Collider>();
                if (collider != null) Destroy(collider);
                droneMarkers.Add(marker.transform);
            }
            UpdateDroneMarkers();
        }

        private void UpdateDroneMarkers()
        {
            if (simulation == null) return;
            int count = Math.Min(droneMarkers.Count, simulation.World.Drones.Count);
            for (int i = 0; i < count; i++)
            {
                DroneState drone = simulation.World.Drones[i];
                droneMarkers[i].position = new Vector3((float)drone.PositionX, 1f + i * 0.22f, (float)drone.PositionY);
            }
        }

        private void UpdateEnemyMarkers()
        {
            if (simulation == null) return;
            for (int i = 0; i < simulation.World.Enemies.Count; i++)
            {
                EnemyState enemy = simulation.World.Enemies[i];
                if (!enemyVisuals.TryGetValue(enemy.Id, out GameObject marker))
                {
                    marker = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    marker.name = enemy.Id;
                    marker.transform.SetParent(transform, false);
                    marker.transform.localScale = new Vector3(0.46f, 0.46f, 0.46f);
                    marker.GetComponent<Renderer>().sharedMaterial = CreateMaterial(Warning);
                    Collider collider = marker.GetComponent<Collider>();
                    if (collider != null) Destroy(collider);
                    enemyVisuals.Add(enemy.Id, marker);
                }

                marker.SetActive(enemy.IsAlive);
                if (enemy.IsAlive) marker.transform.position = new Vector3((float)enemy.X, 0.55f, (float)enemy.Y);
            }
        }

        private void CreateBuildGridVisual(GameDefinitions definitions)
        {
            const float lineWidth = 0.12f;
            const float height = 0.035f;
            var vertices = new List<Vector3>();
            var triangles = new List<int>();
            for (int x = 0; x <= definitions.MapWidth; x++)
                AddTerrainQuad(vertices, triangles, new Vector3(x - lineWidth * 0.5f, height, 0f),
                    new Vector3(x - lineWidth * 0.5f, height, definitions.MapHeight),
                    new Vector3(x + lineWidth * 0.5f, height, definitions.MapHeight),
                    new Vector3(x + lineWidth * 0.5f, height, 0f));
            for (int y = 0; y <= definitions.MapHeight; y++)
                AddTerrainQuad(vertices, triangles, new Vector3(0f, height, y - lineWidth * 0.5f),
                    new Vector3(0f, height, y + lineWidth * 0.5f),
                    new Vector3(definitions.MapWidth, height, y + lineWidth * 0.5f),
                    new Vector3(definitions.MapWidth, height, y - lineWidth * 0.5f));

            var mesh = new Mesh { name = "Project C Build Grid Mesh" };
            mesh.SetVertices(vertices);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals();
            buildGridVisual = new GameObject("Build Grid", typeof(MeshFilter), typeof(MeshRenderer));
            buildGridVisual.transform.SetParent(transform, false);
            buildGridVisual.GetComponent<MeshFilter>().sharedMesh = mesh;
            MeshRenderer renderer = buildGridVisual.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = CreateMaterial(new Color32(105, 132, 122, 255));
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            buildGridVisual.SetActive(false);
        }

        private void CreateScreenFlashOverlay()
        {
            RectTransform overlay = CreatePanel(canvas.transform, "Outpost Damage Flash", Vector2.zero, Vector2.one,
                new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero, Color.clear);
            screenFlashImage = overlay.GetComponent<UI.Image>();
            screenFlashImage.raycastTarget = false;
            overlay.SetAsLastSibling();
        }

        private void CreateSelectionHealthBar()
        {
            selectedHealthBarBackground = CreateBlock("Selected Facility Health Background", Vector3.zero,
                Vector3.one, new Color32(15, 24, 31, 255), false);
            selectedHealthBarFill = CreateBlock("Selected Facility Health", Vector3.zero,
                Vector3.one, Teal, false);
            selectedHealthBarBackground.SetActive(false);
            selectedHealthBarFill.SetActive(false);
        }

        private void CreateTurretRangeVisual()
        {
            turretRangeVisual = new GameObject("Selected Turret Range");
            turretRangeVisual.transform.SetParent(transform, false);
            turretRangeLine = turretRangeVisual.AddComponent<LineRenderer>();
            turretRangeLine.useWorldSpace = false;
            turretRangeLine.loop = true;
            turretRangeLine.positionCount = 65;
            turretRangeLine.startWidth = 0.14f;
            turretRangeLine.endWidth = 0.14f;
            turretRangeLine.sharedMaterial = CreateMaterial(new Color32(46, 197, 186, 255));
            turretRangeLine.startColor = Teal;
            turretRangeLine.endColor = Teal;
            turretRangeLine.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            turretRangeLine.receiveShadows = false;
            turretRangeVisual.SetActive(false);
        }

        private void CreateWaveEntryWarningMarkers()
        {
            EnemyEntryPointDefinitionData[] entries = simulation.World.Definitions.EnemyEntryPoints;
            if (entries == null) return;
            for (int i = 0; i < entries.Length; i++)
            {
                EnemyEntryPointDefinitionData entry = entries[i];
                var marker = new GameObject("Wave Entry Warning " + entry.Id);
                marker.transform.SetParent(transform, false);
                marker.transform.position = new Vector3(entry.X + 0.5f, 0.14f, entry.Y + 0.5f);
                var line = marker.AddComponent<LineRenderer>();
                line.useWorldSpace = false;
                line.loop = true;
                line.positionCount = 49;
                line.startWidth = 0.22f;
                line.endWidth = 0.22f;
                line.sharedMaterial = CreateMaterial(Warning);
                line.startColor = Warning;
                line.endColor = Warning;
                line.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                line.receiveShadows = false;
                for (int point = 0; point < line.positionCount; point++)
                {
                    float angle = point * Mathf.PI * 2f / (line.positionCount - 1);
                    line.SetPosition(point, new Vector3(Mathf.Cos(angle) * 1.65f, 0f,
                        Mathf.Sin(angle) * 1.65f));
                }
                marker.SetActive(false);
                waveEntryWarningMarkers.Add(marker);
            }
        }

        private void UpdateSelectionVisualFeedback()
        {
            bool interfaceVisible = menuState == MenuState.Closed &&
                (settingsPanel == null || !settingsPanel.IsOpen);
            bool hasHealth = interfaceVisible && selectedFacility != null && selectedFacility.MaximumHealth > 0;
            if (selectedHealthBarBackground != null) selectedHealthBarBackground.SetActive(hasHealth);
            if (selectedHealthBarFill != null) selectedHealthBarFill.SetActive(hasHealth);
            if (hasHealth)
            {
                float width = Mathf.Max(selectedFacility.Width, selectedFacility.Height) + 0.65f;
                float top = selectedFacility.Position.Y + selectedFacility.Height + 0.5f;
                if (facilityVisuals.TryGetValue(selectedFacility.Id, out GameObject visual))
                {
                    Renderer renderer = visual.GetComponent<Renderer>();
                    if (renderer != null) top = renderer.bounds.max.y + 0.5f;
                }
                float centerX = selectedFacility.Position.X + selectedFacility.Width * 0.5f;
                float centerZ = selectedFacility.Position.Y + selectedFacility.Height * 0.5f;
                float ratio = Mathf.Clamp01(selectedFacility.Health / (float)selectedFacility.MaximumHealth);
                selectedHealthBarBackground.transform.position = new Vector3(centerX, top, centerZ);
                selectedHealthBarBackground.transform.localScale = new Vector3(width, 0.12f, 0.22f);
                float fillWidth = Mathf.Max(0.015f, width * ratio);
                selectedHealthBarFill.transform.position = new Vector3(centerX - (width - fillWidth) * 0.5f,
                    top + 0.015f, centerZ);
                selectedHealthBarFill.transform.localScale = new Vector3(fillWidth, 0.13f, 0.18f);
                selectedHealthBarFill.GetComponent<Renderer>().sharedMaterial = CreateMaterial(ratio > 0.55f
                    ? Teal
                    : ratio > 0.25f ? Warning : new Color32(229, 76, 68, 255));
            }

            bool showRange = interfaceVisible && selectedFacility != null && selectedFacility.Kind == FacilityKind.Turret;
            if (turretRangeVisual != null) turretRangeVisual.SetActive(showRange);
            if (showRange && turretRangeLine != null)
            {
                turretRangeVisual.transform.position = new Vector3(
                    selectedFacility.Position.X + selectedFacility.Width * 0.5f, 0.12f,
                    selectedFacility.Position.Y + selectedFacility.Height * 0.5f);
                float radius = simulation.World.Definitions.TurretRange;
                for (int i = 0; i < turretRangeLine.positionCount; i++)
                {
                    float angle = i * Mathf.PI * 2f / (turretRangeLine.positionCount - 1);
                    turretRangeLine.SetPosition(i, new Vector3(Mathf.Cos(angle) * radius, 0f,
                        Mathf.Sin(angle) * radius));
                }
            }
        }

        private void UpdateVisualEventFeedback()
        {
            List<SimulationEvent> events = simulation.World.Events;
            if (visualEventIndex > events.Count) visualEventIndex = 0;
            FacilityState outpost = simulation.World.FindFacility(FacilityKind.Outpost);
            while (visualEventIndex < events.Count)
            {
                SimulationEvent item = events[visualEventIndex++];
                if (outpost == null || item.Category != "combat" ||
                    !item.Detail.Contains(":facility-damage:" + outpost.Id + ":")) continue;
                if (settingsPanel == null || settingsPanel.CameraShakeEnabled)
                {
                    cameraShakeRemaining = 0.35f;
                    cameraShakeElapsed = 0f;
                }
                if (settingsPanel == null || settingsPanel.ScreenFlashEnabled)
                    screenFlashRemaining = 0.3f;
            }
        }

        private void UpdateWaveEntryWarnings()
        {
            bool show = IsNextWaveWarningActive();
            for (int i = 0; i < waveEntryWarningMarkers.Count; i++)
            {
                GameObject marker = waveEntryWarningMarkers[i];
                marker.SetActive(show);
                if (!show) continue;
                float pulse = 0.7f + 0.3f * Mathf.Sin(Time.unscaledTime * 5f);
                LineRenderer line = marker.GetComponent<LineRenderer>();
                line.startColor = new Color(Warning.r, Warning.g, Warning.b, pulse);
                line.endColor = line.startColor;
            }
        }

        private bool IsNextWaveWarningActive()
        {
            GameDefinitions definitions = simulation.World.Definitions;
            int nextWave = GetCurrentWave(simulation.CurrentMilliseconds, definitions) + 1;
            if (nextWave <= 0 || nextWave > definitions.WaveCount) return false;
            long startsAt = definitions.GetWaveStartMilliseconds(nextWave);
            long timeUntil = startsAt - simulation.CurrentMilliseconds;
            return timeUntil > 0 && timeUntil <= 30000;
        }

        private void UpdateScreenFeedback()
        {
            cameraShakeRemaining = Mathf.Max(0f, cameraShakeRemaining - Time.unscaledDeltaTime);
            cameraShakeElapsed += Time.unscaledDeltaTime;
            if (settingsPanel != null && !settingsPanel.CameraShakeEnabled) cameraShakeRemaining = 0f;
            if (settingsPanel != null && !settingsPanel.ScreenFlashEnabled) screenFlashRemaining = 0f;
            screenFlashRemaining = Mathf.Max(0f, screenFlashRemaining - Time.unscaledDeltaTime);
            float alpha = screenFlashRemaining <= 0f ? 0f : 0.32f * screenFlashRemaining / 0.3f;
            if (screenFlashImage != null)
                screenFlashImage.color = new Color(1f, 0.36f, 0.23f, alpha);
            PositionCamera();
        }

        private void CreateMapTerrain(GameDefinitions definitions)
        {
            var vertices = new[]
            {
                new List<Vector3>(), // production ground
                new List<Vector3>(), // combat ground
                new List<Vector3>(), // mountain tops
                new List<Vector3>()  // exposed mountain faces
            };
            var triangles = new[]
            {
                new List<int>(), // production ground
                new List<int>(), // combat ground
                new List<int>(), // mountain tops
                new List<int>()  // exposed mountain faces
            };
            const float height = 2.0f;
            for (int y = 0; y < definitions.MapHeight; y++)
            {
                for (int x = 0; x < definitions.MapWidth; x++)
                {
                    if (!definitions.IsMountainCell(x, y))
                    {
                        int regionMaterial = y < definitions.ProductionHeight ? 0 : 1;
                        AddTerrainQuad(vertices[regionMaterial], triangles[regionMaterial],
                            new Vector3(x, 0.01f, y), new Vector3(x, 0.01f, y + 1),
                            new Vector3(x + 1, 0.01f, y + 1), new Vector3(x + 1, 0.01f, y));
                        continue;
                    }

                    AddTerrainQuad(vertices[2], triangles[2],
                        new Vector3(x, height, y), new Vector3(x, height, y + 1),
                        new Vector3(x + 1, height, y + 1), new Vector3(x + 1, height, y));
                    if (!definitions.IsMountainCell(x - 1, y))
                        AddTerrainQuad(vertices[3], triangles[3], new Vector3(x, 0.01f, y), new Vector3(x, 0.01f, y + 1),
                            new Vector3(x, height, y + 1), new Vector3(x, height, y));
                    if (!definitions.IsMountainCell(x + 1, y))
                        AddTerrainQuad(vertices[3], triangles[3], new Vector3(x + 1, 0.01f, y + 1), new Vector3(x + 1, 0.01f, y),
                            new Vector3(x + 1, height, y), new Vector3(x + 1, height, y + 1));
                    if (!definitions.IsMountainCell(x, y - 1))
                        AddTerrainQuad(vertices[3], triangles[3], new Vector3(x + 1, 0.01f, y), new Vector3(x, 0.01f, y),
                            new Vector3(x, height, y), new Vector3(x + 1, height, y));
                    if (!definitions.IsMountainCell(x, y + 1))
                        AddTerrainQuad(vertices[3], triangles[3], new Vector3(x, 0.01f, y + 1), new Vector3(x + 1, 0.01f, y + 1),
                            new Vector3(x + 1, height, y + 1), new Vector3(x, height, y + 1));
                }
            }

            // Keep each surface class on its own renderer. This avoids the URP runtime
            // blockout collapsing submesh material slots into the first terrain color.
            CreateTerrainSection("Production Ground", vertices[0], triangles[0],
                new Color32(74, 112, 83, 255));
            CreateTerrainSection("Combat Ground", vertices[1], triangles[1],
                new Color32(151, 87, 67, 255));
            CreateTerrainSection("Mountain Tops", vertices[2], triangles[2],
                new Color32(152, 163, 169, 255));
            CreateTerrainSection("Mountain Faces", vertices[3], triangles[3],
                new Color32(78, 91, 101, 255));
        }

        private void CreateTerrainSection(string name, List<Vector3> vertices, List<int> triangles, Color color)
        {
            if (triangles.Count == 0) return;

            var mesh = new Mesh { name = "Project C " + name + " Mesh" };
            mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.SetVertices(vertices);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals();
            var terrain = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer), typeof(MeshCollider));
            terrain.transform.SetParent(transform, false);
            terrain.GetComponent<MeshFilter>().sharedMesh = mesh;
            terrain.GetComponent<MeshRenderer>().sharedMaterial = CreateTerrainMaterial(color);
            terrain.GetComponent<MeshCollider>().sharedMesh = mesh;
        }

        private Material CreateTerrainMaterial(Color color)
        {
            Material material = CreateRuntimeMaterial(color);
            terrainMaterials.Add(material);
            return material;
        }

        private static void AddTerrainQuad(List<Vector3> vertices, List<int> triangles,
            Vector3 a, Vector3 b, Vector3 c, Vector3 d)
        {
            int start = vertices.Count;
            vertices.Add(a);
            vertices.Add(b);
            vertices.Add(c);
            vertices.Add(d);
            triangles.Add(start);
            triangles.Add(start + 1);
            triangles.Add(start + 2);
            triangles.Add(start);
            triangles.Add(start + 2);
            triangles.Add(start + 3);
        }

        private void RefreshTransferAction()
        {
            transferSourceFacilityId = null;
            transferDestinationFacilityId = null;
            transferQuantity = Math.Min(RequestedTransferBatch, simulation.World.Definitions.DroneCarryCapacity);

            if (selectedFacility != null && !selectedFacility.IsUnderConstruction)
            {
                switch (selectedFacility.Kind)
                {
                    case FacilityKind.Port:
                        transferDestinationFacilityId = FindFacilityId(FacilityKind.Ironworks);
                        transferItem = ItemId.Iron;
                        break;
                    case FacilityKind.Ironworks:
                        transferDestinationFacilityId = FindFacilityId(FacilityKind.AmmunitionFactory);
                        transferItem = ItemId.Plate;
                        break;
                    case FacilityKind.AmmunitionFactory:
                        transferDestinationFacilityId = FindFacilityId(FacilityKind.Outpost);
                        transferItem = ItemId.Ammunition;
                        break;
                    case FacilityKind.Outpost:
                        transferDestinationFacilityId = FindFacilityId(FacilityKind.Turret);
                        transferItem = ItemId.Ammunition;
                        break;
                    case FacilityKind.Miner:
                        transferDestinationFacilityId = FindNearestFacilityId(FacilityKind.Refinery, selectedFacility);
                        transferItem = ItemId.Ore;
                        break;
                    case FacilityKind.Refinery:
                        transferDestinationFacilityId = FindFacilityId(FacilityKind.Port);
                        transferItem = ItemId.Crystal;
                        break;
                }

                if (transferDestinationFacilityId != null) transferSourceFacilityId = selectedFacility.Id;
            }

            bool canQueue = transferButton != null && transferSourceFacilityId != null && transferQuantity > 0;
            if (transferButton != null) transferButton.interactable = canQueue;
            if (transferButtonLabel != null)
            {
                transferButtonLabel.text = canQueue
                    ? string.Format(Localize("Queue {0} {1} to {2}", "{0} {1} 운반: {2}"), transferQuantity,
                        GetItemDisplayName(transferItem).ToUpperInvariant(),
                        GetFacilityDisplayName(simulation.World.FindFacility(transferDestinationFacilityId).Kind).ToUpperInvariant())
                    : Localize("No transfer from this facility", "이 시설에서 요청할 운반 없음");
            }
        }

        private void QueueSelectedTransfer()
        {
            if (transferSourceFacilityId == null || transferDestinationFacilityId == null) return;
            try
            {
                TransportOrder order = simulation.QueueTransfer(transferSourceFacilityId,
                    transferDestinationFacilityId, transferItem, transferQuantity);
                transferFeedback = string.Format("Queued {0}: {1} {2}", order.Id, order.Quantity, order.Item);
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "queue_transfer",
                    order.Id + ":" + order.Quantity + ":" + order.Item + ":" + order.SourceFacilityId + "->" + order.DestinationFacilityId);
            }
            catch (Exception exception)
            {
                transferFeedback = "Transfer rejected: " + exception.Message;
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "queue_transfer", "rejected:" + exception.Message);
            }
            diagnostics?.CaptureEvents(simulation.World);
            RefreshHud();
        }

        private void TogglePause()
        {
            simulation.Clock.SetPaused(simulation.Clock.Speed != GameSpeed.Paused);
            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "pause_toggle", simulation.Clock.Speed.ToString());
        }

        private void SetSpeed(GameSpeed speed)
        {
            simulation.Clock.SetSpeed(speed);
            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "set_speed", speed.ToString());
        }

        private string FindFacilityId(FacilityKind kind)
        {
            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState candidate = simulation.World.Facilities[i];
                if (candidate.Kind == kind && !candidate.IsUnderConstruction && !candidate.IsDestroyed) return candidate.Id;
            }

            return null;
        }

        private string FindNearestFacilityId(FacilityKind kind, FacilityState source)
        {
            FacilityState best = null;
            double bestDistanceSquared = double.MaxValue;
            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState candidate = simulation.World.Facilities[i];
                if (candidate.Kind != kind || candidate.IsUnderConstruction || candidate.IsDestroyed) continue;
                double dx = candidate.Position.X - source.Position.X;
                double dy = candidate.Position.Y - source.Position.Y;
                double distanceSquared = dx * dx + dy * dy;
                if (distanceSquared >= bestDistanceSquared) continue;
                best = candidate;
                bestDistanceSquared = distanceSquared;
            }

            return best == null ? null : best.Id;
        }

        private void BeginPlacement(FacilityKind kind)
        {
            if (simulation.World.Outcome != MatchOutcome.Running)
            {
                transferFeedback = "The match has ended.";
                RefreshHud();
                return;
            }

            pendingBuildKind = kind;
            pendingBuildRotation = 0;
            transferFeedback = kind == FacilityKind.Conveyor
                ? Localize("Drag between open tiles beside two facilities to connect them.",
                    "두 시설에 맞닿은 빈 칸 사이를 드래그해 연결하세요.")
                : Localize("Click an open grid tile to place ", "빈 격자를 클릭해 배치: ") + GetFacilityDisplayName(kind) + ".";
            RefreshBuildModeText();
            RefreshHud();
        }

        private void CancelPlacement()
        {
            if (!pendingBuildKind.HasValue) return;
            string cancelledKind = pendingBuildKind.Value.ToString();
            pendingBuildKind = null;
            pendingBuildRotation = 0;
            isDraggingConveyorPath = false;
            HideConveyorPreview();
            if (facilityPlacementPreview != null) facilityPlacementPreview.SetActive(false);
            transferFeedback = Localize("Placement cancelled.", "배치 미리보기를 취소했습니다.");
            diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "cancel_placement", cancelledKind);
            RefreshBuildModeText();
            RefreshHud();
        }

        private void UpdateFacilityPlacementPreview(GridPosition position)
        {
            if (!pendingBuildKind.HasValue || pendingBuildKind == FacilityKind.Conveyor) return;
            FacilityKind kind = pendingBuildKind.Value;
            FacilityDefinitionData definition = simulation.World.Definitions.FindBuildableFacility(kind);
            if (definition == null) return;
            bool swapsDimensions = pendingBuildRotation == 90 || pendingBuildRotation == 270;
            int width = swapsDimensions ? definition.Height : definition.Width;
            int height = swapsDimensions ? definition.Width : definition.Height;
            if (facilityPlacementPreview == null)
                facilityPlacementPreview = CreateBlock("Facility Placement Preview", Vector3.zero,
                    Vector3.one, Color.white, false);

            bool canPlace = simulation.Construction.CanPlaceFacility(simulation.World, kind, position,
                pendingBuildRotation, out _);
            facilityPlacementPreview.transform.position = new Vector3(position.X + width * 0.5f, 0.62f,
                position.Y + height * 0.5f);
            facilityPlacementPreview.transform.localScale = new Vector3(width * 0.9f, 1f, height * 0.9f);
            facilityPlacementPreview.GetComponent<Renderer>().sharedMaterial = CreateMaterial(canPlace
                ? new Color32(65, 205, 151, 255)
                : new Color32(226, 91, 75, 255));
            facilityPlacementPreview.SetActive(true);
        }

        private void CommitFacilityPlacement(GridPosition position)
        {
            if (!pendingBuildKind.HasValue) return;
            FacilityKind kind = pendingBuildKind.Value;
            if (simulation.TryPlaceFacility(kind, position, pendingBuildRotation,
                out FacilityState facility, out string reason))
            {
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_facility",
                    facility.Id + ":" + facility.Kind + ":" + position.X + "," + position.Y + ":rotation:" + pendingBuildRotation);
                transferFeedback = "Placed " + facility.Kind + " site at " + position.X + ", " + position.Y;
                pendingBuildKind = null;
                pendingBuildRotation = 0;
                if (facilityPlacementPreview != null) facilityPlacementPreview.SetActive(false);
                RefreshFacilityViews();
                SelectFacility(facility);
            }
            else
            {
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_facility",
                    "rejected:" + kind + ":" + position.X + "," + position.Y + ":" + reason);
                transferFeedback = Localize("Build rejected: ", "건설할 수 없습니다: ") + reason;
            }
            RefreshBuildModeText();
            RefreshHud();
        }

        private bool TryGetGridPosition(Vector2 screenPosition, out GridPosition position)
        {
            Ray ray = worldCamera.ScreenPointToRay(screenPosition);
            var ground = new Plane(Vector3.up, new Vector3(0f, 0.01f, 0f));
            if (!ground.Raycast(ray, out float distance))
            {
                position = default;
                return false;
            }

            Vector3 point = ray.GetPoint(distance);
            int x = Mathf.FloorToInt(point.x);
            int y = Mathf.FloorToInt(point.z);
            if (x < 0 || x >= simulation.World.Definitions.MapWidth ||
                y < 0 || y >= simulation.World.Definitions.MapHeight)
            {
                position = default;
                return false;
            }
            position = new GridPosition(x, y);
            return true;
        }

        private void UpdateConveyorRoutePreview(GridPosition end, bool force = false)
        {
            if (!force && hasConveyorPreviewEnd && end.Equals(conveyorPreviewEnd)) return;
            conveyorPreviewEnd = end;
            hasConveyorPreviewEnd = true;
            BuildOrthogonalConveyorRoute(conveyorDragStart, end, conveyorHorizontalFirst, conveyorPreviewCells);
            string reason = string.Empty;
            bool valid = TryValidatePreviewConveyorRoute(out _, out _, out reason);
            Color previewColor = valid ? new Color32(57, 210, 147, 235) : new Color32(236, 106, 83, 235);
            for (int i = 0; i < conveyorPreviewCells.Count; i++)
            {
                GameObject tile;
                if (i >= conveyorPreviewTiles.Count)
                {
                    tile = CreateBlock("Conveyor Path Preview", Vector3.zero,
                        new Vector3(0.76f, 0.2f, 0.76f), previewColor, false);
                    conveyorPreviewTiles.Add(tile);
                }
                else tile = conveyorPreviewTiles[i];
                tile.SetActive(true);
                tile.transform.position = new Vector3(conveyorPreviewCells[i].X + 0.5f, 0.18f,
                    conveyorPreviewCells[i].Y + 0.5f);
                tile.GetComponent<Renderer>().sharedMaterial = CreateMaterial(previewColor);
            }
            for (int i = conveyorPreviewCells.Count; i < conveyorPreviewTiles.Count; i++)
                conveyorPreviewTiles[i].SetActive(false);

            transferFeedback = valid ? null : Localize("Path preview: ", "경로 미리보기: ") +
                GetConveyorFailureDisplay(reason);
            RefreshHud();
        }

        private bool TryValidatePreviewConveyorRoute(out FacilityState source, out FacilityState destination,
            out string reason)
        {
            source = null;
            destination = null;
            if (conveyorPreviewCells.Count == 0)
            {
                reason = "path-needs-at-least-one-tile";
                return false;
            }
            source = FindFacilityTouchingCell(conveyorPreviewCells[0], null, selectedFacility);
            destination = source == null ? null : FindFacilityTouchingCell(
                conveyorPreviewCells[conveyorPreviewCells.Count - 1], source.Id, null);
            if (source == null || destination == null)
            {
                reason = "path-must-touch-both-endpoints";
                return false;
            }
            if (source == destination)
            {
                reason = "path-endpoints-must-differ";
                return false;
            }
            return simulation.Conveyors.CanConnectPlannedPath(simulation.World, source.Id,
                conveyorPreviewCells, destination.Id, out reason);
        }

        private FacilityState FindFacilityTouchingCell(GridPosition cell, string excludedFacilityId,
            FacilityState preferred)
        {
            if (IsUsableConveyorEndpoint(preferred, excludedFacilityId) && FacilityTouchesCell(cell, preferred))
                return preferred;
            for (int i = 0; i < simulation.World.Facilities.Count; i++)
            {
                FacilityState facility = simulation.World.Facilities[i];
                if (IsUsableConveyorEndpoint(facility, excludedFacilityId) && FacilityTouchesCell(cell, facility))
                    return facility;
            }
            return null;
        }

        private static bool IsUsableConveyorEndpoint(FacilityState facility, string excludedFacilityId) =>
            facility != null && facility.Id != excludedFacilityId && !facility.IsUnderConstruction &&
            !facility.IsDestroyed && !facility.IsDemolishing;

        private static bool FacilityTouchesCell(GridPosition cell, FacilityState facility)
        {
            bool verticalOverlap = cell.Y < facility.Position.Y + facility.Height && cell.Y + 1 > facility.Position.Y;
            bool horizontalOverlap = cell.X < facility.Position.X + facility.Width && cell.X + 1 > facility.Position.X;
            return (verticalOverlap && (cell.X + 1 == facility.Position.X ||
                    cell.X == facility.Position.X + facility.Width)) ||
                   (horizontalOverlap && (cell.Y + 1 == facility.Position.Y ||
                    cell.Y == facility.Position.Y + facility.Height));
        }

        private static void BuildOrthogonalConveyorRoute(GridPosition start, GridPosition end,
            bool horizontalFirst, List<GridPosition> result)
        {
            result.Clear();
            int x = start.X;
            int y = start.Y;
            result.Add(start);
            int firstDx = horizontalFirst ? Math.Sign(end.X - x) : 0;
            int firstDy = horizontalFirst ? 0 : Math.Sign(end.Y - y);
            int firstDistance = horizontalFirst ? Math.Abs(end.X - x) : Math.Abs(end.Y - y);
            for (int i = 0; i < firstDistance; i++)
            {
                x += firstDx;
                y += firstDy;
                result.Add(new GridPosition(x, y));
            }

            int secondDx = horizontalFirst ? 0 : Math.Sign(end.X - x);
            int secondDy = horizontalFirst ? Math.Sign(end.Y - y) : 0;
            int secondDistance = horizontalFirst ? Math.Abs(end.Y - y) : Math.Abs(end.X - x);
            for (int i = 0; i < secondDistance; i++)
            {
                x += secondDx;
                y += secondDy;
                result.Add(new GridPosition(x, y));
            }
        }

        private void FinishConveyorRoute(GridPosition end)
        {
            UpdateConveyorRoutePreview(end);
            bool valid = TryValidatePreviewConveyorRoute(out FacilityState source,
                out FacilityState destination, out string reason);
            isDraggingConveyorPath = false;
            if (!valid)
            {
                transferFeedback = Localize("Conveyor path rejected: ", "컨베이어 경로를 확정하지 못했습니다: ") +
                    GetConveyorFailureDisplay(reason);
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_conveyor_path", "rejected:" + reason);
                HideConveyorPreview();
                RefreshBuildModeText();
                RefreshHud();
                return;
            }

            if (simulation.TryPlaceConveyorPath(source.Id, conveyorPreviewCells, destination.Id,
                out ConveyorPathState path, out reason))
            {
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_conveyor_path",
                    path.Id + ":" + source.Id + "->" + destination.Id + ":" + conveyorPreviewCells.Count);
                transferFeedback = string.Format(Localize("Conveyor path connected · {0} tiles", "컨베이어 경로 연결 · {0}칸"),
                    conveyorPreviewCells.Count);
                pendingBuildKind = null;
                pendingBuildRotation = 0;
                RefreshFacilityViews();
                SelectFacility(source);
            }
            else
            {
                diagnostics?.RecordCommand(simulation.CurrentMilliseconds, "place_conveyor_path", "rejected:" + reason);
                transferFeedback = Localize("Conveyor path rejected: ", "컨베이어 경로를 확정하지 못했습니다: ") +
                    GetConveyorFailureDisplay(reason);
            }

            HideConveyorPreview();
            RefreshBuildModeText();
            RefreshHud();
        }

        private void HideConveyorPreview()
        {
            hasConveyorPreviewEnd = false;
            conveyorPreviewCells.Clear();
            for (int i = 0; i < conveyorPreviewTiles.Count; i++)
                if (conveyorPreviewTiles[i] != null) conveyorPreviewTiles[i].SetActive(false);
        }

        private string GetConveyorFailureDisplay(string reason)
        {
            if (!IsKorean) return reason;
            switch (reason)
            {
                case "path-needs-at-least-one-tile": return "경로에 벨트 칸이 필요합니다.";
                case "path-repeats-a-cell": return "경로가 같은 칸을 반복합니다.";
                case "path-must-use-four-direction-connections": return "경로는 상하좌우로 연결해야 합니다.";
                case "path-outside-map": return "지도 범위를 벗어났습니다.";
                case "mountain": return "산 지형에는 배치할 수 없습니다.";
                case "occupied": return "다른 시설이 있는 칸입니다.";
                case "overlaps-existing-belt": return "기존 벨트와 겹칩니다.";
                case "invalid-endpoint": return "양 끝 시설을 찾을 수 없습니다.";
                case "endpoint-not-found": return "연결할 시설이 사라졌습니다.";
                case "outpost-relay-required": return "구역 사이 연결은 전초기지를 거쳐야 합니다.";
                case "path-must-touch-both-endpoints": return "경로 양 끝을 시설에 맞닿게 하세요.";
                case "path-endpoints-must-differ": return "서로 다른 두 시설을 연결해야 합니다.";
                case "path-already-connected": return "이미 연결된 경로입니다.";
                case "connection-endpoints-must-share-a-side": return "연결된 칸은 상하좌우로 맞닿아야 합니다.";
                case "splitter-output-capacity": return "분배기의 출력 연결 한도를 넘었습니다.";
                case "merger-input-capacity": return "합류기의 입력 연결 한도를 넘었습니다.";
                default: return reason;
            }
        }

        private void AppendConstructionStatus(StringBuilder builder, GameWorld world, FacilityState facility)
        {
            for (int i = 0; i < world.ConstructionSites.Count; i++)
            {
                ConstructionSite site = world.ConstructionSites[i];
                if (site.Facility != facility) continue;
                FacilityDefinitionData definition = world.Definitions.FindBuildableFacility(facility.Kind);
                double durationSeconds = (definition == null ? 0 : definition.ConstructionMilliseconds) / 1_000d;
                builder.AppendLine(site.AssignedDroneId == null
                    ? Localize("STATUS   Waiting for materials / drone", "상태   자재 또는 드론 대기")
                    : site.Facility.IsConstructionStarted
                        ? string.Format(Localize("STATUS   Building {0:N1}s / {1:N1}s", "상태   건설 중 {0:N1}초 / {1:N1}초"),
                            site.ProgressMilliseconds / 1_000d, durationSeconds)
                        : Localize("STATUS   Construction drone en route", "상태   건설 드론 이동 중"));
                break;
            }
            builder.AppendLine();
        }

        private void AppendConveyorStatus(StringBuilder builder, FacilityState facility)
        {
            ConveyorNodeState node = simulation.Conveyors.GetNode(facility.Id);
            builder.AppendLine(Localize("BELT CARGO", "벨트 화물"));
            builder.AppendLine(node != null && node.Item.HasValue
                ? string.Format(Localize("{0} in transit", "운반 중: {0}"), GetItemDisplayName(node.Item.Value))
                : Localize("No item on this tile", "이 칸에 화물이 없습니다."));

            int connectedPathCount = 0;
            IReadOnlyList<ConveyorPathState> paths = simulation.Conveyors.Paths;
            for (int i = 0; i < paths.Count; i++)
            {
                for (int j = 0; j < paths[i].Cells.Count; j++)
                {
                    if (!paths[i].Cells[j].Equals(facility.Position)) continue;
                    connectedPathCount++;
                    break;
                }
            }
            builder.AppendLine(string.Format(Localize("Connected paths: {0}", "연결된 경로: {0}"), connectedPathCount));
            if (facility.Kind == FacilityKind.Splitter && connectedPathCount == 0)
                builder.AppendLine(Localize("Connect an output to set its filter.", "출력 경로를 연결하면 필터를 설정할 수 있습니다."));
            builder.AppendLine();
        }

        private static bool IsConveyorKind(FacilityKind kind) => kind == FacilityKind.Conveyor ||
            kind == FacilityKind.Splitter || kind == FacilityKind.Merger;

        private void AppendDemolitionStatus(StringBuilder builder, FacilityState facility)
        {
            DemolitionTask task = simulation.Demolitions.GetTask(facility.Id);
            if (task == null)
            {
                builder.AppendLine(Localize("DEMOLITION   In progress", "철거   진행 중"));
                builder.AppendLine();
                return;
            }

            string status = task.AssignedDroneId == null
                ? Localize("Waiting for a drone", "드론 대기 중")
                : !task.HasStarted
                    ? Localize("Demolition drone en route", "철거 드론 이동 중")
                    : string.Format(Localize("Working {0:N1}s / 5.0s", "작업 중 {0:N1}초 / 5.0초"),
                        task.ProgressMilliseconds / 1_000d);
            builder.AppendLine(Localize("DEMOLITION   ", "철거   ") + status);
            builder.AppendLine();
        }

        private void AppendRecoveryPiles(StringBuilder builder, GameWorld world, GridPosition position)
        {
            for (int i = 0; i < world.RecoveryPiles.Count; i++)
            {
                RecoveryPile pile = world.RecoveryPiles[i];
                if (!pile.Position.Equals(position)) continue;
                builder.AppendLine(Localize("RECOVERY PILE", "회수 더미"));
                builder.AppendLine(pile.Id);
                AppendRecoveryPileInventory(builder, pile);
                builder.AppendLine();
            }
        }

        private void AppendRecoveryPileInventory(StringBuilder builder, RecoveryPile pile)
        {
            bool hasStock = false;
            foreach (ItemId item in Enum.GetValues(typeof(ItemId)))
            {
                int stock = pile.Inventory.GetStock(item);
                int reserved = pile.Inventory.GetReserved(item);
                int inbound = pile.Inventory.GetExpectedInbound(item);
                int inTransit = pile.Inventory.GetInTransit(item);
                if (stock <= 0 && reserved <= 0 && inbound <= 0 && inTransit <= 0) continue;
                hasStock = true;
                builder.AppendLine(string.Format("  {0}: {1}  ·  {2} {3}", GetItemDisplayName(item), stock,
                    Localize("reserved", "예약"), reserved));
                if (inbound > 0 || inTransit > 0)
                    builder.AppendLine(string.Format("    {0} {1} ({2}: {3})",
                        Localize("inbound incl. transit", "반입 예정·운반 중 포함"), inbound,
                        Localize("in transit", "운반 중"), inTransit));
            }
            if (!hasStock) builder.AppendLine("  " + Localize("No recoverable materials remain.", "남은 회수 자재가 없습니다."));
        }

        private void RefreshBuildModeText()
        {
            if (buildModeText == null) return;
            Key rotateKey = settingsPanel == null ? Key.R : settingsPanel.RotateBinding;
            buildModeText.text = pendingBuildKind.HasValue
                ? (pendingBuildKind == FacilityKind.Conveyor
                      ? Localize("Drag between open tiles beside two facilities.", "두 시설에 맞닿은 빈 칸 사이를 드래그하세요.") +
                        (settingsPanel == null ? Key.Q : settingsPanel.ConveyorBendBinding) +
                        Localize(" changes bend order; Esc cancels", " 키로 꺾임 순서를 바꾸고 Esc로 취소")
                      : Localize("Click map to place ", "지도에서 배치: ") + GetFacilityDisplayName(pendingBuildKind.Value) +
                        Localize("\n", "\n") + rotateKey + Localize(" rotates   Esc cancels\nRotation ", " 회전   Esc 취소\n회전 ") + pendingBuildRotation + "°")
                : Localize("Select a facility, then click the map.\n", "시설을 선택한 뒤 지도에서 위치를 고르세요.\n") +
                  rotateKey + Localize(" rotates while placing.", " 배치 방향을 회전합니다.");
        }

        private void AppendTransfers(StringBuilder builder, GameWorld world, FacilityState facility)
        {
            builder.AppendLine("\n" + Localize("TRANSFERS", "운반"));
            int shown = 0;
            for (int i = world.TransportOrders.Count - 1; i >= 0 && shown < 3; i--)
            {
                TransportOrder order = world.TransportOrders[i];
                if (order.SourceFacilityId != facility.Id && order.DestinationFacilityId != facility.Id) continue;
                builder.AppendLine(string.Format("{0} {1}  {2}/{3}  R{4} T{5}",
                    TransferStateLabel(order.State), GetItemDisplayName(order.Item).ToUpperInvariant(),
                    order.DeliveredQuantity, order.Quantity, order.ReservedQuantity, order.InTransitQuantity));
                shown++;
            }
            if (shown == 0) builder.AppendLine(Localize("No transfers queued", "대기 중인 운반 없음"));
        }

        private string TransferStateLabel(TransportOrderState state)
        {
            switch (state)
            {
                case TransportOrderState.InProgress: return Localize("MOVING", "이동 중");
                case TransportOrderState.Completed: return Localize("COMPLETE", "완료");
                default: return Localize("PENDING", "대기");
            }
        }

        private void PositionCamera()
        {
            Vector3 offset = new Vector3(0f, 132f, -86f);
            Vector3 shake = Vector3.zero;
            if (cameraShakeRemaining > 0f && (settingsPanel == null || settingsPanel.CameraShakeEnabled))
            {
                float decay = cameraShakeRemaining / 0.35f;
                shake.x = Mathf.Sin(cameraShakeElapsed * 61f) * 0.34f * decay;
                shake.z = Mathf.Sin(cameraShakeElapsed * 47f) * 0.22f * decay;
            }
            worldCamera.transform.position = cameraTarget + offset + shake;
            worldCamera.transform.LookAt(cameraTarget);
        }

        private GameObject CreateBlock(string name, Vector3 position, Vector3 size, Color color, bool selectable)
        {
            GameObject block = GameObject.CreatePrimitive(PrimitiveType.Cube);
            block.name = name;
            block.transform.SetParent(transform, false);
            block.transform.position = position;
            block.transform.localScale = size;
            Renderer renderer = block.GetComponent<Renderer>();
            renderer.sharedMaterial = CreateMaterial(color);
            if (!selectable)
            {
                Collider collider = block.GetComponent<Collider>();
                if (collider != null) Destroy(collider);
            }
            return block;
        }

        private Material CreateMaterial(Color color)
        {
            if (materials.TryGetValue(color, out Material existing)) return existing;
            Material material = CreateRuntimeMaterial(color);
            materials.Add(color, material);
            return material;
        }

        private static Material CreateRuntimeMaterial(Color color)
        {
            if (runtimeMaterialTemplate == null)
            {
                runtimeMaterialTemplate = Resources.Load<Material>("ProjectC/RuntimeMaterials/ProjectCLitRuntime");
            }

            Material material;
            if (runtimeMaterialTemplate != null)
            {
                material = new Material(runtimeMaterialTemplate);
            }
            else
            {
                Shader shader = Shader.Find("Universal Render Pipeline/Lit");
                if (shader == null)
                {
                    throw new InvalidOperationException(
                        "The Project C runtime material and URP/Lit shader are unavailable in this player.");
                }

                material = new Material(shader);
            }

            material.color = color;
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            return material;
        }

        private RectTransform CreatePanel(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax,
            Vector2 pivot, Vector2 anchoredPosition, Vector2 size, Color color)
        {
            var panel = new GameObject(name, typeof(RectTransform), typeof(UI.Image));
            panel.transform.SetParent(parent, false);
            RectTransform rect = panel.GetComponent<RectTransform>();
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = pivot;
            rect.anchoredPosition = anchoredPosition;
            rect.sizeDelta = size;
            panel.GetComponent<UI.Image>().color = color;
            return rect;
        }

        private UI.Text CreateText(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax,
            Vector2 offsetMin, Vector2 offsetMax, Color color, int fontSize, TextAnchor alignment)
        {
            var textObject = new GameObject(name, typeof(RectTransform), typeof(UI.Text));
            textObject.transform.SetParent(parent, false);
            RectTransform rect = textObject.GetComponent<RectTransform>();
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.offsetMin = offsetMin;
            rect.offsetMax = offsetMax;
            UI.Text text = textObject.GetComponent<UI.Text>();
            text.font = runtimeFont;
            text.fontSize = fontSize;
            text.color = color;
            text.alignment = alignment;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.raycastTarget = false;
            return text;
        }

        private UI.Button CreateButton(Transform parent, string label, Vector2 anchorMin, Vector2 anchorMax,
            Vector2 pivot, Vector2 anchoredPosition, Vector2 size, Action onClick)
        {
            var buttonObject = new GameObject(label + " Button", typeof(RectTransform), typeof(UI.Image), typeof(UI.Button));
            buttonObject.transform.SetParent(parent, false);
            RectTransform rect = buttonObject.GetComponent<RectTransform>();
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = pivot;
            rect.anchoredPosition = anchoredPosition;
            rect.sizeDelta = size;
            UI.Image image = buttonObject.GetComponent<UI.Image>();
            image.color = new Color32(30, 93, 103, 255);
            UI.Button button = buttonObject.GetComponent<UI.Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(() => onClick());
            CreateText(buttonObject.transform, label + " Label", Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero, TextColor, 16, TextAnchor.MiddleCenter);
            return button;
        }

        private UI.InputField CreateIntegerInput(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax,
            Vector2 pivot, Vector2 anchoredPosition, Vector2 size)
        {
            var inputObject = new GameObject(name, typeof(RectTransform), typeof(UI.Image), typeof(UI.InputField));
            inputObject.transform.SetParent(parent, false);
            RectTransform rect = inputObject.GetComponent<RectTransform>();
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
            rect.pivot = pivot;
            rect.anchoredPosition = anchoredPosition;
            rect.sizeDelta = size;

            UI.Image background = inputObject.GetComponent<UI.Image>();
            background.color = new Color32(8, 20, 30, 255);
            UI.InputField input = inputObject.GetComponent<UI.InputField>();
            input.targetGraphic = background;
            input.contentType = UI.InputField.ContentType.IntegerNumber;
            input.lineType = UI.InputField.LineType.SingleLine;
            input.characterLimit = 6;
            input.textComponent = CreateText(inputObject.transform, name + " Value", Vector2.zero, Vector2.one,
                new Vector2(9f, 2f), new Vector2(-9f, -2f), TextColor, 16, TextAnchor.MiddleLeft);
            UI.Text placeholder = CreateText(inputObject.transform, name + " Placeholder", Vector2.zero, Vector2.one,
                new Vector2(9f, 2f), new Vector2(-9f, -2f), Muted, 14, TextAnchor.MiddleLeft);
            placeholder.text = "Target quantity";
            placeholder.fontStyle = FontStyle.Italic;
            input.placeholder = placeholder;
            input.text = "0";
            return input;
        }

        private static void EnsureEventSystem()
        {
            EventSystem eventSystem = FindFirstObjectByType<EventSystem>();
            if (eventSystem != null) return;

            var eventSystemObject = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
            eventSystem = eventSystemObject.GetComponent<EventSystem>();
            eventSystem.gameObject.GetComponent<InputSystemUIInputModule>().AssignDefaultActions();
        }

        private void AppendItem(StringBuilder builder, InventoryStore inventory, ItemId item)
        {
            int stock = inventory.GetStock(item);
            int reserved = inventory.GetReserved(item);
            int inbound = inventory.GetExpectedInbound(item);
            int inTransit = inventory.GetInTransit(item);
            if (!inventory.HasCapacity(item) && stock == 0 && reserved == 0 && inbound == 0 && inTransit == 0) return;
            string stockText = inventory.HasCapacity(item)
                ? string.Format("{0}/{1}", stock, inventory.GetCapacity(item))
                : stock.ToString();
            builder.AppendLine(string.Format("{0,-10} {1} {2}", GetItemDisplayName(item).ToUpperInvariant(),
                Localize("stock", "보유"), stockText));
            if (inbound > 0 || inTransit > 0)
                builder.AppendLine(string.Format("   {0} {1}   {2} {3}   ({4} {5})",
                    Localize("reserved", "예약"), reserved,
                    Localize("inbound, transit included", "반입 예정·운반 중 포함"), inbound,
                    Localize("in transit", "운반 중"), inTransit));
            else if (reserved > 0)
                builder.AppendLine(string.Format("   {0} {1}", Localize("reserved", "예약"), reserved));
        }

        private static int GetCurrentWave(long milliseconds, GameDefinitions definitions)
        {
            if (milliseconds < definitions.InitialWaveMilliseconds) return 0;
            return Mathf.Min(definitions.WaveCount,
                (int)((milliseconds - definitions.InitialWaveMilliseconds) / definitions.WaveIntervalMilliseconds) + 1);
        }

        private static long GetMillisecondsUntilNextWave(long milliseconds, int currentWave, GameDefinitions definitions)
        {
            long nextWaveMilliseconds = currentWave == 0
                ? definitions.InitialWaveMilliseconds
                : definitions.InitialWaveMilliseconds + (long)currentWave * definitions.WaveIntervalMilliseconds;
            return Math.Max(0L, nextWaveMilliseconds - milliseconds);
        }

        private static int GetNextSupport(GameWorld world)
        {
            if (world.Definitions.SubsidyTiers == null || world.Definitions.SubsidyTiers.Length == 0) return 0;
            int amount = world.Definitions.SubsidyTiers[0].Amount;
            for (int i = 0; i < world.Definitions.SubsidyTiers.Length; i++)
            {
                SubsidyTierData tier = world.Definitions.SubsidyTiers[i];
                if (world.ExportedCrystals < tier.ExportThreshold) break;
                amount = tier.Amount;
            }
            return amount;
        }

        private static string FormatGameTime(long milliseconds)
        {
            TimeSpan time = TimeSpan.FromMilliseconds(milliseconds);
            return string.Format("{0:00}:{1:00}:{2:00}", (int)time.TotalHours, time.Minutes, time.Seconds);
        }

        private static float FacilityHeight(FacilityKind kind)
        {
            switch (kind)
            {
                case FacilityKind.Port: return 1.0f;
                case FacilityKind.Ironworks: return 2.5f;
                case FacilityKind.AmmunitionFactory: return 3.2f;
                case FacilityKind.Outpost: return 4.0f;
                case FacilityKind.Turret: return 2.0f;
                case FacilityKind.Conveyor: return 0.34f;
                case FacilityKind.Splitter: return 0.72f;
                case FacilityKind.Merger: return 0.72f;
                default: return 1.6f;
            }
        }

        private static Color FacilityColor(FacilityKind kind)
        {
            switch (kind)
            {
                case FacilityKind.Port: return new Color32(120, 141, 153, 255);
                case FacilityKind.Ironworks: return new Color32(184, 121, 65, 255);
                case FacilityKind.AmmunitionFactory: return new Color32(154, 83, 65, 255);
                case FacilityKind.Outpost: return new Color32(62, 126, 126, 255);
                case FacilityKind.Turret: return new Color32(98, 120, 143, 255);
                case FacilityKind.Miner: return new Color32(103, 130, 78, 255);
                case FacilityKind.Refinery: return new Color32(68, 127, 142, 255);
                case FacilityKind.Conveyor: return new Color32(115, 145, 149, 255);
                case FacilityKind.Splitter: return new Color32(70, 150, 131, 255);
                case FacilityKind.Merger: return new Color32(74, 127, 161, 255);
                default: return Warning;
            }
        }

        private static Color ItemColor(ItemId item)
        {
            switch (item)
            {
                case ItemId.Iron: return new Color32(184, 189, 178, 255);
                case ItemId.Plate: return new Color32(120, 177, 191, 255);
                case ItemId.Ammunition: return new Color32(226, 171, 73, 255);
                case ItemId.Ore: return new Color32(170, 112, 77, 255);
                case ItemId.Crystal: return new Color32(86, 218, 225, 255);
                default: return TextColor;
            }
        }

        private sealed class FacilityViewTarget : MonoBehaviour
        {
            public string FacilityId;
        }

        private sealed class RecoveryPileViewTarget : MonoBehaviour
        {
            public string RecoveryPileId;
        }
    }
}
