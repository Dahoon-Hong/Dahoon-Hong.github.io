# 12. 적 시야 우선 추적 및 A* Web Worker 분리

상태: 구현 완료 (구현 완료 2026-09-14)

선행 plan:

- 11. 적 경로 탐색 스케줄링·공유 캐시 최적화
- 09-a. 적 근거리 Local Steering 및 경로 전환

## 목적

09-a 구현 이후에도 적이 시야에 들어온 뒤 추적이 늦어지고, 적 수가 늘면
navigation 처리와 separation/terrain 검사 때문에 프레임 드랍과 적 정지가
발생한다. 이번 plan은 다음 두 가지를 동시에 해결한다.

1. 카메라 시야에 진입한 적은 A* 응답을 기다리지 않고 다음 simulation update부터
   차량의 현재 engagement slot을 향해 추적한다.
2. A* 경로 탐색을 메인 스레드에서 단일 Web Worker로 분리해 렌더링과 적 이동을
   동기식 A* 계산으로 막지 않는다.

현재 저장소는 Vite 브라우저 게임이므로 Node worker_threads나 별도 process가
아니라 module Web Worker를 사용한다. Worker는 경로 계산만 맡고 Enemy, Canvas,
DOM, 차량 충돌 보정은 메인 스레드에 남긴다.

## 현재 문제의 근거

현재 EnemyNavigationCoordinator.processPending()은 프레임당 A*를 제한하지만
findPath() 자체는 동기식이다. 따라서 검색 횟수는 1회여도 한 번의 검색 시간이
메인 스레드의 한 frame을 직접 점유한다.

또한 다음 비용이 메인 스레드에 남아 있다.

- update()와 getLocalMode()에서 같은 slot 직선 terrain 검사를 중복 수행한다.
- Enemy.getSeparation()이 모든 적 배열을 받아 적별로 처음부터 순회한다.
- local steering의 여러 후보가 isOpenForRadiusSegment()를 호출하고, 실제 이동이
  다시 safe progress terrain 검사를 수행한다.
- DEV observer가 켜진 test runtime에서는 적별 snapshot 복사·정렬 비용도 추가된다.

Spike에서 방어력을 기본 5에서 35로 임시 상승시킨 뒤 약 52초 동안 GAME_OVER 없이
관측했을 때에도 liveEnemies 785, pendingNavigationAgents 241,
localSteeringAgents 210, engagedAgents 257, stuckAgents 13이 확인됐다.
따라서 전투 사망을 원인으로 숨기지 않고 navigation 부하와 정지 상태를
관측할 수 있는 별도 fixture가 필요하다.

## 요구사항 및 범위

### 포함

- 카메라 gameplay viewport 기준의 시야 진입 판정
- 시야 진입 즉시 local approach 또는 engaged 전환
- 직선 접근이 막힌 시야 적의 priority path request
- Worker 응답 대기 중 기존 유효 경로와 local fallback 유지
- 단일 Web Worker의 batch A* 경로 탐색
- target revision, terrain revision, request id를 이용한 stale 결과 폐기
- 기존 dedupe/cache와 Worker in-flight request의 결합
- 적 주변 조회용 spatial grid
- 프레임 내 중복 direct terrain 검사 제거
- 메인 navigation 시간과 Worker queue 상태를 확인할 DEV telemetry
- Worker on/off A/B가 가능한 3~4분 QA 전용 load fixture
- canonical test map에서 차량 방어력을 100으로 임시 고정
- 적 이동·terrain 안전 이동·contact damage·wave 회귀 테스트

### 제외

- Enemy 전체 update, local steering, Canvas, DOM을 Worker로 이동
- OffscreenCanvas 또는 SharedArrayBuffer 도입
- 처음부터 여러 Worker를 사용하는 worker pool
- flow field, reverse BFS, HPA*, sector A* 도입
- 이번 plan에서 A* open set을 binary heap으로 교체
- 동적 장애물까지 포함한 Worker용 물리 시뮬레이션
- production 적 속도, HP, 접촉 피해, wave 수량, 방어력 밸런스 변경
- 별도 process 실행 또는 서버 측 pathfinding

## 선택 설계

### 1. 메인 스레드와 Worker의 책임

메인 스레드는 게임 상태와 프레임 결정의 유일한 소유자다.

- Game: 카메라 시야 bounds, 차량 target snapshot, 적 update, 차량 충돌 보정,
  contact damage, render를 담당한다.
- EnemyNavigationCoordinator: visibility priority, slot, spatial index,
  local/path mode, cache, pending/in-flight request, Worker 결과 적용을
  담당한다.
- Enemy: coordinator directive에 따라 local steering 또는 기존 waypoint 이동을
  실행한다.
- EnemyNavigationWorker: 직렬화된 지형 snapshot과 start/goal/radius만 사용해
  TerrainPathfinder.findPath()를 batch 처리한다.

Worker는 Enemy 객체나 TerrainGrid의 메인 인스턴스를 참조하지 않는다. Worker 초기화
시 한 번 TerrainMapData의 구조화 복사본으로 자체 TerrainGrid와
TerrainPathfinder를 만들고, 같은 pathfinder 규칙을 재사용해 메인 경로와
corner-cutting/반지름 계약이 달라지지 않게 한다.

처음에는 Worker 하나만 생성한다. Worker queue가 지속적으로 한계를 넘는다는
telemetry가 확인될 때만 worker 수 증가를 별도 변경으로 판단한다.

### 2. 시야 진입과 즉시 추적

시야는 현재 camera가 표시하는 gameplay world rectangle에 한 terrain cell의
margin을 더한 영역으로 정의한다. 물리적인 line-of-sight가 아니라 사용자가
화면에서 적을 볼 수 있는지를 기준으로 한다.

각 simulation update에서 coordinator는 적별로 다음 순서를 적용한다.

1. 시야 여부를 계산한다.
2. assigned engagement slot까지의 direct terrain 가능성은 한 번만 계산한다.
3. 시야 안이고 direct가 열려 있으면 거리와 무관하게 local 또는 engaged
   directive를 즉시 반환한다.
4. 시야 안이지만 direct가 막혀 있으면 현재 유효한 path를 유지하면서 priority
   Worker request를 등록한다.
5. path가 없거나 오래된 경우에는 마지막 안전 방향·local probe·정지 사유를
   유지하고, Worker 응답 전까지 적을 조용히 멈추게 하지 않는다.

시야 진입 시점은 observer에 visibleSince와 immediateFollowTransition을 기록한다.
통과 기준은 시야 판정 update와 local/engaged 이동 directive 사이가 1
simulation update 이내인 것이다.

기존 localSteeringEnterDistance는 화면 밖 적의 일반적인 local 전환 기준으로
유지할 수 있지만, 시야 안 direct 접근에는 적용하지 않는다. 이로써 화면에
나타난 적이 72 거리 제한과 queue 대기 때문에 path mode에 머무는 문제를
제거한다.

### 3. Worker 경로 요청 흐름

Coordinator의 기존 pending job은 main cache와 dedupe를 유지하고, 실제
pathfinder 호출만 Worker로 넘긴다.

흐름은 다음과 같다.

1. 적별 요청을 기존 key인 terrain revision, start cell, goal cell,
   radius profile로 dedupe한다.
2. 같은 key에 새 적이 추가되면 기존 pending 또는 in-flight job의 requester에
   연결한다.
3. coordinator가 한 update에서 bounded batch를 꺼내 Worker에 전달한다.
4. Worker는 batch의 각 요청을 같은 TerrainPathfinder로 계산한다.
5. 결과에는 requestId, key, terrainRevision, targetRevision, path 또는 null을
   포함한다.
6. 메인 스레드는 모든 revision과 현재 적의 target/goal을 재확인한 뒤 유효한
   결과만 cache에 쓰고 requester에게 적용한다.

Worker가 계산 중인 동안 target이 이동하거나 적이 죽어도 Worker를 동기적으로
취소하지 않는다. 결과를 메인에서 폐기해 취소 통신과 복잡한 공유 상태를
추가하지 않는다. 단, stale in-flight job이 queue를 차지하지 않도록 해당
requester가 모두 사라진 job은 결과 수신 후 폐기한다.

권장 message 계약은 다음 네 종류다.

- init: TerrainMapData와 terrainRevision 전달
- search: requestId와 path job 배열 전달
- result: requestId별 path/null 배열 반환
- dispose: map/run reset 시 Worker 종료

경로 배열과 message에는 Enemy 객체, 함수, class instance를 넣지 않는다. 현재
맵 크기에서 구조화 복사 비용이 path 계산보다 커지는지 telemetry로 확인하고,
그 전에는 SharedArrayBuffer나 수동 binary protocol을 만들지 않는다.

### 4. Worker 실패와 fallback

Worker 생성, init, message 처리 중 오류가 발생하면 다음 순서로 처리한다.

- Worker를 terminate한다.
- in-flight job을 main pending queue로 되돌린다.
- 기존 synchronous coordinator budget으로 검색을 재개한다.
- workerFallbackCount와 마지막 오류 종류를 DEV telemetry에 기록한다.

Fallback은 게임이 멈추지 않게 하는 안전 동작이며 Worker 성능 요구사항의
PASS를 대신하지 않는다. Worker-enabled required runtime에서 Worker가 계속
실패하면 제품 동작은 FAIL로 기록한다.

정상 Worker 결과라도 requestId, targetRevision, terrainRevision 중 하나라도
현재 값과 다르면 적용하지 않는다. stale path가 새 차량 위치로 적을 되돌리는
회귀를 막는 것이 핵심 계약이다.

### 5. 공간 인덱스와 메인 스레드 비용

EnemyNavigationCoordinator.update() 시작 시 생존 적을 world cell 기반의
간단한 spatial grid에 한 번 등록한다. bucket 크기는 separation 최소 거리와
적 반지름을 커버할 수 있는 값으로 policy에서 정하고, 각 적의 local steering은
자기 bucket과 인접 bucket만 조회한다.

Game이 매 적 update마다 전체 this.enemies를 nearbyEnemies로 전달하는 흐름을
제거하고, coordinator가 적별 bounded nearby list를 제공한다. separation은
현재 maxNearbyEnemies까지만 실제 거리 계산을 수행한다.

같은 update에서 계산한 다음 값은 state에 보관해 재사용한다.

- enemy position과 slot point의 directApproachClear
- visible 여부
- assigned slot
- target/terrain revision
- spatial neighbor list

이번 plan에서는 TerrainGrid의 circle sampling 알고리즘 자체를 다시 작성하지
않는다. 중복 호출 제거와 입력 수 제한으로 먼저 효과를 측정하며, terrain
sampling이 여전히 상위 병목으로 남을 때만 별도 plan으로 확장한다.

### 6. Budget과 telemetry

기존 maxPathSearchesPerFrame은 main fallback의 안전 상한으로 유지한다. Worker
경로에는 다음 제한을 추가한다.

- workerEnabled
- workerDispatchInterval
- maxWorkerJobsPerBatch
- maxWorkerInFlightJobs
- maxNavigationMainThreadMs

초기 숫자는 기존 navigation policy와 baseline 측정으로 정하고, 데이터 파일에
분리한다. Main thread는 dispatch와 결과 적용만 수행하므로 Worker가 검색 중인
동안 frame update를 막지 않는다. batch/in-flight 상한을 넘으면 새 요청은
dedupe하거나 최신 target으로 대체하고, 적의 기존 유효 경로는 유지한다.

DEV observer에 다음 값을 추가한다.

- visibleAgents
- visibleImmediateFollowTransitions
- visibleBlockedAgents
- navigationMainMs
- navigationMainMsMax
- workerEnabled
- workerDispatchesThisFrame
- workerJobsInFlight
- workerQueueDepth
- workerResultsThisFrame
- workerStaleResultsThisFrame
- workerFallbackCount
- oldestWorkerRequestAge
- neighborCandidatesTotal
- neighborCandidatesMax
- stoppedAgentsByReason

일반 production runtime에는 이 observer와 상세 적별 snapshot을 노출하지 않는다.

## 구현·검증 단계

### 12.1 baseline과 QA fixture

- 현재 09-a runtime 시나리오와 동일한 개발 observer를 기준선으로 기록한다.
- enemy-navigation-worker 시나리오를 추가하고 worker=on/off query를 DEV에서만
  허용한다.
- fixture는 고정된 수의 적을 생성하고 wave 자동 증가와 추가 spawn을 정지해
  3~4분 동안 적 수가 변하지 않게 한다.
- 개발·테스트의 canonical map은 aurelia/landing-zone으로 고정하고, 차량 armor는
  테스트 시점에만 100으로 override한다.
- navigation 관측을 위해 fixture에서는 game over를 비활성화한다. contact,
  death, wave, reward 회귀는 정상 전투 fixture에서 별도로 확인한다.
- observer가 worker 상태와 visibility transition을 같은 snapshot에 기록한다.

예상 변경 파일:

- src/core/GameTestScenario.ts
- src/core/Game.ts
- src/core/GameTestObserver.ts
- src/core/GameTestObserver.test.ts
- 필요 시 src/core/GameTestScenario.test.ts

### 12.2 시야 우선 및 즉시 추적

- EnemyNavigationTarget에 visible world bounds 또는 동등한 snapshot을 추가한다.
- camera viewport와 margin을 Game에서 한 update에 계산해 coordinator에 전달한다.
- update()에서 direct terrain 검사를 한 번만 수행하고 getLocalMode()가 그 결과를
  재사용하도록 수정한다.
- visible + direct clear 적은 거리와 무관하게 local/engaged directive를 받게 한다.
- visible + blocked 적은 priority request로 등록하고 기존 path를 보존한다.
- visibleSince, immediate follow latency, blocked reason을 agent state와
  telemetry에 추가한다.
- Enemy의 stop 상태가 pending path 자체를 이유로 발생하지 않도록 상태를
  구분한다.

단위 테스트:

- 시야 밖 72 거리 초과 적은 기존 path mode를 유지한다.
- 시야 안 direct 적은 다음 update에 local directive를 받는다.
- 시야 안 blocked 적은 priority request를 받고 기존 유효 path를 지킨다.
- target revision이 바뀐 결과는 적용되지 않는다.
- stopDistance 도달과 blocked stop이 telemetry에서 구분된다.

### 12.3 spatial grid와 중복 검사 제거

- src/core/EnemySpatialIndex.ts에 insert/build/query 책임만 구현한다.
- coordinator가 update마다 한 번 build하고 getNearbyEnemies(enemy)로 bounded
  결과를 제공한다.
- Game이 전체 enemies 대신 bounded list를 EnemyNavigationContext에 전달한다.
- empty bucket, dead enemy 제거, map reset을 단위 테스트로 고정한다.
- directApproachClear와 slot/visible 값을 같은 frame 안에서 재사용한다.

단위 테스트:

- 멀리 떨어진 적이 nearby 결과에 들어오지 않는다.
- 인접 bucket의 적은 조회된다.
- dead enemy는 결과에서 제외된다.
- maxNearbyEnemies 이상 적이 있어도 local steering 호출이 전체 배열을
  순회하지 않는다.
- direct terrain 호출 횟수가 같은 frame 중복 전보다 줄고, 결과 의미가
  변경되지 않는다.

### 12.4 단일 Web Worker pathfinding

- src/core/EnemyNavigationWorkerProtocol.ts에 구조화 복사 가능한 init/search/
  result/dispose message type을 정의한다.
- src/workers/EnemyNavigationWorker.ts에서 map snapshot으로 TerrainGrid와
  TerrainPathfinder를 만들고 batch search를 수행한다.
- EnemyNavigationCoordinator에 Worker lifecycle, pending/in-flight map, result
  검증, stale 폐기, fallback을 연결한다.
- 기존 cache와 negative cache는 coordinator에 유지한다.
- worker=off는 기존 synchronous budget 경로로 실행해 A/B 기준선을 만든다.
- map transition과 beginFreshRun에서 기존 Worker를 dispose하고 새 revision으로
  초기화한다.

단위 테스트:

- 동일 key의 batch 요청이 Worker pathfinder를 한 번만 호출한다.
- null path도 `repathInterval` TTL의 negative cache에 저장하고, TTL 만료 후
  재요청한다. 새 null 결과는 다음 engagement slot을 재탐색한다.
- stale requestId/targetRevision/terrainRevision 결과가 적용되지 않는다.
- Worker error가 pending queue와 synchronous fallback으로 복구된다.
- reset 뒤 이전 map의 in-flight 결과가 새 적에게 적용되지 않는다.
- Worker message에는 class instance나 Enemy 객체가 포함되지 않는다.

### 12.5 예산·telemetry·회귀

- enemy-navigation.json에 Worker와 main navigation budget을 추가하고 loader
  검증을 확장한다.
- coordinator update, Worker dispatch, Worker result apply 시간을 DEV에서만
  측정한다.
- worker queue가 상한을 넘지 않고, 최신 target이 오래된 요청을 대체하도록
  한다.
- 기존 11번 cache/dedupe와 09-a slot/local/stuck 동작이 모두 유지되는지
  회귀 테스트를 실행한다.
- 필요 시 F3에는 aggregate 값만 추가하고, 적별 debug는 기존 DEV observer
  계약 안에서만 유지한다.

### 12.5.1 적 충돌 보정 후속 (중간 구현)

스크린샷 QA에서 차량에 밀린 적이 벽에 끼이거나 spawn 군집이 겹치는 현상을
확인해 추가했던 중간 보정은 12.7~12.9 구현으로 대체했다. 현재 적-적 충돌은
위치를 직접 보정하지 않고 push intent를 통해 자연스럽게 이동하며, 차량 contact
guard만 kinematic 안전 보정으로 유지한다.

- `EnemyCollisionResolver`가 차량 충돌 보정 후보를 `TerrainGrid`의 enemy
  반경 기준 safe progress로 클리핑해 적이 벽 뒤로 이동하지 않게 한다.
- 기존 `EnemySpatialIndex`를 broadphase로 재사용해 적 간 겹침을 이동 전·후에
  bounded pass로 보정한다. exact-overlap spawn은 결정론적 방향과 대체 각도
  probe로 강제 분산한다.
- 충돌 보정은 별도 Worker/thread를 늘리지 않고 메인 게임 루프의 짧은 위치
  보정으로 처리해 pathfinding Worker의 책임과 queue 계약을 유지한다.

단위 테스트:

- 차량이 적을 벽 방향으로 밀어도 최종 위치가 enemy terrain footprint를
  침범하지 않는다.
- 같은 위치에서 생성된 적 군집이 보정 후 서로 겹치지 않고 모두 terrain-safe다.

현재 구현의 자연스러운 동작·밀도·성능 문제는 다음 세 subplan으로 분리해
재설계한다. 권장 순서는 `12.7 → 12.8 → 12.9`다.

- [12.7 적 자연스러운 밀어내기와 spawn admission](12.7-enemy-natural-push-and-spawn-admission.md):
  적-적 위치 강제 변경을 push intent로 바꾸고, 포화 spawn을 skip한다.
- [12.8 적 collider 밀도 조정](12.8-enemy-collider-density.md): 기존 radius 계약을
  유지하면서 standard/tanker footprint를 줄인다.
- [12.9 적 collision 성능 예산과 frame drop 제거](12.9-enemy-collision-performance.md):
  spatial snapshot 공유와 bounded query로 중복·반복 계산을 제거한다.

### 12.6 검증 명령과 runtime QA

node_modules가 없는 환경에서는 구현 검증 전에 npm ci를 실행해 package-lock의
vitest, TypeScript, Vite 의존성을 복원한다. 이후 다음 명령을 실행한다.

1. npm test
2. npm run build
3. git diff --check

오케스트레이터는 현재 plan worktree의 실제 Vite URL·port와 고유 runtimeId를
integration-tester에 전달한다. tester는 별도 서버를 만들거나 다른 port를
찾지 않는다. 정상 검증은 60,000ms 내 결론을 기대하며, 단일 QA 실행 timeout은
최대 240,000ms다. 제품 동작 현상이 확인되면 최소 증거를 남기고 즉시 `FAIL`로
종료한다.

## 약 1분 기대, 최대 4분 runtime 시나리오

필수 URL:

- worker enabled: /?test=1&scenario=enemy-navigation-worker&worker=on
- 비교용 baseline: /?test=1&scenario=enemy-navigation-worker&worker=off

worker=off는 선택 비교용으로 두고, worker=on 실행을 필수 성능 시나리오로
판정한다. 두 실행을 별도 반복하지 않고 빠른 비교가 필요하면 fixture의 첫
30초 baseline snapshot과 이후 worker-on 관측을 한 번에 기록하는 test mode를
추가할 수 있으나, 기본 구현에는 넣지 않는다.

사전조건:

- DEV test observer가 활성화되어야 한다.
- fixture가 canonical map, armor 100, game over disabled, fixed enemy load 상태여야 한다.
- worker-on에서는 Worker init 완료와 terrain revision 일치가 확인되어야 한다.
- worker-off에서는 synchronous fallback이 의도적으로 사용되어야 한다.

시간 순서:

- 0:00~0:15: fixture 초기화, Worker init, armor 100, 적 수와 revision 기록
- 0:15~0:45: 적이 시야 밖에서 생성되고 카메라 영역에 진입하는 동안 핵심 이동·충돌
  기준을 확인
- 0:45~1:00: 차량 이동, queue, stuck recovery, console과 최종 movement 상태를
  확인하고 결론
- 1:00~4:00: 1분 내 결론이 불가능한 환경 지연이나 증거 부족이 있을 때만 연장한다.
  제품 동작 현상이 확인되면 이 구간에 진입하지 않고 즉시 `FAIL`로 종료한다.

통과 기준:

- visible 판정 후 1 simulation update 이내에 local/engaged 추적이 시작된다.
- direct 접근이 가능한 visible 적이 Worker 응답 대기 때문에 멈추지 않는다.
- blocked visible 적은 기존 유효 path를 잃지 않거나 명확한 blocked 상태로
  기록되고, priority request가 생성된다.
- worker-on에서 main navigation 시간이 설정된 maxNavigationMainThreadMs를
  지속적으로 초과하지 않는다.
- worker queue depth와 oldestWorkerRequestAge가 상한 안에서 유지되고 무한히
  증가하지 않는다.
- stale result가 적용되지 않고, 새 target 방향으로 되돌아가는 적이 없다.
- 모든 적이 벽을 관통하지 않고, stuck 적은 recovery 또는 명시적인 no-route
  상태로 전환된다.
- game over가 발생하지 않는다. 이는 fixture 완화 설정으로 사망을 판정에서
  제외한 것이며 전투 회귀 PASS를 의미하지 않는다.
- 브라우저 console error와 runtime exception이 없다.

별도 normal-combat-regression fixture에서는 기본 armor/health/damage/wave를
복원해 다음을 확인한다.

- contact damage와 contact interval
- enemy death와 reward
- wave 진행과 spawn
- pause/resume
- 기존 terrain collision과 차량 충돌 보정

## 성능 완료 기준

- visible direct 적의 추적 latency가 기존 path queue latency에 의존하지 않는다.
- 메인 스레드에서 동기식 A*가 사라지고, Worker-disabled fallback에서만 기존
  budget 내 동기 검색이 발생한다.
- 동일 path key는 Worker batch에서도 한 번만 계산된다.
- 적별 separation 입력이 전체 적 배열이 아니라 인접 bucket으로 제한된다.
- Worker queue가 bounded이며 target revision 변경 시 오래된 요청이 정리된다.
- worker-on의 main navigation 시간과 frame time이 worker-off 기준선보다
  안정적이거나 낮다.
- Worker가 일시적으로 실패해도 게임 loop가 중단되지 않고 fallback telemetry가
  기록된다.

## 변경 예상 파일

- src/core/EnemyNavigationCoordinator.ts
- src/core/EnemyNavigationCoordinator.test.ts
- src/core/EnemySpatialIndex.ts
- src/core/EnemySpatialIndex.test.ts
- src/core/EnemyNavigationWorkerProtocol.ts
- src/workers/EnemyNavigationWorker.ts
- src/entities/Enemy.ts
- src/entities/Enemy.test.ts
- src/core/Game.ts
- src/core/EnemyCollisionResolver.ts
- src/core/EnemyCollisionResolver.test.ts
- src/core/GameTestScenario.ts
- src/core/GameTestObserver.ts
- src/core/GameTestObserver.test.ts
- src/data/enemy-navigation.json
- 필요 시 src/core/TerrainPathfinder.ts 및 관련 테스트
- 구현 완료 후 plans/implementation/progress.md

## 최종 완료 기준

- 카메라 시야에 들어온 적은 다음 simulation update부터 현재 차량 slot을
  추적한다.
- A*는 단일 Web Worker에서 batch 처리되고, 메인 스레드는 게임 상태·local
  steering·충돌·렌더링을 계속 담당한다.
- Worker 결과의 stale revision/request가 적용되지 않는다.
- spatial grid와 direct terrain 결과 재사용으로 적 수 증가에 따른 불필요한
  O(N²) 비용이 제거된다.
- Worker queue, main navigation time, visible follow latency, stuck recovery가
  DEV telemetry에서 확인된다.
- 방어력 100 고정 load fixture의 필수 3~4분 runtime 검증이 PASS 또는 사용자
  MANUAL-PASS다.
- normal combat regression과 단위 테스트, build, diff check가 통과한다.
- Worker 수 확대, flow field, heap, HPA는 이번 결과를 근거로 별도 plan에서
  승인받는다.
