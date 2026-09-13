# 09. HUD·업그레이드 UI 개선

상태: 구현 완료 · runtime QA PASS (허용된 SKIP-ENV/SKIP-N/A 포함)

## 목적

전투 중 생존 상태와 생산 흐름을 전장 안에서 즉시 읽을 수 있게 하고, 우측 업그레이드 UI의 정보 우선순위를 다시 배치한다. 기존 Canvas HUD, 업그레이드 규칙, 자원 계산, 입력 hitbox 계약은 유지하며 표시 계층만 개선한다.

사용자 승인 결정:

- 탱크 위에는 `Core HP`를 표시한다.
- 자원 영역은 저장량 bar가 아니라 생산 시스템의 다음 cycle 진행률을 표시한다.
- `resource-generator`, `recycler`, `arsenal`, `composer` 4개 생산 시스템을 모두 표시한다.
- 정보 팝업은 hover 시 표시하고 pointer가 나가면 닫는다.
- 기존 Canvas HUD를 재배치하며 새 DOM UI나 업그레이드 전용 화면은 추가하지 않는다.

## 현재 구조

- 논리 Canvas는 `1280x720`이며 우측 HUD 패널 폭은 `340px`이다.
- `HUDManager`가 상단 상태 bar, 시스템·전투 모듈 목록, 설치 목록, upgrade web, pause/result overlay와 hitbox를 함께 관리한다.
- 상단에는 현재 Core HP bar와 4종 자원 수치, wave/status/music 정보가 있다.
- 시스템·전투 모듈은 작은 2열 버튼으로 표시되고 upgrade web node는 `98x72` 기준으로 그려진다.
- `VehicleSystems`의 생산 timer와 output buffer는 private 상태이며 `ResourceStorage`는 현재량/저장 한도를 관리한다.
- 생산은 `Game.update()`에서 pause gate를 거친 뒤 `VehicleSystems.update()`로 진행된다. pause 중 자동 생산·수집은 중지되어야 한다.

## 요구사항 및 범위

### 포함

- 탱크 월드 위치에 고정되는 Core HP bar와 현재/최대 HP 표시
- 4개 생산 시스템의 실제 cycle timer 기반 progress bar
- 생산 진행률의 running, paused, waiting-input, buffer-full, storage-full 상태 표현
- 기존 우측 패널 안에서 시스템·전투 모듈 카드 크기 확대
- upgrade web의 node와 간격 축소
- 모든 upgrade node, 연결, 비용, 상태, click hitbox 보존
- 시스템 카드, 생산 bar, upgrade node, 탱크 HP bar의 hover tooltip
- tooltip의 Canvas 경계 보정과 text clipping 방지
- 현재 자원량/저장 한도의 접근성 보존: 생산 bar의 보조 숫자 또는 tooltip에서 확인 가능
- 자동 테스트, build/QA, 지정 runtime과 `integration-tester`를 사용한 브라우저 검증

### 제외

- Core HP, module HP, armor, 생산량, interval, 비용, unlock 조건의 밸런스 변경
- 생산 timer의 실행 순서, 자원 차감, output flush 규칙 변경
- 신규 생산 시스템·업그레이드 node·전투 모듈·asset 추가
- DOM 기반 HUD, 새 업그레이드 화면, scroll container, 모바일 전용 hover 대체 입력
- 기존 pause, install, research, purchase, module placement 규칙 변경
- 맵·terrain·카메라·탱크 충돌과 무관한 리팩터링

## 화면 설계

### 탱크 위 Core HP

- `Vehicle.getCoreHp()`와 `getCoreMaxHp()`를 사용해 현재 생존 판정과 같은 값을 표시한다.
- `Vehicle`의 현재 월드 bounds 상단 중심을 `Camera.worldToScreen()`으로 변환해 tank sprite 위에 bar를 배치한다.
- 이동과 회전 중에도 매 frame 위치를 다시 계산한다. Canvas HUD의 고정 top bar 좌표를 사용하지 않는다.
- bar는 정상/경고/위험 임계값을 기존 `VisualTheme` semantic color로 구분한다.
- 작은 숫자 `current / max`를 bar에 함께 표시하고, hover tooltip에는 Core 상태를 상세히 표시한다.
- 기존 상단 Core HP 영역은 제거해 중복 표시와 top bar 공간 낭비를 없앤다.

### 생산 cycle bar

상단 `50px` bar 높이와 논리 좌표를 우선 유지하고, gameplay viewport를 줄이지 않는다. 4개의 생산 card는 기존 wave/status/music 영역과 겹치지 않는 범위에서 가로로 배치한다.

| 시스템 | 입력 | 출력 | 주요 표시 |
| --- | --- | --- | --- |
| resource-generator | 없음 | resource | cycle progress, 현재 resource 수치 |
| recycler | resource | matter | cycle progress, 입력/출력 상태 |
| arsenal | matter | ammo | cycle progress, 입력/출력 상태 |
| composer | matter | nano | cycle progress, 입력/출력 상태 |

- bar fill은 `timer / interval`을 `0..1`로 clamp한다.
- card label에는 시스템 또는 출력 자원 이름을 표시하고, 현재 저장량/한도는 작은 보조 수치로 유지한다.
- pause 중에는 bar가 정지하고 `PAUSED` marker를 표시한다.
- 다음 cycle에 필요한 입력이 부족하면 `WAITING INPUT`, 내부 output buffer가 차면 `BUFFER FULL`, 출력 저장소가 가득 차면 `STORAGE FULL`을 표시한다.
- 표시 상태는 실제 simulation을 변경하지 않는다. 현재 구현의 timer가 blocked cycle에서도 진행되는 계약은 유지하고, UI에서 blocked reason만 명시한다.

### 시스템·업그레이드 패널

- `HUDManager.PANEL_WIDTH = 340`은 유지한다.
- 시스템과 전투 모듈 card의 높이·내부 padding·icon 크기를 키워 이름, level/status, 선택 상태가 한눈에 보이게 한다.
- card는 기존 2열 목록을 유지하되 row height와 gap을 layout 계산으로 관리한다. 카드가 커져도 실제 그려진 rect와 click hitbox는 같은 객체에서 파생한다.
- 시스템 목록이 차지하는 공간이 늘어나는 만큼 upgrade web의 node width/height와 level gap을 줄인다.
- upgrade map은 node를 삭제하거나 일부만 숨기지 않는다. 모든 node와 연결선을 compact layout에 배치하고, text는 기존 wrap/truncate 규칙을 재사용한다.
- selected, available, insufficient, locked, disabled 상태는 기존 marker와 semantic color를 유지한다.
- `ARMORY`의 research map과 combat module stock/action은 기존 흐름을 유지하되 compact graph가 stock card와 겹치지 않도록 panel content top/bottom을 공통 layout 계산으로 바꾼다.

### Hover tooltip

`HUDManager`가 한 개의 `TooltipTarget`만 보유하고 frame 마지막에 그린다. tooltip은 클릭을 가로채지 않는다.

- 시스템/전투 모듈: 이름, built-in/level, 현재 HP, 주요 효과, 선택·설치 상태
- 생산 bar: 입력/출력, interval, cycle progress, current storage, blocked reason
- upgrade node: 효과, 비용, 상태, 부족한 자원 또는 선행 조건
- 탱크 HP bar: Core HP, 생존 상태, hover 시점의 수치

tooltip box는 대상 rect의 우선 위치를 사용하고, Canvas 좌우·상하 경계를 넘으면 반대쪽으로 배치한다. 텍스트는 기존 `wrapText`와 제한된 line count를 사용해 전투 화면을 가리지 않게 한다.

## 데이터·API 설계

### `VehicleSystems` 읽기 API

생산 simulation을 수정하지 않고 HUD 관측용 snapshot만 공개한다.

```ts
type ProductionStatus =
  | 'running'
  | 'waiting-input'
  | 'buffer-full'
  | 'storage-full';

interface ProductionSnapshot {
  moduleId: string;
  input: ResourceType | null;
  output: ResourceType;
  progress: number;
  interval: number;
  bufferedOutput: number;
  outputCapacity: number;
  status: ProductionStatus;
}
```

- `resource-generator`는 input과 buffer가 없는 생산 source로 표현한다.
- snapshot은 `timer`, effective interval/stat, output buffer, `ResourceStorage`를 읽어 계산한다.
- pause 여부는 `VehicleSystems`가 아니라 기존 `HUDManager.render(..., isPaused)`가 최종 표시 상태에 반영한다.
- module이 현재 탱크 definition에 없으면 HUD는 임의의 bar를 만들지 않고 해당 card를 생략한다.
- progress, interval, buffer 값은 비정상 숫자를 방어하고 UI에 유한한 값만 전달한다.

### `HUDManager` 상태

- 기존 `pointer`와 subject/node hitbox를 재사용한다.
- `productionHitboxes`, `coreHealthHitbox`, `tooltipTarget`을 추가하되, draw rect와 hitbox를 각각 따로 하드코딩하지 않는다.
- hover 우선순위는 `upgrade node/card → production bar → tank HP`로 한다.
- `render()` 순서는 `top bar → tank HP/월드 표시 → module preview → right panel → tooltip`으로 고정한다.
- 새 화면 상태나 callback은 추가하지 않는다. `Vehicle`, `ResourceStorage`, `UpgradeManager`, `ArmoryManager`의 기존 read API를 사용한다.

## 구현 순서

### 09.1 생산 snapshot과 최소 자동 테스트

- `VehicleSystems`의 4개 생산 rule에 대한 snapshot 타입과 읽기 메서드를 추가한다.
- progress가 `0..1`로 clamp되는지, interval과 buffer가 실제 effective stat을 따르는지 검증한다.
- input 부족, output buffer full, output storage full 상태를 각각 확인한다.
- snapshot 추가가 기존 `update`, `resetRuntime`, pause 동작에 영향을 주지 않는지 확인한다.

### 09.2 탱크 HP·생산 bar 렌더링

- top bar에서 중복 Core HP 영역을 제거한다.
- camera/world bounds 기반 tank-overhead Core HP bar를 추가한다.
- 4개 production card와 progress/status marker를 top bar에 배치한다.
- 현재 저장량/한도 숫자, wave, status, music control이 clipping 없이 남아 있는지 확인한다.

### 09.3 우측 패널 레이아웃 재배치

- 시스템·전투 모듈 card를 확대하고 layout-derived hitbox를 연결한다.
- upgrade web node와 level gap을 축소한다.
- compact layout에서도 node 연결, 상태 marker, 비용, 효과, Armory stock/action이 표시되도록 한다.
- 실제 draw rect와 pointer click 좌표가 계속 일치하는지 확인한다.

### 09.4 hover tooltip

- 생산 bar, tank HP, system/module card, upgrade node의 target을 통합한다.
- 대상별 상세 정보 formatter는 기존 이름·효과·비용 formatter를 재사용한다.
- tooltip 위치 clamp, line wrap, pointer 대상 변경/이탈 처리를 추가한다.
- tooltip이 click, drag, rotation, install, upgrade 입력을 막지 않는지 확인한다.

### 09.4.1 재현 가능한 runtime fixture

- 필수 상태를 자연 플레이 시간이나 자원 운에 의존하지 않고 `?test=1&scenario=...` URL로 결정한다.
- `production-wait-input`: 생산 입력 자원을 0으로 시작해 `WAIT INPUT`을 즉시 관측한다.
- `production-buffer-full`: 출력 저장소를 가득 채우고 생산 buffer를 capacity로 시작해 `BUFFER FULL`을 즉시 관측한다.
- `production-storage-full`: resource 저장소를 capacity로 시작해 `STORAGE FULL`을 관측한다.
- `armory-install`: test-only matter와 direct-weapon stock을 준비해 purchase/install/drag/rotation 입력을 검증한다.
- `terminal-game-over`: Core HP를 0으로 시작해 `GAME_OVER` overlay를 검증한다.
- `terminal-region`: 마지막 wave가 clear된 상태로 시작해 실제 `REGION_CLEARED` 전환을 검증한다.
- 모든 fixture는 development test runtime에서만 활성화하고 일반 production runtime에는 노출하지 않는다.
- 현재 `Game`에는 `VICTORY`로 이어지는 실제 전환 경로가 없으므로, Plan 09에서는 도달 가능한 `GAME_OVER`와 `REGION_CLEARED`를 필수 terminal 검증으로 삼고 campaign victory 전환은 별도 범위로 기록한다.

### 09.5 회귀·runtime 검증

- 사용자 요청에 따라 자동 unit/build/QA는 실행하지 않고 Plan 통합 테스트만 실행한다.
- 현재 plan worktree에서 orchestrator가 실행한 정확한 dev-server URL/port를 `integration-tester`에 전달한다.
- tester는 별도 서버나 임의 port를 시작하지 않고 bounded 단일 실행으로 최종 결과만 반환한다.
- fixture URL과 precondition을 prompt에 함께 전달해 필수 상태가 재현되는지 검증한다.
- 필수 시나리오가 PASS이고 허용된 skip만 남을 때 plan을 완료한다.

### 09.6 진행 기록과 전달

- 구현 완료 후 `plans/implementation/progress.md`에 다음 형식을 추가한다.

  `yyyy-mm-dd | plans/implementation/09-ui-improvement | 탱크 상단 Core HP, 생산 cycle bar, 확대 시스템 카드, compact upgrade map, hover tooltip 구현 및 runtime QA 결과`

- 구현·검증 diff를 확인하고 커밋 메시지에 `plan 09`를 포함한다.
- PR은 별도 요청이 있을 때만 `docs/contribution/README.md`, PR template, 최신 `origin/defence` 확인 후 진행한다.

## 테스트 및 필수 runtime QA

### 자동 검증

이번 실행에서는 사용자의 요청에 따라 Plan 통합 테스트만 수행하고 아래 자동 스위트는 실행하지 않는다.

- `npm test`
- `npm run qa:release`
- `npm run build`
- `git diff --check`

### 필수 integration-tester 시나리오

| ID | 시나리오 | 필수 결과 |
| --- | --- | --- |
| UI-09-1 | 전투 시작 화면에서 탱크 위 Core HP bar 확인 | bar와 수치가 Core HP와 일치하고 tank 이동 시 함께 이동 |
| UI-09-2 | 정상 전투 중 4개 생산 cycle bar 확인 | 네 bar가 실제 timer에 따라 진행하고 출력 label이 맞음 |
| UI-09-3 | pause/resume | pause 중 생산 bar·자동 생산·자원 수집이 정지하고 resume 후 재개 |
| UI-09-4 | `production-wait-input`, `production-buffer-full`, `production-storage-full` fixture 순서로 실행 | bar가 `WAIT INPUT`, `BUFFER FULL`, `STORAGE FULL` marker와 tooltip 문구로 원인을 구분 |
| UI-09-5 | 시스템·전투 모듈 card 선택 | 확대된 card가 읽히고 기존 선택/hitbox이 동작 |
| UI-09-6 | upgrade node 선택·구매/연구 | compact map의 모든 node가 보이고 기존 상태·비용·입력이 유지 |
| UI-09-7 | system/node/production/HP hover | 올바른 tooltip, clipping 없음, 대상 변경·pointer 이탈 시 정상 교체/닫힘 |
| UI-09-8 | `armory-install` fixture에서 install·drag·R 회전·upgrade 입력 | 준비된 stock/cost로 실제 입력이 성공하고 tooltip이 click/drag/rotation을 방해하지 않음 |
| UI-09-9 | 1280x720 및 축소 viewport | HUD 겹침·잘림·pointer offset·콘솔 critical error 없음 |
| UI-09-10 | `terminal-game-over` 및 `terminal-region` fixture에서 terminal 전환 | 새 HUD가 wave, pause, GAME_OVER/REGION_CLEARED overlay를 가리지 않음; VICTORY는 별도 campaign 전환 범위 |

필수 시나리오가 `FAIL` 또는 `BLOCKED`이면 plan 완료·commit을 보류하고 재현 조건과 원인을 기록한다. 변경 범위 밖의 검증은 `SKIP-N/A`, 환경상 실행 불가능한 경우에만 사유를 포함한 `SKIP-ENV`로 기록한다. 관측할 수 없는 필수 상태를 skip으로 숨기지 않는다.

## 예상 변경 파일

- `src/core/VehicleSystems.ts`
- `src/core/GameTestScenario.ts`
- `src/core/GameTestObserver.ts`
- `src/core/Game.ts`
- `src/core/VehicleSystems.test.ts` 또는 기존 관련 core test 파일
- `src/ui/HUDManager.ts`
- 필요 시 tooltip/layout 계산을 검증하는 순수 helper 및 test 파일
- 구현 완료 시 `plans/implementation/progress.md`

이번 plan에서는 data JSON, asset manifest, map/terrain, combat rule 파일을 변경하지 않는다.

## 최종 완료 기준

- 탱크 위 Core HP bar가 실제 Core HP와 항상 일치한다.
- 4개 production cycle bar가 실제 timer를 표시하고 pause 중 정지한다.
- 생산 blocked 상태가 bar와 tooltip에서 원인별로 구분된다.
- 시스템·전투 모듈 card는 커지고 upgrade map은 compact해졌지만 모든 기존 node, 연결, 비용, click 흐름이 유지된다.
- hover tooltip이 필요한 정보를 제공하고 Canvas 밖으로 잘리지 않는다.
- install, drag, rotation, research, purchase, pause, wave, terminal 흐름에 회귀가 없다.
- 필수 runtime integration QA가 PASS이며, 자동 검증은 사용자 요청에 따른 미실행과 허용된 skip이 명시되어 있다.
- progress 기록, `git diff --check`, `plan 09` 커밋 메시지 규칙을 지킨다.

## 구현 결과

- Subtask 1: `c757d51 feat(plan 09): expose production snapshots` — `VehicleSystems`에 4개 생산 시스템의 읽기 전용 snapshot API 추가
- Subtask 2: `772cf7d feat(plan 09): rebalance HUD layout` — 탱크 상단 Core HP, production cycle bar, 확대 시스템 card, compact upgrade map 추가
- Subtask 3: `99e89b1 feat(plan 09): add HUD hover tooltips` — HP/production/system/node hover tooltip과 Canvas 경계 보정 추가
- Subtask 4: `GameTestScenario.ts`, `GameTestObserver.ts` — URL별 deterministic fixture와 production/resource/armory observer snapshot 추가
- Subtask 5: `Game.ts`, `VehicleSystems.ts` — test runtime에서만 입력 부족, buffer/storage full, armory stock, terminal 상태를 주입
- 문서·진행 기록: `dbe4bcf docs(plan 09): record UI implementation QA`, `f4487bf docs(plan 09): correct integration QA record`

## 실제 runtime 검증 기록

```text
baseline runtimeId: 35142
baseline URL: http://127.0.0.1:5179/?test=1
fixture runtimeId: 49537
fixture URLs: http://127.0.0.1:5181/?test=1&scenario=production-wait-input,
              http://127.0.0.1:5181/?test=1&scenario=production-buffer-full,
              http://127.0.0.1:5181/?test=1&scenario=production-storage-full,
              http://127.0.0.1:5181/?test=1&scenario=armory-install,
              http://127.0.0.1:5181/?test=1&scenario=terminal-game-over,
              http://127.0.0.1:5181/?test=1&scenario=terminal-region
worktree: C:\Users\slaye\ws\local_game
branch: feature/plan-09-ui-improvement
결과: PASS (허용된 SKIP-ENV/SKIP-N/A 포함)
PASS: UI-09-1 Core HP bar/value, UI-09-2 production bars/labels/timer,
      UI-09-3 pause/resume, UI-09-5 system/card 선택, UI-09-6 compact upgrade map,
      UI-09-7 HP/system/production/node tooltip과 닫힘, UI-09-9 1280x720 layout
      UI-09-4 fixture 3종(WAIT INPUT/BUFFER FULL/STORAGE FULL),
      UI-09-8 armory install/drag/R 회전, UI-09-10 GAME_OVER/REGION_CLEARED terminal
SKIP-ENV: UI-09-1 이동 hold API 부재, UI-09-9 축소 viewport API 부재
SKIP-N/A: VICTORY는 현재 production transition이 없어 별도 campaign 범위
콘솔: errors 0, warnings 0
자동 검증: 사용자 요청에 따라 npm test/build/qa:release 미실행. QA 중 파일 변경 없음
```
