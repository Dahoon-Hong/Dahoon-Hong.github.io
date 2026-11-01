# Plan 1: Project C MVP

- **Status:** In Progress
- **Branch:** `defence_c` (parentless baseline)
- **Created:** 2026-11-01
- **Purpose:** Implement and verify the complete first playable Project C release.

## Objective

Deliver one offline, single-player Windows x64 game in which the player imports
materials, builds and runs production, supplies defenses, survives the scheduled
waves, mines and refines crystals, and wins only when the export ship departs with
the required total before the fixed deadline. The game rules must remain testable
without rendering a Unity scene.

## Requirements and scope

### Required product behavior

- Use the existing Unity `6000.2.14f1` URP project as the starting point. Target
  Windows 10/11 x64, keyboard and mouse, and offline play. The first distributable
  is a ZIP containing the executable and every required runtime file.
- Keep authoritative simulation state and rules in a screenless C# core. Unity
  handles presentation, input, audio, settings, and Windows integration. Definitions
  such as prices, items, recipes, facilities, and waves are data; behavior is code.
- Preserve the confirmed map, grid, placement, movement, transport, combat, and
  economy rules from the local planning snapshot. Do not let model geometry,
  animation timing, or rendered frames change simulation outcomes.
- Use the confirmed opening conditions: starting materials are zero, funds are
  500, the first scheduled ship order is 100 iron with 100 prepaid, and five drones
  start with four in production and one in the combat area. Keep required outpost
  relaying and the ship timetable. Do not add tutorial materials or preconnected
  conveyors.
- Connect the real loop: contract confirmation and prepayment → ship arrival and
  sequential unloading → production and transport → outpost and turret resupply →
  wave defense → crystal mining and refining → ship loading and departure settlement.
  Count exports only on actual ship departure.
- Preserve the fixed match conditions: first wave at 300 game seconds, following
  waves on the confirmed 120-second schedule, 30 waves total, 2,000 crystals
  exported, departure strictly before 3,900 game seconds, and outpost destruction
  as a loss. At the exact event boundaries, apply
  [event-rules.md](../../../ProjectC/Documentation/Notion-Q-494/source/event-rules.md).
- Preserve the opening timetable and actual state changes: first 100-iron order
  with 100 prepaid from 500 funds, sequential unloading at 20 items per game
  second, next regular order at 120 seconds for a ship due at 180 seconds, and
  100 support at 180 seconds when nothing has been exported. The first wave has
  10 enemies at 300 seconds; the starting turret holds 60 ammunition. Use the
  confirmed five-drone assignment of four production and one combat.
- Preserve the confirmed basic production rates: one iron becomes one plate in
  one second; one plate becomes twelve ammunition in twelve seconds. The outpost
  must receive ammunition before combat-area drones can deliver it to a turret.
  Export only cargo committed at actual departure; partial available cargo may
  ship under the existing contract rules.
- Provide the confirmed play, port contract, settings, and result flows. Support
  Korean and English, minimum 1280×720, adjustable UI scale, window/fullscreen
  modes, key remapping with duplicate-binding prevention, audio controls, pause
  and 1×/2×/4× speed, map navigation, and the required HUD and facility details.
  Opening or closing a management screen must not change pause or speed.
- Keep the always-visible HUD focused on funds, support tier, export progress,
  outpost health, wave/time, and current speed. Preserve the confirmed minimap and
  facility-detail information. Applied user settings persist across relaunch; an
  in-progress match does not. Provide master/BGM/effects levels and the confirmed
  shake/flash settings. Use one naturally looping calm industrial/electronic BGM
  and only the sound triggers defined by the local audio rules.
- Keep the game scene pixel-styled while UI and text remain crisp. Use a fixed
  orthographic quarter-view camera with pan and zoom but no camera rotation,
  readable 3D facility/unit shapes, restrained lighting and shadows, reduced
  occlusion, and a selection outline linked to the selected simulation entity.
  Apply representative 3D facility and terrain treatment in the first full-flow
  slice; final art is not a prerequisite for connecting the loop.
- Keep all five result statistics to the confirmed set: final exported amount,
  goal completion rate, elapsed time, highest wave reached, and enemies defeated.
  Automatically write a local diagnostic record with build/version, starting
  conditions, main commands, events, errors, and measurements. Do not add player
  save/load or full-run replay.
- Use free assets and verify provenance, license/usage terms, and AI editing and
  inspection suitability before adoption. Keep total asset purchases at or below
  50,000 KRW, with audio prioritized. If free assets and permitted processing
  cannot meet the visual requirements, document the gap and options before
  selecting a substitute.

### Out of scope

- A separate short-match/test mode, additional maps, or a separate game.
- Multiplayer, online services, storefront integration, mod support, or a general
  player-facing content editor.
- Mid-match save/load, complete input replay, or extra result analytics.
- Windows on ARM as a separately supported target.
- Completing every final model, effect, or polished screen before the first
  end-to-end playable slice.

## Technical approach

1. Retain the Unity project already present in `ProjectC`; do not scaffold a second
   application or import the legacy game source.
2. Separate simulation definitions, simulation state/rules, run control, Unity
   presentation/platform adapters, and diagnostics by responsibility. Keep the
   core free of Scene, GameObject, rendering, and physics dependencies.
3. Advance a game clock independently from render frames. Pause stops game time;
   1×/2×/4× change elapsed game time without changing rules. Process crossed event
   times in order and preserve all explicit precedence rules in the source spec.
4. Make inventory movement, reservations, consumption, refunds, and settlement
   observable and conserved. Reject invalid or contradictory definition data
   during development validation instead of silently substituting values.
5. Choose the smallest compatible Unity-supported test and profiling tools after
   checking the current project packages. Do not add a package unless the project
   needs it.

## Implementation phases

### Phase 1 — Project baseline and simulation foundation

- Confirm the checked-in Unity project opens with the specified Editor and its
  Windows build profile is usable; record any actual environment constraint.
- Define and validate the confirmed game data and starting state from the local
  Notion snapshot.
- Implement the screenless simulation boundary, game clock, command/result flow,
  entity identity, and deterministic event processing needed by the confirmed
  event rules.
- Add automated checks for definitions, resource conservation, reservations,
  transaction idempotency, time scaling/pause, and event precedence.

**Exit criteria:** the core can run representative scenarios without a Unity scene;
invalid data and the specified event boundaries produce observable failures or
expected outcomes.

### Phase 2 — First complete playable flow

- Connect the actual opening transaction, ship arrival and unloading, iron
  processing, ammunition production, outpost relay, turret delivery, first defense,
  crystal extraction/refining, loading, departure, and settlement.
- Use the confirmed initial resources, drone assignments, production/transport
  rules, and ship timetable. Keep all transfers and production in the simulation
  state; UI actions must issue commands rather than grant materials.
- Add basic Unity scene interaction and status display. Include representative 3D
  facility and terrain rendering with the confirmed camera and scene/UI separation.
- Exercise a short development scenario by advancing test time; do not expose a
  separate short-mode feature to players or use it as evidence for full-match
  completion.

**Exit criteria:** a player can observe and operate every link in the real loop,
and the displayed inventory, reservations, ship state, defense state, and export
settlement match core state.

### Phase 3 — MVP gameplay and interface completion

- Complete the confirmed wave schedule, enemy movement and terrain occlusion,
  turret targeting/ammunition/damage, drone work, construction, repair, demolition,
  supply, contracts, and the win/loss state.
- Implement all applicable acceptance criteria in
  [planning.md](../../../ProjectC/Documentation/Notion-Q-494/source/planning.md),
  including `AC-UI-001` through `AC-UI-028`, and the runtime scenarios in
  [play-flow.md](../../../ProjectC/Documentation/Notion-Q-494/source/play-flow.md)
  and `UF-01` through `UF-30` in
  [ui-flow.md](../../../ProjectC/Documentation/Notion-Q-494/source/ui-flow.md).
  Onboarding must be skippable without granting resources or automating
  production/transport.
- Complete the four confirmed screens, settings persistence, Korean/English text,
  minimum-resolution layout, selection/placement feedback, facility detail and
  problem indicators, minimap navigation, and the five-stat result screen.
- Maintain local diagnostic records and connect displayed events and audio to
  actual simulation events.

**Exit criteria:** every applicable source acceptance criterion is implemented;
full-match win, loss, restart, and return-to-menu flows are reachable.

### Phase 4 — Balance, visual, and performance verification

- Verify the full 30-wave match and the actual export victory through ship
  departure. Evaluate multiple reasonable layouts and expansion orders without
  changing confirmed values before evidence supports a proposed adjustment.
- Verify readability at supported zooms and UI scales; tune scene pixel treatment
  separately from crisp UI. Check selection identity, occlusion, facility/enemy
  identification, and the required audio behavior.
- Measure 1080p at 1×, 2×, and 4× on a recorded Windows x64 integrated-graphics
  machine with 8 GB RAM. Record actual hardware, OS, build, scenario, method, and
  results. The target is 60 FPS at each speed; do not claim it before measurement.
- If the visual effects conflict with performance, reduce shadows, post-processing,
  and decorative effects first, then rerun the affected measurements and core
  correctness checks.

**Exit criteria:** the required match and performance evidence is recorded, or a
specific failure/blocker and its impact are documented. Do not silently lower a
confirmed target.

### Phase 5 — Windows package and release checks

- Build the Windows x64 player and create a ZIP that includes all required files.
- Run that exact build offline on Windows 10/11 x64. Verify launch, input, window
  modes, saved settings, all required screens, restart, and no dependency on the
  development machine or network.
- Complete the required runtime scenarios below through the Unity Standalone
  application. A browser-only result cannot establish Windows runtime completion.
- Review every included asset’s attribution and redistribution terms, then verify
  the ZIP contents and local diagnostic output.

**Exit criteria:** required scenarios pass in the target runtime, permitted skips
include their reason and impact, and no required scenario is hidden as a skip.

## Required verification scenarios

All scenarios below are required unless a row is demonstrably outside the changed
scope (`SKIP-N/A`). Environment-blocked scenarios must state the reason and impact
(`SKIP-ENV`). A required scenario whose result cannot be observed is `BLOCKED`, not
a pass or skip.

| ID | Required scenario | Expected evidence |
| --- | --- | --- |
| CORE-01 | New match opening state and first order | Confirmed starting resources/funds/drones, 100-iron order, 100 prepayment, and sequential unloading match core state. |
| CORE-02 | Resource flow and cancellation boundaries | No lost/duplicated/negative stock across reservation, transport, production, construction, cancellation, refund, and settlement. |
| CORE-03 | Time and event precedence | Pause and 1×/2×/4× preserve rules; EV-01 through EV-07 in `event-rules.md` produce their documented outcomes. |
| FLOW-01 | End-to-end playable loop | Import → production → outpost/turret supply → defense → mining/refining → actual ship departure settlement. |
| GAME-01 | Full match and outcome | 30-wave schedule; victory only after 2,000 crystals are actually exported before 3,900 game seconds with outpost alive; outpost loss wins precedence. |
| UI-01 | Source interface acceptance | All applicable `AC-UI-001`–`AC-UI-028` criteria in `planning.md` and all `UF-01`–`UF-30` scenarios in `ui-flow.md`; Korean/English, minimum 1280×720, supported scale, input and settings behavior. UF-13 covers all 16 combinations of language, 1280×720/1920×1080, and four UI scales. |
| VIS-01 | Scene/UI rendering | Fixed orthographic camera, scene pixel feel, crisp text/UI, selection identity, representative models and terrain, zoom readability. |
| RUN-01 | Windows offline ZIP | Exact packaged build launches and completes the applicable play, settings, restart, and result flows without network access. |
| PERF-01 | Performance target | Recorded 1080p measurements at 1×/2×/4× on the target integrated-GPU/8-GB class; report whether each meets 60 FPS. |
| DIAG-01 | Local diagnostic record | Version, starting conditions, main commands, events, errors, and measurements can be reviewed and correspond to the run. |

For each completed feature plan, use the repository-required `integration-tester`
runtime QA agent against the exact current worktree runtime. This plan targets a
native Windows application and has no browser URL/port; the QA procedure must
observe the Standalone runtime directly. Do not start another server or substitute
browser DOM checks for native runtime evidence.

## Dependencies and open verification

- The Unity template project and local requirements snapshot are present. The
  specified Unity Editor/Windows build profile still need to be confirmed by an
  actual open/build in the implementation worktree.
- The workspace's integration-tester instructions describe a URL-oriented
  workflow, while this product is a native offline application. Establish an
  observable Standalone runtime QA path before the Plan 1 completion gate; until
  then, native UI scenarios are not verified.
- The exact performance test machine is not yet identified. Record the actual
  device when testing; this does not change the stated performance target.
- Rendering implementation details and compatible asset candidates are design
  tasks. Verify them in the project and respect the asset escalation rule if free
  usable assets do not meet the confirmed requirements.

## Traceability

- Product decisions and latest requirement priority: [planning.md](../../../ProjectC/Documentation/Notion-Q-494/source/planning.md)
- Architecture and ownership boundaries: [software-architecture.md](../../../ProjectC/Documentation/Notion-Q-494/source/software-architecture.md)
- First whole-flow slice: [first-validation.md](../../../ProjectC/Documentation/Notion-Q-494/source/first-validation.md)
- Starting flow and match calculations: [play-flow.md](../../../ProjectC/Documentation/Notion-Q-494/source/play-flow.md)
- UI flows and acceptance scenarios: [ui-flow.md](../../../ProjectC/Documentation/Notion-Q-494/source/ui-flow.md)
- Event ordering and boundary scenarios: [event-rules.md](../../../ProjectC/Documentation/Notion-Q-494/source/event-rules.md)
- Automated, Windows, and performance verification: [technical-validation.md](../../../ProjectC/Documentation/Notion-Q-494/source/technical-validation.md)
- Asset selection and budget: [asset-plan.md](../../../ProjectC/Documentation/Notion-Q-494/source/asset-plan.md)
- Complete source archive and UI wireframe: [Q-494 index](../../../ProjectC/Documentation/Notion-Q-494/INDEX.md)

## Current progress

- [x] Create a parentless Project C branch baseline and retain the Notion snapshot and UI PNG.
- [x] Create a fresh implementation plan numbered from Plan 1 for this branch.
- [ ] Implement phases 1–5.
- [ ] Run the required runtime scenarios and record actual evidence.
