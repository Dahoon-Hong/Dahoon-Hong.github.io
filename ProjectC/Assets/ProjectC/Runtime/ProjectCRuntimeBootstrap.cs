using System;
using ProjectC.Core;
using UnityEngine;

namespace ProjectC.Runtime
{
    /// <summary>Creates the first playable view when the configured Unity scene starts.</summary>
    internal sealed class ProjectCRuntimeBootstrap : MonoBehaviour
    {
        private static ProjectCRuntimeBootstrap instance;
        private GameDefinitions definitions;
        private GameSimulation simulation;
        private LocalDiagnosticRecorder diagnostics;
        private ProjectCRuntimeView view;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void StartProjectC()
        {
            if (FindFirstObjectByType<ProjectCRuntimeBootstrap>() != null) return;

            var bootstrapObject = new GameObject("Project C Runtime");
            DontDestroyOnLoad(bootstrapObject);
            bootstrapObject.AddComponent<ProjectCRuntimeBootstrap>();
        }

        private void Awake()
        {
            if (instance != null && instance != this)
            {
                Destroy(gameObject);
                return;
            }

            instance = this;

            try
            {
                definitions = UnityDefinitionLoader.Load();
                StartNewMatch(true);
            }
            catch (Exception exception)
            {
                diagnostics?.RecordError(simulation == null ? 0 : simulation.CurrentMilliseconds, exception);
                if (simulation != null) diagnostics?.CaptureEvents(simulation.World);
                Debug.LogException(exception);
            }
        }

        private void OnApplicationQuit()
        {
            if (simulation == null || diagnostics == null) return;
            diagnostics.CaptureEvents(simulation.World);
            diagnostics.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
        }

        private void StartNewMatch(bool showMainMenu)
        {
            if (view != null)
            {
                view.gameObject.SetActive(false);
                Destroy(view.gameObject);
                view = null;
            }
            if (simulation != null && diagnostics != null)
            {
                diagnostics.CaptureEvents(simulation.World);
                diagnostics.RecordSessionEnd(simulation.World, simulation.CurrentMilliseconds);
            }

            try
            {
                simulation = GameSimulation.CreateNewMatch(definitions);
                diagnostics = new LocalDiagnosticRecorder(simulation);
                view = new GameObject("Project C Play View").AddComponent<ProjectCRuntimeView>();
                view.Initialize(simulation, diagnostics, () => StartNewMatch(false), showMainMenu);
            }
            catch (Exception exception)
            {
                diagnostics?.RecordError(simulation == null ? 0 : simulation.CurrentMilliseconds, exception);
                if (simulation != null) diagnostics?.CaptureEvents(simulation.World);
                Debug.LogException(exception);
            }
        }

        private void OnDestroy()
        {
            if (instance == this) instance = null;
        }
    }
}
