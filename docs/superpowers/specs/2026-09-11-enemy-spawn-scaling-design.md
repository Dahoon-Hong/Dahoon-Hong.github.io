# Plan 8: 적 스폰 배치·간격 조절 설계

작성일: 2026-09-11

상태: 설계 문서화 완료, 구현 전

구현 순서와 단계별 완료 기준: [8번 적 스폰 배치·간격 조절 구현 계획](../../../plans/implementation/8-enemy-spawn-scaling/8-enemy-spawn-scaling.md)

## 사용자 요구와 적용 범위

이번 변경의 직접 요구는 `enemies.json`에서 웨이브 중 적 스폰 수와 스폰 간격을 조정할 수 있게 하는 것이다.

- 1차 위협값은 기존 런타임의 `currentWave`를 사용한다.
- Wave 1은 위협 단계 0으로 보고, Wave가 올라갈수록 같은 정책의 조정값이 커진다.
- 한 번에 생성하는 수(batch size)와 생성 간격(interval)을 각각 설정할 수 있어야 한다.
- 처치 수·경과 시간 등을 합산하는 별도 위협값은 이번 구현에 넣지 않는다. 대신 후속 `ThreatMeter` backlog로 남겨 다음 단계에서 같은 스폰 정책에 연결한다.
- 이번 변경은 적 스폰 스케줄러와 데이터 계약에 한정한다. 새 적 종류, 난이도 선택 UI, 무한 모드, `maxAlive` 제한은 추가하지 않는다.

첨부 이미지는 이전 맵 작업의 시각적 참고 자료이며, 이번 스폰 정책의 데이터나 규칙을 추가로 정의하는 문서로 해석하지 않는다.

## 현재 구조와 문제

- `src/data/enemies.json`은 현재 `standard`와 `tanker`의 전투 수치만 보유한다.
- `ProgressionManager`가 읽는 `progression.json`의 웨이브 정의는 적 종류별 총량을 보유한다.
- `WaveManager`는 한 번의 interval마다 큐에서 적 한 마리만 꺼내 생성한다.
- 현재 interval은 지역의 `spawnInterval`, `spawnIntervalStep`, `minimumSpawnInterval`으로 계산된다.
- 한 번의 스폰 이벤트에서 생성하는 수와, 스폰 정책을 나중에 다른 위협값으로 교체할 수 있는 순수 계산 경계가 없다.

현재 웨이브별 총 적 수와 적 종류별 전투 수치는 유지하면서, 스폰 이벤트 단위의 배치 수와 간격만 별도 조정할 수 있어야 한다.

## 접근 방식 선택

| 방식 | 판단 |
| --- | --- |
| `progression.json`의 웨이브마다 batch/interval을 직접 추가 | 총량과 시간 정책이 섞이고 모든 웨이브를 반복 수정해야 하므로 제외한다. |
| `enemies.json` 루트에 공통 `spawn` 정책을 추가 | 적 전투 정의와 스폰 정책을 분리하면서 기존 웨이브 구성과 지역별 기본 cadence를 재사용할 수 있어 채택한다. |
| 별도 `difficulty.json`을 즉시 도입 | 향후 ThreatMeter에는 적합하지만 현재 요구보다 범위가 크고 기존 difficulty/endless 설계와 중복될 수 있으므로 backlog로 미룬다. |

선택안은 `enemies.json`의 `spawn` 정책을 로드하고, `WaveManager`가 `currentWave`에서 계산한 위협 단계로 순수한 스케줄 값을 얻는 구조다. `WaveManager`는 위협값의 출처를 직접 알지 않도록 계산 함수에 숫자형 위협 단계만 전달한다.

## 데이터 계약

`enemies.json` 루트는 적 정의와 스폰 정책을 구분한다.

```json
{
  "spawn": {
    "baseBatchSize": 1,
    "batchSizePerThreat": 0,
    "maxBatchSize": 3,
    "intervalStep": 0,
    "minimumInterval": 0.25
  },
  "standard": {
    "hp": 45,
    "speed": 95,
    "radius": 12,
    "reward": 10,
    "typeName": "Standard",
    "contactDamage": 10,
    "contactDamageInterval": 0.2
  },
  "tanker": {
    "hp": 160,
    "speed": 45,
    "radius": 18,
    "reward": 25,
    "typeName": "Tanker",
    "contactDamage": 5,
    "contactDamageInterval": 0.2
  }
}
```

필드 의미는 다음과 같다.

| 필드 | 의미 | 규칙 |
| --- | --- | --- |
| `baseBatchSize` | 위협 0에서 한 스폰 이벤트가 생성하는 적 수 | 정수, 1 이상 |
| `batchSizePerThreat` | 위협 1단계마다 증가하는 배치 수 | 정수, 0 이상. 현재 초기값은 기존 동작 보존을 위해 0 |
| `maxBatchSize` | 한 이벤트의 최대 생성 수 | 정수, `baseBatchSize` 이상 |
| `intervalStep` | 위협 1단계마다 지역 기본 interval에 더하는 초 단위 보정값 | 음수면 빨라지고 양수면 느려짐 |
| `minimumInterval` | 모든 계산 후 적용하는 전역 최소 interval | 양수 |

초기값은 기존 동작을 보존한다. `baseBatchSize: 1`, `batchSizePerThreat: 0`, `intervalStep: 0`으로 시작하며 실제 난이도 수치는 플레이 검증에서 별도로 조정한다. `maxBatchSize`는 향후 상향 조정할 수 있는 안전 상한이고, `minimumInterval`은 과도한 음수 보정으로 무한히 빨라지는 것을 막는다.

## 스케줄 계산 규칙

### 위협 단계

```text
threatLevel = max(0, currentWave - 1)
```

`currentWave`는 현재 웨이브가 준비되는 시점의 값으로 고정한다. 이번 단계에서는 처치 수나 경과 시간을 직접 읽지 않는다.

### 배치 수

```text
batchSize = clamp(
  baseBatchSize + threatLevel * batchSizePerThreat,
  1,
  maxBatchSize
)
```

배치 수는 정수이며, 남은 큐의 적 수보다 커지지 않게 실제 생성 루프에서 다시 제한한다. 따라서 마지막 이벤트가 남은 수를 초과하지 않는다.

### interval

기존 지역별 cadence를 먼저 계산한다.

```text
regionInterval = max(
  region.minimumSpawnInterval,
  region.spawnInterval + threatLevel * region.spawnIntervalStep
)
```

그 다음 공통 정책의 보정값과 최소값을 적용한다.

```text
spawnInterval = max(
  spawn.minimumInterval,
  regionInterval + threatLevel * spawn.intervalStep
)
```

기존 `progression.json` 값의 의미를 바꾸지 않기 위해 지역 설정은 유지한다. `spawn.intervalStep`의 초기값이 0이므로 기존 맵의 interval 결과도 유지된다. 이후 밸런스 조정에서 전역 보정을 사용할 때는 지역 step과 합산되는 것을 명시적으로 고려한다.

## 런타임 동작

- `prepareWave()`는 웨이브 총량과 큐를 기존처럼 구성하고, 같은 시점에 `threatLevel`, `batchSize`, `spawnInterval`을 확정한다.
- interval이 만료되면 `spawnBatch()`가 큐에서 최대 `batchSize`개를 꺼내 생성한다.
- batch 안의 각 적은 기존 `enemySpawnCells` 순환 규칙을 한 번씩 적용한다. 배치 수가 늘어도 특정 스폰 셀에 고정되지 않는다.
- 표준/탱커 큐의 기존 순서와 웨이브별 총량은 유지한다.
- `spawnedEnemiesCount`는 실제 생성한 개수만큼 증가하고, `totalWaveEnemies`와 웨이브 종료 판정은 기존 의미를 유지한다.
- HUD가 이미 생성 수를 표시한다면 batch 생성 후 실제 증가량을 그대로 반영한다. 새로운 HUD나 디버그 UI는 만들지 않는다.
- 이번 범위에서 `maxAlive`는 정의하지 않는다. “한번에 생성할 수”는 동시에 살아 있는 적의 상한이 아니라 하나의 스폰 이벤트에서 생성하는 배치 수로 해석한다.

## 검증 전략

- 데이터 로더가 `spawn`을 적 종류 키로 잘못 취급하지 않고, 누락·비정수·범위 오류를 명확히 거부하는지 검증한다.
- Wave 1에서 배치 1개와 기존 interval 결과가 동일한지 검증한다.
- 테스트 정책을 주입해 Wave 3/5 등 위협 단계에서 batch가 증가하고 음수 interval이 최소값에서 clamp되는지 검증한다.
- 큐에 1개, batch보다 적은 마지막 잔여 수, standard/tanker 혼합 큐를 각각 검증한다.
- 배치 생성에서도 스폰 셀 순환, 총량 초과 방지, 웨이브 clear 조건이 유지되는지 검증한다.
- 실제 게임에서는 Wave 1의 기본 동작, 후속 웨이브의 batch/interval 값, HUD 카운트, 스폰 지점과 경로를 확인한다.

## 후속 backlog: ThreatMeter

현재 `currentWave` 계산 경계를 교체하지 않고, 다음 단계에서 별도 `ThreatMeter`를 추가한다.

1. 경과 시간, 처치 수, 살아 있는 적 수 또는 누적 압력 등 신호를 설정 가능한 가중치로 합산한다.
2. 합산값을 정규화하고 최소·최대 범위를 clamp한다.
3. 고정된 갱신 주기로 위협값을 갱신해 프레임별 변동으로 스폰이 흔들리지 않게 한다.
4. `WaveManager`에는 숫자형 위협값만 전달해 현재의 `currentWave`와 향후 `ThreatMeter`를 교체 가능하게 한다.
5. 저장·난이도 선택·무한 모드와 연결하기 전, 별도 설계와 밸런스 검증을 수행한다.

이번 구현에서는 이 backlog의 런타임 코드, UI, 데이터 필드, 처치/시간 집계를 추가하지 않는다.

## 범위 제외

- 새 적 종류 또는 적별 스폰 정책
- 웨이브별 총 적 수 변경
- `maxAlive`·동시 생존 적 제한
- 난이도 선택, 무한 모드, 별도 `difficulty.json`
- 처치 수·경과 시간 기반 ThreatMeter 런타임
- 스폰 이펙트·새 HUD·맵 아트 변경
