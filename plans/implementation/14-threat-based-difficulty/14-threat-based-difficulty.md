# Plan 14: 위협수치 기반 난이도 시스템

작성일: 2026-09-14

상태: 설계 승인, 구현 대기

관련 문서:

- [90번 Level 및 난이도 Design](../90-level-and-difficulty/90-level-and-difficulty.md)
- [8번 적 스폰 배치·간격 조절](../8-enemy-spawn-scaling/8-enemy-spawn-scaling.md)
- [적 스폰 배치·간격 조절 설계](../../../docs/superpowers/specs/2026-09-11-enemy-spawn-scaling-design.md)

## 1. 목표

맵마다 다른 기본 위협수치에 플레이어가 선택한 난이도 배율과 Stage 진행 시간을 합성하고, 그 결과를 적 스폰량·공격력·Wave 제거 목표에 일관되게 적용한다.

이 plan은 위협수치 계산과 적용 계층을 마련한다. Easy/Normal/Hard 선택 UI와 난이도별 콘텐츠 조정은 90번에서 담당하며, 14번은 선택된 난이도의 공통 `threatMultiplier`를 입력으로 받는다.

핵심 목표는 다음과 같다.

1. 맵·난이도·시간 증가를 한 곳에서 예측 가능하게 계산한다.
2. 모든 튜닝 수치, 계수, 상한, 반올림 규칙과 지원 계산 모드를 JSON에서 수정할 수 있게 한다.
3. 현재 `WaveManager`의 spawn weight, 적 종류 순서, 스폰 셀 순환, Wave clear 조건을 보존한다.
4. 시간에 따른 압력 상승이 Pause나 결과 상태에서 진행되지 않도록 한다.
5. 계산 계층을 순수 로직으로 분리해 자동 테스트와 runtime observer 검증이 가능하게 한다.

## 2. 범위와 plan 분할

### 포함

- 맵별 `threat.baseMultiplier` 데이터 계약
- 신규 `src/data/threat.json`의 시간·출력·formula 설정
- `ThreatManager`의 위협 배율과 파생값 계산
- Plan 90에서 주입하는 난이도 공통 배율 계약
- Stage 경과 시간에 따른 배율 증가
- 스폰 이벤트 batch 수의 위협수치 비례 보정
- 적 생성 시점의 `contactDamage` 보정
- 기존 Wave별 `targetKills`의 위협수치 비례 보정
- 데이터 validation, 단위 테스트, WaveManager 회귀 테스트
- test observer 기반 runtime fixture 및 필수 시나리오 검증

### 제외

- 난이도 선택 UI, 저장, 메뉴 흐름 및 난이도 profile 자체의 세부 밸런스
- 난이도별 플레이어 무기·모듈 수치 변경
- 무한 모드 전용 규칙이나 Boss/Elite
- 처치 수·생존 적 수 등 플레이 성과를 합산하는 별도 동적 신호
- 원거리 적 또는 새 공격 타입
- JSON에서 임의 JavaScript 수식·스크립트를 실행하는 기능
- 위협 UI, 경고 이펙트, 맵 아트 변경
- 위협값에 맞춘 대규모 Stage 콘텐츠 재밸런싱

90번은 난이도 profile을 선택하고 `threatMultiplier`를 제공하는 plan으로 남긴다. 90번의 직접 난이도 배수와 14번의 시간·맵 위협 출력이 같은 속성에 함께 적용될 때는 `기본값 × 난이도 직접 배수 × 위협 출력 배율`의 계층으로 각각 한 번만 적용한다.

## 3. 현재 구조와 문제

- `ProgressionManager`의 Region은 여러 Wave와 Wave별 `targetKills`를 가진다.
- `Game.createWaveManager()`가 맵 spawn cell, 적 정의, `baseEnemySpawn`을 `WaveManager`에 전달한다.
- `WaveManager`는 적별 `spawnWeight`, `spawnInterval`, `spawnBatchSize`를 사용해 이벤트마다 batch를 만들고, 현재 Wave의 `targetKills`를 고정값으로 사용한다.
- `EnemyDefinition.contactDamage`는 적 생성 시 그대로 복사되며, Stage 경과 시간이나 난이도에 따른 공통 위협 계층이 없다.
- Plan 8은 1차 위협값으로 `currentWave`를 사용했지만, 맵 기본값·난이도·Stage 시간 기반 ThreatManager는 아직 없다.

이번 plan은 기존 적 정의를 직접 변형하지 않고, 현재 정의에서 계산한 기본값에 ThreatManager 출력을 적용한다. 기존 `spawnBatchSize`는 위협 1.0에서의 기본 batch를 계산하는 입력으로 사용하며, 위협수치 적용 후의 상한은 `threat.json`에서 관리한다.

## 4. 접근 방식

연속 위협 배율 방식을 사용한다.

| 방식 | 판단 |
| --- | --- |
| 맵 기본값 × 난이도 × 시간의 연속 배율 | 채택. 비례 관계가 명확하고 JSON 계수로 튜닝하기 쉽다. |
| 시간마다 선형 증가하는 위협 단계 | 제외. 장시간 플레이에서 압력 증가가 둔해지고 별도 가속 규칙이 필요하다. |
| 시간 경계마다 급격히 상승하는 티어 | 제외. 경계에서 난이도가 튀고 연속적인 위협감이 약하다. |

JSON에는 코드가 지원하는 `threatMode`와 `outputMode`만 선택하게 한다. 숫자 계수와 clamp 범위는 설정에서 조정하지만, 임의 문자열을 실행해 런타임 로직을 바꾸지는 않는다.

## 5. 데이터 계약

### 5.1 맵 기본 위협값

`src/data/maps.json`의 모든 맵에 다음 블록을 필수로 추가한다.

```json
"threat": {
  "baseMultiplier": 1.00
}
```

첫 튜닝 후보는 다음과 같다. 이는 최종 밸런스가 아니라 동작 확인과 첫 플레이테스트를 위한 시작값이며, 실제 수치는 JSON에서 조정한다.

| 맵 | 시작 후보 |
| --- | ---: |
| `aurelia/landing-zone` | 0.90 |
| `aurelia/relay-fields` | 1.00 |
| `cinder/ash-basin` | 1.10 |
| `cinder/core-ruins` | 1.20 |

`baseMultiplier`는 유한한 양수여야 한다. 맵에 값이 누락되면 1.0으로 조용히 대체하지 않고 로딩을 실패시킨다.

### 5.2 전역 위협 설정

신규 `src/data/threat.json`의 초기 계약은 다음과 같다.

```json
{
  "version": 1,
  "time": {
    "stepSeconds": 60,
    "growthMultiplier": 1.10,
    "minThreatMultiplier": 0.00,
    "maxThreatMultiplier": 4.00
  },
  "outputs": {
    "spawnBatch": {
      "threatWeight": 1.00,
      "minMultiplier": 0.50,
      "maxMultiplier": 4.00,
      "minValue": 1,
      "maxValue": 20,
      "rounding": "nearest"
    },
    "attack": {
      "threatWeight": 1.00,
      "minMultiplier": 0.25,
      "maxMultiplier": 4.00
    },
    "targetKills": {
      "threatWeight": 1.00,
      "minMultiplier": 0.50,
      "maxMultiplier": 4.00,
      "minValue": 1,
      "maxValue": 100,
      "rounding": "nearest"
    }
  },
  "formula": {
    "threatMode": "multiplicative-exponential-time",
    "outputMode": "weighted-linear"
  }
}
```

필드 의미와 validation 규칙은 다음과 같다.

| 필드 | 의미 | validation |
| --- | --- | --- |
| `time.stepSeconds` | 위협 시간이 한 단계 증가하는 Stage 경과 시간(초) | 유한한 수, `> 0` |
| `time.growthMultiplier` | 시간 단계마다 곱하는 증가 배율 | 유한한 수, `>= 1` |
| `time.minThreatMultiplier/maxThreatMultiplier` | 합성된 위협 배율의 하한·상한 | 유한한 수, `0 <= min <= max` |
| `outputs.*.threatWeight` | 해당 출력이 위협 변화에 반응하는 정도 | 유한한 수, `>= 0` |
| `outputs.*.minMultiplier/maxMultiplier` | 기본값에 적용하는 출력 배율 범위 | 유한한 수, `0 < min <= max` |
| `spawnBatch.minValue/maxValue` | 실제 스폰 batch의 정수 범위 | 정수, `1 <= min <= max` |
| `targetKills.minValue/maxValue` | Wave 목표의 정수 범위 | 정수, `1 <= min <= max` |
| `formula.*` | 코드가 지원하는 계산 방식 | 허용된 enum만 가능 |

### 5.3 Plan 90 난이도 입력

90번의 `difficulty.json` profile은 다음 필드를 제공한다.

```json
{
  "id": "normal",
  "name": "보통",
  "threatMultiplier": 1.00
}
```

14번은 난이도 ID나 선택 UI를 알지 못하고, 유한한 양수인 `difficultyMultiplier`만 받는다. 90번이 아직 연결되지 않은 단위·runtime fixture에서는 `1.00`을 주입한다.

## 6. 계산 규칙

### 6.1 위협 배율

Stage는 현재 `ProgressionManager`의 Region에 해당한다. Stage 진입 시 시간을 0으로 초기화하고, Wave가 바뀌어도 시간을 유지한다.

```text
timeIndex = floor(stageElapsedSeconds / time.stepSeconds)

threatMultiplier = clamp(
  mapBaseMultiplier
  × difficultyMultiplier
  × time.growthMultiplier ^ timeIndex,
  time.minThreatMultiplier,
  time.maxThreatMultiplier
)
```

`stageElapsedSeconds`는 PLAYING 시간만 포함한다. `timeIndex`는 매 프레임이 아니라 경계가 바뀔 때만 갱신하며, 큰 frame delta로 여러 경계를 건너뛰면 최종 index를 한 번 계산한다.

### 6.2 출력 배율

각 출력은 독립적인 weight와 범위를 갖는다.

```text
outputMultiplier = clamp(
  1 + output.threatWeight × (threatMultiplier - 1),
  output.minMultiplier,
  output.maxMultiplier
)
```

`threatWeight = 1`이면 위협 배율에 정비례하고, `0`이면 기본값을 유지한다. Easy의 위협 배율이 1보다 작을 때도 같은 식으로 감소하며, 출력별 최소값을 넘지 않는다.

### 6.3 스폰 batch

현재 적 정의에서 기존 함수를 사용해 위협 배율 1.0의 기본 batch를 먼저 구한다.

```text
baseSpawnBatch = calculateEnemySpawnCount(baseEnemySpawn, enemyDefinition)
spawnBatch = clamp(
  round(baseSpawnBatch × spawnBatchMultiplier),
  spawnBatch.minValue,
  spawnBatch.maxValue
)
```

`spawnWeight <= 0` 또는 기존 계산 결과가 0이면 계속 0이다. 그 외에는 실제 큐 잔여량을 한 번 더 적용해 Wave 총량을 초과하지 않는다. 기존 `spawnBatchSize`의 위협 1.0 기준 동작은 유지하고, 위협 증가로 그 값을 넘을 수 있는 새 상한은 `threat.json`에서 관리한다.

### 6.4 공격력

적 생성 시점에 새 객체를 만들어 `contactDamage`만 보정한다.

```text
scaledContactDamage = baseContactDamage × attackMultiplier
```

`contactDamageInterval`, HP, speed, radius, reward는 이 plan에서 변경하지 않는다. 향후 원거리 공격력 필드가 추가되면 동일한 attack 출력 계층에 연결하되, 새 적 타입 구현은 별도 plan으로 분리한다.

### 6.5 Wave 제거 목표

현재 Wave의 `targetKills`를 해당 Wave의 기본 목표로 사용한다.

```text
targetKills = clamp(
  round(baseTargetKills × targetKillsMultiplier),
  targetKills.minValue,
  targetKills.maxValue
)
```

목표는 Wave 시작 시 snapshot하고, Wave 진행 중에는 시간이 경계를 넘어도 변경하지 않는다. 별도의 Stage 총 목표 필드나 Wave 간 목표 분배 시스템은 만들지 않는다.

## 7. 런타임 구성

### 7.1 ThreatManager

`src/core/ThreatManager.ts`는 다음 책임만 가진다.

- 설정과 입력값 validation
- Stage 시작·재시작 시 elapsed reset
- `advance(dt)`를 통한 PLAYING 시간 누적
- `timeIndex`와 현재 위협 snapshot 계산
- spawn batch, attack, targetKills 파생값 계산
- `EnemyDefinition`의 불변 복사본에 attack 출력을 적용

계산 함수는 가능한 한 외부 상태가 없는 순수 함수로 구성한다. 기본 맵·난이도·적·Wave 정의를 직접 변경하지 않는다.

### 7.2 Game 생명주기

1. 맵과 선택 난이도 입력을 확인한다.
2. Stage 진입 시 ThreatManager를 `map.baseMultiplier`와 `difficulty.threatMultiplier`로 초기화한다.
3. PLAYING 상태에서만 `advance(dt)`를 호출한다.
4. `WaveManager`에 `ThreatProvider`를 주입한다.
5. Region 전환·동일 Region 재시작 시 ThreatManager를 reset한다.
6. GAME_OVER·REGION_CLEARED·PAUSED에서는 위협 시간이 진행되지 않는다.

현재 코드에 90번 난이도 선택이 아직 없을 경우에는 `difficultyMultiplier = 1.0`을 명시적으로 주입한다. 90번 구현 시 동일한 provider 경계에 선택 profile의 값을 연결한다.

### 7.3 WaveManager 연결

- `prepareWave()`에서 provider의 현재 snapshot으로 `targetKills`를 한 번 계산한다.
- 스폰 timer가 만료될 때 provider에서 현재 spawn batch를 읽는다.
- 실제 spawn loop는 기존 `spawnEnemy()`와 spawn admission, spawn cell cursor를 그대로 사용한다.
- 적 생성 직전에 provider가 반환한 attack 보정 정의를 사용한다.
- `spawnedEnemiesCount`, `killedEnemiesCount`, `totalWaves`, clear 조건은 기존 의미를 유지한다.

## 8. validation과 오류 처리

- `maps.json`의 모든 맵이 유효한 `threat.baseMultiplier`를 갖는지 `MapDefinitionLoader`에서 검사한다.
- `threat.json`의 version, time, outputs, formula enum을 별도 loader/type 경계에서 검사한다.
- 난이도 입력은 `Number.isFinite()`와 양수 조건을 만족해야 한다.
- weight·배율·상한이 유효하지 않으면 기본값을 넣지 않고 경로가 포함된 오류를 던진다.
- `Math.pow` 또는 곱셈 결과가 유한하지 않으면 최대 위협 배율로 clamp하고 Infinity/NaN을 적·Wave 객체에 전달하지 않는다.
- 정수 출력은 설정된 rounding mode를 거친 뒤 clamp한다.
- 기본값이 0인 spawn 종류 또는 목표가 0인 Wave는 기존 의미를 보존해 0으로 유지한다. 현재 progression validation은 양수 `targetKills`를 요구하므로 정상 콘텐츠에서는 최소 1이 적용된다.

## 9. 구현 단계

각 단계의 자동 검증이 통과한 뒤 다음 단계로 진행한다.

### 14.1 기준선과 입력 계약 고정

대상:

- `src/core/WaveManager.ts`
- `src/core/WaveManager.test.ts`
- `src/core/Game.ts`
- `src/core/ProgressionManager.ts`
- `src/entities/Enemy.ts`

검증:

- 기존 spawn weight·spawn batch·targetKills·Wave clear 테스트 통과
- 현재 `EnemyDefinition` 원본과 `contactDamage` 생성 경계 확인
- Plan 90 profile이 제공해야 할 `threatMultiplier` 계약 기록

완료 조건:

- 기본 batch는 기존 `calculateEnemySpawnCount()` 결과를 사용한다.
- Wave 목표는 기존 `WaveDefinition.targetKills`를 base로 사용한다.
- 위협값 추가 후에도 기존 순서를 보존할 테스트 위치가 확정된다.

### 14.2 설정 타입과 맵 데이터 추가

수정:

- `src/data/threat.json`
- `src/data/maps.json`
- `src/core/MapDefinitionLoader.ts`
- 관련 loader test

구현:

- `MapDefinition.threat.baseMultiplier`를 `MapDefinition`에 포함한다.
- threat config의 typed loader와 validation을 추가한다.
- 허용 formula mode, rounding mode, 범위·정수 검증을 추가한다.
- 현재 네 맵의 시작 후보값을 넣는다.

검증:

- 정상 데이터 로드
- 맵 기본값 누락·문자열·0 이하·Infinity에 해당하는 invalid fixture
- time/weight/clamp/formula 필드별 invalid fixture
- 기존 맵 지형·도달성·아트 계약 회귀

### 14.3 ThreatManager 순수 계산 구현

구현:

- `ThreatSnapshot`과 `ThreatProvider` 타입을 정의한다.
- Stage elapsed와 timeIndex를 관리한다.
- 위협 합성, output weight, clamp, rounding 계산을 독립 함수로 둔다.
- base EnemyDefinition과 Wave 값을 복사해 파생값을 반환한다.

필수 테스트:

- map base × difficulty × time growth 순서
- 0초, 경계 직전, 정확한 경계, 여러 경계 건너뛰기
- maxThreatMultiplier clamp
- weight 0/1 및 출력별 최소·최대 clamp
- batch/target round와 최소 1
- contactDamage만 변경되고 원본 정의가 변하지 않음
- overflow/NaN 방어

### 14.4 Game Stage 시간 연결

구현:

- Stage 생성·재시작·Region 전환 시 ThreatManager reset
- PLAYING update에서만 `advance(dt)` 호출
- Pause·terminal 상태에서 elapsed가 유지되는지 보장
- 90번 미연결 시 명시적 normal fixture를 주입

검증:

- reset 후 timeIndex=0
- Wave 전환 시 elapsed 유지
- Region 재진입 시 elapsed 재시작
- Pause 동안 위협 snapshot 불변

### 14.5 WaveManager와 Enemy 생성 연결

구현:

- `WaveManager`가 숫자형 ThreatProvider만 받도록 연결한다.
- `prepareWave()`에서 targetKills를 snapshot한다.
- 스폰 이벤트마다 현재 batch를 계산한다.
- 적 생성 시 contactDamage 보정 정의를 사용한다.

검증:

- 위협 1.0에서 기존 batch와 targetKills가 동일
- 시간 경계 후 다음 spawn 이벤트의 batch만 증가
- 현재 Wave의 targetKills는 경계 통과 후에도 고정
- standard/tanker spawn weight·순서·cell cursor 유지
- 잔여 큐 초과 spawn 방지
- 적 정의 원본과 기존 clear 조건 불변

### 14.6 runtime fixture와 observer

`GameTestScenario`에 `threat-scaling` 시나리오를 추가한다. 테스트 전용 in-memory config는 `stepSeconds`를 짧게 설정해 1분 이내에 최소 두 번의 시간 경계를 관측할 수 있게 하되, production JSON은 변경하지 않는다.

observer에 다음 값을 추가한다.

- `stageElapsedSeconds`
- `threatTimeIndex`
- `threatMultiplier`
- `spawnBatchMultiplier`와 마지막 실제 batch
- 마지막 생성 적의 `contactDamage`
- 현재 Wave의 scaled `targetKills`

production HUD에는 노출하지 않는다.

### 14.7 자동·runtime QA

자동 검증:

1. `npm test`
2. `npm run build`
3. `git diff --check`

필수 runtime 시나리오:

| 시나리오 | 사전조건 | 관측값 | 통과 기준 | required |
| --- | --- | --- | --- | --- |
| 초기 위협 | `?test=threat-scaling`, PLAYING 진입 | index 0 snapshot | 맵·난이도 입력 합성이 정상이고 값이 유한함 | yes |
| 시간 상승 | 같은 Stage에서 두 시간 경계 대기 | index, threat, batch, attack | 시간이 증가할 때 다음 spawn/생성 적의 값이 설정식과 일치 | yes |
| Pause 고정 | 경계 직전 Pause 후 대기·Resume | elapsed, index, threat | Pause 동안 값이 변하지 않음 | yes |
| Wave snapshot | 시간 경계 전후 Wave 진입 | targetKills | Wave 시작 목표가 진행 중 재계산되지 않음 | yes |
| 회귀 | 기존 test map 전투 | spawn count, clear state, console | 기존 spawn/cell/clear 동작과 런타임 오류 없음 | yes |

runtime 실행 시 현재 plan worktree의 절대 경로, 실제 URL/port, 고유 `runtimeId`, fixture, timeout을 integration-tester에 전달한다. 제품 동작 실패는 `FAIL`, URL·observer·브라우저 같은 환경 문제는 `BLOCKED`로 기록하며, 동일한 BLOCKED 원인을 반복 실행하지 않는다.

### 14.8 문서·진행 기록

검증 통과 후:

- `plans/implementation/progress.md`에 구현 결과를 추가한다.
- Plan 8과 관련 설계 문서의 후속 참조가 Plan 14를 가리키는지 확인한다.
- 90번은 난이도 조정 plan으로 유지하고, Plan 14의 ThreatManager를 완료된 공통 의존성으로 계속 참조한다.
- 구현 commit에는 `plan 14`를 포함한다.

## 10. 예상 변경 파일

신규:

- `src/data/threat.json`
- `src/core/ThreatManager.ts`
- `src/core/ThreatManager.test.ts`
- `plans/implementation/14-threat-based-difficulty/14-threat-based-difficulty.md`

수정:

- `src/data/maps.json`
- `src/core/MapDefinitionLoader.ts` 및 관련 테스트
- `src/core/Game.ts`
- `src/core/WaveManager.ts` 및 관련 테스트
- `src/core/GameTestScenario.ts`
- `src/core/GameTestObserver.ts`
- `plans/backlog`
- `plans/implementation/90-level-and-difficulty/90-level-and-difficulty.md`
- `plans/implementation/8-enemy-spawn-scaling/8-enemy-spawn-scaling.md`
- `docs/superpowers/specs/2026-09-11-enemy-spawn-scaling-design.md`
- 구현 완료 후 `plans/implementation/progress.md`

`Enemy.ts`, `ProgressionManager.ts`, `HUDManager.ts`, `StartMenu.ts`는 현재 계약으로 해결되면 수정하지 않는다. 실제 구현에서 loader 경계나 difficulty provider 연결 때문에 필요해질 경우에만 변경하고, 변경 이유를 plan 진행 기록에 남긴다.

## 11. 최종 완료 기준

- 모든 맵이 JSON으로 조정 가능한 기본 위협값을 가진다.
- Plan 90의 난이도 배율과 Stage 시간 증가가 위협 배율에 순서대로 합성된다.
- 시간은 Stage 단위로 누적되고 Pause·terminal 상태에서는 정지한다.
- spawn batch, contactDamage, Wave targetKills가 각자의 snapshot 시점 규칙에 따라 위협수치에 비례한다.
- 기존 spawn weight, spawn cell 순환, enemy 종류 순서, Wave clear 조건이 회귀하지 않는다.
- invalid config가 조용한 기본값으로 대체되지 않고 명확히 실패한다.
- `npm test`, `npm run build`, `git diff --check`가 통과한다.
- 필수 runtime 시나리오가 PASS 또는 사용자가 직접 확인한 MANUAL-PASS이고, 환경 문제는 BLOCKED로 숨기지 않고 기록된다.
- backlog에는 독립 난이도 항목이 남지 않고, 90번은 난이도 조정 plan, 14번은 위협수치 시스템 plan으로 역할이 분리된다.
