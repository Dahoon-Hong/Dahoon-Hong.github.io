# 8. 적 스폰 배치·간격 조절

상태: 구현 완료

설계 문서: [적 스폰 배치·간격 조절 설계](../../../docs/superpowers/specs/2026-09-11-enemy-spawn-scaling-design.md)

## 목적

기존 웨이브별 적 총량과 적 전투 수치를 유지하면서, `enemies.json`에서 다음 스폰 정책을 조정할 수 있게 한다.

- 한 번의 스폰 이벤트에서 생성하는 적 수
- 위협 단계에 따른 batch 수 증가
- 위협 단계에 따른 스폰 interval 보정
- 최종 interval의 안전 하한

1차 위협 단계는 `currentWave - 1`로 계산한다. Wave 1은 0이며, 처치 수·경과 시간 등을 합산한 별도 위협 수치는 구현하지 않고 backlog로 남긴다.

## 요구사항 및 범위

### 포함

- `enemies.json` 루트의 `spawn` 정책 계약 추가
- 적 정의와 스폰 정책을 구분하는 loader/type/validation 변경
- `currentWave`를 받아 batch 수와 interval을 계산하는 순수 로직
- `WaveManager`의 1회 스폰 이벤트 batch 생성
- 남은 큐보다 많이 생성하지 않는 보정
- 기존 스폰 셀 순환과 standard/tanker 큐 순서 유지
- 자동 테스트, 실제 개발 서버, integration-tester 브라우저 검증
- 데이터 계약이 바뀌는 경우 `docs/adding-content/enemies.md` 갱신
- 구현 완료 후 `plans/implementation/progress.md` 갱신

### 제외

- 처치 수·경과 시간·생존 적을 합산하는 `ThreatMeter` 런타임
- 새로운 적 타입, 적별 spawn policy, `maxAlive`
- 웨이브 총량 또는 `progression.json`의 캠페인 밸런스 변경
- 난이도 선택, 무한 모드, `difficulty.json`
- 스폰 이펙트나 신규 UI
- 1번 맵 타일/지형 데이터와 맵 아트 변경

## 데이터·계산 기준

`enemies.json`의 초기 정책은 현재 동작을 보존한다.

```json
"spawn": {
  "baseBatchSize": 1,
  "batchSizePerThreat": 0,
  "maxBatchSize": 3,
  "intervalStep": 0,
  "minimumInterval": 0.25
}
```

계산은 다음 순서로 고정한다.

```text
threatLevel = max(0, currentWave - 1)
regionInterval = max(
  region.minimumSpawnInterval,
  region.spawnInterval + threatLevel * region.spawnIntervalStep
)
spawnInterval = max(
  enemies.spawn.minimumInterval,
  regionInterval + threatLevel * enemies.spawn.intervalStep
)
batchSize = clamp(
  enemies.spawn.baseBatchSize + threatLevel * enemies.spawn.batchSizePerThreat,
  1,
  enemies.spawn.maxBatchSize
)
```

`batchSizePerThreat`는 정수로 유지한다. 실제 생성 시에는 남은 큐의 길이를 한 번 더 적용한다. 초기 `batchSizePerThreat`와 `intervalStep`이 0이므로 기존 Wave 1 및 지역별 interval 동작은 변하지 않는다. 밸런스 수치의 상향은 자동 테스트가 아니라 실제 플레이 검증 결과를 근거로 별도 조정한다.

## 세부 구현·검증 단계

각 단계의 검증이 통과한 뒤에만 다음 단계로 진행한다. 실패하면 해당 단계의 변경만 수정하고 이전 단계의 통과 결과를 다시 확인한다.

### 8.1 현재 계약과 테스트 기준선 고정

변경 전 현재 파일·타입·테스트를 다시 읽고, `WaveManager`의 기존 한 마리 스폰과 스폰 셀 순환을 기준선으로 기록한다.

대상:

- `src/data/enemies.json`
- `src/core/ProgressionManager.ts`
- `src/core/WaveManager.ts`
- `src/core/WaveManager.test.ts` 및 관련 loader/progression 테스트

검증:

- `npm test -- --runInBand` 또는 프로젝트가 지원하는 전체 test 명령으로 기준선 통과
- 현재 `totalWaveEnemies`, `spawnedEnemiesCount`, 웨이브 종료 조건을 확인
- 변경 전 `git diff`가 비어 있고 맵 작업의 기존 커밋 외 변경이 없는지 확인

완료 조건:

- 구현할 타입 경계와 회귀 테스트 대상이 확정된다.
- 기존 큐 순서와 spawn cell 순환을 새 로직에서 보존할 근거가 있다.

### 8.2 `enemies.json` spawn 정책 계약 추가

적 전투 정의 레코드와 루트 `spawn` 정책을 구분하는 타입을 추가한다. 기존 호출부가 `enemyData[enemyType]`로 적 정의를 읽는 동작은 유지하고, `enemyData.spawn`은 별도 경로로 읽는다.

검증할 규칙:

- `baseBatchSize`, `batchSizePerThreat`, `maxBatchSize`는 유한한 정수다.
- `baseBatchSize >= 1`, `batchSizePerThreat >= 0`, `maxBatchSize >= baseBatchSize`다.
- `minimumInterval > 0`이고 유한하다.
- `intervalStep`은 유한한 수이며 음수를 허용한다.
- `standard`, `tanker`의 기존 필수 전투 필드는 그대로 검증한다.
- `spawn`이 누락되거나 enemy type처럼 해석되면 명확한 로딩 오류를 낸다.

검증:

- 정상 JSON이 새 타입으로 로드되는 단위 테스트
- 각 필드 누락, 문자열, `NaN`에 해당하는 잘못된 JSON 값, 음수/범위 오류 테스트
- `standard`/`tanker` lookup 회귀 테스트

완료 조건:

- 타입 우회나 `as` 캐스팅 없이 spawn 정책을 읽는다.
- 잘못된 데이터가 조용히 기본값으로 대체되지 않는다.

### 8.3 순수 spawn scaling 계산기 구현

`currentWave`, 지역 interval 설정, `spawn` 정책을 받아 `threatLevel`, `batchSize`, `spawnInterval`을 반환하는 작은 순수 함수를 추가한다. 기존 로직과 테스트가 겹치면 `WaveManager.ts` 안의 독립 함수로 시작하고, 파일 책임이 커질 때만 별도 모듈로 분리한다.

검증 케이스:

- Wave 1은 `threatLevel = 0`, batch 1, 기존 지역 interval을 반환한다.
- Wave 0 또는 음수 입력은 위협 0으로 clamp된다.
- `batchSizePerThreat`가 증가하면 정수 batch가 증가한다.
- `maxBatchSize`를 넘지 않는다.
- 음수 `intervalStep`도 `minimumInterval` 아래로 내려가지 않는다.
- 지역 minimum이 전역 minimum보다 크면 지역 minimum이 유지된다.
- 큰 wave 값에서도 유한한 batch/interval 결과를 반환한다.

검증:

- 계산 함수 단위 테스트를 먼저 통과시킨다.
- 기존 region의 실제 값 몇 개를 넣어 변경 전 interval과 초기 정책의 결과가 같은지 확인한다.

완료 조건:

- `WaveManager`가 계산식의 일부를 중복 구현하지 않는다.
- 향후 `ThreatMeter`가 `currentWave` 대신 숫자형 위협값을 전달할 수 있는 입력 경계가 보인다.

### 8.4 `WaveManager` batch 생성 연결

한 interval 만료 시 최대 계산된 batch만큼 큐를 소비하고, 각 적을 기존 `spawnEnemy()` 흐름으로 생성한다. 기존 생성 함수의 책임을 유지하면서 실제 생성 개수만 호출부에서 조절한다.

검증 케이스:

- 초기 정책은 기존처럼 interval마다 정확히 1마리를 생성한다.
- batch 2/3 정책은 한 이벤트에서 해당 수만 생성한다.
- 큐가 batch보다 짧으면 남은 수만 생성하고 over-spawn하지 않는다.
- standard와 tanker가 이어지는 큐에서 타입 순서가 바뀌지 않는다.
- 한 batch 안에서도 enemy spawn cell이 매 생성마다 순환한다.
- `spawnedEnemiesCount`가 실제 생성 수만큼 증가한다.
- `totalWaveEnemies`와 wave clear 조건이 기존 총량 기준으로 유지된다.

검증:

- `WaveManager.test.ts`에 기본 정책 회귀 테스트와 batch 테스트를 추가한다.
- 기존 spawn cell cycle 테스트가 계속 통과하는지 확인한다.
- 큰 `delta`에서 한 번의 update가 의도하지 않게 여러 batch를 생성하지 않는 기존 cadence도 확인한다.

완료 조건:

- batch 생성이 기존 적 생성·경로·스폰 위치 검증을 우회하지 않는다.
- Wave 1 플레이 결과는 변경 전과 구분되지 않는다.

### 8.5 실제 데이터와 콘텐츠 가이드 정합성

`src/data/enemies.json`에 spawn 정책을 추가하고, 구현된 계약이 기존 콘텐츠 추가 가이드와 다르면 `docs/adding-content/enemies.md`의 JSON 예시·필드 설명을 갱신한다. `docs/` 파일을 수정하기 전 `docs/agents.md`를 읽는다.

검증:

- JSON parse/loader test
- 모든 enemy definition의 필수 수치와 spawn 정책 validation
- 다른 지역 `progression.json`을 변경하지 않았는지 diff 확인
- `git diff --check`

완료 조건:

- 코드를 읽지 않아도 spawn policy 필드의 단위와 clamp 의미를 알 수 있다.
- 문서와 loader/type/test의 필드 이름이 일치한다.

### 8.6 자동 회귀 및 빌드 검증

다음 명령을 순서대로 실행하고 실패 시 원인을 먼저 해결한다.

1. `npm test`
2. `npm run qa:art`
3. `npm run build`
4. `git diff --check`

검증 포인트:

- 적 스폰 변경이 맵 아트 정합성 검사에 영향을 주지 않는다.
- 타입 검사와 production build가 통과한다.
- 전체 테스트에서 기존 map/tank/terrain 회귀가 없다.

### 8.7 실제 게임 및 integration-tester 검증

이미 실행 중인 dev 서버가 있으면 재사용하고, 없으면 `npm run dev`로 실행한다. 저장소의 `integration-tester` sub-agent를 사용해 실제 브라우저에서 검증한다.

시나리오:

1. 1번 맵을 시작하고 Wave 1에서 적이 한 interval에 1마리씩 생성되는지 확인한다.
2. 테스트용 spawn 정책 또는 실제 조정값으로 후속 wave의 batch 수가 증가하는지 확인한다.
3. interval이 설정된 최소값 아래로 내려가지 않는지 확인한다.
4. 마지막 batch가 총량을 넘겨 생성하지 않는지 확인한다.
5. standard/tanker 구성, HUD 생성 수, wave clear 조건을 확인한다.
6. 기존 맵 지형·탱크 이동·적 경로가 영향을 받지 않는지 최소 smoke test한다.

완료 조건:

- `integration-tester` 결과가 PASS다.
- BLOCKED 또는 FAIL이면 PR/완료 커밋 단계로 진행하지 않고 원인과 재현을 기록한다.

### 8.8 문서·진행 기록·커밋

자동/브라우저 검증이 PASS인 뒤에만 다음을 수행한다.

- `plans/implementation/progress.md`에 `yyyy-mm-dd | plans/implementation/8-enemy-spawn-scaling | ...` 형식으로 구현 결과를 추가한다.
- 변경 파일과 검증 결과를 다시 확인한다.
- 커밋 메시지에 `plan 8`을 포함한다.
- 현재 브랜치에만 커밋하며 `defence` 직접 push나 PR 생성은 별도 요청 없이는 하지 않는다.

## 변경 예상 파일

- `src/data/enemies.json`
- `src/core/ProgressionManager.ts` 또는 관련 data loader/type 파일
- `src/core/WaveManager.ts`
- `src/core/WaveManager.test.ts`
- 관련 progression/data validation test
- 필요 시 `docs/adding-content/enemies.md` (수정 전 `docs/agents.md` 확인)
- `plans/implementation/progress.md`

변경이 필요하지 않은 `progression.json`, map 데이터, 탱크/terrain 파일은 건드리지 않는다. 특히 밸런스 수치를 임의로 크게 올리는 변경은 자동화된 계약 구현과 분리해 실제 플레이 결과로 승인한다.

## 최종 완료 기준

- `enemies.json`의 spawn 정책이 타입 검증을 거쳐 로드된다.
- `currentWave - 1`이 1차 위협 단계로 사용된다.
- batch 수가 설정값과 상한에 따라 계산되고, 실제 생성 수가 웨이브 총량을 초과하지 않는다.
- interval 보정이 지역 cadence와 전역 minimum을 함께 지킨다.
- 기존 Wave 1 동작, 스폰 셀 순환, 적 종류 순서, wave clear 조건이 회귀하지 않는다.
- `npm test`, `npm run qa:art`, `npm run build`, `git diff --check`가 통과한다.
- dev 브라우저에서 1번 맵의 스폰·카운트·웨이브 진행이 확인되고 integration-tester가 PASS다.
- 처치 수·경과 시간 기반 `ThreatMeter`는 구현하지 않고 다음 backlog로 명시되어 있다.
