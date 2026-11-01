# Project C

Project C is a standalone Unity 3D URP project, separate from the existing web game.
The current Unity project contains the template scene and development environment.

## Project C requirements and plan

Project C requirements are maintained in the branch-local [documentation](Documentation/README.md).
Start with [the Q-494 handoff index](Documentation/Notion-Q-494/INDEX.md) and follow
[Plan 1](../plans/implementation/1-project-c-mvp/1-project-c-mvp.md) for the MVP.
Use these branch files as the working source; the original Notion URLs are retained for provenance.

## Requirements

- Unity Editor 6000.2.14f1 with Windows x64 build support
- Unity CLI, authenticated with an active Personal or Pro license
- Windows 10/11 x64

## Open the project

Open this ProjectC directory from Unity Hub, or run:

    unity editor --project-path .\ProjectC

The CLI can query the open Editor and send Editor commands:

    unity status --project-path .\ProjectC --until-ready --timeout 300 --format json
    unity command --project-path .\ProjectC --help

## Build

The configured build profile is Windows x64 and includes Assets/Scenes/SampleScene.unity.
Use File → Build Profiles → Windows → Build. Place local output outside
this Git worktree, such as %TEMP%\ProjectCBuild, so generated files stay out of version control.

## Unity services

The project is offline and does not require Unity Cloud. The Unity CLI Pipeline package is
included so the CLI can connect to the Editor. Each developer must authenticate and activate
their own Unity license; do not commit credentials or license files.
