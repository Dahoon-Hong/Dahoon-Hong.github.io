# Plan 완료 테스트 전환 설계

## 상태

- 작성일: 2026-09-12
- 목적: PR 직전 중복 통합 테스트를 제거하고, plan 구현 완료 시점의 단일 테스트로 대체한다.
- 범위: plan 테스트 실행 규칙, 현재 worktree runtime 계약, 테스트 전용 관측성, 결과·skip·대기 정책

## 1. 배경과 문제

현재 `integration-tester`는 PR 생성 전에 별도 호출된다. 이 방식은 다음 문제를 만든다.

- tester가 자체적으로 dev server를 찾거나 시작해 worktree와 runtime이 어긋날 수 있다.
- 같은 변경에 대해 구현 완료 테스트와 PR 전 테스트가 중복될 수 있다.
- 고정 화면과 카메라 추적 때문에 스크린샷만으로 차량의 WASD 이동을 안정적으로 판정하기 어렵다.
- 부모 agent가 중간 상태를 반복 polling하면 브라우저 작업 시간과 토큰이 늘어난다.

## 2. 목표와 비목표

### 목표

- plan 구현 완료 시 한 번의 테스트 실행으로 자동·브라우저 검증을 기록한다.
- 테스트는 변경이 있는 동일 worktree에서 실행 중인 runtime에 접속한다.
- plan에 정의된 시나리오만 실행하고, 대상이 아니거나 환경상 불가능한 검증은 명시적으로 `SKIP`한다.
- 카메라 화면 좌표가 아니라 차량 월드 좌표와 runtime 상태로 이동·스폰을 판정한다.
- tester는 중간 진행을 반복 보고하지 않고 제한된 시간 안에 최종 결과만 반환한다.

### 비목표

- CI 전체 파이프라인이나 원격 브라우저 farm을 새로 구축하지 않는다.
- production 게임에 테스트 HUD나 디버그 API를 노출하지 않는다.
- 스크린샷 픽셀 비교를 일반적인 기능 판정 수단으로 만들지 않는다.

## 3. 용어와 결과 상태

| 상태 | 의미 | plan 완료 처리 |
| --- | --- | --- |
| `PASS` | 필수 시나리오가 실제 runtime에서 통과 | 완료 가능 |
| `SKIP-N/A` | 해당 plan에 테스트 대상 기능이 없음 | 사유 기록 후 완료 가능 |
| `SKIP-ENV` | 외부 환경 제약으로 실행 불가하며 코드 실패 증거는 없음 | 사유·영향 범위를 기록하고 사용자 또는 plan 소유자가 비차단으로 승인한 경우에만 완료 |
| `BLOCKED` | 테스트 대상이지만 runtime·focus·관측성·도구 문제로 판정 불가 | 완료·commit 보류 |
| `FAIL` | 실제 기대 동작과 다름 | 완료·commit 보류 |

`SKIP`은 테스트 대상이 아닌 경우나 명시된 환경 제약에만 사용한다. WASD처럼 plan에 포함된 기능을 관측하지 못한 경우는 `SKIP`이 아니라 `BLOCKED`다.

## 4. 완료 시점 테스트 흐름

```text
plan 구현
  -> 자동 테스트/build
  -> 같은 worktree에서 runtime 준비
  -> plan 시나리오만 실제 브라우저에서 실행
  -> PASS/SKIP/BLOCKED/FAIL 기록
  -> progress 기록 및 commit
  -> PR은 plan 테스트 결과를 참조
```

PR 생성 전 별도의 `integration-tester` 게이트는 제거한다. `integration-tester` agent 자체는 삭제하지 않고 plan 완료 테스트 전담 역할로 전환한다. PR 단계에서는 plan 테스트 결과와 일반 CI 결과를 확인한다.

## 5. Runtime 계약

### 5.1 소유권

테스트 실행 오케스트레이터가 runtime의 유일한 소유자다. tester는 runtime을 새로 시작하거나 다른 프로세스를 찾아 재사용하지 않고, 제공된 URL에만 접속한다.

### 5.2 실행 정보

오케스트레이터는 tester 생성 시 다음 정보를 함께 전달한다.

```text
worktree: C:\...\worktrees\plan-test\local_game
url: http://127.0.0.1:5183/
port: 5183
runtimeId: plan-8-<run-id>
```

runtime launcher는 지정 worktree에서 다음 조건으로 서버를 실행한다.

```text
npm run dev -- --host 127.0.0.1 --port <port> --strictPort
```

- port가 사용 중이면 자동으로 다른 port를 선택하지 않고 실패한다.
- readiness 확인 후에만 tester를 시작한다.
- tester가 종료되거나 timeout이 나면 오케스트레이터가 runtime을 정리한다.
- worktree·port·runtimeId가 manifest와 일치하지 않으면 테스트를 시작하지 않는다.

## 6. 테스트 전용 관측성

`?test=1`이면서 Vite development runtime일 때만 `GameTestObserver`를 활성화한다. observer는 DOM의 안정적인 `data-testid="game-test-observer"` 요소에 현재 snapshot을 표시한다. production build와 일반 플레이에는 요소를 만들지 않는다.

snapshot에 포함할 최소 필드는 다음과 같다.

```text
screen
gameState
wave
totalWaveEnemies
spawnedEnemies
liveEnemies
vehicleWorldX
vehicleWorldY
cameraX
cameraY
movementInput
lastKeyCode / lastKeyAt
movementDistance
lastMovementInput / lastMovementAt
lastSpawnBatchSize
lastSpawnAt
lastSpawnTypes
timestamp
```

### 판정 기준

- 이동: 입력 전후 `vehicleWorldX/Y`의 변화 방향과 최소 delta를 비교한다. camera 좌표나 탱크의 화면 위치는 판정 기준으로 사용하지 않는다.
- 스폰량: `spawnedEnemies` delta와 `lastSpawnBatchSize`를 비교한다.
- 생성간격: 연속 spawn event의 `lastSpawnAt` 차이를 비교한다.
- 마지막 batch: `totalWaveEnemies`를 초과하지 않는지 비교한다.

observer는 게임 동작을 제어하지 않고 읽기 전용 상태만 표시한다. 상태 갱신은 debug 모드에서만 수행한다.

## 7. Plan 시나리오 계약

각 구현 plan은 다음 표를 포함한다.

| id | 시나리오 | setup | action | expected | required |
| --- | --- | --- | --- | --- | --- |
| movement | 차량 이동 | test map, observer 표시 | KeyD 또는 KeyW 입력 | 월드 좌표가 예상 방향으로 변화 | plan 범위에 이동이 있을 때 |
| spawn | 적 생성 | wave 시작 | spawn event 관찰 | batch·interval이 plan 값과 일치 | spawn 변경 시 |
| regression | 기존 흐름 | 기본 시작 경로 | wave 진행 | 화면·콘솔 오류 없음 | runtime 변경 시 |

tester는 `required=true`인 시나리오만 실행한다. `required=false`이거나 plan 범위와 무관한 시나리오는 `SKIP-N/A`로 기록하고 실행하지 않는다.

## 8. 시간·토큰 정책

- plan 완료당 tester 실행은 1회다. 코드 변경 후 재검증이 필요할 때만 새 run을 만든다.
- 부모 agent는 tester의 중간 상태를 polling하지 않고, bounded wait 한 번으로 최종 결과를 받는다.
- runtime readiness timeout, scenario timeout, 전체 run timeout을 각각 둔다. 기본값은 readiness 15초, 시나리오 30초, 전체 180초로 하며 plan이 필요한 경우에만 상향한다.
- focus 재확인은 1회만 허용한다. 재시도 후에도 observer가 변하지 않으면 `BLOCKED`로 종료한다.
- 관찰 지점은 시작, 시나리오 전, 시나리오 후, 최종 console 확인으로 제한한다. 매 frame 스크린샷이나 반복 상태 출력을 금지한다.
- 결과는 URL, worktree, 실행 시나리오, 상태, 핵심 관측값, console 오류, cleanup 결과를 포함하는 짧은 구조로 반환한다.

## 9. 오류와 정리

| 상황 | 결과 | 처리 |
| --- | --- | --- |
| runtime이 지정 port에서 준비되지 않음 | `BLOCKED` | tester 미실행, runtime 정리 |
| 다른 worktree의 URL 또는 port 감지 | `BLOCKED` | 즉시 중단, manifest 기록 |
| observer 미노출 | `BLOCKED` | 일반 스크린샷 추측으로 대체하지 않음 |
| plan에 해당 시나리오가 없음 | `SKIP-N/A` | 실행하지 않고 사유 기록 |
| 외부 서비스·장치 부재 | `SKIP-ENV` | 영향 범위와 승인자 기록 |
| 기대값 불일치 | `FAIL` | 코드 수정 후 새 run 필요 |

모든 종료 경로는 runtime cleanup 결과를 남긴다. orphan server가 남은 경우 해당 run을 완료로 처리하지 않는다.

## 10. 변경 대상과 검증

예상 변경 대상:

- `.codex/agents/integration-tester.toml`: PR 전 게이트를 plan 완료 테스트로 변경
- `scripts/integration-runtime.mjs`: worktree·port·readiness·cleanup 계약 구현
- `src/core/GameTestObserver.ts` 및 `src/main.ts`/`src/core/Game.ts`: dev-only observer 연결
- plan 문서 템플릿 또는 관련 plan: 시나리오 표와 required/skip 규칙 추가
- observer·runtime launcher 단위 테스트 및 운영 문서

검증은 다음 순서로 한다.

1. runtime launcher가 지정 worktree와 strict port를 지키는지 확인한다.
2. observer가 일반 production 경로에 노출되지 않는지 확인한다.
3. observer snapshot의 이동·spawn 값이 실제 Game/WaveManager 상태와 일치하는지 단위 테스트한다.
4. 샘플 plan에서 같은 worktree runtime으로 plan 시나리오를 한 번 실행한다.
5. 결과와 cleanup이 `progress.md`에 기록되는지 확인한다.

## 11. 마이그레이션

- 기존 PR 전 통합테스트 문구를 제거하고 plan 완료 시점 테스트 규칙으로 교체한다.
- 기존 plan의 브라우저 시나리오는 required 여부를 표시한다.
- 문서 전용 plan은 `SKIP-N/A`로 빠르게 종료한다.
- 기존 기능 plan은 observer를 사용해 이동·입력·runtime 상태를 검증한다.
- PR template에는 별도 통합테스트 실행을 요구하지 않고, plan 테스트 결과 링크 또는 요약을 기록한다.
