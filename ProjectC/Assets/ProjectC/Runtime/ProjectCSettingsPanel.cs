using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using UI = UnityEngine.UI;

namespace ProjectC.Runtime
{
    /// <summary>Persistent user settings UI, independent from match time and speed.</summary>
    internal sealed class ProjectCSettingsPanel : MonoBehaviour
    {
        private const string Prefix = "ProjectC.Settings.";
        private static readonly Color Backdrop = new Color32(8, 16, 27, 238);
        private static readonly Color Surface = new Color32(18, 36, 54, 250);
        private static readonly Color Teal = new Color32(46, 197, 186, 255);
        private static readonly Color TextColor = new Color32(221, 235, 241, 255);
        private static readonly Color Muted = new Color32(142, 168, 180, 255);
        private static readonly int[] SupportedScales = { 75, 100, 125, 150 };

        private Canvas canvas;
        private UI.CanvasScaler canvasScaler;
        private Vector2 baseReferenceResolution;
        private Action closeCallback;
        private GameObject panelObject;
        private Font font;
        private UI.Text languageText;
        private UI.Text screenModeText;
        private UI.Text scaleText;
        private UI.Text masterValueText;
        private UI.Text bgmValueText;
        private UI.Text effectsValueText;
        private UI.Text shakeText;
        private UI.Text flashText;
        private UI.Text pauseBindingText;
        private UI.Text rotateBindingText;
        private UI.Text conveyorBindingText;
        private UI.Text feedbackText;
        private UI.Slider masterSlider;
        private UI.Slider bgmSlider;
        private UI.Slider effectsSlider;
        private string appliedLanguage;
        private int languageDraft;
        private int scaleIndex;
        private bool fullscreen;
        private bool shakeEnabled;
        private bool flashEnabled;
        private Key pauseBinding;
        private Key rotateBinding;
        private Key conveyorBendBinding;
        private BindingAction pendingBinding;
        private bool initialized;

        private enum BindingAction
        {
            None,
            Pause,
            Rotate,
            ConveyorBend
        }

        public bool IsOpen => panelObject != null && panelObject.activeSelf;
        public Key PauseBinding => pauseBinding;
        public Key RotateBinding => rotateBinding;
        public Key ConveyorBendBinding => conveyorBendBinding;
        public string Language => appliedLanguage;
        public int UiScalePercent => SupportedScales[scaleIndex];
        public float MasterVolume => masterSlider == null ? AudioListener.volume : masterSlider.value;
        public float BgmVolume => bgmSlider == null ? 0.8f : bgmSlider.value;
        public float EffectsVolume => effectsSlider == null ? 0.9f : effectsSlider.value;
        public bool CameraShakeEnabled => shakeEnabled;
        public bool ScreenFlashEnabled => flashEnabled;

        public event Action<string> LanguageApplied;

        public void Initialize(Canvas targetCanvas, UI.CanvasScaler targetScaler, Action onClose)
        {
            if (targetCanvas == null) throw new ArgumentNullException(nameof(targetCanvas));
            if (targetScaler == null) throw new ArgumentNullException(nameof(targetScaler));
            canvas = targetCanvas;
            canvasScaler = targetScaler;
            baseReferenceResolution = targetScaler.referenceResolution;
            closeCallback = onClose;
            font = Font.CreateDynamicFontFromOSFont(new[] { "Malgun Gothic", "Arial" }, 18);
            LoadSettings();
            BuildPanel();
            ApplyImmediateSettings();
            initialized = true;
        }

        public void Open()
        {
            if (!initialized) throw new InvalidOperationException("Initialize the settings panel before opening it.");
            languageDraft = string.Equals(appliedLanguage, "ko", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
            RefreshLabels();
            panelObject.SetActive(true);
        }

        public void Close()
        {
            if (panelObject == null) return;
            panelObject.SetActive(false);
            pendingBinding = BindingAction.None;
            PlayerPrefs.Save();
        }

        private void Update()
        {
            if (!IsOpen) return;
            Keyboard keyboard = Keyboard.current;
            if (keyboard == null) return;

            bool inputFocused = EventSystem.current != null &&
                                EventSystem.current.currentSelectedGameObject != null &&
                                EventSystem.current.currentSelectedGameObject.GetComponentInParent<UI.InputField>() != null;
            if (inputFocused) return;

            if (pendingBinding != BindingAction.None)
            {
                CaptureBinding(keyboard);
                return;
            }

            if (keyboard.escapeKey.wasPressedThisFrame)
            {
                Close();
                closeCallback?.Invoke();
            }
        }

        private void LoadSettings()
        {
            appliedLanguage = PlayerPrefs.GetString(Prefix + "Language", "en");
            if (appliedLanguage != "ko" && appliedLanguage != "en") appliedLanguage = "en";
            fullscreen = PlayerPrefs.GetInt(Prefix + "Fullscreen", 0) != 0;
            int scale = PlayerPrefs.GetInt(Prefix + "UiScale", 100);
            scaleIndex = FindScaleIndex(scale);
            shakeEnabled = PlayerPrefs.GetInt(Prefix + "CameraShake", 1) != 0;
            flashEnabled = PlayerPrefs.GetInt(Prefix + "ScreenFlash", 1) != 0;
            pauseBinding = ReadBinding("Pause", Key.Space);
            rotateBinding = ReadBinding("Rotate", Key.R);
            conveyorBendBinding = ReadBinding("ConveyorBend", Key.Q);
            ResolveBindingCollisions();
        }

        private void BuildPanel()
        {
            panelObject = CreatePanel(canvas.transform, "Project C Settings", Vector2.zero,
                new Vector2(760f, 760f), Backdrop).gameObject;
            RectTransform panel = panelObject.GetComponent<RectTransform>();
            CreateText(panel, "Settings Title", "SETTINGS", 30f, 700f, 560f, 36f, TextColor, 24);
            CreateButton(panel, "Close Settings", "×", 685f, 699f, 42f, 36f, CloseFromButton);

            CreateText(panel, "Language Label", "Language", 32f, 648f, 185f, 32f, TextColor, 16);
            languageText = CreateText(panel, "Language Value", string.Empty, 300f, 648f, 180f, 32f, Teal, 16);
            CreateButton(panel, "Previous Language", "‹", 245f, 649f, 42f, 30f, () => CycleLanguage(-1));
            CreateButton(panel, "Next Language", "›", 493f, 649f, 42f, 30f, () => CycleLanguage(1));
            CreateButton(panel, "Apply Language", "Apply", 560f, 646f, 164f, 36f, ApplyLanguage);

            CreateText(panel, "Screen Mode Label", "Display mode", 32f, 598f, 185f, 32f, TextColor, 16);
            screenModeText = CreateText(panel, "Screen Mode Value", string.Empty, 300f, 598f, 200f, 32f, Teal, 16);
            CreateButton(panel, "Toggle Screen Mode", "Change", 560f, 596f, 164f, 36f, ToggleScreenMode);
            CreateText(panel, "Scale Label", "UI scale", 32f, 552f, 185f, 32f, TextColor, 16);
            scaleText = CreateText(panel, "UI Scale Value", string.Empty, 300f, 552f, 200f, 32f, Teal, 16);
            CreateButton(panel, "Previous UI Scale", "−", 510f, 552f, 42f, 32f, () => CycleScale(-1));
            CreateButton(panel, "Next UI Scale", "+", 678f, 552f, 42f, 32f, () => CycleScale(1));

            CreateText(panel, "Master Volume Label", "Master volume", 32f, 504f, 185f, 30f, TextColor, 15);
            masterSlider = CreateSlider(panel, "Master Volume", new Vector2(248f, 506f), 340f,
                PlayerPrefs.GetFloat(Prefix + "Master", 0.8f), OnMasterVolumeChanged);
            masterValueText = CreateText(panel, "Master Volume Value", string.Empty, 612f, 504f, 110f, 30f, Muted, 14);
            CreateText(panel, "BGM Volume Label", "BGM volume", 32f, 459f, 185f, 30f, TextColor, 15);
            bgmSlider = CreateSlider(panel, "BGM Volume", new Vector2(248f, 461f), 340f,
                PlayerPrefs.GetFloat(Prefix + "Bgm", 0.8f), OnBgmVolumeChanged);
            bgmValueText = CreateText(panel, "BGM Volume Value", string.Empty, 612f, 459f, 110f, 30f, Muted, 14);
            CreateText(panel, "Effects Volume Label", "Effects volume", 32f, 414f, 185f, 30f, TextColor, 15);
            effectsSlider = CreateSlider(panel, "Effects Volume", new Vector2(248f, 416f), 340f,
                PlayerPrefs.GetFloat(Prefix + "Effects", 0.9f), OnEffectsVolumeChanged);
            effectsValueText = CreateText(panel, "Effects Volume Value", string.Empty, 612f, 414f, 110f, 30f, Muted, 14);

            CreateText(panel, "Camera Shake Label", "Camera shake", 32f, 368f, 185f, 30f, TextColor, 15);
            shakeText = CreateText(panel, "Camera Shake Value", string.Empty, 300f, 368f, 200f, 30f, Teal, 15);
            CreateButton(panel, "Toggle Camera Shake", "On / Off", 560f, 366f, 164f, 34f, ToggleShake);
            CreateText(panel, "Screen Flash Label", "Screen flash", 32f, 323f, 185f, 30f, TextColor, 15);
            flashText = CreateText(panel, "Screen Flash Value", string.Empty, 300f, 323f, 200f, 30f, Teal, 15);
            CreateButton(panel, "Toggle Screen Flash", "On / Off", 560f, 321f, 164f, 34f, ToggleFlash);

            CreateText(panel, "Bindings Header", "KEY BINDINGS", 32f, 278f, 300f, 28f, Teal, 16);
            CreateText(panel, "Pause Binding Label", "Pause / resume", 32f, 236f, 215f, 30f, TextColor, 14);
            pauseBindingText = CreateText(panel, "Pause Binding Value", string.Empty, 300f, 236f, 190f, 30f, Teal, 14);
            CreateButton(panel, "Rebind Pause", "Rebind", 560f, 234f, 164f, 34f, () => BeginRebind(BindingAction.Pause));
            CreateText(panel, "Rotate Binding Label", "Rotate placement", 32f, 193f, 215f, 30f, TextColor, 14);
            rotateBindingText = CreateText(panel, "Rotate Binding Value", string.Empty, 300f, 193f, 190f, 30f, Teal, 14);
            CreateButton(panel, "Rebind Rotate", "Rebind", 560f, 191f, 164f, 34f, () => BeginRebind(BindingAction.Rotate));
            CreateText(panel, "Conveyor Binding Label", "Conveyor bend order", 32f, 150f, 215f, 30f, TextColor, 14);
            conveyorBindingText = CreateText(panel, "Conveyor Binding Value", string.Empty, 300f, 150f, 190f, 30f, Teal, 14);
            CreateButton(panel, "Rebind Conveyor Bend", "Rebind", 560f, 148f, 164f, 34f,
                () => BeginRebind(BindingAction.ConveyorBend));

            feedbackText = CreateText(panel, "Settings Feedback", string.Empty, 32f, 90f, 690f, 32f, Muted, 12);
            CreateButton(panel, "Restore Language", "Language\nDefault", 28f, 32f, 108f, 48f, RestoreLanguageDefault);
            CreateButton(panel, "Restore Display", "Display\nDefault", 147f, 32f, 108f, 48f, RestoreDisplayDefaults);
            CreateButton(panel, "Restore Audio", "Audio\nDefault", 266f, 32f, 108f, 48f, RestoreAudioDefaults);
            CreateButton(panel, "Restore Visuals", "Visuals\nDefault", 385f, 32f, 108f, 48f, RestoreVisualDefaults);
            CreateButton(panel, "Restore Keys", "Keys\nDefault", 504f, 32f, 108f, 48f, RestoreKeyDefaults);
            CreateButton(panel, "Restore All", "Restore\nAll", 623f, 32f, 108f, 48f, RestoreAllDefaults);
            panelObject.SetActive(false);
            RefreshLabels();
        }

        private void RefreshLabels()
        {
            bool korean = string.Equals(appliedLanguage, "ko", StringComparison.OrdinalIgnoreCase);
            if (languageText != null)
                languageText.text = languageDraft == 1 ? "한국어" : "English";
            if (screenModeText != null) screenModeText.text = fullscreen ? (korean ? "전체 화면" : "Fullscreen") : (korean ? "창 모드" : "Windowed");
            if (scaleText != null) scaleText.text = SupportedScales[scaleIndex] + "%";
            if (masterValueText != null) masterValueText.text = Mathf.RoundToInt(MasterVolume * 100f) + "%";
            if (bgmValueText != null) bgmValueText.text = Mathf.RoundToInt(BgmVolume * 100f) + "%";
            if (effectsValueText != null) effectsValueText.text = Mathf.RoundToInt(EffectsVolume * 100f) + "%";
            if (shakeText != null) shakeText.text = shakeEnabled ? (korean ? "켜짐" : "On") : (korean ? "꺼짐" : "Off");
            if (flashText != null) flashText.text = flashEnabled ? (korean ? "켜짐" : "On") : (korean ? "꺼짐" : "Off");
            if (pauseBindingText != null) pauseBindingText.text = FormatKey(pauseBinding);
            if (rotateBindingText != null) rotateBindingText.text = FormatKey(rotateBinding);
            if (conveyorBindingText != null) conveyorBindingText.text = FormatKey(conveyorBendBinding);
            ApplyLocalizedLabels(korean);
        }

        private void ApplyLocalizedLabels(bool korean)
        {
            SetText("Settings Title", korean ? "설정" : "SETTINGS");
            SetText("Language Label", korean ? "언어" : "Language");
            SetText("Screen Mode Label", korean ? "화면 모드" : "Display mode");
            SetText("Scale Label", korean ? "UI 배율" : "UI scale");
            SetText("Master Volume Label", korean ? "전체 음량" : "Master volume");
            SetText("BGM Volume Label", korean ? "배경음 음량" : "BGM volume");
            SetText("Effects Volume Label", korean ? "효과음 음량" : "Effects volume");
            SetText("Camera Shake Label", korean ? "화면 흔들림" : "Camera shake");
            SetText("Screen Flash Label", korean ? "화면 섬광" : "Screen flash");
            SetText("Bindings Header", korean ? "단축키" : "KEY BINDINGS");
            SetText("Pause Binding Label", korean ? "일시정지 / 재개" : "Pause / resume");
            SetText("Rotate Binding Label", korean ? "배치 회전" : "Rotate placement");
            SetText("Conveyor Binding Label", korean ? "컨베이어 꺾임 순서" : "Conveyor bend order");
            SetButtonText("Close Settings", "×");
            SetButtonText("Previous Language", "‹");
            SetButtonText("Next Language", "›");
            SetButtonText("Apply Language", korean ? "적용" : "Apply");
            SetButtonText("Toggle Screen Mode", korean ? "변경" : "Change");
            SetButtonText("Previous UI Scale", "−");
            SetButtonText("Next UI Scale", "+");
            SetButtonText("Toggle Camera Shake", korean ? "켜기 / 끄기" : "On / Off");
            SetButtonText("Toggle Screen Flash", korean ? "켜기 / 끄기" : "On / Off");
            SetButtonText("Rebind Pause", korean ? "지정" : "Rebind");
            SetButtonText("Rebind Rotate", korean ? "지정" : "Rebind");
            SetButtonText("Rebind Conveyor Bend", korean ? "지정" : "Rebind");
            SetButtonText("Restore Language", korean ? "언어\n기본값" : "Language\nDefault");
            SetButtonText("Restore Display", korean ? "화면\n기본값" : "Display\nDefault");
            SetButtonText("Restore Audio", korean ? "소리\n기본값" : "Audio\nDefault");
            SetButtonText("Restore Visuals", korean ? "시각 효과\n기본값" : "Visuals\nDefault");
            SetButtonText("Restore Keys", korean ? "키\n기본값" : "Keys\nDefault");
            SetButtonText("Restore All", korean ? "전체\n복원" : "Restore\nAll");
        }

        private void SetText(string objectName, string value)
        {
            if (panelObject == null) return;
            UI.Text[] texts = panelObject.GetComponentsInChildren<UI.Text>(true);
            for (int i = 0; i < texts.Length; i++)
                if (texts[i].gameObject.name == objectName) texts[i].text = value;
        }

        private void SetButtonText(string buttonName, string value)
        {
            if (panelObject == null) return;
            UI.Button[] buttons = panelObject.GetComponentsInChildren<UI.Button>(true);
            for (int i = 0; i < buttons.Length; i++)
            {
                if (buttons[i].gameObject.name != buttonName) continue;
                UI.Text text = buttons[i].GetComponentInChildren<UI.Text>(true);
                if (text != null) text.text = value;
                return;
            }
        }

        private void CycleLanguage(int direction)
        {
            languageDraft = (languageDraft + direction + 2) % 2;
            RefreshLabels();
        }

        private void ApplyLanguage()
        {
            appliedLanguage = languageDraft == 1 ? "ko" : "en";
            PlayerPrefs.SetString(Prefix + "Language", appliedLanguage);
            PlayerPrefs.Save();
            RefreshLabels();
            feedbackText.text = Localized("Language applied.", "언어를 적용했습니다.");
            LanguageApplied?.Invoke(appliedLanguage);
        }

        private void ToggleScreenMode()
        {
            fullscreen = !fullscreen;
            PlayerPrefs.SetInt(Prefix + "Fullscreen", fullscreen ? 1 : 0);
            ApplyScreenMode();
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void CycleScale(int direction)
        {
            scaleIndex = (scaleIndex + direction + SupportedScales.Length) % SupportedScales.Length;
            PlayerPrefs.SetInt(Prefix + "UiScale", SupportedScales[scaleIndex]);
            ApplyScale();
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void OnMasterVolumeChanged(float value)
        {
            AudioListener.volume = value;
            PlayerPrefs.SetFloat(Prefix + "Master", value);
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void OnBgmVolumeChanged(float value)
        {
            PlayerPrefs.SetFloat(Prefix + "Bgm", value);
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void OnEffectsVolumeChanged(float value)
        {
            PlayerPrefs.SetFloat(Prefix + "Effects", value);
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void ToggleShake()
        {
            shakeEnabled = !shakeEnabled;
            PlayerPrefs.SetInt(Prefix + "CameraShake", shakeEnabled ? 1 : 0);
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void ToggleFlash()
        {
            flashEnabled = !flashEnabled;
            PlayerPrefs.SetInt(Prefix + "ScreenFlash", flashEnabled ? 1 : 0);
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void BeginRebind(BindingAction action)
        {
            pendingBinding = action;
            feedbackText.text = Localized(
                "Press a key. Escape cancels. Existing bindings stay unchanged if the key is already used.",
                "키를 누르세요. Esc로 취소합니다. 이미 사용 중인 키는 지정되지 않고 기존 설정을 유지합니다.");
        }

        private void CaptureBinding(Keyboard keyboard)
        {
            if (!keyboard.anyKey.wasPressedThisFrame) return;
            foreach (KeyControl control in keyboard.allKeys)
            {
                if (!control.wasPressedThisFrame) continue;
                Key candidate = control.keyCode;
                if (candidate == Key.Escape)
                {
                    pendingBinding = BindingAction.None;
                    feedbackText.text = Localized("Key binding cancelled.", "키 지정을 취소했습니다.");
                    return;
                }
                if (candidate == Key.None || candidate == Key.Space && pendingBinding != BindingAction.Pause)
                {
                    feedbackText.text = Localized("That key is reserved for the pause action.", "이 키는 일시정지/재개에 예약되어 있습니다.");
                    return;
                }
                if (IsUsedByOtherAction(candidate, pendingBinding, out string otherAction))
                {
                    feedbackText.text = string.Format(
                        Localized("{0} is already assigned to {1}. The existing bindings were kept.",
                            "{0} 키는 이미 {1}에 지정되어 있습니다. 기존 키 설정을 유지했습니다."),
                        FormatKey(candidate), otherAction);
                    pendingBinding = BindingAction.None;
                    return;
                }

                SetBinding(pendingBinding, candidate);
                pendingBinding = BindingAction.None;
                feedbackText.text = Localized("Key binding saved.", "키 설정을 저장했습니다.");
                return;
            }
        }

        private bool IsUsedByOtherAction(Key key, BindingAction action, out string actionName)
        {
            if (action != BindingAction.Pause && pauseBinding == key) { actionName = Localized("Pause / resume", "일시정지 / 재개"); return true; }
            if (action != BindingAction.Rotate && rotateBinding == key) { actionName = Localized("Rotate placement", "배치 회전"); return true; }
            if (action != BindingAction.ConveyorBend && conveyorBendBinding == key) { actionName = Localized("Conveyor bend order", "컨베이어 꺾임 순서"); return true; }
            actionName = string.Empty;
            return false;
        }

        private void SetBinding(BindingAction action, Key key)
        {
            switch (action)
            {
                case BindingAction.Pause:
                    pauseBinding = key;
                    PlayerPrefs.SetInt(Prefix + "PauseBinding", (int)key);
                    break;
                case BindingAction.Rotate:
                    rotateBinding = key;
                    PlayerPrefs.SetInt(Prefix + "RotateBinding", (int)key);
                    break;
                case BindingAction.ConveyorBend:
                    conveyorBendBinding = key;
                    PlayerPrefs.SetInt(Prefix + "ConveyorBendBinding", (int)key);
                    break;
            }
            PlayerPrefs.Save();
            RefreshLabels();
        }

        private void RestoreLanguageDefault()
        {
            languageDraft = 0;
            RefreshLabels();
            feedbackText.text = Localized("English is selected as the draft. Apply it to change the saved language.",
                "언어 초안을 기본값으로 바꿨습니다. 적용을 눌러야 저장 언어가 변경됩니다.");
        }

        private void RestoreDisplayDefaults()
        {
            ResetDisplayValues();
            PlayerPrefs.Save();
            RefreshLabels();
            feedbackText.text = Localized("Display mode and UI scale restored.", "화면 모드와 UI 배율을 기본값으로 복원했습니다.");
        }

        private void RestoreAudioDefaults()
        {
            ResetAudioValues();
            PlayerPrefs.Save();
            RefreshLabels();
            feedbackText.text = Localized("Audio levels restored.", "음량을 기본값으로 복원했습니다.");
        }

        private void RestoreVisualDefaults()
        {
            ResetVisualValues();
            PlayerPrefs.Save();
            RefreshLabels();
            feedbackText.text = Localized("Visual effect settings restored.", "시각 효과 설정을 기본값으로 복원했습니다.");
        }

        private void RestoreKeyDefaults()
        {
            ResetBindingValues();
            PlayerPrefs.Save();
            RefreshLabels();
            feedbackText.text = Localized("Key bindings restored.", "단축키를 기본값으로 복원했습니다.");
        }

        private void RestoreAllDefaults()
        {
            languageDraft = 0;
            ResetDisplayValues();
            ResetAudioValues();
            ResetVisualValues();
            ResetBindingValues();
            PlayerPrefs.Save();
            RefreshLabels();
            feedbackText.text = Localized(
                "Immediate settings restored. Apply English to change the saved language.",
                "즉시 반영 설정을 기본값으로 복원했습니다. 언어는 적용을 눌러야 영어로 변경됩니다.");
        }

        private void ResetDisplayValues()
        {
            fullscreen = false;
            scaleIndex = FindScaleIndex(100);
            PlayerPrefs.SetInt(Prefix + "Fullscreen", 0);
            PlayerPrefs.SetInt(Prefix + "UiScale", 100);
            ApplyScreenMode();
            ApplyScale();
        }

        private void ResetAudioValues()
        {
            if (masterSlider != null) masterSlider.SetValueWithoutNotify(0.8f);
            if (bgmSlider != null) bgmSlider.SetValueWithoutNotify(0.8f);
            if (effectsSlider != null) effectsSlider.SetValueWithoutNotify(0.9f);
            AudioListener.volume = 0.8f;
            PlayerPrefs.SetFloat(Prefix + "Master", 0.8f);
            PlayerPrefs.SetFloat(Prefix + "Bgm", 0.8f);
            PlayerPrefs.SetFloat(Prefix + "Effects", 0.9f);
        }

        private void ResetVisualValues()
        {
            shakeEnabled = true;
            flashEnabled = true;
            PlayerPrefs.SetInt(Prefix + "CameraShake", 1);
            PlayerPrefs.SetInt(Prefix + "ScreenFlash", 1);
        }

        private void ResetBindingValues()
        {
            pauseBinding = Key.Space;
            rotateBinding = Key.R;
            conveyorBendBinding = Key.Q;
            PlayerPrefs.SetInt(Prefix + "PauseBinding", (int)Key.Space);
            PlayerPrefs.SetInt(Prefix + "RotateBinding", (int)Key.R);
            PlayerPrefs.SetInt(Prefix + "ConveyorBendBinding", (int)Key.Q);
        }

        private void ApplyImmediateSettings()
        {
            AudioListener.volume = PlayerPrefs.GetFloat(Prefix + "Master", 0.8f);
            ApplyScreenMode();
            ApplyScale();
        }

        private void ApplyScreenMode()
        {
            Screen.fullScreenMode = fullscreen ? FullScreenMode.FullScreenWindow : FullScreenMode.Windowed;
        }

        private void ApplyScale()
        {
            int percent = SupportedScales[scaleIndex];
            float divisor = percent / 100f;
            canvasScaler.referenceResolution = new Vector2(baseReferenceResolution.x / divisor,
                baseReferenceResolution.y / divisor);
        }

        private Key ReadBinding(string name, Key fallback)
        {
            int stored = PlayerPrefs.GetInt(Prefix + name + "Binding", (int)fallback);
            Key value = (Key)stored;
            return Enum.IsDefined(typeof(Key), value) && value != Key.None ? value : fallback;
        }

        private void ResolveBindingCollisions()
        {
            if (pauseBinding == rotateBinding || pauseBinding == conveyorBendBinding || rotateBinding == conveyorBendBinding)
            {
                pauseBinding = Key.Space;
                rotateBinding = Key.R;
                conveyorBendBinding = Key.Q;
            }
        }

        private static int FindScaleIndex(int value)
        {
            for (int i = 0; i < SupportedScales.Length; i++)
                if (SupportedScales[i] == value) return i;
            return 1;
        }

        private string Localized(string english, string korean) =>
            string.Equals(appliedLanguage, "ko", StringComparison.OrdinalIgnoreCase) ? korean : english;

        private static string FormatKey(Key key) => key.ToString();

        private RectTransform CreatePanel(Transform parent, string name, Vector2 position, Vector2 size, Color color)
        {
            var panel = new GameObject(name, typeof(RectTransform), typeof(UI.Image));
            panel.transform.SetParent(parent, false);
            RectTransform rect = panel.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0.5f);
            rect.anchorMax = new Vector2(0.5f, 0.5f);
            rect.pivot = new Vector2(0.5f, 0.5f);
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            panel.GetComponent<UI.Image>().color = color;
            return rect;
        }

        private UI.Text CreateText(Transform parent, string name, string value, float x, float y,
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
            text.font = font;
            text.fontSize = fontSize;
            text.color = color;
            text.alignment = TextAnchor.MiddleLeft;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.raycastTarget = false;
            text.text = value;
            return text;
        }

        private UI.Button CreateButton(Transform parent, string name, string label, float x, float y,
            float width, float height, Action onClick)
        {
            var buttonObject = new GameObject(name, typeof(RectTransform), typeof(UI.Image), typeof(UI.Button));
            buttonObject.transform.SetParent(parent, false);
            RectTransform rect = buttonObject.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.zero;
            rect.pivot = Vector2.zero;
            rect.anchoredPosition = new Vector2(x, y);
            rect.sizeDelta = new Vector2(width, height);
            UI.Image image = buttonObject.GetComponent<UI.Image>();
            image.color = new Color32(30, 93, 103, 255);
            UI.Button button = buttonObject.GetComponent<UI.Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(() => onClick());
            UI.Text buttonText = CreateText(buttonObject.transform, name + " Label", label,
                4f, 0f, width - 8f, height, TextColor, 14);
            buttonText.alignment = TextAnchor.MiddleCenter;
            return button;
        }

        private UI.Slider CreateSlider(Transform parent, string name, Vector2 position, float width,
            float initial, Action<float> onChanged)
        {
            var sliderObject = new GameObject(name, typeof(RectTransform), typeof(UI.Image), typeof(UI.Slider));
            sliderObject.transform.SetParent(parent, false);
            RectTransform rect = sliderObject.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.zero;
            rect.pivot = Vector2.zero;
            rect.anchoredPosition = position;
            rect.sizeDelta = new Vector2(width, 24f);
            sliderObject.GetComponent<UI.Image>().color = new Color32(52, 74, 86, 255);
            var handleObject = new GameObject(name + " Handle", typeof(RectTransform), typeof(UI.Image));
            handleObject.transform.SetParent(sliderObject.transform, false);
            RectTransform handle = handleObject.GetComponent<RectTransform>();
            handle.anchorMin = new Vector2(0f, 0.5f);
            handle.anchorMax = new Vector2(0f, 0.5f);
            handle.pivot = new Vector2(0.5f, 0.5f);
            handle.sizeDelta = new Vector2(18f, 28f);
            UI.Image handleImage = handleObject.GetComponent<UI.Image>();
            handleImage.color = Teal;
            UI.Slider slider = sliderObject.GetComponent<UI.Slider>();
            slider.minValue = 0f;
            slider.maxValue = 1f;
            slider.handleRect = handle;
            slider.targetGraphic = handleImage;
            slider.value = Mathf.Clamp01(initial);
            slider.onValueChanged.AddListener(value => onChanged(value));
            return slider;
        }

        private void CloseFromButton()
        {
            Close();
            closeCallback?.Invoke();
        }

        private void OnDestroy()
        {
            if (font != null) Destroy(font);
        }
    }
}
