using System.Collections;
using System.Collections.Generic;
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
        private const string ShakeKey = "ProjectC.Settings.CameraShake";
        private const string FlashKey = "ProjectC.Settings.ScreenFlash";
        private const string PauseKey = "ProjectC.Settings.PauseBinding";

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
        private GameObject settingsReloadObject;
        private Camera[] testCameras;
        private Light[] testLights;
        private GameSimulation simulation;
        private ProjectCRuntimeView view;
        private Mouse mouse;
        private Keyboard keyboard;
        private PreferenceSnapshot preferences;
        private float previousAudioVolume;
        private FullScreenMode previousScreenMode;
        private string expectedLanguage;

        [UnitySetUp]
        public IEnumerator SetUpRuntime()
        {
            preferences = new PreferenceSnapshot();
            previousAudioVolume = AudioListener.volume;
            previousScreenMode = Screen.fullScreenMode;

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
            view.Initialize(simulation, null, null, false);
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
            if (settingsReloadObject != null) Object.Destroy(settingsReloadObject);
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

            yield return SaveAndReloadSettings();

            simulation.DamageFacility("outpost", simulation.World.Definitions.OutpostHealth);
            Assert.That(simulation.World.Outcome, Is.EqualTo(MatchOutcome.Defeat));
            yield return new WaitForSecondsRealtime(0.25f);

            Assert.That(FindNamedObject(view.transform, "Game Menu").activeSelf, Is.True);
            string title = FindText(view.transform, "Menu Title").text;
            Assert.That(title, Is.EqualTo(expectedLanguage == "ko" ? "패배" : "DEFEAT"));
            string body = FindText(view.transform, "Menu Body").text;
            Assert.That(body, Does.Contain("/"));
            Assert.That(body, Does.Contain(expectedLanguage == "ko" ? "최종 수출량:" : "Final exported:"));
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

            Canvas canvas = view.GetComponentInChildren<Canvas>(true);
            UI.CanvasScaler scaler = canvas.GetComponent<UI.CanvasScaler>();
            settingsReloadObject = new GameObject("Project C Settings Reload Probe");
            ProjectCSettingsPanel reloaded = settingsReloadObject.AddComponent<ProjectCSettingsPanel>();
            reloaded.Initialize(canvas, scaler, null);
            Assert.That(reloaded.Language, Is.EqualTo(expectedLanguage));
            Assert.That(reloaded.CameraShakeEnabled, Is.EqualTo(expectedShake));
            Assert.That(reloaded.ScreenFlashEnabled, Is.EqualTo(expectedFlash));
            Assert.That(reloaded.PauseBinding, Is.EqualTo(expectedPauseBinding));
        }

        private IEnumerator DragConveyorPath(GridPosition start, GridPosition end)
        {
            mouse = InputSystem.AddDevice<Mouse>();
            Camera camera = Camera.main;
            Assert.That(camera, Is.Not.Null, "The runtime view must provide the map camera.");
            Vector2 startScreen = camera.WorldToScreenPoint(new Vector3(start.X + 0.5f, 0.01f, start.Y + 0.5f));
            Vector2 endScreen = camera.WorldToScreenPoint(new Vector3(end.X + 0.5f, 0.01f, end.Y + 0.5f));
            Move(mouse.position, startScreen);
            yield return null;
            Press(mouse.leftButton);
            yield return null;
            Move(mouse.position, endScreen);
            yield return null;
            Release(mouse.leftButton);
            yield return null;
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
            private readonly bool hadShake = PlayerPrefs.HasKey(ShakeKey);
            private readonly bool hadFlash = PlayerPrefs.HasKey(FlashKey);
            private readonly bool hadPause = PlayerPrefs.HasKey(PauseKey);
            private readonly string language = PlayerPrefs.GetString(LanguageKey, "en");
            private readonly int shake = PlayerPrefs.GetInt(ShakeKey, 1);
            private readonly int flash = PlayerPrefs.GetInt(FlashKey, 1);
            private readonly int pause = PlayerPrefs.GetInt(PauseKey, (int)Key.Space);

            public void Restore()
            {
                RestoreString(LanguageKey, hadLanguage, language);
                RestoreInt(ShakeKey, hadShake, shake);
                RestoreInt(FlashKey, hadFlash, flash);
                RestoreInt(PauseKey, hadPause, pause);
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
        }
    }
}
