# 09-a. 적 근거리 Local Steering 및 경로 전환

상태: 구현 완료 (2026-09-14, 사용자 runtime QA MANUAL-PASS)

## 목적

plan 11에서 적별 A* 경로 계산을 중앙 스케줄러와 프레임 예산으로 분산한 뒤
프레임 드랍은 줄었지만, 다음 문제가 남아 있다.

- 적이 차량 중심 cell로 몰린 뒤 차량 충돌 보정에 반복해서 밀려나며 멈춘 것처럼 보인다.
- 차량이 이동할 때 기존 경로를 `repathInterval`과 pending queue latency 동안 계속 따라가서 이전 목표 방향으로 이동한다.
- `maxPathSearchesPerFrame: 1` 때문에 여러 시작 cell의 요청이 쌓이고, 차량이 계속 이동하면 요청이 최신 목표로 교체되어 일부 적이 장시간 경로를 받지 못할 수 있다.
- 현재 navigation telemetry가 집계값 중심이라 적별로 `경로 대기`, `terrain blocked`, `차량 충돌 반복`을 구분하기 어렵다.

이번 plan은 장거리 A*를 유지하면서 차량 주변의 근거리 이동을 별도 모드로 처리한다.
근거리 모드에서는 매 프레임 짧은 terrain probe와 주변 적 회피만 계산하고 A*를
호출하지 않는다.

## 요구사항 및 범위

### 포함

- 차량 중심이 아닌 차량 주변의 접근/공격 슬롯을 navigation 목표로 사용하는 계약
- 차량의 실제 world position과 목표 cell을 분리한 navigation target snapshot
- `PATH_FOLLOWING`, `LOCAL_APPROACH`, `ENGAGED`, `REPATH` 전환 상태
- seek, arrival, separation, 짧은 terrain probe를 결합한 local steering
- local steering 진입·이탈 hysteresis와 target 변경 grace 처리
- waypoint 진행량 기반 stuck 감지 및 우선순위 재탐색
- local steering 중 불필요한 path search/validation 요청 억제
- DEV 전용 local/engaged/stuck telemetry와 path/slot debug 표시
- 적 이동, 차량 충돌 보정, contact damage, terrain 관통 방지 회귀 테스트
- Map 1과 terrain-test 실제 runtime 통합 검증

### 제외

- sector A*, HPA*, flow field 또는 reverse BFS 도입
- A* open set 자료구조 교체와 worker/incremental pathfinder 도입
- full physics, steering library, 가속도 기반 차량/적 물리 구현
- 적 간 정밀한 물리 충돌 또는 동적 장애물 pathfinding
- 적 HP, 속도, 반지름, spawn/wave 수량 및 난이도 변경
- 맵 이미지, terrain cell, tank collision geometry의 전면 변경

## 선택 설계

### 1. Navigation target과 접근 슬롯

`Game`은 한 update에서 다음 target snapshot을 한 번 만든다.

```text
targetPoint       차량의 실제 world position
targetCell        차량 중심이 위치한 terrain cell
engagementBounds  현재 contact resolver와 같은 차량 외곽 bounds
```

`EnemyNavigationCoordinator`는 적별로 안정적인 slot index를 보관한다. 슬롯은
`engagementBounds` 바깥의 8방향 후보 point/cell로 만들고, 적 반지름으로 통과
가능한 후보만 사용한다.

- global path의 goal은 차량 중심 cell이 아니라 선택된 접근 cell이다.
- local mode에서는 접근 cell 중심이 아니라 실제 slot point를 향한다.
- 같은 슬롯에 적이 몰리면 separation으로 분산하고, 슬롯 자체는 매 프레임
  재배정하지 않는다.
- 차량이 이동했을 때 현재 슬롯이 유효하면 유지하고, terrain blocked, 차량과의
  거리 변화, stuck이 발생했을 때만 다른 슬롯을 선택한다.
- 슬롯 후보가 없는 경우에는 local direct movement를 시도하지 않고 `REPATH` 또는
  명시적 `NO_ROUTE` 상태로 남긴다.

차량 중심을 최종 waypoint로 사용하지 않으므로, 이동 후
`resolveEnemyAgainstGrid()`가 적을 밀어내는데도 같은 중심 waypoint를 계속
따라가는 반복을 제거한다. 접근 슬롯의 contact 거리는 현재 차량 충돌 보정과
contact damage 판정이 서로 다른 위치를 사용하지 않도록 같은 bounds/radius
계약에서 계산한다.

### 2. Local steering 계산

매 프레임 다음 순서로 최종 이동 방향을 계산한다.

1. `seek`: 현재 적 위치에서 assigned slot point로 향하는 방향
2. `arrival`: slot에 가까워질수록 속도를 줄이는 배율
3. `separation`: 가까운 적에서 멀어지는 방향을 작은 가중치로 추가
4. `terrain probe`: 최종 방향의 짧은 이동 segment가 통과 가능한지 확인

개념적인 계산은 다음과 같다.

```text
desired = normalize(seek * 1.0 + separation * separationWeight)
candidateEnd = position + desired * min(speed * dt, probeDistance)
```

candidate가 terrain에 막히면 목표 방향 주변의 고정된 소수 후보를 시험한다.

```text
desired angle, ±20°, ±45°, ±90°, reverse
```

각 후보는 `isOpenForRadiusSegment()`와 실제 이동의
`getSafeRadiusProgress()`를 모두 통과해야 하며, 통과 가능한 후보 중 slot까지의
거리 감소량과 방향 전환량을 함께 평가해 선택한다. 모든 후보가 막히면 이동하지
않고 stuck timer를 증가시킨다.

이번 plan에서는 현재 적 수를 기준으로 주변 적을 bounded scan으로 조회하고,
`maxNearbyEnemies`까지만 separation을 적용한다. 적 수가 증가해 이 부분이
profile상 병목이 될 때만 spatial hash를 별도 plan으로 추가한다.

가속도·관성은 추가하지 않는다. 현재 Enemy의 speed/dt 이동 계약을 유지하고,
arrival·slot·separation·terrain probe만으로 자연스러움과 예측 가능한 충돌을
먼저 확보한다.

### 3. 전환 상태와 hysteresis

```text
PATH_FOLLOWING
  ├─ 근거리 + slot 직선 segment 통과 가능 → LOCAL_APPROACH
  ├─ 경로/waypoint가 무효 → REPATH
  └─ 일정 시간 이동하지 못함 → LOCAL_APPROACH 또는 REPATH

LOCAL_APPROACH
  ├─ contact/attack 거리 도달 → ENGAGED
  ├─ slot segment가 잠시 막힘 → terrain probe 유지
  ├─ 일정 시간 막힘 → REPATH
  └─ exit 거리 이상 멀어짐 → PATH_FOLLOWING

ENGAGED
  ├─ assigned slot을 유지하며 arrival/separation 적용
  └─ 차량 이동 또는 slot 무효 → LOCAL_APPROACH
```

진입과 이탈에 서로 다른 거리를 사용한다. 초기값은 데이터로 분리하되 최종
밸런스 값으로 확정하지 않는다.

```json
{
  "localSteeringEnterDistance": 72,
  "localSteeringExitDistance": 90,
  "localSteeringProbeDistance": 24,
  "localSteeringStuckDuration": 0.2,
  "localSteeringGracePeriod": 0.15,
  "separationWeight": 0.3,
  "maxNearbyEnemies": 8
}
```

`localSteeringEnterDistance`와 `localSteeringExitDistance`는 차량 중심까지의
거리 대신 assigned slot 또는 engagement bounds까지의 거리로 판정한다.

차량이 이동해 target cell이 바뀌어도 local mode의 targetPoint/slot은 매 프레임
갱신한다. 기존 global path는 짧은 grace period 동안만 fallback으로 유지하며,
그 이후에는 현재 target으로 직접 이동 가능하면 local mode를 사용하고, 불가능하면
우선순위 A*를 요청한다. 목표가 바뀔 때마다 모든 적의 A*를 즉시 실행하지 않는다.

### 4. Stuck 감지와 coordinator 연결

적은 다음 값을 navigation 상태로 기록한다.

- 마지막 관측 위치와 관측 시각
- 마지막 waypoint까지의 거리
- 실제 이동량 또는 safe progress
- 현재 slot/target revision
- 연속 blocked 시간

차량 충돌 보정 이후에도 위치가 반복해서 이전 위치로 돌아오거나,
`localSteeringStuckDuration` 동안 waypoint/slot과의 거리가 줄지 않으면 stuck으로
판정한다.

- slot까지 terrain segment가 열려 있으면 local steering으로 전환한다.
- slot까지도 막혀 있으면 해당 적만 priority path request로 등록한다.
- pending 상태에서는 같은 key를 반복 등록하지 않는다.
- `NO_ROUTE` 결과는 잠시 유지하되 target revision 또는 slot이 바뀌면 다시
  시도한다.

local mode에 들어간 적은 path validation과 A* 요청 대상에서 제외한다. local
mode가 종료된 뒤에만 global path 상태를 다시 평가한다.

### 5. 책임과 인터페이스

- `Game`: 차량 이동 뒤 target snapshot과 engagement bounds를 만들고 coordinator에
  전달한다. 적 update와 contact resolver의 순서는 유지한다.
- `EnemyNavigationCoordinator`: slot 할당, global path 요청, 상태 전환, stale
  target 처리, stuck priority를 담당한다.
- `Enemy`: path waypoint 이동과 local steering 이동을 실행하고, 실제 이동 결과를
  coordinator가 읽을 수 있는 최소 telemetry로 제공한다.
- `enemy-navigation.json`: local steering threshold와 separation 정책을 보유하고
  기존 정책 검증 함수에서 값의 범위와 정수 여부를 검증한다.

새로운 steering framework나 범용 agent abstraction은 만들지 않는다. 계산이
`Enemy.ts`의 이동 책임을 넘어서지 않는 한 private helper로 유지한다.

### 6. DEV telemetry

기존 aggregate navigation observer에 다음 필드를 추가한다.

- `localSteeringAgents`
- `engagedAgents`
- `stuckAgents`
- `pendingNavigationAgents`
- `oldestPendingRequestAge`
- `localSteeringTransitionsThisFrame`

F3 debug overlay에서는 적별 mode와 assigned slot을 표시한다.

- PATH_FOLLOWING: 기존 path 색상
- LOCAL_APPROACH: 별도 색상과 slot marker
- ENGAGED: contact ring 표시
- STUCK/REPATH: 경고 색상

production runtime에는 적별 debug observer를 노출하지 않는다.

## 구현·검증 단계

### 09-a.1 target/slot 계약과 상태 기반 준비

- `EnemyNavigationTarget` 또는 동등한 snapshot 구조를 정의한다.
- `Game`이 targetPoint, targetCell, engagementBounds를 한 번 계산하도록 연결한다.
- coordinator에 적별 stable slot assignment와 target revision을 추가한다.
- 차량 중심 cell을 최종 goal로 직접 사용하는 기존 흐름을 접근 cell/slot 기준으로
  전환한다.
- slot 후보의 radius-aware terrain 검증과 contact bounds 일치 여부를 테스트한다.

예상 변경 파일:

- `src/core/Game.ts`
- `src/core/EnemyNavigationCoordinator.ts`
- `src/entities/Enemy.ts`
- `src/core/EnemyNavigationCoordinator.test.ts`
- `src/entities/Enemy.test.ts`

### 09-a.2 local steering과 근거리 전환

- seek/arrival/separation 벡터 계산을 추가한다.
- bounded nearby enemy scan과 separation weight를 적용한다.
- 목표 방향 주변 고정 후보에 대한 terrain probe를 추가한다.
- `getSafeRadiusProgress()`로 최종 이동을 실행한다.
- enter/exit hysteresis와 local grace period를 적용한다.
- local mode에서 path search/validation이 발생하지 않는지 고정한다.

필수 단위 시나리오:

- 열린 공간에서 적이 slot으로 접근한다.
- 같은 slot을 향하는 적들이 separation으로 겹치지 않는다.
- 목표 방향이 막히면 통과 가능한 probe 방향을 선택한다.
- 모든 probe 방향이 막히면 벽을 뚫지 않고 stuck 상태가 된다.
- slot 근처에서 arrival로 overshoot와 진동이 줄어든다.

### 09-a.3 stale path, stuck priority, contact 회귀

- targetPoint가 같은 cell 안에서 이동할 때 local target이 실제 차량을 따라가도록
  수정한다.
- target cell 변경 시 이전 path의 grace/폐기 조건을 구현한다.
- waypoint 이동량과 contact resolver 이후 위치를 사용한 stuck 감지를 연결한다.
- stuck 적은 slot direct path 여부에 따라 local 또는 priority A*로 보낸다.
- 차량 중심으로 진입하지 않고 engagement slot에서 contact damage가 유지되는지
  확인한다.
- map reset, new run, enemy death 시 slot/pending 상태를 정리한다.

필수 단위 시나리오:

- pending path 처리 전에 target이 바뀌어도 최신 target으로만 전환한다.
- target이 같은 cell 안에서 움직여도 적이 이전 cell center에 남지 않는다.
- 차량 충돌 보정으로 밀린 적이 무한히 같은 waypoint를 반복하지 않는다.
- no-route 적이 순간이동하지 않고 재시도 조건을 지킨다.
- standard/tanker 반지름별 슬롯·terrain 통과 가능성이 분리된다.

### 09-a.4 telemetry, runtime QA, 성능 확인

- DEV observer aggregate 필드를 추가한다.
- F3 overlay에서 path/mode/slot/stuck을 확인할 수 있게 한다.
- `npm test`, `npm run build`, `git diff --check`를 실행한다.
- 오케스트레이터가 현재 worktree의 Vite runtime을 지정된 URL·port에서 실행하고,
  `integration-tester`가 별도 서버를 시작하지 않고 검증한다.

runtime fixture 및 사전조건:

- `navigation-survival` (required): Map 1, 적 12마리 이상, 차량 health/armor 상향 또는
  무적, wave 고정, game over 비활성화. 사망이 아니라 slot 접근·local steering·terrain
  안전성이 판정 대상이므로 충분한 관측 시간을 확보한다.
- `stuck-recovery` (required): engaged agent 1개와 의도적으로 정지한 agent 1개를
  배치하고, 정지 agent를 일정 시간 후 복구한다. `stuckEvent`, priority repath/slot
  변경, recovery movement를 시간 순서로 관측한다.
- `normal-combat-regression` (required): 정상 health/damage/wave 조건에서 contact damage,
  wave, enemy death/reward, pause/resume을 별도 확인한다. navigation fixture의 방어력
  완화 설정으로 전투 회귀를 대신 판정하지 않는다.
- 각 fixture의 완화 설정과 observer 핵심 값은 결과에 기록하며, 한 fixture의 조기
  game over 또는 브라우저 관측 실패를 제품 동작 실패로 오인하지 않는다.

필수 runtime 시나리오:

1. Map 1에서 12마리 이상을 생성하고 차량을 여러 terrain cell로 이동한다.
2. 적들이 이전 차량 위치가 아닌 현재 engagement slot 방향으로 전환한다.
3. 차량 주변에서 적이 한 점에 겹치거나 충돌 보정으로 떨지 않는다.
4. local mode 동안 `pathSearchesThisFrame`가 증가하지 않는다.
5. terrain 벽과 좁은 통로에서 적 반지름을 무시하거나 벽을 관통하지 않는다.
6. 한 적을 의도적으로 blocked 상태에 두었을 때 stuck telemetry와 priority
   repath가 관측된다.
7. contact damage, wave 진행, 적 사망/보상, pause/resume이 회귀하지 않는다.
8. console error와 runtime exception이 없다.

## 성능 완료 기준

- local steering frame 비용이 적 수에 대해 작은 bounded neighbor scan 수준이다.
- local mode에서 A* search와 path validation을 새로 발생시키지 않는다.
- target cell 변경 시 모든 적이 같은 frame에 search하지 않는다.
- pending request가 최신 target으로 갱신되더라도 적이 장시간 정지하지 않는다.
- 기존 frame drop 개선을 유지한다.
- path/steering 이동 중 terrain 관통과 contact jitter가 없다.

## 변경 예상 파일

- `src/core/Game.ts`
- `src/core/EnemyNavigationCoordinator.ts`
- `src/core/EnemyNavigationCoordinator.test.ts`
- `src/entities/Enemy.ts`
- `src/entities/Enemy.test.ts`
- `src/core/GameTestObserver.ts`
- `src/core/GameTestObserver.test.ts`
- `src/data/enemy-navigation.json`
- 필요 시 `src/core/GameTestScenario.ts`
- 구현 완료 후 `plans/implementation/progress.md`

## 최종 완료 기준

- 적은 차량 중심 cell이 아니라 radius-aware engagement slot을 최종 목표로 사용한다.
- 장거리에서는 기존 coordinator/A*를 사용하고, 근거리에서는 local steering으로
  매 프레임 이동한다.
- local steering은 seek만 사용하지 않고 arrival, separation, terrain probe를
  함께 적용한다.
- 목표 변경, 차량 충돌 보정, waypoint 정체가 stale path나 무한 정지로 이어지지
  않는다.
- standard/tanker의 terrain clearance와 contact damage가 유지된다.
- 단위 테스트, build, diff check, 필수 runtime 통합 검증이 `PASS` 또는 사용자의
  명시적 `MANUAL-PASS`로 확인된다.
- sector A*/flow field는 09-a 범위에 들어오지 않으며, 이후 telemetry와 적 수가
  필요성을 입증할 때 별도 plan으로 제안한다.

검증 기록:

- `npm test`: 16 files / 77 tests 통과
- `npm run qa:release`: test, art QA(errors 0), audio QA, production build 통과
- runtime QA: 사용자가 QA test 화면을 직접 확인하고 문제없음을 확인해
  `MANUAL-PASS` 처리했다. 자동 integration-tester는 browser/runtime 계약과 관측
  timeout 문제로 완료되지 않았으며, 제품 동작 `FAIL`로 판정된 항목은 없다.
