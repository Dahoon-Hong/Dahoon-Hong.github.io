# Plan 17: 위협수치 기반 Tanker 초기 batch 지연

작성일: 2026-09-16

상태: 구현 완료 · runtime MANUAL-PASS

관련 문서:

- [Plan 14 위협수치 기반 난이도](../14-threat-based-difficulty/14-threat-based-difficulty.md)
- [적 추가 가이드](../../../docs/adding-content/enemies.md)

## 1. 목표

Tanker가 Stage 시작 직후부터 생성되지 않고, 기존 공통 위협수치 증가식과
`spawnBatchSize` 조정만으로 약 3분 이후부터 생성되게 한다. Tanker 전용 해금
타이머, 시간 조건 분기, 별도 스폰 매니저는 추가하지 않는다.

핵심 생성식은 기존 공통 경로를 유지한다.

```text
baseBatch = min(round(baseSpawn × spawnWeight), spawnBatchSize)
actualBatch = clamp(floor(baseBatch × spawnBatchMultiplier), 0, maxValue)
```

`actualBatch`가 0이면 기존 spawn loop가 생성 없이 다음 이벤트로 넘어간다.

## 2. 요구사항 및 범위

### 포함

- `spawnBatch` 정수 출력의 `floor` 반올림 지원
- `spawnBatch.minValue = 0` 허용
- production `threat.json`의 spawn batch 설정 조정
- `enemies.json` Tanker `spawnBatchSize` 초기 튜닝
- 위협수치·배치 경계와 기존 Standard 생성 회귀 테스트
- 구현 결과와 runtime 검증을 `progress.md`에 기록

### 제외

- Plan 90 난이도 profile, 메뉴, UI, 저장
- Tanker 전용 unlock field, elapsed 조건, timer gate, type별 특수 분기
- `WaveManager`의 생성 순서·interval·spawn admission·Wave clear 규칙 변경
- Tanker HP, armor, speed, contact damage, reward 변경
- Plan 14의 공통 threat 시간 곡선 자체 변경

## 3. 현재 구조

- `ThreatManager.getSpawnBatch()`가 기존 적 정의에서 기본 batch를 계산한 뒤
  `spawnBatchMultiplier`를 적용한다.
- 현재 `spawnBatch.minValue = 1`, `rounding = nearest`라서 낮은 배율에서도
  양수 batch가 최소 1로 보정된다.
- `WaveManager`는 Standard와 Tanker를 같은 공통 경로에서 독립 interval로
  처리하므로, 계산 결과가 0이면 별도 차단 로직 없이 생성되지 않는다.
- Plan 14 production threat curve는 `initialMultiplier = 0.25`,
  `growthMultiplier = 1.32`, `stepSeconds = 60`이다.

## 4. 선택 설계

### 4.1 공통 floor 처리

`ThreatManager`의 정수 출력 설정에서 `spawnBatch`에 한해 최소값 0을 허용한다.
`targetKills`는 기존처럼 최소 1을 유지한다. `scaleIntegerThreatValue()`는
이미 설정된 rounding mode 후 clamp하는 공통 경로이므로, Tanker만 인식하는
분기를 만들지 않는다.

### 4.2 데이터 튜닝

`src/data/threat.json`은 다음을 사용한다.

```json
"spawnBatch": {
  "threatWeight": 1,
  "minMultiplier": 0.25,
  "maxMultiplier": 4,
  "minValue": 0,
  "maxValue": 20,
  "rounding": "floor"
}
```

`src/data/enemies.json`의 Tanker `spawnBatchSize`는 2를 시작 후보로 둔다.
기본 맵·Normal 위협 기준 예상 batch는 다음과 같다.

```text
0분: floor(2 × 0.25)    = 0
1분: floor(2 × 0.33)    = 0
2분: floor(2 × 0.4356)  = 0
3분: floor(2 × 0.575)   = 1
5분: floor(2 × 1.0)     = 2
```

Standard의 기존 `spawnBatchSize = 5`는 초기 `floor(5 × 0.25) = 1`이므로
초기 약 1/5 생산과 약 5분 기준 회복을 유지한다.

맵 기본 위협 배율과 향후 난이도 배율은 공통 threat 입력이므로 실제 경계가
맵·난이도별로 약간 당겨지거나 늦어질 수 있다. 이 plan은 별도 Tanker 조건으로
이를 상쇄하지 않고 위협수치 비례 정책을 유지한다.

Tanker도 5분에 기존 batch 5까지 회복해야 하는 요구가 추가되면, 현재의 단일
공통 출력식과 `spawnBatchSize` 정적 값만으로는 “3분까지 0”과 동시에 만족하기
어렵다. 그 경우에는 별도 plan에서 공통 성장식 또는 출력 곡선을 재설계한다.

## 5. 구현 단계

### 17.1 설정·계산 변경

- `ThreatManager`의 정수 설정 validation에 최소 허용값을 인자로 전달한다.
- `spawnBatch`는 0 이상 정수, `targetKills`는 1 이상 정수로 검증한다.
- production `threat.json`을 `minValue = 0`, `rounding = floor`로 변경한다.
- DEV threat fixture도 동일한 rounding/minimum 계약을 사용한다.

### 17.2 적 데이터 변경

- Tanker `spawnBatchSize`를 2로 변경한다.
- Standard 및 Tanker의 interval, weight, 전투 수치는 변경하지 않는다.
- 적 타입별 조건 코드는 추가하지 않는다.

### 17.3 자동 테스트

- 0 배치가 허용되고 음수·소수가 거부되는 설정 validation
- `floor(0.99) = 0`, `floor(1.0) = 1` 경계
- threat curve에서 Tanker batch가 0 → 1로 증가하는 3분 경계
- Standard 초기 batch가 1이고 5분 기준 batch가 5인 회귀
- 기존 WaveManager의 타입별 interval·생성 순서·spawn count 회귀
- 원본 EnemyDefinition과 targetKills 처리 불변

### 17.4 runtime QA

`tanker-batch-floor` DEV fixture를 사용하며 production 수치를 직접 변경하지 않는다.
필수 관측값은 `stageElapsedSeconds`, `threatTimeIndex`,
`spawnBatchMultiplier`, `lastSpawnBatchSize`, `lastSpawnTypes`다.

- 초기 구간: Standard는 생성되고 Tanker batch는 0인지 확인
- 위협 단계 경계: batch floor 결과가 0에서 양수로 바뀌는지 확인
- 시간 상승: 이후 batch가 위협수치에 따라 증가하는지 확인
- Pause: 위협 시간과 batch 계산 입력이 고정되는지 확인
- 일반 전투: Standard/Tanker 기존 이동·접촉·Wave 흐름과 console 오류 회귀 확인

runtime 실행 시 현재 worktree 절대 경로, 실제 dev URL·port, 고유 runtimeId,
사용 fixture와 required 시나리오를 integration-tester에 전달한다. 환경 문제는
`BLOCKED`, 제품 동작 실패는 `FAIL`로 기록한다.

## 6. 완료 기준

- Tanker 전용 시간 체크나 특수 분기 없이 3분 전 batch가 0이다.
- 3분 이후 Tanker가 기존 interval 경로에서 양수 batch로 생성된다.
- Standard의 초기 1/4~1/5 수준 및 5분 기준 회복 흐름이 유지된다.
- 모든 변경 수치는 `threat.json` 또는 `enemies.json`에서 조정 가능하다.
- `npm test`, `npm run build`, `git diff --check`가 통과한다.
- required runtime 시나리오가 PASS/MANUAL-PASS이거나, 환경 BLOCKED 사유가
  progress에 명확히 기록된다.
