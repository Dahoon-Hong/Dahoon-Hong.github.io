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

## Fast verification cadence

Keep the required scenarios below as release gates while shortening the
implementation feedback loop:

- **TDD and time budget:** every behavior change starts with a focused test that
  fails for the missing behavior, followed by the smallest implementation and a
  passing rerun. Every automated test command, including a focused flow scenario,
  must finish within60 seconds wall time. Do not run a scenario that advances
  through a long full-match timeline merely to inspect an intermediate state;
  test that decision at its own boundary and retain only short, deterministic
  acceptance flows.

- For simulation-only changes, run affected EditMode tests or a focused test
  filter before building a Player. The Unity CLI installed for this worktree is
  `1.0.0-beta.15`; the project Editor is `6000.2.14f1`. From the repository root,
  an affected run is:

  ```powershell
  unity --no-banner --color never --format json test ProjectC --mode EditMode --affected --output ProjectC/Builds/Verification-fast/EditMode-affected.xml --editor-version 6000.2.14f1 --timeout 60 -- -nographics
  ```

  Use `--filter <test-name-pattern>` for a known focused test. Drop `--affected`
  or the filter for a full EditMode suite. Keep the XML report with the run so
  failures and the affected-test selection remain reviewable.
- Historical GAME-01 v1–v72 screens are strategy exploration only. Their
  1,500/1,800-second runs took61–117 seconds and did not demonstrate Victory;
  they are not acceptance tests and must not be rerun under the 60-second test
  budget. Keep their outcomes in this plan as history. Use short unit tests for
  exact wave/deadline rules and a separate full-flow scenario for integrated
  construction, conveyors, production, defense, and actual ship departure.

  Unity's batch Editor needs local IPC sockets; if the sandboxed invocation
  crashes during Editor startup, rerun the same command through the approved
  unrestricted Unity test path and retain its CLI log.
- Keep the Unity Editor open during active code iterations and use its Test Runner
  to rerun the focused or failed EditMode tests. The measured test body took
  3.01 seconds while a cold headless CLI invocation spent about 43 seconds
  starting/importing the Editor; starting a new CLI process for every small edit
  repeats that larger cost. Keep the existing `Library` cache between runs.
  `--affected` is based on the diff from `HEAD`, but this project's
  `ProjectC.Core.Tests` assembly references only `ProjectC.Core`; a change isolated
  to `ProjectC.Runtime` UI code may therefore select no relevant tests. Compile
  the Editor and verify those changes in a Player instead of treating an empty
  affected-test selection as coverage.
- Rebuild a Player after a batch of runtime, presentation, or platform changes,
  rather than after each simulation-only edit. Then group applicable UI and
  runtime checks into the same Standalone QA session. Run the 16 UF-13 language,
  resolution, and scale combinations in that session when the runtime controls
  permit; otherwise use one session per resolution and cycle language and scale
  without relaunching for each combination.
  After the batch build, reuse the executable for visual iterations with
  `unity build run ProjectC --build-path ProjectC/Builds/Windows64/MVP/ProjectC.exe`
  (or launch that executable directly); this command runs the latest existing
  build without rebuilding it.
- A WebGL build can support quick supplemental smoke checks, but it does not
  replace required Windows Standalone evidence or the offline ZIP checks.

Baseline measured on 2026-11-03: the full EditMode suite passed 33/33; test
execution took 3.01 seconds and the first headless Editor startup/import took
about 43 seconds. The first sandboxed launch crashed while starting
`BuildReportRestService` on a local socket; rerunning the same command outside
that process sandbox completed successfully. This is an environment startup
constraint, not a test failure.

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
| FLOW-01 | End-to-end playable loop | From a fresh match, construct and connect at least one conveyor path that actually moves bulk material; then verify import → production → outpost/turret supply → defense → mining/refining → actual ship departure settlement. No preconnected path or injected starting stock. |
| GAME-01 | Full match and outcome | 30-wave schedule; victory only after 2,000 crystals are actually exported before 3,900 game seconds with outpost alive; outpost loss wins precedence. |
| UI-01 | Source interface acceptance | All applicable `AC-UI-001`–`AC-UI-028` criteria in `planning.md` and all `UF-01`–`UF-30` scenarios in `ui-flow.md`; Korean/English, minimum 1280×720, supported scale, input and settings behavior. UF-13 covers all 16 combinations of language, 1280×720/1920×1080, and four UI scales. |
| VIS-01 | Scene/UI rendering | Fixed orthographic camera, scene pixel feel, crisp text/UI, selection identity, representative models and terrain, zoom readability. |
| RUN-01 | Windows offline ZIP | Exact packaged build launches and completes the applicable play, settings, restart, and result flows without network access. |
| PERF-01 | Performance target | Recorded 1080p measurements at 1×/2×/4× on the target integrated-GPU/8-GB class; report whether each meets 60 FPS. |
| DIAG-01 | Local diagnostic record | Version, starting conditions, main commands, events, errors, and measurements can be reviewed and correspond to the run. |

### Automated feature coverage and 60-second budget

Every test command is capped at60 seconds wall time. The default EditMode suite
and each focused feature/flow suite must both remain below that limit; no Explicit
diagnostic test may require a longer run. Use a direct state fixture only for an
isolated subsystem test, never to bypass the behavior that the test claims to
cover. The integrated FLOW-01 test must use a fresh default match and actual
player commands, including a constructed conveyor path.

| Feature area | Automated test coverage |
| --- | --- |
| Opening state, contracts, imports/exports, funds, production, mining, construction, drone transport, repair, demolition, combat, pause/speed, event rules | `CoreFoundationTests`, `DroneRegionReassignmentTests`, `EventBoundaryTests`, and `EventBoundaryDepartureTests` with focused observable-state assertions. |
| Conveyor path placement, invalid-route atomicity, movement/delivery, reversal, splitter filters, merger selection, and destroyed-node handling | `ConveyorSystemTests` covers each subsystem boundary; the connected FLOW-01 scenario also verifies Miner→Conveyor→Refinery without a Drone transfer. |
| Runtime controls, diagnostics, navigation confirmations, facility management, build/conveyor placement/input and splitter filters, port contracts, map/HUD, selection/warnings/minimap, onboarding, localization, settings persistence/rebinding, and result flow | `RuntimeMvpPlayModeTests` exercises pause/speed and Escape menu open; restart/main-menu confirmation cancellation; Settings time behavior while running/paused, all four UI scales and `CanvasScaler` resolution, display mode, all three audio levels, duplicate-key rejection, reload, and restore defaults; virtual-mouse facility placement preview (invalid/valid color), rotation and commit, construction cancel/recovery, and conveyor placement/rejection/cancel preview; mixed valid/occupied route drops are rejected in full with facility, construction-site, and path state preserved; splitter output filter modes (Iron, Plate, Ammunition, block-all, allow-all); restock target, repair request/cancel/completion, construction waiting/completion, and demolition request/cancel; regular contract edits and invalid draft retention; one-off purchase rejection/prepayment/exact arrival through Port UI; drone-region reassignment action; facility selection/details/markers; HUD values; warning list and camera navigation; minimap navigation; guide hide/skip without match mutations; all five localized defeat statistics; and JSONL diagnostic metadata, events, commands, errors, session end, 1×/2×/4× frame speed, duration, frame count, and resolution. Retain Standalone integration tests for physical pointer routing, actual Windows display/audio behavior, all 16 UF-13 language/resolution/scale combinations, and offline launch; a pure EditMode pass does not cover these runtime boundaries. |
| Full-match outcome rules | Keep exact unscaled tests for the30-wave schedule, 2,000-export threshold, strict3,900,000ms deadline, and Outpost-loss precedence. Full 1,800/3,900-second replay probes are exploratory history and are removed from the runnable test suite. |

Use TDD for each uncovered area: add the observable failing assertion, run its
exact filter within60 seconds, implement the smallest change, rerun that filter,
then run the default suite within60 seconds. Record red/green duration, test
counts, and XML paths in `progress.md`.

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

### Focused implementation slice — fractional opening-import ticks

**Requirements and scope**

- Keep the prepaid opening iron shipment docked while its rate accumulator has
  not yet produced a whole iron unit for the current simulation step. A short
  frame remainder is not evidence that the Port is full.
- Stop the current unload batch only when a positive unload amount cannot be
  added to the Port because its actual capacity is insufficient. Preserve the
  existing unload rate, fractional remainder, prepayment, and refund rules.
- Add a deterministic EditMode regression that advances the opening shipment
  through 186 ms (three 50 ms unloads plus a 36 ms zero-unit step), then another
  64 ms. The ship must remain docked after 186 ms with 3 iron unloaded and
  continue to 5 iron by 250 ms.

**Acceptance and verification**

- At 186 ms, the opening ship remains docked with the full 100-iron unloading
  eligibility, 3 iron unloaded, and 97 iron still aboard. At 250 ms it has
  unloaded 5 iron and remains docked.
- The focused EditMode regression fails before the fix and passes afterward;
  the full Core EditMode suite passes.
- Rebuild and launch the updated Windows Standalone player, then confirm its
  local diagnostic log no longer records departure/refund at 186 ms and shows
  unloading continues. This is direct exploratory evidence; the current
  URL-only integration-tester cannot formally validate this native runtime, so
  the required Standalone QA gate remains open until that path is supported.
- 2026-11-04 direct Player evidence: `session-20261104T124825973Z` recorded
  starting/available funds 500/400, prepayment 100, and a 100-iron contract;
  100 unload events delivered all 100 iron, then the ship departed at 5,000 ms
  with zero refund and no diagnostic errors. The required integration-tester
  returned `BLOCKED` because this native runtime has no URL or port, so the
  formal QA gate remains open and this slice must not be committed yet.

### Focused implementation slice — connected FLOW-01 core scenario

**Requirements and scope**

- Add a deterministic EditMode scenario that starts with `GameSimulation.CreateNewMatch()` and uses only the confirmed opening shipment and normal simulation commands; do not inject inventory, add a player-facing short mode, or bypass facility construction.
- Add a focused core regression that seeds an Outpost exactly at its ammo target and a turret deficit, then verifies automatic combat supply and re-queues production restock after pickup. Keep this isolated setup separate from the zero-inventory connected flow.
- Coalesce incremental automatic restock requests that share a source, destination, and item, so sequential ship unloading can use the existing drone carry capacity without leaving many one-item jobs.
- Connect first iron unloading, iron-to-plate production, ammunition production, outpost relay, turret delivery, first-wave combat, ore mining/refining, port loading, and export settlement on actual ship departure.
- Require at least one player-commanded conveyor build/path in the connected flow. In the first belt scenario, move the Refinery from `(22,25)` to `(23,25)` to leave `(22,25)` for the Conveyor between the Miner and Refinery; set Refinery Ore restock to0 and assert mined Ore reaches it through the connected belt, not a Drone transfer. The existing Drone routes remain in the scenario for the flexible Outpost/combat relay.
- In the connected scenario, set Ironworks Iron and AmmunitionFactory Plate restock targets to 0 before the first simulation tick. After the opening shipment fully unloads, queue a normal Port→Ironworks transfer for 20 Iron and let the Ironworks produce 20 Plates. Place Miner and Refinery only after Ironworks Iron reaches 0; then `ConstructionSystem.QueueMissingMaterials` can batch the sites' combined 40 Iron from Port and 10 Plates from Ironworks without competing for incomplete stock. Restore the AmmunitionFactory Plate target to 5 after construction.
- Set the Refinery Ore target to0 before its first simulation tick. Once the completed Miner has produced Ore, place and complete the one-cell Conveyor path, then verify Ore arrives at the Refinery with no matching Drone transfer. After the Refinery produces five actual Crystals, lower Miner and Refinery priorities to3, raise Port to5, and queue a normal Refinery→Port transfer for five. Let the scheduled export ship load and depart with the batch by the360-second arrival. The simulation continues through the first wave while these steps advance; lower Outpost priority to3 after the first confirmed turret resupply. The existing regular-ship test covers the transient partial-loading boundary, while this connected flow checks departure and settlement without polling through a250ms loading window.
- Set the outpost ammunition restock target to one produced batch (12) and raise its existing facility priority to 5 as player commands. With outpost stock exactly at that target, the turret's automatic combat restock must still be allowed to draw ammunition; after the actual outbound pickup, production-side restock can refill the outpost. Raise the new miner and refinery priorities to 5 before their construction requests compete with older restock work.
- Assert that the connected stock flow remains conserved and export/funds are credited only when the ship departs.
- Keep this scenario in `ProjectC.Core.Tests`, cap it with `[Timeout(60_000)]`, and verify its focused wall time is below60 seconds. Keep it runnable without rebuilding the Windows Player. This is core regression coverage, not evidence that the required Standalone FLOW-01 runtime scenario has passed.

**Acceptance and verification**

- The test starts with the existing zero-material opening state and reaches each connected stage using existing `GameSimulation` commands and systems.
- Outpost restock targets protect production-to-outpost automatic restock only; they do not block automatic outpost-to-combat supply even when the outpost is exactly at target, and the production refill resumes after actual stock removal.
- The TDD sequence records the initial failing conveyor assertion, then a passing focused test after actual path placement and transfer. The focused EditMode test and default suite each finish within60 seconds; reports record wall time and XML paths. A Player build is not required for this simulation-only slice.
- The full runtime FLOW-01, native UI, full-match, performance, and offline ZIP gates remain open until separately verified.

### Focused implementation slice — diagnostic runtime measurements

**Requirements and scope**

- Complete DIAG-01 by writing measured rendering performance samples to the existing local JSONL diagnostic session during active gameplay.
- Capture host OS, graphics device, system memory, and current resolution in the session-start record alongside the existing build, Unity version, and device model metadata.
- Accumulate real elapsed frame time and frame count for each uninterrupted 1×, 2×, or 4× game-speed interval. Emit average FPS, average frame time, sample duration, and frame count every 10 real seconds. Reset the partial sample when speed changes; do not include paused time or the main menu.
- Treat these records as diagnostic evidence only. PERF-01 remains unverified until a 1080p full-match scenario is measured on a recorded integrated-GPU/8-GB target at all three speeds.

**Acceptance and verification**

- A Windows Standalone diagnostic session-start record identifies the build, OS, device, graphics adapter, system memory, and resolution.
- A single runtime session that holds each supported active speed for at least 10 seconds contains measurement records with the corresponding speed, FPS, frame time, sample duration, and sampled frame count.
- Launch the updated Windows Standalone Player and inspect its JSONL output. This slice does not claim PERF-01's 60 FPS target or complete the formal native integration-tester gate.

### Focused implementation slice — drone region reassignment

**Requirements and scope**

- Preserve the confirmed opening allocation of four Production drones and one Combat drone; newly purchased drones continue to enter Production.
- Let the player request moving one drone between Production and Combat from the Port management UI. Show current counts and pending reassignment so the change is observable.
- Keep both reassignment controls inside the Port panel at the minimum supported 1280×720 resolution.
- Never interrupt a transport, construction, repair, or demolition task. Apply a requested region change after the drone finishes its current task and returns to the Outpost. An idle drone outside the Outpost also returns before changing region.
- Do not assign new work to a drone while it is returning for reassignment. Keep the drone unavailable to the old and new region until it reaches the Outpost; then apply the requested region and allow normal work scheduling.

**Acceptance and verification**

- EditMode regressions cover immediate reassignment at the Outpost, return-before-reassignment from another location, and an active transport completing with conserved cargo before the region changes.
- A Windows Standalone session shows the Production/Combat counts, accepts one reassignment in each direction, and the diagnostic log records the request and completed region change.
- Rebuild and use the same Windows Player for this UI check and the diagnostic measurement slice. The full-wave survival and formal native integration-tester gates remain open.

### Focused implementation slice — batched material delivery

**Requirements and scope**

- Keep construction and automatic-restock transport requests from dispatching
  one-item drone trips while a Port shipment or production recipe is adding stock
  a few units at a time.
- Queue a construction-material transfer only when its source can supply at least
  one drone load, or the entire smaller remaining requirement. Choose a legal
  source that meets that threshold, and avoid making duplicate requests for the
  same material deficit during one simulation step.
- Apply the same minimum-load rule to automatic restock requests while preserving
  coalescing of incremental requests. Small player-issued transfers and recovery
  transfers keep their existing behavior.
- Preserve source reservations, destination expected-inbound accounting, item
  conservation, transport priorities, and the confirmed drone carry capacity.

**Acceptance and verification**

- A focused EditMode regression advances the normal opening import in 50 ms
  simulation steps while a construction site requests materials. Construction
  and automatic-restock orders are grouped into loads of five where the remaining
  demand allows it; no one-item trip is created for a growing stock pile.
- Existing manual one-item transfer, coalesced automatic-restock, construction,
  cancellation, and resource-conservation regressions pass.
- Rerun the separate Explicit normal-command GAME-01 probe and retain its NUnit
  XML and captured CLI output. Compare completed sites, active drone assignments,
  open-order count, and material flow with the prior v3 probe; the exploratory
  harness passing is not a GAME-01 pass.
- This simulation-only slice does not claim the Standalone FLOW-01, full-match,
  UI, performance, or offline-ZIP gates.

### Focused implementation slice — construction work scheduling

**Requirements and scope**

- Give a fully supplied construction site the first opportunity to reserve an
  available drone in its assigned region before new transport trips take the
  remaining idle workers for that simulation step.
- Do not interrupt active transport, reassignment-return, construction, repair,
  or demolition work. A construction site must still wait until its full material
  cost is present.
- Keep construction progress and completion before the combat resolution step so
  the confirmed event precedence remains unchanged.

**Acceptance and verification**

- A focused EditMode regression starts a ready construction site while a
  transport order is waiting. The site claims one eligible worker first, and the
  remaining workers may still serve transport.
- Existing construction, transport, repair, demolition, resource-conservation,
  and event-boundary tests pass.
- Rerun the Explicit normal-command GAME-01 probe and record when construction
  workers are assigned, facilities complete, Outpost health changes, and the
  terminal result occurs. This scheduling fix alone is not a GAME-01 pass.

### Focused implementation slice — automatic restock target reconciliation

**Requirements and scope**

- When a restock target is reduced, reconcile the destination's actual stock and
  expected inbound against the new target. Cancel only excess quantities from
  open automatic facility-to-facility restock orders; leave manual transfers,
  recovery-pile orders, and unrelated items untouched.
- Cancel unassigned automatic quantity first, then cancel only reserved trips
  that have not picked up cargo. Release source reservations and make a drone
  available if its pending-pickup trip is fully canceled. Preserve cargo already
  in transit, along with its expected-inbound accounting.
- Record target-reduction cancellations as settled cancellations, not as
  demolition-restorable work. If the target later rises, normal automatic
  restocking can queue a fresh order.
- Keep cancellation quantities, source reservations, destination expected
  inbound, order state, and delivered/in-transit stock conserved.

**Acceptance and verification**

- Focused EditMode coverage verifies unassigned and pre-pickup quantities are
  canceled, a partial pickup load keeps only the still-needed reservation, a
  fully canceled trip releases its drone, and a later target increase queues
  fresh automatic supply.
- A second regression lowers a target while cargo is in transit and confirms
  that the in-flight quantity and expected inbound remain intact. Manual orders
  remain unchanged when automatic excess is reconciled.
- Run the focused regressions first, then the full EditMode suite. Rerun the
  Explicit GAME-01 probe and compare construction-worker availability and
  terminal outcome; this logistics behavior alone is not a GAME-01 pass.
- This simulation-only slice does not claim the Standalone full-match,
  performance, UI, or offline-ZIP gates.

### Focused implementation slice — one-time enemy arrival events

**Requirements and scope**

- Record an enemy's `attacking-outpost` event only on its first arrival at the
  Outpost. Keep the confirmed 50 ms simulation tick, enemy movement, attack
  timing, and damage unchanged.
- Reuse `EnemyState.ReachedOutpost` as the arrival transition guard; do not add a
  second flag or a new diagnostics system.

**Acceptance and verification**

- A focused EditMode regression spawns one enemy, disables the starting Turret,
  waits for Outpost arrival, and advances additional ticks. The event is present
  exactly once while the Outpost continues to take damage.
- Run the focused regression and full EditMode suite. Rerun the Explicit GAME-01
  candidate and compare terminal progress and wall-clock time; the event-log
  optimization alone is not a GAME-01 pass.

### Focused implementation slice — GAME-01 normal-command match probe

**Requirements and scope**

- Start with `GameSimulation.CreateNewMatch()` and default confirmed definitions. Use only normal public simulation commands; do not inject stock, change prices/rates/wave values, or grant free facilities.
- Exercise an expansion order that builds at least two miners and two refineries, connects actual ore/crystal transfers to the Port, retains real ship departure settlement, and attempts the full 30-wave deadline with normal combat/supply commands.
- Record decision-stage game times, actual exports and departed ship cargo, highest wave, enemies defeated, outpost health, and the terminal match outcome. Keep the opening ammunition and normal ship timetable in the run.
- Treat a losing candidate strategy as diagnostic evidence, not as a successful GAME-01 result. Use the earliest failure stage to adjust only the player's command sequence/layout, keeping confirmed rules unchanged.

**Acceptance and verification**

- The probe output makes it clear whether the candidate reaches `Victory`, `Defeat`, or the deadline; a passing test harness must never present a loss as GAME-01 completion.
- Keep both exploratory probes `Explicit` so the default fast EditMode suite does not pay their simulation cost. Run the 900-second checkpoint by the exact test name with `--filter NormalCommandFullMatchProbeReports900SecondCheckpoint` for strategy iterations; run the terminal probe with `--filter NormalCommandFullMatchProbeReportsTerminalOutcome` only for a promising candidate. The terminal probe and CLI have a 900-second timeout. Retain the NUnit XML and captured CLI log for each run.
- Latest terminal candidate v45 kept the staged Drone strategy and raised Port priority to 4 after production expansion. It reached 3,000 game seconds, Wave 23, with 15/2,000 exported crystals, Outpost 3,080 HP, and 1,447 alive enemies, but the Unity CLI 900-second wall-time limit expired before a terminal result. Candidate v42 had the same checkpoint state and also timed out. GAME-01 did not pass. The 900-second diagnostic checkpoint remains the quick first step before another terminal candidate.
- A GAME-01 pass requires 30 waves reached, at least 2,000 crystals counted only after actual ship departure, departure strictly before 3,900 game seconds, and a living Outpost. A Standalone player run remains required after the core scenario succeeds.
- Record the scenario result in Plan 1 progress. The current no-command Standalone run is only a baseline: it ended in Outpost defeat at 592,858 ms, Wave 3, with zero exported crystals and 12 enemies defeated.

### GAME-01 strategy experiment — Outpost Iron target 20 after 900 seconds

**Requirements and scope**

- Starting from the normal-command staged candidate, once game time reaches
  900 seconds, reduce only the Outpost Iron restock target from 40 to 20. Keep
  its Plate target, facility priorities, production layout, ship contracts, and
  Drone-region timing unchanged.
- Let normal order reconciliation cancel only the newly excess, unpicked
  automatic Iron supply. Preserve cargo already in transit and keep the usual
  repair, construction, transport, and ship-settlement rules.
- Run to a separate 1,800-second Explicit checkpoint and report exports, Port
  Crystal stock/inbound, Outpost health and repair progress, plus Drone task
  assignments. Treat the result as a strategy experiment, not a GAME-01 pass.

**Acceptance and verification**

- The checkpoint proves the target change was applied once at 900 seconds and
  reports the resulting resource and assignment state at 1,800 seconds.
- Compare against the unchanged candidate's 0 exports at 900 seconds and 11 at
  1,800 seconds. A terminal follow-up is justified only if exports approach 600
  at 1,800 seconds, Outpost health remains at least 4,000, and repair work is
  still completing. Otherwise inspect the new orders and adjust one additional
  player command only after identifying the next bottleneck.
- Run the focused Explicit checkpoint, then the default EditMode suite. This
  experiment does not close GAME-01 or any native runtime, UI, offline-ZIP, or
  target-device performance gate.
- Candidate v46 applied the target change at exactly 900 seconds and completed
  the 1,800-second checkpoint in 108.4 seconds. It ended with 4 exports,
  Outpost 4,000 HP, 12,700 HP paid/restored, Port Crystal 0, six Production
  drones still on Port-to-Outpost Iron, and both Ore orders waiting. It did not
  improve the baseline and does not justify a terminal run.

### GAME-01 strategy experiment — stop Outpost Iron auto restock at 900 seconds

**Requirements and scope**

- Repeat the v46 normal-command candidate from a fresh match, but at 900 game
  seconds set only the Outpost Iron restock target to 0. Keep the Plate target,
  facility priorities, production layout, ship contracts, and Drone-region
  timing unchanged.
- Preserve delivered and in-transit cargo. Observe whether normal restock
  reconciliation cancels only excess automatic Iron work and returns those
  Production drones to eligible Ore and Crystal logistics.
- Stop at 1,800 game seconds and capture exports, Outpost health and repair
  status, Port Crystal stock/inbound, open transport orders, and Drone tasks.

**Acceptance and verification**

- The log confirms the target becomes 0 at 900 seconds and reports which
  automatic orders were canceled versus left in transit. Confirm all resource
  quantities remain accounted for.
- Candidate v47 stopped Outpost Iron restock at exactly 900 seconds. It reached
  Outpost defeat at game time 1,430 seconds, Wave 10, with 12 exports, six
  Crystal at the Port, and 309 alive enemies. The Explicit checkpoint reported
  the actual defeat before its 1,800-second mark. This released enough flow to
  increase exports over v46, but it starved Outpost repair and is not viable for
  a terminal run.
- Run this Explicit checkpoint and then the default EditMode suite. It is a
  strategy experiment only and does not close GAME-01 or native acceptance gates.

### GAME-01 strategy experiment — Outpost Iron buffer 10 at 900 seconds

**Requirements and scope**

- Repeat the v46 staged candidate from a fresh match and, at 900 game seconds,
  set only the Outpost Iron restock target to 10. Keep the Plate target, repair
  requests, priorities, production layout, ship contracts, and Drone-region
  timing unchanged.
- Preserve delivered and in-transit cargo. Observe order reconciliation and
  allow normal repair, transport, and ship settlement to proceed.
- Run to the 1,800-second checkpoint; report actual exports, Outpost health and
  repair progress, Port Crystal stock/inbound, Iron order totals, Ore orders,
  and Production Drone tasks.

**Acceptance and verification**

- Confirm the target becomes 10 at exactly 900 seconds and that only excess
  unassigned or pre-pickup automatic Iron quantities are canceled; picked-up
  cargo remains in transit.
- Require more than v46's 4 exports at 1,800 seconds while the Outpost remains
  alive with repair progress. A terminal follow-up still requires an export pace
  that projects to 2,000 before the deadline; with 0 at 900 seconds, that means
  roughly 600 exports by 1,800 seconds. Do not spend a terminal probe if the
  projection or defense fails.
- Run this Explicit checkpoint and the default EditMode suite. This is a
  strategy experiment only and does not close GAME-01 or native acceptance gates.
- Candidate v48 completed the 1,800-second Explicit checkpoint with 10 exports,
  Outpost 750 HP, 9,450 HP paid/restored, Port Crystal 0, and 122 Ore in
  production stock. Three Production drones remained on Port-to-Outpost Iron,
  two on Port-to-Ironworks Iron, and two on Plate delivery; both Ore-to-Refinery
  orders had no assigned worker. This still projects far below 2,000 exports
  and leaves the Outpost critically low, so it does not justify a terminal run.

### Next GAME-01 strategy experiment — lower Outpost logistics priority at 900 seconds

**Requirements and scope**

- Repeat the v45 staged candidate from a fresh match and, at exactly 900 game
  seconds, lower only the Outpost facility priority from 5 to 3. Keep its Iron
  target at 40, Plate target at 10, repair requests, refinery priorities,
  production layout, ship contracts, and Drone-region timing unchanged.
- Preserve all active transport trips and stock. Let normal assignment priority
  selection determine whether Production workers move from Outpost restock to
  Port-bound Crystal and Miner-to-Refinery Ore orders.
- Stop at 1,800 seconds. Capture exports, Outpost health and repair progress,
  Port Crystal stock/inbound, open orders, and Drone tasks.

**Acceptance and verification**

- Confirm the Outpost priority is changed once at 900 seconds; report which
  shipments complete after the change and which remain in progress.
- Require materially more than v46's 4 exports while preserving the Outpost
  above 4,000 HP with repair work continuing. A terminal run still requires an
  export projection close to 2,000 by the deadline. Do not start one if either
  the logistics or defense result fails.
- Run this Explicit checkpoint and the default EditMode suite. This is a
  strategy experiment only and does not close GAME-01 or native acceptance gates.
- Candidate v49 lowered the Outpost priority from 5 to 3 at exactly 900 seconds.
  It reached Defeat at t=1,490/Wave 10 with 8 exports, Port Crystal 3, and 309
  alive enemies. Six Production drones were assigned to the older Port-to-
  Ironworks Iron order; only one was on a Refinery-to-Port Crystal trip. Ore
  and Outpost Iron orders waited. This did not preserve the Outpost or improve
  exports enough for a terminal probe.

### Next GAME-01 strategy experiment — prioritize Ore intake at 900 seconds

**Requirements and scope**

- Start from the v49 staged candidate: Outpost priority3, Outpost Iron target40,
  Outpost Plate target10, Port priority4, and Ironworks/Refinery priorities3.
- At exactly 900 game seconds, raise only both Refineries' priorities from3 to4.
  Keep the Outpost priority and stock targets, Port priority, Ironworks priority,
  repair requests, contracts, production layout, and Drone-region timing
  unchanged.
- Run to the 1,800-second checkpoint and observe both Miner-to-Refinery Ore
  orders, Refinery-to-Port Crystal shipments, Outpost HP and repair materials,
  exports, and Production Drone tasks. Do not recall active trips or alter stock.

**Acceptance and verification**

- Confirm both Refinery priorities become4 at exactly 900 seconds.
- Require both Ore loads to complete and Crystal to reach the Port, exports to
  exceed v49's 8, and the Outpost to remain alive with repair continuing. A
  terminal run is justified only if the export pace projects close to 2,000 by
  the deadline and the Outpost keeps a safe health margin.
- Run this Explicit checkpoint and then the default EditMode suite. This
  experiment does not close GAME-01 or any native runtime acceptance gate.
- Candidate v50 raised both Refinery priorities to4 while keeping the Outpost
  at3. It had 2 exports/2,900 Outpost HP at t=1,200, 28 exports/900 HP at
  t=1,500, and reached Defeat at t=1,690/Wave 12 with 42 exports. Multiple
  Crystal trips and one Ore trip were active, but the Ironworks-to-Outpost Plate
  order was still waiting while the Outpost had no Plate stock. Ore/Crystal
  throughput improved; repair supply then failed. No terminal probe was run.

### Next GAME-01 strategy experiment — restore Outpost Plate priority

**Requirements and scope**

- Repeat the v50 candidate: at 900 seconds raise both Refinery priorities from3
  to4, while Outpost priority is3, its Iron target40, Plate target10, and Port
  priority4.
- At that same 900-second decision point, change only the Outpost priority from3
  to4. Keep all stock targets, repair requests, production settings, ship
  contracts, and Drone-region timing unchanged.
- Run to the 1,800-second checkpoint; inspect Outpost Plate delivery, Ore and
  Crystal transfers, exports, health, repairs, and Drone assignment state.

**Acceptance and verification**

- Confirm both Refinery and Outpost priority changes apply at exactly 900
  seconds. Confirm the existing Ironworks-to-Outpost Plate order gets a worker
  without stopping the Miner-to-Refinery and Refinery-to-Port flow.
- Require the Outpost to remain alive with Plate and repair progress, both Ore
  loads to complete, Crystal to reach Port, and exports to exceed v50's 42 by
  the 1,800-second mark. Do not run a terminal probe unless the export pace
  projects close to 2,000 by the deadline with a safe Outpost health margin.
- Run this Explicit checkpoint and then the default EditMode suite. This
  experiment does not close GAME-01 or any native runtime acceptance gate.
- Candidate v51 changed Outpost and both Refinery priorities to4 at t=900. It
  had 34 exports at t=1,500 and then reached Defeat at t=1,590 with 34 exports,
  Port Crystal 14, Outpost Iron 40, and Outpost Plate 0. Crystal and Ore trips
  proceeded, but the older Port-to-Ironworks Iron order stayed waiting, so the
  Ironworks could not refill Outpost Plate. This improved exports over v50 but
  did not sustain repair; no terminal probe was run.

### Next GAME-01 strategy experiment — prioritize Ironworks input

**Requirements and scope**

- Candidate v52 repeated v51 and raised Ironworks priority from3 to4 at 900
  seconds without a reset. It reached Defeat at t=1,290/Wave 9 with 4 exports,
  Outpost Iron40, and Outpost Plate0. The Port-to-Ironworks Iron order grew to
  q153 and six Production drones remained assigned to it; Plate, Ore, and
  Crystal orders waited. A permanent priority4 does not work.

### Next GAME-01 strategy experiment — temporary Ironworks input priority boost

**Requirements and scope**

- Repeat the v51 candidate: at 900 seconds set Outpost priority4 and both
  Refinery priorities4. Keep Outpost Iron target40, Plate target10, Port
  priority4, contracts, repair requests, production layout, and Drone-region
  timing unchanged.
- At 900 seconds, raise only Ironworks priority from3 to4. Once the Outpost has
  at least5 Plate in stock or picked up into an active in-transit load, restore
  Ironworks priority to3. Do not cancel or edit any existing order; preserve
  delivered and in-transit cargo.
- Run to the 1,800-second checkpoint and inspect Iron delivery, Plate output and
  arrival, Outpost repair and health, Ore/Crystal shipments, exports, and Drone
  assignments. Log the exact time of the priority reset.

**Acceptance and verification**

- Confirm the Ironworks priority changes to4 at exactly 900 seconds and resets
  to3 only after at least5 Outpost Plate is stocked or actually picked up for
  delivery. The waiting Iron order must be assigned/delivered without editing
  the order or stock.
- Require Outpost Plate to arrive and repairs to continue with the Outpost alive;
  retain Ore/Crystal throughput and exports above v51's 34 by t=1,800. A
  terminal probe requires a pace projecting close to 2,000 by the deadline and
  a safe Outpost health margin.
- Run this Explicit checkpoint and then the default EditMode suite. This
  experiment does not close GAME-01 or any native runtime acceptance gate.
- Candidate v53 still reached Defeat at t=1,290 with 4 exports, Outpost Iron40,
  and Plate0. The Plate load never entered transit, so Ironworks priority stayed
  at4; six workers remained on the growing Port-to-Ironworks Iron order. The
  Ironworks-to-Outpost Plate q10 order waited while Ironworks-to-AmmunitionFactory
  Plate q2 was in progress. The temporary boost cannot release workers until the
  competing Plate consumer is deprioritized.

### Next GAME-01 strategy experiment — prioritize Outpost Plate over ammunition restock

**Requirements and scope**

- Repeat candidate v53 exactly: at 900 seconds set Outpost and both Refinery
  priorities to4; temporarily raise Ironworks from3 to4 and restore it to3 only
  after the Outpost has at least5 Plate in stock or picked up into an active
  in-transit load.
- At 900 seconds, lower only the core AmmunitionFactory priority from5 to3.
  Production completion sets it to5 before the decision point. Keep its Plate
  restock target at5 and preserve every other target, contract, repair request,
  construction command, and Drone-region change from v53.
- Run to terminal outcome or the 1,800-second checkpoint. Inspect whether the
  Outpost Plate order receives a worker, the Ironworks priority reset time,
  Outpost survival and repair, Ore/Crystal transfers, exports, and remaining
  drone assignments.

**Acceptance and verification**

- Confirm AmmoFactory changes from priority5 to3 exactly at t=900, and the other
  candidate commands match v53. Confirm an Outpost Plate load is picked up and
  the Ironworks reset happens only after the five-Plate buffer condition.
- Require the Outpost to remain alive with repair underway, while Ore/Crystal
  transport continues and exports exceed v53's 4 by t=1,800. Run a terminal
  probe only if the observed export pace projects close to 2,000 by the deadline
  with a safe Outpost health margin.
- For this test-harness-only strategy iteration, run the single filtered
  Explicit checkpoint and preserve its NUnit XML and Unity CLI log. After the
  strategy/helper stabilizes, run the default EditMode suite once; rerun it
  sooner if production code changes. This keeps each strategy feedback loop
  focused without closing any GAME-01 or native runtime acceptance gate.
- Candidate v54 passed its filtered Explicit EditMode test (1/1, 111.36 s).
  It lowered AmmoFactory priority5→3 at t=900; the streamed run output showed
  Ironworks priority resetting to3 at t=1,155 after an Outpost Plate pickup.
  At t=1,200 the Outpost had 2,900 HP and 5,600 paid/restored repair HP; at
  t=1,500 it had 3,900 HP, 9,600 paid/restored repair HP, 8 exports, Port
  Crystal4, and Crystal6 inbound. This improved on v53's 4 exports and kept the
  Outpost alive through t=1,500. The NUnit XML is saved; a separate raw CLI log
  was not captured for this run. No terminal victory or GAME-01 pass is claimed.

### GAME-01 strategy experiment — restore Ironworks priority after a source Plate buffer

**Requirements and scope**

- Repeat v54 exactly: at 900 seconds set Outpost and both Refineries to
  priority4, set AmmoFactory to priority3, and temporarily raise Ironworks from3
  to4. Keep targets, contracts, repair requests, build orders, and region changes
  unchanged.
- Change only the temporary Ironworks reset condition: restore it to priority3
  once Ironworks has at least10 available Plate in stock. Do not wait for the
  Outpost to receive or pick up Plate; do not cancel, edit, or recall any order
  or active cargo.
- Run to a terminal outcome or the 1,800-second diagnostic checkpoint. Record
  the reset time and inspect Outpost Plate/repair, the older Port-to-Ironworks
  Iron backlog, Ore and Crystal transfers, exports, and Drone assignments at
  t=900, 1,200, 1,500, and the final checkpoint.

**Acceptance and verification**

- Confirm the Ironworks reset occurs only after its available Plate stock reaches
 10, then confirm an Outpost Plate shipment is assigned and picked up while
  Ore/Crystal logistics continue.
- Require the Outpost to remain alive with repair progress and exports to exceed
  v54's 8 by t=1,800. Run a terminal probe only if exports project close to 2,000
  by the deadline and the Outpost keeps a safe health margin.
- Run the single filtered Explicit checkpoint and save both its NUnit XML and
  complete Unity CLI stdout using `Tee-Object`. Run the default EditMode suite
  after this strategy/helper stabilizes, or sooner after any production-code
  change. GAME-01 and native runtime acceptance gates remain open.
- Candidate v55 passed its filtered Explicit EditMode checkpoint (1/1, 112.70 s)
  and reached t=1,800 with outcome Running, 33 exports, Outpost 2,510 HP, and
  501 alive enemies. The Ironworks priority reset at t=905 when its available
  Plate reached10. Exports rose from8 at t=1,200 to21 at t=1,500 and33 at
  t=1,800; the Outpost had 3,000 paid/restored repair HP at the final checkpoint
  but was WaitingForMaterials with Plate0 and no expected Plate inbound. At
  t=1,200, Outpost Plate expected inbound was10; the final Ironworks Plate stock
  was6 and its automatic Plate order to AmmoFactory still waited at q5. Ore and
  Crystal loads were active, with 34 Crystal expected inbound to Port. This is
  not terminal GAME-01 acceptance.

### GAME-01 strategy experiment — reduce the AmmunitionFactory Plate reserve

**Requirements and scope**

- Repeat v55 exactly: at t=900 set Outpost and both Refineries to priority4,
  AmmoFactory priority5→3, and temporarily raise Ironworks to4. Restore
  Ironworks to3 only when its available Plate stock reaches10.
- At t=900, lower only the core AmmoFactory Plate restock target from5 to1.
  Keep all other targets, priorities, repairs, build orders, contracts, and
  Drone-region changes unchanged. Let the normal restock-target reconciliation
  shrink unassigned excess; preserve reserved and already picked-up cargo.
- Run to terminal outcome or t=1,800. Inspect AmmoFactory's reconciled Plate
  order and ammunition output, Outpost Plate/repair/health, Ore and Crystal
  traffic, exports, and Production Drone assignments at t=900, 1,200, 1,500,
  and the final checkpoint.

**Acceptance and verification**

- Confirm the AmmoFactory target changes5→1 at t=900 and that any unassigned
  automatic Plate order is reconciled to the new target without recalling
  in-transit cargo. Confirm an Outpost Plate shipment is picked up and arrives.
- Require the Outpost to remain alive with repair progress through t=1,800 and
  exports to exceed v55's 33. Record AmmoFactory and Outpost ammunition so the
  reduced production buffer's defense cost is visible. A terminal probe still
  requires export pace close to2,000 by the deadline and a safe Outpost health
  margin.
- Run only the filtered Explicit checkpoint for this scenario-only iteration;
  preserve NUnit XML and full Unity CLI stdout with `Tee-Object`. Run the default
  EditMode suite after the strategy/helper stabilizes, or sooner after any
  production-code change. GAME-01 and native runtime acceptance gates remain
  open.
- Candidate v56 passed the filtered Explicit checkpoint (1/1, 114.46 s) and
  reached t=1,800 Running with 33 exports and Outpost 3,510 HP. The t=900 target
  change reconciled the unassigned AmmoFactory Plate order from q5 to q1. The
  Outpost had 3,900 HP and 6,600 paid/restored repair HP at t=1,200; at t=1,500
  it had 2,510 HP and 21 exports. At t=1,800 it had 4,000 paid/restored repair
  HP, but repair was WaitingForMaterials with Plate0/no inbound and ammunition
  stock0. Relative to v55, exports were unchanged while Outpost health and
  restored repair improved by1,000. The single-variable target reduction helped
  the repair buffer but did not improve export pace or close GAME-01.

### GAME-01 strategy experiment — lower Outpost priority after its repair buffer is loaded

**Requirements and scope**

- Repeat v56 exactly: at t=900 set Outpost and both Refineries to priority4,
  AmmoFactory priority5→3 and Plate target5→1; temporarily raise Ironworks to4,
  then reset it to3 when available Ironworks Plate reaches10.
- Once Outpost Iron stock plus expected inbound reaches40 and Plate stock plus
  expected inbound reaches10, and game time is at least1,200 seconds, lower only
  the Outpost priority from4 to3. Expected inbound includes queued/reserved
  shipments, so the change can occur before every crate is physically delivered.
  Do not cancel or recall any shipment; retain the buffer orders and all other
  commands from v56.
- Run to terminal outcome or t=1,800. Inspect Port-to-Ironworks Iron assignment,
  Outpost Plate and repair replenishment, Ore/Crystal traffic, exports, Outpost
  health, ammunition, and Production Drone tasks at t=1,200, 1,500, and final.

**Acceptance and verification**

- Confirm the Outpost priority changes once from4 to3 only after stock plus
  expected inbound meets the 40-Iron and 10-Plate buffer condition. Confirm the
  older Port-to-Ironworks
  order receives a worker and an Outpost Plate shipment is picked up without
  disrupting Ore/Crystal transport.
- Require exports to exceed v56's33 by t=1,800 while the Outpost remains alive
  and continues restoring health. Compare ammunition stock and Outpost defense
  with v56's zero Outpost ammunition at t=1,800. Run a terminal probe only when
  export pace projects close to2,000 by the deadline and Outpost HP has a safe
  margin.
- Run only the filtered Explicit checkpoint and save NUnit XML plus complete
  Unity CLI stdout. Run the default EditMode suite after the strategy/helper
  stabilizes, or sooner after production code changes. GAME-01 and native runtime
  acceptance gates remain open.
- Candidate v57 applied the Outpost priority4→3 change at t=1,200 after the
  stock-plus-expected-inbound repair buffer reached Iron40/Plate10. Its filtered
  Explicit test passed in89.23 s, but the match reached Defeat at t=1,690/Wave12
  with46 exports and Outpost0 HP. At t=1,500 it had 28 exports, Outpost1,900
  HP, and 7,600 paid/restored repair HP. Refineries and the Port-to-Ironworks
  input received more workers, but lowering the entire Outpost priority did not
  preserve it through the checkpoint. No terminal victory is claimed.

### GAME-01 strategy experiment — reduce Outpost Iron restock after its repair buffer

**Requirements and scope**

- Repeat v56 exactly: at t=900 set Outpost and both Refineries to priority4,
  AmmoFactory priority5→3 and Plate target5→1; temporarily raise Ironworks to4
  and restore it to3 once available Ironworks Plate reaches10.
- Once Outpost Iron stock plus expected inbound reaches40 and Plate stock plus
  expected inbound reaches10, and game time is at least1,200 seconds, lower
  only the Outpost Iron restock target from40 to20. Keep Outpost priority4 so
  Plate and repair orders retain their existing priority. Do not directly cancel
  orders or recall cargo; let normal target reconciliation preserve reserved
  and in-transit shipments.
- Run to terminal outcome or t=1,800. Observe whether the unassigned
  Port-to-Outpost Iron backlog stops growing, whether Outpost Plate/repair
  continues, and whether released drones increase Ore/Crystal and Ironworks
  traffic. Record the same 1,200/1,500/final health, repair, export, stock, and
  order-assignment fields.

**Acceptance and verification**

- Confirm the Iron target changes40→20 only after the 40-Iron/10-Plate
  stock-plus-expected-inbound buffer is present, and confirm reserved/in-transit
  Iron remains intact while unassigned automatic demand is reconciled.
- Require Outpost survival with repair progress through t=1,800 and exports
  above v56's33. Compare Outpost Plate and ammunition supply with v56; do not
  start a terminal probe unless export pace projects close to2,000 by the
  deadline with a safe Outpost health margin.
- Run one filtered Explicit checkpoint and save NUnit XML and full Unity CLI
  stdout. Run the default EditMode suite after this helper stabilizes or sooner
  after production-code changes. GAME-01 and native runtime acceptance gates
  remain open.
- Candidate v58 passed its filtered Explicit checkpoint (1/1, 112.39 s) and
  reached t=1,800 Running with36 exports. Outpost priority remained4; after its
  Iron40/Plate10 stock-plus-expected-inbound buffer, its Iron target changed40→20
  and the already moving cargo was preserved. At t=1,500 the Outpost had2,510
  HP, Plate5, and an EnRoute repair worth1,000 HP; at t=1,800 it had510 HP,
  1,000 paid/restored repair HP, Plate0, and ammunition5. This added3 exports
  over v56 and kept the Outpost alive, but the 510-HP margin is too small for a
  terminal run. XML and full CLI stdout are saved.

### GAME-01 strategy experiment — reduce Outpost Iron target after its repair buffer

**Requirements and scope**

- Repeat v58 exactly, including Outpost priority4, AmmoFactory priority3 and
  Plate target1, and the t=905 Ironworks source-Plate reset.
- After Outpost Iron stock plus expected inbound reaches40 and Plate stock plus
  expected inbound reaches10, and time is at least1,200 seconds, lower only the
  Outpost Iron restock target from40 to30. Preserve Outpost priority4 and all
  reserved or in-transit cargo; let normal target reconciliation handle only
  unassigned demand.
- Run to t=1,800 or terminal outcome. Compare Outpost HP, repair state/materials,
  Outpost Plate and ammunition, exports, Crystal at Port/inbound, and drone
  assignments against v58.

**Acceptance and verification**

- Confirm the target changes40→30 only after the buffer is present and existing
  cargo remains intact. Confirm the unassigned Outpost Iron demand no longer
  absorbs the same share of Production workers.
- Require survival through t=1,800 with more than v58's510 HP and continued
  repair progress, while exports remain above v56's33. Measure the ammunition
  and turret consequences. Do not start a terminal probe without a materially
  safer Outpost health margin and a projected export pace close to2,000.
- Run the focused Explicit test only and preserve NUnit XML plus complete Unity
  CLI stdout. Run the default EditMode suite after the strategy helper stabilizes
  or sooner after production changes. GAME-01 and native runtime acceptance
  gates remain open.
- Candidate v59 passed its filtered Explicit checkpoint (1/1, 108.95 s) and
  reached t=1,800 Running with39 exports. The Outpost stayed at priority4; its
  Iron target changed40→30 after the Iron40/Plate10 stock-plus-expected-inbound
  buffer. At t=1,500 it had2,510 HP, Iron30, Plate1, and a WaitingForMaterials
  repair; at t=1,800 it had1,510 HP, 2,000 paid/restored repair HP, Iron30,
  Plate0, and Outpost ammunition20. This improved on v58 by3 exports and1,000
  HP, while retaining priority for Plate and repair. The 1,510-HP margin is
  better but still not enough to justify a terminal probe. XML and full CLI
  stdout are saved.

### GAME-01 dose-response experiment — reduce Outpost Iron target after its repair buffer

**Requirements and scope**

- Repeat v59 exactly, including priority4, AmmoFactory priority3/Plate target1,
  and the t=905 Ironworks source-Plate reset.
- After the same Iron40/Plate10 stock-plus-expected-inbound buffer is present at
  or after t=1,200, lower only the Outpost Iron target from40 to35. Preserve
  priority4 and all reserved/in-transit cargo.
- Run to t=1,800 or terminal outcome. Record Outpost HP, repair status and
  paid/restored HP, Iron/Plate/ammunition, exports, Port Crystal, and worker
  assignments at t=1,500 and t=1,800.

**Acceptance and verification**

- Confirm target40→35 applies only after the repair buffer is present and
  reconciles only unassigned Iron demand.
- Require survival through t=1,800 with more than v59's1,510 HP, repair progress
  above v59's2,000 HP, and exports above v58's36. Measure ammunition and turret
  consequences; do not start a terminal probe without a materially safer health
  margin and a projected export pace close to2,000.
- Run one filtered Explicit test and save NUnit XML plus complete Unity CLI
  stdout. The helper's default EditMode suite is scheduled once after the
  parameter sweep stabilizes, or sooner after production code changes. GAME-01
  and native runtime acceptance gates remain open.
- Candidate v60 passed its filtered Explicit checkpoint (1/1, 110.95 s) and
  reached t=1,800 Running with32 exports. At t=1,500 it had22 exports, Outpost
  2,510 HP, Iron35, Plate1, and no paid repair; at t=1,800 it had2,110 HP,
  2,600 paid/restored repair HP, Iron35, Plate0, and ammunition20. This kept the
  Outpost alive and improved HP by600 over v59, but exports fell from39 to32 and
  no Plate remained at the final checkpoint. The target35 dose did not meet its
  export criterion; it is not a terminal candidate. XML and full CLI stdout
  are saved.

### GAME-01 strategy experiment v61 — reprioritize Ironworks input after the repair buffer

**Requirements and scope**

- Repeat v59 exactly: at t=900 set Outpost/Refineries to priority4, AmmoFactory
  to priority3 with Plate target1, temporarily boost Ironworks and reset it to3
  when its available Plate reaches10; at t=1,200 lower Outpost Iron target40→30
  after its Iron40/Plate10 stock-plus-expected-inbound buffer.
- At that same t=1,200 decision, raise only Ironworks priority3→4 and keep it at4
  through the checkpoint. Do not cancel or edit the existing Port-to-Ironworks
  Iron order or any Outpost shipment.
- Run to terminal outcome or t=1,800. Inspect whether the Ironworks order gets a
  worker, Ironworks Iron/Plate stock and cycles, Outpost Plate arrival/repair/HP,
  Crystal and Ore task assignments, exports, and ammunition.

**Acceptance and verification**

- Confirm the priority change occurs once after the repair buffer is present,
  and confirm Port-to-Ironworks Iron receives workers without losing all
  Refinery-to-Port Crystal flow.
- Require the Outpost to remain alive above v59's1,510 HP with repair activity
  and Outpost Plate available or inbound at t=1,800. Require exports to remain
  at least v59's39; otherwise record the trade-off and reject the profile.
- Run one filtered Explicit checkpoint and save NUnit XML plus full Unity CLI
  stdout. Run the default EditMode suite after this new helper path stabilizes
  or sooner after production-code changes. GAME-01 and native runtime acceptance
  gates remain open.
- Candidate v61 passed its filtered Explicit checkpoint (1/1, 102.51 s), but the
  simulated match reached Defeat at t=1,785/Wave13 with16 exports and the Outpost
  destroyed. At t=1,500 it had2,850 HP, Iron29 inbound, Plate10, and no active
  repair. At defeat, Ironworks held Plate163 while all seven Production drones
  were assigned to the growing Port→Ironworks Iron order; Crystal throughput had
  stalled. Raising Ironworks priority4 without capping its automatic Iron demand
  is rejected. NUnit XML and complete CLI stdout are saved.

### GAME-01 strategy experiment v62 — cap Ironworks Iron demand after the repair buffer

**Requirements and scope**

- Repeat v61 exactly, including the v59 Outpost/Refinery/AmmoFactory setup, the
  Ironworks priority3→4 increase at the repair buffer, and the Outpost Iron
  target40→30 adjustment.
- At that same post-buffer decision, lower only Ironworks' Iron restock target
  from20 to5. Preserve the Ironworks priority4 boost, existing picked-up cargo,
  and all Outpost shipments. Allow automatic restock reconciliation to trim only
  unassigned and still-cancellable cargo above the new target.
- First run the filtered Explicit profile to the t=1,500 decision-stage screen.
  Inspect whether the old Port→Ironworks order still captures nearly all
  Production drones, whether Crystal transport resumes, Ironworks Plate
  production continues, and Outpost repair/export pace improves. If the screen
  is promising or ambiguous, rerun the same profile from t=0 to terminal outcome
  or t=1,800; do not claim acceptance from the screen.

**Acceptance and verification**

- Confirm the target change occurs once after the Iron40/Plate10 repair buffer
  and inspect the resulting reserved, in-transit, and unassigned quantities.
- Require survival through t=1,800 with an Outpost health margin above v59's
  1,510 HP, repair activity, Plate available or inbound, and exports at least
  v59's39. Otherwise record the trade-off and reject the profile; a Passed
  diagnostic test is not a GAME-01 win.
- Save NUnit XML and complete Unity CLI stdout for each screen/full run. Use the
  1,500-second screen only for strategy triage, not as a pass/fail gate; rerun
  full EditMode after the helper path stabilizes or sooner after production-code
  changes. GAME-01 and native runtime acceptance gates remain open.
- Candidate v62 passed the filtered t=1,500 screen (1/1, 61.01 s) with20 exports,
  Outpost HP3,620, 1,000 paid/restored repair HP, Port Crystal1, and Outpost
  ammunition0. Compared with v59's t=1,500 state (24 exports, HP2,510, no paid
  repair, ammo20), export and defense signals disagreed, so the profile was
  ambiguous and received the full follow-up. The t=1,800 filtered checkpoint
  passed1/1 in107.17 s but remained Running with26 exports, Outpost HP1,620,
  2,000 paid/restored repair HP, Iron10 plus20 inbound, Plate0 plus5 inbound,
  ammo0, and Port Crystal10. v59 had39 exports and ammo20 at1,510 HP with the
  same2,000 repair HP. The target5 cap preserved survival/repair but lost13
  exports and all Outpost ammunition; it is rejected and does not prove GAME-01.
  XML and full CLI stdout are saved for both stages.

### GAME-01 strategy experiment v63 — raise the capped Ironworks Iron target to10

**Requirements and scope**

- Repeat v62 exactly: keep Ironworks priority4, Outpost Iron target30, the
  AmmoFactory Plate target1, refinery/outpost priority4, and the source-Plate
  reset. At the same t=1,200 repair-buffer trigger, change only Ironworks Iron
  target20→10 instead of20→5.
- First run the filtered Explicit profile to the t=1,500 decision-stage screen.
  Inspect the Port→Ironworks order and drone assignments, Ironworks Iron/Plate
  cycle, Crystal exports and inbound, Outpost repair/materials/ammunition, and
  Turret ammunition deliveries. Rerun from t=0 to t=1,800 if the screen is
  promising or ambiguous.

**Acceptance and verification**

- Confirm the Ironworks Iron target changes once after the Outpost Iron40 and
  Plate10 buffer, and that reconciliation trims unassigned/cancellable demand
  without altering picked-up cargo.
- For the full checkpoint, require the Outpost to survive above v59's1,510 HP,
  continue repair, keep Plate available or inbound, recover to at least39 exports,
  and hold at least20 Outpost ammunition. Otherwise record the trade-off and
  reject the profile. A Passed diagnostic run or t=1,500 screen is not a GAME-01
  win.
- Preserve NUnit XML and full Unity CLI stdout for each stage. Rerun the default
  EditMode suite once the strategy helper sweep stabilizes. GAME-01 and native
  runtime acceptance gates remain open.
- Candidate v63 passed the filtered t=1,500 screen (1/1, 63.01 s) with18 exports,
  Outpost HP3,940, 1,250 paid/restored repair HP, Plate3 plus7 inbound, and
  ammunition0. Ironworks Plate was13 and Port Crystal2; six Production drones
  were assigned to Port→Outpost Iron while Crystal orders waited. The higher
  Outpost health/repair offset the weaker export flow, so the screen was
  ambiguous and received a full follow-up. The t=1,800 checkpoint passed1/1 in
  102.17 s but remained Running with20 exports, Outpost HP3,190, 3,500
  paid/restored repair HP, Iron0 plus30 inbound, Plate2 plus8 inbound, ammunition
  10, Turret ammunition9, and Ironworks Plate38. Port Crystal was2 plus4 inbound.
  This dose response improved HP, repair, Plate, and ammunition over v62, but
  exports fell by6 to20; it remains far below v59's39 and is rejected for the
  current target. XML and full CLI stdout are saved.

### GAME-01 strategy experiment v64 — keep Ironworks at priority3 after the repair buffer

**Requirements and scope**

- Repeat v62 exactly: retain Ironworks Iron target5, Outpost Iron target30,
  AmmoFactory Plate target1, Refinery/Outpost priority4, and the source-Plate
  reset. Change only the t=1,200 Ironworks priority decision: keep it at3 after
  the repair buffer instead of raising it to4. The source-Plate reset already
  returns it to3 earlier in the match; omit v62's later boost.
- First run the filtered Explicit profile to the t=1,500 screen. Inspect whether
  the existing Port→Ironworks Iron order loses workers to Outpost repair/Plate
  and Refinery→Port Crystal work, while its accumulated Plate continues to
  support the Outpost. Rerun from t=0 to t=1,800 if the screen is promising or
  ambiguous.

**Acceptance and verification**

- Confirm the Ironworks priority remains3 after the buffer and Iron target5 is
  applied once; confirm reserved and picked-up cargo stays intact.
- For the full checkpoint, require survival above v59's1,510 HP with active
  repair, Outpost Plate available or inbound, exports at least39, and Outpost
  ammunition at least10. Otherwise record the trade-off and reject the profile.
  Neither the screen nor a Passed diagnostic test proves GAME-01.
- Preserve XML and complete CLI stdout for each stage. Rerun the default
  EditMode suite after this strategy helper sweep stabilizes; GAME-01 and native
  runtime acceptance gates remain open.
- Candidate v64 passed the t=1,500 screen (1/1, 57.31 s) with24 exports,
  Outpost HP2,510, no paid repair, ammo20, and multiple Crystal trips in progress.
  The full t=1,800 checkpoint passed1/1 in104.30 s and remained Running with39
  exports, Outpost HP1,510, 2,000 paid/restored repair HP, Iron30, Plate0, ammo20,
  Turret ammo8, and Port Crystal8 plus15 inbound. These terminal checkpoint
  metrics match v59; the target5/priority3 variation did not improve the margin
  or add Plate for the next repair, so it is rejected. XML and full CLI stdout
  are saved.

### GAME-01 strategy experiment v65 — boost Ironworks only through one Outpost Plate load

**Requirements and scope**

- Repeat v64, including Ironworks Iron target5 and its priority3 baseline. At
  the same t=1,200 Outpost Iron40/Plate10 buffer, keep the target5 cap and raise
  Ironworks priority3→4.
- Capture Outpost Plate in-transit quantity at the boost point. After a fresh
  five-unit Plate load is picked up for the Outpost (in-transit rises by5 from
  that snapshot), return Ironworks priority to3 once. Preserve reserved and
  picked-up cargo; do not wait on Plate stock that was already present before
  the boost.
- First run the filtered Explicit profile to the t=1,500 screen. Confirm the
  priority-reset trigger and inspect Outpost Plate delivery/repair, Crystal
  transport, Ironworks stock, and drone assignments. Rerun from t=0 to t=1,800
  if promising or ambiguous.

**Acceptance and verification**

- Confirm the priority increase and reset each happen once after the repair
  buffer and after a newly picked-up five-unit Outpost Plate load, respectively.
  Confirm in-transit cargo remains conserved after the reset.
- At t=1,800, require survival above v59's1,510 HP, continued repair, Plate
  available or inbound, exports at least39, and Outpost ammunition at least20.
  Otherwise record the trade-off and reject the profile; screens and Passed
  diagnostic tests do not prove GAME-01.
- Preserve NUnit XML and full Unity CLI stdout for each stage. Run the default
  EditMode suite once this helper path stabilizes. GAME-01 and native runtime
  acceptance gates remain open.
- Candidate v65 passed the t=1,500 screen (1/1, 61.38 s) with21 exports,
  Outpost HP3,620, repair1,000, and ammunition0. The priority reset logged at
  t=1,220 after Outpost Plate in-transit rose from0 to5. However, the t=1,200
  snapshot already had an Ironworks→Outpost Plate trip with5 reserved and0 in
  transit, so the aggregate trigger may have observed a pre-buffer assignment
  reaching pickup rather than a new assignment caused by the boost. The full
  follow-up passed1/1 in104.31 s but reached t=1,800 Running with27 exports,
  Outpost HP620, repair1,000, ammo5, Turret ammo11, and150 cumulative ammo
  deliveries to Turrets. This is worse than v64 and is rejected. XML and full
  CLI stdout are saved; a future load-trigger test must count pickup events
  beyond the t=1,200 reserved-quantity snapshot before attributing an effect to
  the boost.

### GAME-01 strategy experiment v66 — count only Plate pickups beyond prior reservations

**Requirements and scope**

- Repeat v64 exactly: keep Ironworks Iron target5, Outpost Iron target30, and
  Ironworks priority3 after the t=1,200 repair buffer.
- At the buffer, snapshot the reserved quantity on matching automatic
  Ironworks→Outpost Plate orders, then raise Ironworks priority3→4. Count
  subsequent `picked-up` events for those matching orders. Restore priority3
  only after cumulative post-buffer pickup quantity exceeds the reserved
  snapshot, proving at least one load beyond work already assigned before the
  boost reached its source. Preserve all cargo.
- First run the filtered Explicit profile to the t=1,500 screen. Log the
  baseline, each matching pickup, cumulative pickup quantity, and whether the
  reset fired. If the new-load trigger has not fired or the export/defense
  trade-off is unclear, inspect assignment and Plate-flow evidence before
  deciding whether to continue. Rerun from t=0 to t=1,800 when promising or
  ambiguous.

**Acceptance and verification**

- Confirm the reset cannot be caused only by a trip already reserved at t=1,200,
  and that the priority increase/reset each happen once. Verify in-transit cargo
  remains conserved after the reset.
- For the full checkpoint, require survival above v59's1,510 HP, continued
  repair, Plate available or inbound, exports at least39, and Outpost ammunition
  at least20. Otherwise record the trade-off and reject the profile. A screen or
  Passed diagnostic test never proves GAME-01.
- The default EditMode suite was rerun after helper stabilization:53 passed,0
  failed,28 Explicit probes skipped in8.77 s. GAME-01 and native runtime
  acceptance gates remain open.
- The t=1,500 screen passed1/1 in62.67 s. At t=1,200 the reserved baseline was5;
  matching order `transport-59` produced two5-unit pickup events, reaching10,
  and priority returned to3 at t=1,240. The screen ended Running with21 exports,
  Outpost HP3,620, 1,000 repaired HP, and ammunition0.
- The full follow-up passed1/1 in105.56 s but remained Running at t=1,800 with27
  exports, Outpost HP620, repair active at1,000 HP, Plate0 available/inbound,
  ammunition5, Turret ammunition11,150 cumulative ammunition deliveries to
  Turrets, and Port Crystal9 plus10 inbound. It fails the experiment's endpoint
  thresholds for HP, Plate, exports, and Outpost ammunition; reject v66. Its
  endpoint matches rejected v65, so counting beyond the reservation baseline
  fixed trigger attribution but did not improve the strategy. The diagnostic
  pass does not prove GAME-01.
- Saved NUnit XML and complete CLI stdout for the t=1,500 screen, t=1,800
  checkpoint, and default EditMode suite under
  `ProjectC/Builds/Verification-fast/Plan1-game01-temporary-priority4-fresh-plate-screen-v66.*`,
  `Plan1-game01-temporary-priority4-fresh-plate-checkpoint-v66.*`, and
  `Plan1-default-editmode-after-v66.*`, respectively.

### Focused implementation slice — repair recovery under ongoing damage

**Requirements and scope**

- Preserve the confirmed manual repair request, material costs, cumulative cost rounding, one field worker, and damage-before-repair event precedence.
- Keep the recovery amount captured by a new repair request while its initial materials are unavailable. Incoming damage must not continuously enlarge this unpaid initial batch and prevent the request from ever starting.
- After the paid recovery amount is fully restored, extend the same request to the current missing health and charge only the additional cumulative cost. If more materials are unavailable, finish the paid recovery first, release the worker, and keep the request waiting for the next increment.
- Keep task state, paid costs, restored health, stock, and reservations conserved across wait/resume. Do not create duplicate requests or silently grant repair materials.

**Acceptance and verification**

- A regression applies more damage while the initial repair is waiting for materials, then supplies enough for the original request and verifies the worker can start and restore that paid amount without waiting for the full, continually growing deficit.
- A second regression applies additional damage during a repair, verifies the already paid recovery completes before the task waits for the incremental cost, then resumes without charging the first batch twice. It supplies the remaining materials in separate arrivals and verifies the released repair drone can complete another task while the request waits.
- Run the focused repair tests first, then the full EditMode suite. Rerun the Explicit GAME-01 probe and verify the repair task leaves `WaitingForMaterials`, reports paid/restored HP, and changes Outpost survival time; the probe passing alone is not a GAME-01 pass.
- This simulation-only slice does not claim Standalone repair UI, full-match victory, performance, or offline-ZIP gates.
- The Turret regression now reuses the released Combat repair drone for a second
  repair while the first waits, then supplies its final 100 HP recovery in two
  separate one-Iron arrivals. It verifies the paid tranche sequence reaches
  150 then200 HP without charging the first100 twice.
- Focused Outpost/Turret repair tests passed2/2 in0.40 s. The full EditMode suite
  passed53, failed0, with28 Explicit probes skipped in8.63 s. The v66 Explicit
  full-match probe passed its test but remained Running at t=1,800; repair was
  `WaitingForMaterials` with1,000 paid/restored HP and the Outpost had620 HP,
  compared with1,510 HP under v64. This confirms observable repair/survival
  behavior only; it does not pass GAME-01. Saved test XML and full CLI stdout.

### Focused implementation slice — facility collision broadphase

**Requirements and scope**

- Reduce the per-candidate facility scan in enemy movement by indexing facility
  bounds into half-cell spatial buckets and checking only facilities in the
  enemy center's bucket.
- Check facility membership at the start of each 50 ms combat tick and rebuild
  only when the world, map geometry, or facility references/order changed since
  the previous tick. Facility positions and sizes are immutable. Check each
  facility's live destroyed state during the exact collision test so destruction
  during the current combat tick is reflected immediately.
- Keep the existing enemy radius, production-zone exclusion, strict rectangle
  overlap predicate, map and mountain checks, movement candidate order, enemy
  occupancy, damage, event order, and simulation tick unchanged. The broadphase
  must be conservative: it may return extra candidates, but cannot omit a
  facility that overlaps the enemy's collision rectangle.
- Reuse bucket storage between ticks to avoid replacing repeated facility scans
  with per-tick allocation churn. Keep the index private to combat simulation;
  expose only an internal test seam if required for differential coverage.

**Acceptance and verification**

- EditMode differential coverage compares indexed collision results with the
  original linear predicate at ordinary positions, half-cell and facility-edge
  boundaries, and positions adjacent to the production-zone cutoff. Include a
  destroyed facility, and rebuild after adding, removing, or moving a facility.
- Run focused collision and enemy-arrival regressions, then the full EditMode
  suite. Run the 900-game-second Explicit checkpoint before another terminal
  candidate; compare its progress state and captured output against v42 to
  confirm the broadphase preserves simulation behavior.
- Record measured test body time and wall-clock time for the same checkpoint.
  The terminal GAME-01 probe remains a separate, expensive follow-up and is only
  repeated if the checkpoint shows the candidate is promising. This optimization
  alone does not close GAME-01, native runtime, UI, offline-ZIP, or target-device
  performance gates.

### Focused implementation slice — enemy occupancy reuse

**Requirements and scope**

- Keep enemy occupancy owned by `WaveCombatSystem` and reuse its cell dictionary
  and bucket lists across 50 ms combat ticks. Clear only buckets touched by the
  preceding tick, then rebuild occupancy from live enemies.
- Preserve enemy ordering, movement, collision checks, damage, wave timing, and
  event ordering. Do not claim a measured full-match speedup from storage reuse
  alone.

**Acceptance and verification**

- A focused regression includes live enemies, warms the combat occupancy, and
  verifies the same occupied-cell buckets remain reusable across 100 ticks.
- The focused test and full EditMode suite each finish within the 60-second
  wall-clock budget. Native Standalone path placement, full-match Victory,
  target-device performance, and offline ZIP remain independent release gates.

### GAME-01 capacity experiment v67 — add one Production Drone at t=1,500

**Requirements and scope**

- Repeat v64 unchanged through t=1,500: preserve its initial two paid drones,
  early one-off drone order, facility placements, priorities, and repair-buffer
  targets. At the t=1,500 checkpoint, record the seven Production Drone
  assignments, waiting Crystal/Plate work, and available funds.
- If funds and the drone limit permit, place exactly one additional
  `PlaceOneOffOrder(0, 1)` at t=1,500. This costs100, schedules arrival at
  t=1,560, and is the only strategy change. Do not alter priorities, targets,
  or existing cargo.
- Run a t=1,680 screen, 120 seconds after the expected arrival. Verify the order
  was accepted once, the Production Drone arrived, and whether it made progress
  on waiting Crystal or other critical supply. Continue from t=0 to t=1,800 if
  promising or ambiguous; a clear lack of useful dispatch can reject the
  candidate at the screen.

**Acceptance and verification**

- Confirm funds fall by100 at the order, the additional Drone arrives by
  t=1,560 as Production, and its assignment/delivery is visible in the saved
  diagnostics. Compare Crystal trips, Outpost Plate and repair, Outpost health
  and ammunition, exports, and worker assignments with v64.
- For a promising t=1,800 checkpoint, require exports at least39, Outpost HP
  above1,510, active repair, Plate available or inbound, Outpost ammunition at
  least20, and a measurable improvement to a queued critical delivery. Otherwise
  record the capacity trade-off and reject v67. A diagnostic pass is not a
  GAME-01 Victory.
- Preserve NUnit XML and complete CLI stdout for the screen and any full
  follow-up. Rerun the default EditMode suite after this helper path stabilizes.
  GAME-01, native runtime, UI, performance, and offline-ZIP gates remain open.
- The t=1,680 screen passed1/1 in85.59 s. The t=1,500 order cost100 (funds
  148→48), had22 available drone slots, and arrived at t=1,560. At t=1,680 the
  new Production Drone had been delivered and was assigned to Ore transport;
  exports remained24, Outpost HP was2,710 with2,000 repaired HP and ammo20,
  while Port Crystal was18 plus11 inbound. The mixed screen justified a full
  follow-up.
- The t=1,800 follow-up passed1/1 in104.78 s but remained Running with24 exports,
  Outpost HP1,510, repair2,000, Plate0 available/inbound, and ammo20. The added
  Drone was assigned to a Refinery→Port Crystal order with1 reserved and no
  pickup/delivery. Port Crystal accumulated26 plus24 inbound versus v64's8 plus15
  inbound, but exports were15 lower and the critical delivery did not progress.
  Reject v67 under its criteria; a diagnostic test pass is not a GAME-01 win.
- After the helper stabilized, the default EditMode suite passed53, failed0, with
  30 Explicit probes skipped (83 total) in9.03 s. Screen, full-checkpoint, and
  suite NUnit XML/CLI logs are saved as `Plan1-game01-extra-production-drone-screen-v67.*`,
  `Plan1-game01-extra-production-drone-checkpoint-v67.*`, and
  `Plan1-default-editmode-after-v67.*` under `ProjectC/Builds/Verification-fast/`.

### GAME-01 export recovery experiment v68 — export on the t=1,500 drone ship

**Requirements and scope**

- Repeat the v67 strategy and its t=1,500 checkpoint unchanged. Place exactly
  one paid Production Drone at t=1,500, but set that one-off ship's export
  contract to500 Crystal (`PlaceOneOffOrder(0, 1, exportQuantity: 500)`). The
  Drone uses100 of the ship's500 cargo capacity, leaving room for at most400
  Crystal. Keep all existing regular import/export contracts, facility orders,
  priorities, repair buffers, and worker assignments unchanged.
- The added ship arrives no earlier than t=1,560. It may load only Crystal
  already available at the Port when it starts export loading; it does not wait
  for later Crystal production. Loading can hold the single dock until the
  eligible quantity is loaded. Its Drone cargo leaves room for at most400
  Crystal; at20 Crystal/second that load takes at most20 seconds. The next
  regular import is scheduled for t=1,620, so track actual dock occupancy and
  regular ships' arrival, departure, and waiting states for delivery delay.
- Use one adaptive Explicit run: report the t=1,680 screen, stop at that point
  for a clear rejection, and continue the same simulation to t=1,800 if the
  extra export helps without harming the v67 defense baseline or if ship timing
  remains ambiguous. This avoids replaying t=0 for promising candidates. It is
  a strategy diagnostic and is not GAME-01 proof.

**Acceptance and verification**

- Confirm one 100-fund Drone order is accepted, delivered as Production, and the
  ship records its eligible Crystal quantity, loaded amount, and departure.
  Compare exports, Port Crystal available/inbound, Outpost HP and repair,
  Plate, ammunition, Drone assignments, and regular ship delays against v67
  and the v64 reference endpoint.
- In addition to increasing exports and reducing Crystal backlog, require the
  one-off order to preserve the next scheduled periodic import confirmation and
  arrival. A t=1,800 gain that skips a regular import is a trade-off, not a
  retained GAME-01 candidate. Keep Outpost survival, repair, and ammunition at
  least at the reference baseline. A diagnostic candidate still requires the
  separate terminal GAME-01 Victory probe and other MVP gates.
- Preserve NUnit XML and full CLI stdout for the adaptive run and the default
  EditMode suite after the helper stabilizes. Keep the separate v68 t=1,680 and
  t=1,800 runs as historical comparison artifacts.
- The initial split v68 runs passed1/1 each: the t=1,680 body took85.79 s and
  the t=1,800 body took107.90 s. At t=1,680 the one-off ship departed at
  t=1,560 after loading all8 eligible Crystal; exports rose24→32, Port Crystal
  was10+11 inbound versus v67's18+11, and Outpost HP/repair/ammo matched v67 at
  2,710/2,000/20. At t=1,800, v68 remained Running with32 exports, HP1,510,
  repair2,000, Plate0, ammo20, and Port Crystal18+24 inbound. v67 had24 exports
  and Crystal26+24 inbound; v64 had39 exports, HP1,510, repair2,000, Plate0,
  ammo20, and Crystal8+15 inbound. The t=1,800 screen improved on v67 but
  stayed7 exports behind v64; the periodic-import funding failure recorded
  below rejects v68 as a viable strategy. No checkpoint proves GAME-01.
- After the helper stabilized, default EditMode passed53, failed0, with32
  Explicit probes skipped (85 total) in9.86 s. The split screen, full checkpoint,
  and suite artifacts are `Plan1-game01-drone-export-screen-v68.*`,
  `Plan1-game01-drone-export-checkpoint-v68.*`, and
  `Plan1-default-editmode-after-v68.*` under
  `ProjectC/Builds/Verification-fast/`.
- The v68 order left funds48 after buying the Drone, below the100 needed at the
  t=1,560 periodic-import confirmation. The ship traffic records jump from
  periodic import9 at t=1,440 to import11 at t=1,800; import10 at t=1,620 was
  skipped. Reject v68 as a viable strategy despite meeting its original
  export/backlog comparison against v67: it added8 exports but consumed the
  next regular import opportunity and still ended7 exports below v64.
- The adaptive v68 probe passed1/1 in101.80 s. It reported the t=1,680 screen,
  met its continuation criteria, and reached the same t=1,800 checkpoint in the
  same run. The split verification took85.79+107.90=193.69 test seconds; one
  adaptive run reduced that promising-candidate cost by91.89 s (47%). A clear
  rejection still stops at t=1,680 without paying for a second replay. The
  adaptive artifact is `Plan1-game01-drone-export-adaptive-v68.*` under
  `ProjectC/Builds/Verification-fast/`.

### GAME-01 export without losing a periodic import v69 — one-Iron ship at t=1,500

**Requirements and scope**

- Repeat the v64 strategy unchanged through t=1,500. Keep its two early paid
  Production Drones, facilities, regular contracts, priorities, and repair
  buffers. Do not order the extra Drone used by v67/v68.
- At t=1,500 place exactly one `PlaceOneOffOrder(1, 0, exportQuantity: 500)`:
  one Iron, no Drones, and a500-Crystal export contract. Its Iron costs1, so
  funds fall148→147 and remain sufficient for the next100-fund periodic import
  confirmation at t=1,560. The one-off ship arrives at t=1,560, unloads its
  single Iron, and loads only Crystal already available at the Port; it does
  not wait for later Crystal production.
- Run one adaptive Explicit scenario: report a t=1,680 screen, reject if the
  one-off ship departed with no Crystal or periodic import10 was not confirmed
  and present by its t=1,620 arrival, and continue the same simulation to
  t=1,800 if both effects are present or ship timing is still ambiguous.

**Acceptance and verification**

- At the screen, log the one-off ship's contract, eligible/loaded Crystal,
  departure, and regular ship phases. Confirm periodic import10 is present at
  t=1,620. At t=1,800, compare cumulative exports, Port Crystal plus inbound,
  Outpost HP/repair/Plate/ammunition, and ship traffic against v64's
  39-export,1,510-HP,2,000-repair,20-ammo endpoint.
- Keep this candidate only if it exports more than39 by t=1,800, periodic
  import10 is preserved, and Outpost survival, repair, and ammunition remain
  at least at v64. Otherwise reject and record the throughput/funding trade-off.
  No Explicit screen or checkpoint counts as GAME-01 Victory.
- Preserve adaptive-run NUnit XML and complete CLI stdout, then rerun the default
  EditMode suite after the helper change.
- After the v69 helper change, default EditMode passed53, failed0, with34
  Explicit probes skipped (87 total) in8.23 s. Its XML and full CLI stdout are
  `Plan1-default-editmode-after-v69.*` under `ProjectC/Builds/Verification-fast/`.
- The adaptive v69 run passed1/1 in104.46 s. At t=1,500, the extra one-Iron
  order cost1 (funds148→147) and arrived at t=1,560. At t=1,680 it had loaded
  and exported8 Crystal; periodic import10 arrived at t=1,620 and departed.
  Exports reached39, with Outpost HP/repair/ammo at2,710/2,000/20. At t=1,800
  exports were still39, Outpost HP/repair/ammo were1,510/2,000/20, and Port
  Crystal was8+15 inbound—the same endpoint as v64. The one-off ship moved8
  exports earlier but did not increase total Crystal throughput. Reject v69.
  The run confirms periodic-import preservation but does not prove GAME-01.
- The adaptive v69 NUnit XML and full CLI stdout are saved as
  `Plan1-game01-one-iron-export-adaptive-v69.*` under
  `ProjectC/Builds/Verification-fast/`.

### GAME-01 release Outpost Iron workers v70 — lower the post-buffer target at t=1,680

**Requirements and scope**

- Repeat the v64 strategy with no additional one-off order. Keep the opening
  and t=900–1,200 priorities, facility layout, contracts, paid repairs, and
  all Drone assignments unchanged through t=1,680.
- At the t=1,680 screen, require Outpost Iron stock plus expected inbound to be
  at least30 and the repair buffer to have restored at least2,000 HP. Then lower
  only the Outpost Iron restock target30→20. Let normal automatic-order
  reconciliation cancel excess unassigned or still-to-pick-up Iron work while
  preserving already-picked-up cargo and its inbound accounting.
- Record which Production Drones are released and whether they start waiting
  Refinery→Port Crystal or Miner→Refinery Ore work. Continue that same simulation
  through the t=1,800 checkpoint. If the regular ship arriving at t=1,800 has
  only just docked, continue to t=1,860 to capture its export departure.

**Acceptance and verification**

- Confirm the target changes once, from30 to20, only after the repair buffer
  threshold. Verify at least two previously assigned Iron workers are released
  and that Crystal or Ore deliveries progress before t=1,800. Existing cargo in
  transit must remain conserved.
- At t=1,800 and, if needed, t=1,860, compare exports, Port Crystal/inbound,
  Outpost HP/repair/Plate/ammunition, and Drone tasks against v64. Keep the
  candidate only if exports exceed39, the periodic import schedule remains
  intact, Outpost HP is at least1,510 at t=1,800, repair remains at least2,000,
  and ammunition remains at least20. Reject a profile that loses the Outpost or
  materially undercuts defense to free workers.
- Save the adaptive NUnit XML and full CLI stdout; rerun the default EditMode
  suite after the helper change. Neither checkpoint nor passing probe is a
  GAME-01 Victory.
- A matched v64 control was added to run unchanged through t=1,860, including
  regular-ship traffic at t=1,800 and t=1,860. It passed1/1 in122.14 s. At
  t=1,800, v64 and v70 both had39 exports, Outpost HP1,510, repair2,000, ammo20,
  and25 total Port Crystal stock plus inbound. At t=1,860, v70 had54 exports
  against v64's47 (+7), with both at Outpost HP910, repair2,000, ammo20. V70
  had Crystal5+19 inbound; v64 had12+6. The control confirms periodic import11
  docked and departed at t=1,800 carrying8 Crystal; v70 adds no one-off order
  and its t=1,800→1,860 export increase was15 versus the control's8. This
  supports retaining v70 as the best throughput candidate, while its run did
  not record regular-ship phase/load telemetry directly. The candidate remains
  exploratory: both runs were Running at t=1,860 and GAME-01 Victory is open.
- After adding the control helper, default EditMode passed53, failed0, with36
  Explicit probes skipped (89 total) in9.31 s. XML and complete CLI stdout are
  `Plan1-default-editmode-after-v64-control.*` under
  `ProjectC/Builds/Verification-fast/`.

### v70 terminal outcome — reject as GAME-01 strategy

- A terminal continuation reused the v70 setup and its t=1,200/t=1,680 triggers in one Explicit EditMode run. The diagnostic test completed 1/1 in142.02 s and reached Defeat at game t=1,951/Wave14 with54 exported Crystal, Outpost HP0,579 alive enemies, and Port Crystal22 plus31 inbound. It ended before the3,900-second deadline and far below the2,000-export goal, so reject v70 as a GAME-01 solution.
- NUnit `Passed` means the exploratory test reached and logged a terminal outcome. The probe has zero assertions and is not a gameplay acceptance pass. Its XML is `ProjectC/Builds/Verification-fast/Plan1-game01-terminal-v70.xml`. Raw CLI stdout was not saved as a separate file for this run; capture it with the next terminal candidate.

### GAME-01 strategy experiment v71 — restore Ironworks input after releasing Outpost workers

**Requirements and scope**

- Repeat the v70 sequence through t=1,680 without changing its priorities, production recipes, contracts, facility layout, Drone count, or earlier actions.
- When the v70 repair-buffer trigger lowers the Outpost Iron target30→20, make one additional change: raise the Ironworks Iron target5→10. Keep its priority unchanged. The second Turret needs Iron20 and Plate5; at v70's t=1,800 checkpoint it held Iron20/Plate0 and remained unstarted while Ironworks had only1 Plate (`ConstructionSystem.cs`, `GameDefinitions.json`).
- Observe the same run through t=1,800. Record whether the extra Iron reserve produces Plate, whether a Plate load is delivered or inbound, whether the waiting Turret starts, and the Outpost/export state.

**Acceptance and verification**

- Confirm both target changes occur once at the t=1,680 repair-buffer decision and no other strategy variable changes.
- Reject the added Iron target if the waiting Turret still has no Plate delivered or inbound and has not started by t=1,800. If Plate production/delivery begins and the Outpost survives, continue the same run to a terminal outcome rather than replaying it from t=0.
- This is a diagnostic strategy screen, not GAME-01 acceptance. Only an actual Victory with at least2,000 exported Crystal before3,900 game seconds and a living Outpost closes GAME-01. Save both NUnit XML and full CLI stdout for each stage.

**v71 screen result**

- The Explicit v71 screen completed1/1 in117.50 s. Its t=1,680 buffer trigger changed Outpost Iron30→20 and Ironworks Iron5→10 once. At t=1,800 it remained Running with39 exports, Outpost HP1,510, repair2,000, and ammunition20—the same state as v70. Ironworks still had1 Plate and no Iron inbound stock; its Port→Ironworks Iron order for10 was waiting without an assigned Drone. The second Turret still held Iron20/Plate0 and had not started. Reject the target-only change under the planned early screen.
- NUnit `Passed` means the diagnostic reached t=1,800; it does not indicate gameplay success. XML: `ProjectC/Builds/Verification-fast/Plan1-game01-v71-screen.xml`; Unity output: `ProjectC/Builds/Verification-fast/Plan1-game01-v71-screen-editor.log`. A terminal run was not justified.

### GAME-01 strategy experiment v72 — bound Ironworks priority for one fresh Iron load

**Requirements and scope**

- Repeat v71 through t=1,680 unchanged: lower Outpost Iron target30→20 and raise Ironworks Iron target5→10 after the repair buffer.
- At that same trigger, temporarily raise Ironworks priority3→4. Snapshot any existing Port→Ironworks Iron reservations and picked-up cargo first. Restore priority3 as soon as a fresh five-Iron load has been picked up beyond that baseline; preserve the picked-up cargo and log the trigger once. Do not change recipes, other priorities, Drone count, facility layout, or production orders.
- Screen at t=1,800 and record Iron order state/assigned workers, Ironworks Plate stock, second Turret construction state, exports, Outpost HP/repair/ammunition, and Port Crystal.

**Acceptance and verification**

- Reject if no fresh five-Iron load is picked up, more than2 Production Drones are committed to Ironworks Iron, or exports/Outpost HP/repair/ammunition fall below the v64 t=1,800 baseline of39/1,510/2,000/20.
- If one fresh load is picked up and those baselines hold, continue a follow-up screen; only then decide whether to extend the same strategy to t=1,860 or terminal. The probe remains diagnostic and cannot close GAME-01 without actual Victory.
- This bounded late boost differs from rejected v61, which raised Ironworks priority3→4 at t=1,200 and left all7 Production Drones committed to Ironworks Iron by its defeat at t=1,785.

**v72 t=1,800 screen result**

- The focused Explicit probe completed1/1 in112.34 s (0 assertions; a diagnostic completion only). The t=1,680 trigger changed Outpost Iron30→20, Ironworks Iron5→10, and priority3→4. Pre-trigger Port→Ironworks reservation was0; exactly5 post-trigger Iron was picked up and priority reset to3 once.
- At t=1,800 the run remained Running with39 exports, Outpost HP1,510, repair2,000, and ammunition20, matching the v64/v70 baseline. Ironworks Plate had risen from1 to11 with10 inbound to Outpost, but the second Turret was still unstarted at Iron20/Plate0. Two Production Drones were assigned to Ironworks Iron and two to Ironworks→Outpost Plate; the other workers remained on Outpost Iron and Crystal/Ore transport. This meets the bounded screen thresholds and justifies only a same-strategy t=1,860 follow-up, not a terminal probe.
- NUnit XML: `ProjectC/Builds/Verification-fast/Plan1-game01-v72-screen.xml`; complete CLI output: `ProjectC/Builds/Verification-fast/Plan1-game01-v72-screen-cli.log`; Unity Editor output: `ProjectC/Builds/Verification-fast/Plan1-game01-v72-screen-editor.log`. The XML `Passed` result does not mean gameplay success.

### CORE-03 event boundary coverage — EV-04 through EV-06

- Added direct regressions: EV-04 lethal damage before same-tick repair keeps the turret destroyed; EV-05 equal-distance targeting uses earlier SpawnSequence despite list order and lower later-enemy HP; EV-06 cancellation one 50 ms step before a 100 ms construction completes returns Iron once and prevents completion.
- Focused EventBoundaryTests passed3/3 in0.274 s. Default EditMode passed56, failed0,38 Explicit probes skipped (94 total) in10.267 s. NUnit XML: `ProjectC/Builds/Verification-fast/Plan1-default-editmode-after-event-boundaries.xml`; Editor log saved alongside it.
- EV-01–03 remain partial because exact ship-departure/tie cases are not integrated into those tests. EV-07 remains covered by `BlockedEntryQueuesPriorWaveWhileOtherEntriesContinueIndependently`. These core tests do not close Standalone FLOW-01 or GAME-01.

### CORE-03 event boundary coverage — EV-01 through EV-03

**Requirements and scope**

- Add integrated simulation regressions for an actual Export Ship departing immediately before the deadline (EV-01), exactly at the deadline while the result is Defeat (EV-02), and on the same tick that the Outpost is destroyed while the export still completes (EV-03). Assert the ship phase, loaded/exported Crystal count, outcome, and same-tick event timestamps/details where applicable.
- Keep production code unchanged. Use the opening docked ship, seed one Crystal in the Port, and set a short test-only deadline around its known departure at5,050ms. Preserve a separate assertion that the normal match deadline remains3,900,000ms, so test acceleration does not weaken the configured-time requirement.
- For EV-03, configure one lethal West-entry enemy to spawn at4,050ms, disable the Turret, and verify combat destruction precedes same-tick ship processing. This checks the real system ordering rather than only `MatchRules.Resolve`.

**Validation speed and acceptance**

- The three scenarios must use the shortest deterministic timeline (101 fixed simulation ticks), rather than replaying all78,000 ticks to the production deadline. No test-only clock reflection or production fast-forward behavior is allowed.
- Run the new boundary tests by exact filter, then run the default EditMode suite. A focused NUnit `Passed` must include the expected assertions and is not itself gameplay acceptance. EV-01–03 close only when all explicit departure, outcome, event, and deadline assertions pass; Standalone FLOW-01 and GAME-01 remain separate gates.
