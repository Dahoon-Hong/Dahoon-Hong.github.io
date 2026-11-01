using System;
using System.Collections.Generic;
using UnityEngine;
using UI = UnityEngine.UI;

namespace ProjectC.Runtime
{
    /// <summary>
    /// Compact, skippable first-play guidance. RuntimeView owns objective detection and passes the
    /// number of completed objectives; this panel never changes match state or creates game resources.
    /// </summary>
    internal sealed class ProjectCOnboardingPanel : MonoBehaviour
    {
        private static readonly Color Backdrop = new Color32(12, 24, 39, 238);
        private static readonly Color TextColor = new Color32(221, 235, 241, 255);
        private static readonly Color Muted = new Color32(142, 168, 180, 255);
        private static readonly Color Teal = new Color32(46, 197, 186, 255);

        private static readonly string[] EnglishTitles =
        {
            "IRON DELIVERY",
            "PLATE PRODUCTION",
            "AMMUNITION PRODUCTION",
            "TURRET SUPPLY"
        };

        private static readonly string[] KoreanTitles =
        {
            "철 운반",
            "철판 생산",
            "탄약 생산",
            "터렛 보급"
        };

        private static readonly string[] EnglishDescriptions =
        {
            "Move imported iron from the port to an ironworks.",
            "Produce a plate at an ironworks.",
            "Move plates to an ammunition factory and produce ammunition.",
            "Deliver at least one ammunition to a turret."
        };

        private static readonly string[] KoreanDescriptions =
        {
            "항구에서 내린 철을 철판 공장으로 운반하세요.",
            "철판 공장에서 철판을 생산하세요.",
            "철판을 탄약 공장으로 운반해 탄약을 생산하세요.",
            "터렛에 탄약을 1개 이상 실제로 전달하세요."
        };

        private readonly List<UI.Text> stepLabels = new List<UI.Text>(4);
        private Canvas canvas;
        private Font font;
        private Font ownedFont;
        private GameObject panelObject;
        private UI.Text titleText;
        private UI.Text progressText;
        private UI.Text descriptionText;
        private UI.Button skipButton;
        private UI.Text skipButtonLabel;
        private bool initialized;
        private bool isKorean;
        private int completedStepCount;

        /// <summary>Raised after the player explicitly skips the guidance for this match.</summary>
        public event Action SkipRequested;

        /// <summary>Raised when the player hides the card without skipping its remaining objectives.</summary>
        public event Action HideRequested;

        /// <summary>Raised when RuntimeView should move the objective highlight to the active step.</summary>
        public event Action<int> ActiveStepChanged;

        public bool IsVisible => panelObject != null && panelObject.activeSelf;
        public bool IsComplete => completedStepCount >= 4;
        public int CompletedStepCount => completedStepCount;
        public int ActiveStepIndex => IsComplete ? -1 : completedStepCount;

        /// <summary>Creates the card under the match Canvas. The Canvas and shared font remain caller-owned.</summary>
        public void Initialize(Canvas targetCanvas, Font sharedFont = null, Vector2? anchoredPosition = null)
        {
            if (targetCanvas == null) throw new ArgumentNullException(nameof(targetCanvas));
            if (initialized) return;

            canvas = targetCanvas;
            font = sharedFont;
            if (font == null)
            {
                ownedFont = Font.CreateDynamicFontFromOSFont(new[] { "Malgun Gothic", "Arial" }, 18);
                font = ownedFont;
            }

            BuildPanel(anchoredPosition ?? new Vector2(18f, -132f));
            initialized = true;
            RefreshLabels();
        }

        /// <summary>Applies the already-selected UI language; accepts "ko" or "en".</summary>
        public void SetLanguage(string language)
        {
            isKorean = string.Equals(language, "ko", StringComparison.OrdinalIgnoreCase);
            RefreshLabels();
        }

        /// <summary>Updates progress from authoritative, event-based match history owned by RuntimeView.</summary>
        public void SetCompletedStepCount(int count)
        {
            int previousActiveStep = ActiveStepIndex;
            completedStepCount = Mathf.Clamp(count, 0, 4);
            RefreshLabels();
            if (previousActiveStep != ActiveStepIndex) ActiveStepChanged?.Invoke(ActiveStepIndex);
        }

        /// <summary>Shows or hides the card without pausing, resuming, or otherwise changing game time.</summary>
        public void SetVisible(bool visible)
        {
            if (!initialized || panelObject == null) return;
            panelObject.SetActive(visible);
            if (visible) ActiveStepChanged?.Invoke(ActiveStepIndex);
        }

        public void Show() => SetVisible(true);

        public void Hide()
        {
            if (!IsVisible) return;
            panelObject.SetActive(false);
            HideRequested?.Invoke();
        }

        private void BuildPanel(Vector2 anchoredPosition)
        {
            var panel = new GameObject("Project C First Play Guide", typeof(RectTransform), typeof(UI.Image));
            panel.transform.SetParent(canvas.transform, false);
            panelObject = panel;
            RectTransform panelRect = panel.GetComponent<RectTransform>();
            panelRect.anchorMin = new Vector2(0f, 1f);
            panelRect.anchorMax = new Vector2(0f, 1f);
            panelRect.pivot = new Vector2(0f, 1f);
            panelRect.anchoredPosition = anchoredPosition;
            panelRect.sizeDelta = new Vector2(350f, 352f);
            panel.GetComponent<UI.Image>().color = Backdrop;

            titleText = CreateText(panel.transform, "Guide Title", new Vector2(16f, -14f),
                new Vector2(250f, 30f), 20, TextColor, TextAnchor.MiddleLeft);
            CreateButton(panel.transform, "Hide Guide", "×", new Vector2(306f, -12f),
                new Vector2(32f, 30f), Hide);

            progressText = CreateText(panel.transform, "Guide Progress", new Vector2(18f, -52f),
                new Vector2(314f, 27f), 14, Teal, TextAnchor.MiddleLeft);
            descriptionText = CreateText(panel.transform, "Guide Objective", new Vector2(18f, -84f),
                new Vector2(314f, 54f), 16, TextColor, TextAnchor.UpperLeft);

            for (int i = 0; i < 4; i++)
            {
                UI.Text row = CreateText(panel.transform, "Guide Step " + (i + 1),
                    new Vector2(18f, -151f - i * 29f), new Vector2(314f, 25f),
                    13, Muted, TextAnchor.MiddleLeft);
                stepLabels.Add(row);
            }

            skipButton = CreateButton(panel.transform, "Skip Guide", "Skip guidance",
                new Vector2(18f, -302f), new Vector2(176f, 34f), RequestSkip);
            skipButtonLabel = skipButton.GetComponentInChildren<UI.Text>();
        }

        private void RequestSkip()
        {
            if (!IsVisible) return;
            panelObject.SetActive(false);
            SkipRequested?.Invoke();
        }

        private void RefreshLabels()
        {
            if (!initialized && panelObject == null) return;
            bool korean = isKorean;
            titleText.text = korean ? "첫 플레이 안내" : "FIRST PLAY GUIDE";

            if (IsComplete)
            {
                progressText.text = korean ? "모든 안내 단계 완료" : "ALL OBJECTIVES COMPLETE";
                descriptionText.text = korean
                    ? "생산 흐름과 방어 보급을 연결했습니다."
                    : "Your production chain and turret supply are connected.";
            }
            else
            {
                int active = ActiveStepIndex;
                progressText.text = korean
                    ? string.Format("단계 {0} / 4 · {1}", active + 1, KoreanTitles[active])
                    : string.Format("STEP {0} / 4 · {1}", active + 1, EnglishTitles[active]);
                descriptionText.text = korean ? KoreanDescriptions[active] : EnglishDescriptions[active];
            }

            for (int i = 0; i < stepLabels.Count; i++)
            {
                bool complete = i < completedStepCount;
                bool active = !IsComplete && i == ActiveStepIndex;
                string marker = complete ? "✓  " : active ? "›  " : "·  ";
                string title = korean ? KoreanTitles[i] : EnglishTitles[i];
                stepLabels[i].text = marker + title;
                stepLabels[i].color = active ? TextColor : complete ? Teal : Muted;
            }

            if (skipButtonLabel != null)
                skipButtonLabel.text = korean ? "안내 건너뛰기" : "Skip guidance";
            if (skipButton != null) skipButton.gameObject.SetActive(!IsComplete);
        }

        private UI.Text CreateText(Transform parent, string name, Vector2 topLeftPosition,
            Vector2 size, int fontSize, Color color, TextAnchor alignment)
        {
            var textObject = new GameObject(name, typeof(RectTransform), typeof(UI.Text));
            textObject.transform.SetParent(parent, false);
            RectTransform rect = textObject.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(0f, 1f);
            rect.pivot = new Vector2(0f, 1f);
            rect.anchoredPosition = topLeftPosition;
            rect.sizeDelta = size;
            UI.Text text = textObject.GetComponent<UI.Text>();
            text.font = font;
            text.fontSize = fontSize;
            text.color = color;
            text.alignment = alignment;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.raycastTarget = false;
            return text;
        }

        private UI.Button CreateButton(Transform parent, string name, string label,
            Vector2 topLeftPosition, Vector2 size, Action onClick)
        {
            var buttonObject = new GameObject(name, typeof(RectTransform), typeof(UI.Image), typeof(UI.Button));
            buttonObject.transform.SetParent(parent, false);
            RectTransform rect = buttonObject.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = new Vector2(0f, 1f);
            rect.pivot = new Vector2(0f, 1f);
            rect.anchoredPosition = topLeftPosition;
            rect.sizeDelta = size;
            UI.Image image = buttonObject.GetComponent<UI.Image>();
            image.color = new Color32(30, 93, 103, 255);
            UI.Button button = buttonObject.GetComponent<UI.Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(() => onClick());
            UI.Text buttonLabel = CreateText(buttonObject.transform, name + " Label",
                new Vector2(7f, -2f), new Vector2(size.x - 14f, size.y - 4f),
                14, TextColor, TextAnchor.MiddleCenter);
            buttonLabel.text = label;
            return button;
        }

        private void OnDestroy()
        {
            if (ownedFont != null) Destroy(ownedFont);
        }
    }
}
