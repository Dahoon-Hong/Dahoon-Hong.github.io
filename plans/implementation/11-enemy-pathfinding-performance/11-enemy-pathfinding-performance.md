# 11. 적 경로 탐색 스케줄링·공유 캐시 최적화

상태: 구현 완료 (최종 runtime 통합 검증은 사용자 지시로 생략)

## 목적

탱크가 움직일 때 모든 적이 같은 프레임에 A*를 다시 실행하면서 발생하는
프레임 드랍을 줄인다. 적의 지형 추적·충돌·접촉 피해 동작은 유지하고, 경로
계산만 공유·지연·분산한다.

현재 `Enemy.updateWithTerrain()`은 다음 조건이 겹친다.

- 모든 적이 매 프레임 남은 경로를 `isPathValid()`로 검사한다.
- 탱크의 목표 cell이 바뀌면 적별 `repathTimer`가 만료되는 즉시 재탐색한다.
- `TerrainPathfinder.findPath()`는 적마다 독립적으로 A*를 실행하고 open set을
  선형 탐색한다.
- 현재 `repathOffset`는 초기 시점만 분산하므로, 목표 cell 변화 뒤에는 여러 적의
  재탐색이 다시 한 프레임에 몰릴 수 있다.

로컬 기준선에서는 Map 1의 한 경로 계산보다 12개 적의 초기 경로 계산 묶음이
크게 증가했으며, 이동 자체보다 경로 탐색 burst가 우선 조사 대상이다. 수치는
환경과 맵에 따라 달라지므로 구현 후 동일 시나리오의 telemetry로 개선 폭을
확인한다.

## 요구사항 및 범위

### 포함

- 적 전체가 공유하는 경로 요청 스케줄러
- 동일한 `(시작 cell, 목표 cell, 반지름)` 요청의 한 번 계산·다중 적용
- 최근 경로의 bounded LRU 캐시와 도달 불가 결과(`null`) 캐시
- 고정 repath 주기와 프레임당 최대 경로 검색 수
- 경로 유효성 검사의 주기화 및 막힘 발생 시 우선 재요청
- 맵 전환·새 게임 시 캐시/대기 요청 초기화
- 개발 전용 navigation telemetry와 자동 테스트
- Map 1 및 terrain-test의 실제 runtime 검증

### 제외

- 적 HP, 속도, 반지름, spawn/wave 수량과 난이도 변경
- 맵 이미지·terrain cell·tank collision 변경
- 새 적 타입, 새 AI 행동, 시각 효과 변경
- 1차 구현에서의 전면 flow-field 또는 A* 자료구조 교체
- 동적 장애물 지원. 현재 맵 지형은 고정이므로 map revision 변경 시 전체
  캐시를 비우는 것으로 충분하다.

## 선택 설계

### 1. 조정 가능한 navigation 정책

`src/data/enemy-navigation.json`을 추가해 다음 값을 코드와 분리한다. 초기값은
현재 동작의 0.25초 주기를 기준으로 시작하고 실제 runtime telemetry로 조정한다.

```json
{
  "repathInterval": 0.25,
  "pathValidationInterval": 0.25,
  "maxPathSearchesPerFrame": 1,
  "maxPathValidationsPerFrame": 4,
  "pathCacheSize": 256
}
```

검증 규칙은 다음과 같다.

- 모든 interval은 유한한 양수다.
- `maxPathSearchesPerFrame`, `maxPathValidationsPerFrame`, `pathCacheSize`는 양의 정수다.
- 검색 예산은 적 수에 따라 자동으로 증가하지 않는다.

### 2. 중앙 `EnemyNavigationCoordinator`

`src/core/EnemyNavigationCoordinator.ts`를 추가하고 `Game`이 한 인스턴스를
소유한다. `Enemy`가 update 중 직접 `findPath()`를 호출하지 않도록 다음 흐름을
사용한다.

1. 한 simulation update에서 차량의 `targetCell`을 한 번 계산한다.
2. 각 생존 적은 현재 cell, 목표 cell, 반지름, 현재 경로 상태만 coordinator에
   제출한다.
3. coordinator는 같은 키의 요청을 하나의 pending job으로 묶는다.
4. 캐시에 있으면 검색 없이 모든 대기 적에게 경로를 복사해 적용한다.
5. cache miss만 round-robin queue에서 처리하고, 한 프레임의 실제 A* 호출 수를
   `maxPathSearchesPerFrame` 이하로 제한한다.
6. 목표가 다시 바뀌기 전에 처리되지 않은 job은 최신 목표 요청으로 대체한다.

대기 중인 적은 기존의 유효한 경로를 계속 사용한다. 경로가 없거나 현재 이동이
막힌 경우에는 해당 적 요청을 우선 처리하고, 결과가 나올 때까지 안전한 이동만
수행한다. 오래된 경로를 사용해 벽을 통과하지 않도록 실제 이동은 계속
`TerrainGrid.getSafeRadiusProgress()`를 거친다.

### 3. 캐시·그룹 키와 수명

캐시 키는 다음 필드를 모두 포함한다.

```text
terrainRevision:startX,startY:goalX,goalY:radiusProfile
```

- `radiusProfile`은 현재 적의 지형 반지름을 구분한다. 작은 적의 경로를 큰
  적에게 재사용하지 않는다.
- 맵 인스턴스가 바뀌거나 새 run을 시작하면 revision을 바꾸고 cache와 pending
  job을 비운다.
- 경로 배열은 적별 상태가 서로 변경하지 않도록 복사해서 전달한다.
- 성공 경로뿐 아니라 `null`도 캐시해 반복되는 도달 불가 검색을 막는다.
- 캐시는 설정된 최대 항목 수를 넘지 않으며, 오래 사용하지 않은 항목부터
  제거한다.

이 방식은 동일 위치에 겹쳐 생성된 적·좁은 통로에서 같은 cell에 모인 적을
실제로 한 번의 탐색으로 처리한다. 서로 다른 시작 cell까지 억지로 같은 경로로
합치지는 않아 잘못된 경로 재사용을 피한다.

### 4. 적별 update 책임 축소

`src/entities/Enemy.ts`는 다음 책임만 남긴다.

- 현재 경로와 waypoint를 보관하고 coordinator가 준 경로를 적용한다.
- 고정 `repathInterval`과 직접 A* 호출을 제거한다.
- `pathValidationInterval`이 되었거나 waypoint 이동이 막힌 경우에만 재검증을
  요청한다.
- target cell 변화는 즉시 검색하지 않고 dirty 상태로 표시한다. scheduler가
  다음 주기에 최신 목표를 처리한다.
- 경로를 따라가는 이동과 반지름 충돌 처리는 기존 로직을 유지한다.

기존 `repathOffset`의 역할은 coordinator의 공정한 round-robin 순서와 검색
예산으로 대체한다. 적 생성 순서·spawn cell 순환·웨이브 동작은 바꾸지 않는다.

## 구현·검증 단계

## 구현 결과

- `EnemyNavigationCoordinator`를 추가해 적 전체의 경로 요청을 한 곳에서
  주기화·예산화하고, 동일한 `(start, goal, radius)` 요청을 묶어 한 번만
  `TerrainPathfinder`를 호출하도록 했다.
- 경로 성공/실패 결과에 bounded LRU 캐시를 적용하고, 맵 전환·새 run 시
  캐시와 대기 요청을 초기화했다. 적은 coordinator가 적용한 경로만 따라가며
  기존 terrain 안전 이동·접촉 피해 동작은 유지한다.
- `enemy-navigation.json`으로 재탐색 주기, 프레임당 검색/검증 예산, 캐시
  크기를 분리하고 DEV observer에 navigation telemetry를 추가했다.
- DEV 전용 `enemy-navigation` 시나리오를 추가해 키 홀드가 제한된 자동화
  환경에서도 Map 1의 여러 target cell 전환을 재현할 수 있게 했다.
- `docs/adding-content/enemies.md`에 공통 경로 탐색 정책과 반지름별 경로
  분리 계약을 반영했다.

### 11.1 기준선과 관측값 고정

변경 전 다음을 측정하고 기록한다.

- 0/6/12마리 적에서 idle, 차량 이동, target cell 전환 시 frame time
- 프레임별 `findPath` 호출 수와 `isPathValid` 호출 수
- 한 경로의 최대 계산 시간과 한 update의 navigation 시간
- Map 1(`160x120`, `18px`)과 terrain-test 결과

테스트용 계측은 개발 전용으로만 두고 production runtime에는 노출하지 않는다.

### 11.2 정책 데이터와 타입 검증

- `enemy-navigation.json`과 타입/검증 함수를 추가한다.
- 누락, 문자열, 0 이하 interval, 정수가 아닌 budget/cache size를 거부한다.
- 기본값으로 조용히 대체하지 않는다.
- loader 단위 테스트로 정상·오류 계약을 고정한다.

### 11.3 coordinator·cache·scheduler 구현

- 경로 요청을 `(start, goal, radiusProfile)`별로 dedupe한다.
- cache hit, negative cache, pending job 공유를 구현한다.
- 한 프레임 검색 예산과 round-robin 공정성을 구현한다.
- 목표가 바뀐 stale job을 폐기하고 최신 요청만 유지한다.
- map/run reset에서 cache와 queue를 초기화한다.
- pathfinder의 기존 반지름·corner-cutting·compact 규칙은 재사용한다.

### 11.4 Enemy·Game 연결

- `EnemyNavigationContext`를 coordinator가 경로를 공급하는 구조로 바꾼다.
- `Enemy.update()` 내부의 직접 A*와 매 프레임 path validation을 제거한다.
- `Game.update()`는 target snapshot을 만들고 coordinator를 적 update와 함께
  호출한다.
- 맵 전환과 `beginFreshRun()`에서 coordinator를 reset한다.
- 일반 gameplay에 영향을 주지 않는 개발 전용 observer 필드만 추가한다.

### 11.5 자동 테스트

다음 테스트를 추가하거나 기존 테스트를 확장한다.

- 동일 key의 여러 적 요청이 `findPath` 한 번으로 처리된다.
- cache hit는 `findPath`를 다시 호출하지 않는다.
- `null` 경로도 재검색하지 않는다.
- radius가 다른 적은 캐시를 공유하지 않는다.
- 프레임 검색 수가 설정된 budget을 넘지 않는다.
- stale target job이 처리되지 않고 최신 목표로 대체된다.
- cache reset 뒤에는 이전 맵의 경로를 사용하지 않는다.
- 주기 전에는 target cell 변화만으로 직접 검색하지 않는다.
- 막힌 waypoint와 도달 불가 경로에서 적이 순간이동하지 않고 재요청한다.
- 기존 terrain 경로, corner-cutting 방지, 적 이동 회귀가 유지된다.

### 11.6 실제 runtime 검증

오케스트레이터가 현재 worktree의 Vite 서버를 지정한 URL·port에서 실행하고,
`integration-tester`가 같은 runtime을 한 번 검증한다.

필수 시나리오:

1. Map 1에서 12마리 이상이 생성된 뒤 차량을 여러 target cell에 걸쳐 이동한다.
2. observer에서 `pathSearchesThisFrame`, `cacheHits`, `deduplicatedRequests`,
   `pendingRequests`, `maxSearchesThisFrame`을 확인한다.
3. 같은 target cell에 머무를 때 주기 밖의 추가 A* 호출이 없고, 설정된 budget을
   초과하는 검색 burst가 없다.
4. target cell이 바뀌면 모든 적이 같은 프레임에 멈추거나 재탐색하지 않고,
   제한된 queue latency 안에 새 경로로 전환한다.
5. terrain-test의 좁은 통로에서 standard/tanker가 벽을 통과하지 않고, 경로가
   없을 때 정지 후 재시도한다.
6. 맵 전환 또는 새 run 뒤 이전 맵 경로가 재사용되지 않는다.
7. console error와 runtime exception이 없다.

성능 완료 기준:

- 한 프레임의 실제 path search 수가 항상 정책 budget 이하이다.
- 동일 key 요청의 pathfinder 호출은 1회이며 나머지는 cache/group 결과를 쓴다.
- 탱크 이동 시 적 수에 비례한 동시 pathfinding spike가 사라진다.
- navigation frame time이 기준선보다 유의미하게 낮아지고, route 갱신 지연은
  `repathInterval + queue latency` 범위 안에 있다.
- 적이 벽을 통과하거나 장시간 stuck되지 않는다.

자동 검증 명령:

1. `npm test`
2. `npm run build`
3. `git diff --check`

아트·오디오·spawn 데이터는 변경 범위 밖으로 두며, release QA를 실행하는 경우
위 runtime 결과와 별도로 기록한다.

2026-09-13 검증 기록:

- `npm test`: 16 files / 73 tests PASS
- `npm run build`: PASS
- `npm run qa:release`: test 73 / art QA / audio QA / build PASS
- 첫 integration-tester 실행은 `plan-11-enemy-navigation` runtime에서
  observer budget·idle 재탐색·reset·console은 PASS했지만, 키 입력이 약
  11.9px만 적용되어 필수 시나리오 1·4를 FAIL했다. 이후 DEV 전용
  `enemy-navigation` 자동 이동 시나리오를 추가했으나, 최종 runtime
  통합 검증은 사용자 지시로 생략했다.

### 11.7 2차 최적화 판단 기준

1차 구현 후에도 cache miss가 대부분이고 적 수가 늘 때 navigation 시간이 다시
증가하면 telemetry를 근거로 별도 plan에서 다음 중 하나를 선택한다.

- 목표 cell·반지름별 reverse flow-field를 만들어 여러 시작 cell이 한 field를
  공유한다.
- `TerrainPathfinder`의 선형 open set을 binary heap으로 교체한다.
- 맵을 sector로 나누고 sector 경로와 local A*를 결합한다.

이 항목들은 1차 계획에 동시에 넣지 않는다. 현재 적 수와 고정 terrain에서
먼저 scheduler/cache의 효과를 확인한 뒤 선택한다.

### 11.8 문서·진행 기록·커밋

구현과 필수 runtime 검증이 PASS한 뒤에만 다음을 수행한다.

- navigation 정책과 적 공통 추적 동작이 바뀌면 `docs/adding-content/enemies.md`
  를 현재 계약에 맞게 갱신한다. 문서 수정 전 `docs/agents.md`를 읽는다.
- `plans/implementation/progress.md`에 구현 결과와 runtime port/시나리오를
  기록한다.
- plan 번호를 포함한 짧은 commit message를 사용한다.
- 별도 요청 없이는 `defence` 직접 push나 PR을 생성하지 않는다.

## 변경 예상 파일

- `src/data/enemy-navigation.json`
- `src/core/EnemyNavigationCoordinator.ts`
- `src/core/EnemyNavigationCoordinator.test.ts`
- `src/entities/Enemy.ts`
- `src/entities/Enemy.test.ts`
- `src/core/Game.ts`
- `src/core/GameTestObserver.ts`
- `src/core/GameTestObserver.test.ts`
- 필요 시 `src/core/TerrainPathfinder.ts` 및 관련 테스트
- 필요 시 `docs/adding-content/enemies.md`
- 구현 완료 후 `plans/implementation/progress.md`

## 최종 완료 기준

- 적 update에서 매 프레임·적별 직접 pathfinding이 제거된다.
- 동일 요청은 묶어서 한 번 계산하고, 재사용 가능한 경로는 bounded cache에서
  제공된다.
- path search와 validation이 일정 주기 및 프레임 budget 안에서 실행된다.
- 맵/새 run 전환 시 stale route가 제거된다.
- 기존 terrain collision, corner-cutting 방지, 적 접촉 피해와 wave 흐름이
  회귀하지 않는다.
- 자동 테스트·build·diff 검사와 필수 integration-tester 시나리오가 PASS한다.
- 2차 flow-field/heap 최적화는 1차 telemetry를 보고 별도 승인한다.
