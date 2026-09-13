# 10. 적별 spawn 가중치와 처치 목표 웨이브

상태: 구현 완료

## 목적

기존 웨이브의 타입별 고정 수량을 제거하고, 맵·웨이브마다 정한 `targetKills`를
달성하면 웨이브가 성공하도록 변경한다. 적 생성은 계속 진행하며, 루트의 기본
`spawn`에 적별 `spawnWeight`를 곱해 생성량을 계산한다. 생성 간격과 한 번에
동시에 생성하는 수(batch)는 각 적 정의가 가진다.

## 요구사항 및 범위

### 포함

- `enemies.json` 루트의 숫자형 기본 `spawn` 계약
- 각 적의 `spawnWeight`, `spawnInterval`, `spawnBatchSize` 계약과 검증
- `progression.json`의 기존 타입별 웨이브 수량 제거 및 `targetKills` 추가
- 타입별 독립 생성 타이머와 batch 생성
- 기본 생성량과 타입 가중치를 곱한 생성량 계산
- 웨이브별 생성 적의 처치 수 추적과 목표 달성 시 wave clear
- HUD·test observer의 생성/처치 목표 telemetry 갱신
- 자동 테스트, 실제 개발 서버, integration-tester 브라우저 검증
- `docs/adding-content/enemies.md`의 데이터 계약 갱신
- 구현 완료 후 `plans/implementation/progress.md` 갱신

### 제외

- 웨이브별 `standard`/`tanker` 고정 quota
- quota를 가중 랜덤으로 선택하는 로직
- 지역 공통 `spawnInterval`, 위협 단계 기반 batch/interval scaling
- `maxAlive`, 별도 `ThreatMeter`, 신규 적 타입·AI·아트·사운드
- 난이도 선택, 무한 모드, 맵 아트·지형 데이터 변경

## 데이터·계산 기준

루트 `spawn`은 모든 타입의 기본 생성량이고, 타입별 설정은 적 정의에 둔다.

```json
{
  "spawn": 5,
  "standard": {
    "spawnWeight": 1,
    "spawnInterval": 0.6,
    "spawnBatchSize": 5
  },
  "tanker": {
    "spawnWeight": 1,
    "spawnInterval": 0.6,
    "spawnBatchSize": 5
  }
}
```

한 타입의 생성 이벤트 수는 다음 계산을 사용한다.

```text
weightedSpawn = round(spawn * spawnWeight)
eventCount = min(weightedSpawn, spawnBatchSize)
```

양수 가중치의 계산 결과는 최소 1로 보정하고, 가중치 0은 해당 타입을 생성하지
않는다. `spawnBatchSize`는 한 이벤트에서 동시에 생성할 수 있는 최대 수이며,
`spawnInterval`은 타입별 이벤트 간 초 단위 간격이다. 두 타입은 각자 타이머로
계속 생성하므로 한 업데이트에서 두 타입의 이벤트가 함께 발생할 수 있다.

`progression.json`의 wave는 다음처럼 처치 목표만 가진다.

```json
{ "targetKills": 12 }
```

`WaveManager`는 현재 웨이브에서 생성한 적만 추적하고, 그 적이 사망한 수가
`targetKills` 이상이면 성공으로 판정한다. 목표에 도달하기 전에 생성된 적 수가
목표를 초과할 수 있으며, 타입별 quota로 생성을 중단하지 않는다.

## 구현 결과 및 검증 결과

- `spawn`을 숫자형 기본 생성량으로 바꾸고, 적 정의의 가중치·interval·batch를
  실제 `WaveManager`에서 사용한다.
- 기존 타입별 웨이브 수량과 지역 공통 spawn 설정을 제거하고, 모든 wave를
  `targetKills` 처치 목표로 전환했다.
- `npm.cmd test`: 15개 test file / 62개 테스트 통과
- `npm.cmd run qa:art`: 오류 0, 기존 경고 2개
- `npm.cmd run build`: 통과
- `git diff --check`: 통과
- integration-tester: `plan-10-enemy-spawn-weight-runtime-2`,
  `http://127.0.0.1:5185/?test=1`에서 observer 필드, standard/tanker 연속
  생성·batch telemetry, 목표 초과 생성, Wave 2 카운터 초기화, HUD 처치
  목표 잔량, 콘솔 오류 없음을 PASS로 확인했다. 이동·카메라·terrain은
  `SKIP-N/A`다.

## 구현·검증 단계

### 10.1 계약과 loader 변경

- `EnemyDefinition`에 세 스폰 필드를 추가한다.
- `EnemyDataRoot.spawn`을 양의 정수로 변경한다.
- `spawnWeight`는 유한한 0 이상, interval은 유한한 양수, batch는 양의 정수로
  검증한다.
- 두 타입의 가중치가 모두 0인 데이터는 거부한다.
- `WaveDefinition`을 `targetKills` 하나로 변경하고 양의 정수로 검증한다.
- 지역 공통 spawn interval 필드를 제거한다.

검증: 정상 데이터, 누락·범위 오류, zero-weight와 all-zero-weight, targetKills
검증을 단위 테스트로 확인한다.

### 10.2 spawn 계산과 WaveManager 연결

- 가중치 곱셈·정수 보정·batch 상한을 작은 순수 함수로 분리한다.
- 타입별 타이머가 자기 interval마다 자기 batch를 생성하도록 한다.
- 기존 spawn cell 순환, standard/tanker 생성 클래스와 repath offset 흐름은
  유지한다.
- 고정 queue, 랜덤 타입 선택, 총량 기반 종료 조건을 제거한다.
- 웨이브 준비 시 처치/생성 카운터와 타입별 타이머를 초기화한다.
- 이전 웨이브의 생존 적이 다음 웨이브 처치 수에 합산되지 않도록 현재 웨이브
  생성 적을 별도로 추적한다.

검증: 곱셈 결과, 타입별 interval, 동시 batch, 연속 생성, spawn cell 순환,
targetKills 달성 및 다음 웨이브 카운터 초기화를 확인한다.

### 10.3 게임 observer·HUD·문서 정합성

- HUD의 남은 수치를 생성 잔량이 아니라 `targetKills - killedEnemies`로 표시한다.
- 개발 전용 observer에 `targetKills`, `killedEnemies`, `spawnedEnemies`를
  노출한다.
- 적 추가 가이드의 필드·계산식·웨이브 예시를 현재 구현과 맞춘다.
- 문서 수정 전 `docs/agents.md`를 확인하고, 문서에 미확정 수치를 추가하지
  않는다.

## 테스트 시나리오

### 자동 검증

- 기본 spawn과 적별 필드가 정상 로드된다.
- 가중치가 기본 spawn에 곱해지고 batch 상한을 넘지 않는다.
- zero-weight 타입은 생성되지 않는다.
- 타입별 interval이 독립적으로 동작하고 여러 타입 batch가 한 update에서
  함께 생성될 수 있다.
- 고정 웨이브 수량 없이 targetKills까지 계속 생성된다.
- 추적된 적 처치 수가 targetKills에 도달하면 wave가 clear된다.
- spawn cell 순환, 다음 웨이브 초기화, progression 순차 진행이 유지된다.

### 필수 runtime 검증

오케스트레이터가 현재 worktree의 Vite 서버를 지정한 포트에서 실행하고,
`integration-tester`가 같은 URL·포트에서 한 번 실행한다.

1. test map의 observer에서 `targetKills`, `killedEnemies`, `spawnedEnemies`가
   표시된다.
2. Wave 1에서 standard와 tanker가 실제로 계속 생성되고 batch telemetry가
   증가한다.
3. 적을 처치하면 `killedEnemies`가 증가하고 목표 달성 시 다음 wave 또는
   REGION CLEARED로 전환된다.
4. 콘솔 오류와 런타임 예외가 없다.

차량 이동·카메라·terrain collision은 변경 범위 외이므로 `SKIP-N/A`로 기록한다.
필수 시나리오가 `FAIL` 또는 `BLOCKED`이면 커밋하지 않는다.

## 검증 명령

1. `npm test`
2. `npm run qa:art`
3. `npm run build`
4. `git diff --check`

## 변경 예상 파일

- `src/data/enemies.json`
- `src/data/progression.json`
- `src/entities/Enemy.ts`
- `src/core/ProgressionManager.ts`
- `src/core/WaveManager.ts`
- `src/core/Game.ts`
- `src/core/GameTestObserver.ts`
- 관련 단위 테스트
- `docs/adding-content/enemies.md`
- `plans/implementation/progress.md`
