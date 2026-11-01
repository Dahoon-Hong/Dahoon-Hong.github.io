# Unity Project Context

<!-- unity-onboarding:generated:start -->

## Project Summary

- Project root: `ProjectC/`
- Last analyzed: 2026-11-01
- Last analyzed commit: `42cff3d747192c7bb77b9e24fc078be53735280d`
- Project C is a new Unity game project on the parentless `defence_c` branch.
  The only existing scene and scripts are Unity URP template content.

## Confirmed Environment

- Unity version: 6000.2.14f1, revision `589824c1fc31`
- Render pipeline: URP 17.2.0
- Input system: Input System package 1.16.0; `activeInputHandler: 1`
- Target platforms: Windows 10/11 x64, offline, per the project requirements

## Important Packages And Frameworks

| Area | Finding | Confidence | Evidence |
| --- | --- | --- | --- |
| Rendering | URP 17.2.0 | Confirmed | `Packages/manifest.json`, `ProjectSettings/GraphicsSettings.asset` |
| Input | Input System 1.16.0 and an input-actions asset; no gameplay binding code yet | Confirmed | `Packages/manifest.json`, `Assets/InputSystem_Actions.inputactions`, `ProjectSettings/ProjectSettings.asset` |
| UI | uGUI 2.0.0 is available; no runtime UI exists yet | Confirmed | `Packages/manifest.json`, `Assets/` |
| Automated tests | Unity Test Framework 1.6.0 is installed; no project test assemblies exist yet | Confirmed | `Packages/manifest.json`, `Assets/` |
| Editor connection | Unity Pipeline 0.9.1-exp.1 is installed; the Unity Editor is open on this project. The standalone `unity` CLI command was not found on PATH. | Confirmed | `Packages/manifest.json`, `C:\Users\slaye\AppData\Local\Unity\Editor\Editor.log` |
| Navigation | AI Navigation 2.0.9 is installed; no project use is present | Confirmed | `Packages/manifest.json`, `Assets/` |
| Multiplayer | Multiplayer Center package is present, but the project has no multiplayer implementation and Project C is offline single-player | Confirmed | `Packages/manifest.json`, project requirements |

## Directory Structure

| Path | Purpose | Confidence | Evidence |
| --- | --- | --- | --- |
| `Assets/Scenes/SampleScene.unity` | Only enabled build scene; Unity starter scene | Confirmed | `ProjectSettings/EditorBuildSettings.asset` |
| `Assets/Settings/` | URP template pipeline and volume assets | Confirmed | File inventory and project settings |
| `Assets/TutorialInfo/` | URP template readme assets/scripts; not game code | Confirmed | File inventory |
| `Documentation/Notion-Q-494/` | Branch-local Project C requirements, design, flow, and sync snapshot including UI PNG | Confirmed | `Documentation/Notion-Q-494/INDEX.md` |

## Assembly Boundaries

| Assembly | Responsibility | Key references | Notes |
| --- | --- | --- | --- |
| None in the starter | No `.asmdef` or `.asmref` files currently exist | — | Plan 1 requires a pure C# simulation core with no UnityEngine reference and separate Unity adapters. |

## Scenes And Startup Flow

- Build scenes: enabled `Assets/Scenes/SampleScene.unity` only.
- Likely startup scene: `SampleScene`; there is no Project C startup flow yet.
- Scene loading flow: none found.

## Architecture

| Pattern | Finding | Confidence | Evidence |
| --- | --- | --- | --- |
| Gameplay architecture | No Project C gameplay architecture exists yet | Confirmed | First-party asset inventory |
| Core/presentation boundary | Required by Plan 1 and `software-architecture.md`; not implemented yet | Confirmed requirement | `Documentation/Notion-Q-494/source/software-architecture.md` |

## Coding Conventions

- Namespace and runtime class conventions: unknown; there is no gameplay code sample.
- Unity template readme/editor scripts are generated starter content and are not a Project C pattern.
- Keep deterministic game rules in plain C# and Unity-specific work in adapters, as required by Plan 1.

## Testing And Validation

- EditMode tests: framework is installed; none exist yet.
- PlayMode tests: none exist yet.
- CI/build validation: no Project C test or build command is configured.
- Unity Editor currently has this project open; no build or test has been run for this baseline.

## Available Unity Tooling

| Capability | Status | Evidence |
| --- | --- | --- |
| Unity Editor connection | available | Editor window is open; `Editor.log` identifies this project root. |
| Unity-specific MCP tools | unavailable | No Unity MCP tools are exposed in the current tool list. |
| Unity CLI | unavailable | `where.exe unity` returned no executable. |
| Windows app UI automation | available | Computer Use tooling can target the Unity Editor window. |
| Runtime/test execution | unverified | Must be established after the first game code imports. |

## Important Constraints

- Read `AGENTS.md`, `Documentation/README.md`, the Q-494 index, and Plan 1 before implementation changes.
- Do not use old defence2 source or old implementation plans as Project C requirements.
- Keep the simulation core independent of Unity scenes, GameObjects, rendering, and physics.
- Treat `Library/`, `Temp/`, `Logs/`, and `UserSettings/` as generated; do not edit or commit them.
- The runtime is a native offline Windows game; browser-only validation is insufficient.

## Unknowns And Confidence

- **Confirmed:** Unity 6.2.14f1, URP, Input System, Test Framework, current scene, and currently open project path.
- **Unknown:** Windows player build outcome, full Editor compilation of Project C code, runtime QA route, final asset compatibility/licensing, and target-device performance.
- **Confirmed requirement but unmeasured:** 1080p at 1×/2×/4× should target 60 FPS on integrated graphics with 8 GB RAM.

## Source Files Inspected

- `ProjectC/ProjectSettings/ProjectVersion.txt`
- `ProjectC/ProjectSettings/ProjectSettings.asset`
- `ProjectC/ProjectSettings/GraphicsSettings.asset`
- `ProjectC/ProjectSettings/EditorBuildSettings.asset`
- `ProjectC/Packages/manifest.json`
- `ProjectC/Packages/packages-lock.json`
- `ProjectC/AGENTS.md`
- `ProjectC/Documentation/README.md`
- `ProjectC/Documentation/Notion-Q-494/source/software-architecture.md`
- `ProjectC/Documentation/Notion-Q-494/source/technical-validation.md`

<!-- unity-onboarding:generated:end -->
