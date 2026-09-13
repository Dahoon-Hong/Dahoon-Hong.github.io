# 10. 적별 spawn 가중치

상태: 구현 완료

## 목적

기존 웨이브의 적 타입별 수량과 총 생성량은 유지하면서, 각 적 정의의
`spawnWeight`를 사용해 남은 웨이브 quota 중 생성할 타입을 가중 랜덤으로
선택한다. 이를 통해 `standard`/`tanker`가 데이터에 적힌 순서대로 묶여
생성되지 않고, 적별 출현 빈도를 데이터에서 조절할 수 있게 한다.

## 요구사항 및 범위

### 포함

- `EnemyDefinition`과 `enemies.json`의 각 적에 양수 `spawnWeight` 추가
- `ProgressionManager`의 적별 가중치 검증
- `WaveManager`의 남은 타입 quota 기반 가중 선택
- 기존 `progression.json`의 타입별 수량, 웨이브 총량, wave clear 조건 유지
- 테스트 가능한 결정적 RNG 주입 경계 추가
- `docs/adding-content/enemies.md`의 데이터 계약 갱신
- 구현 완료 후 `plans/implementation/progress.md` 갱신

### 제외

- 웨이브의 타입별 수량 제거 또는 가중치 비율에 의한 총량 재계산
- 가중치에 따른 웨이브 총 생성량·batch size·spawn interval 변경
- 신규 적 타입, 신규 AI, 신규 아트·사운드
- 캠페인 웨이브 수량 및 밸런스 변경
- `maxAlive` 또는 별도 `ThreatMeter`

## 데이터 계약

각 적 정의에 `spawnWeight`를 둔다.

```json
{
  "standard": {
    "spawnWeight": 1,
    "hp": 45
  },
  "tanker": {
    "spawnWeight": 1,
    "hp": 160
  }
}
```

초기 데이터 값은 기존 캠페인 밸런스를 임의로 바꾸지 않도록 두 타입 모두
`1`로 둔다. 이후 희귀도 조정은 실제 플레이 결과를 근거로 별도 변경한다.
`spawnWeight`는 유한한 양수여야 하며, 0은 quota가 있는 타입을 영구적으로
선택하지 못하게 만들 수 있으므로 허용하지 않는다.

## 생성 규칙

1. `prepareWave()`는 기존과 같이 `standard`와 `tanker` 수량을 반복한 남은
   queue를 만든다.
2. 스폰할 때마다 queue에 남은 각 항목의 적 정의 `spawnWeight`를 합산한다.
3. `Math.random()`으로 선택한 항목 하나를 queue에서 제거하고 기존
   `spawnEnemy()` 생성·스폰 셀 순환 흐름을 사용한다.
4. queue가 비면 기존 `totalWaveEnemies`와 `spawnedEnemiesCount` 조건으로
   wave 완료를 판정한다.

가중치는 남은 queue 항목 사이의 선택 순서만 바꾸며, 각 타입의 최종 수량은
기존 wave 정의와 동일하다.

## 테스트 시나리오

### 자동 검증

- 양수·유한 `spawnWeight`가 정상 로드된다.
- 누락, 문자열, 0, 음수, `NaN`에 해당하는 잘못된 가중치를 거부한다.
- 결정적 RNG로 높은 가중치 타입이 먼저 선택되는 것을 확인한다.
- 선택 후 해당 타입 quota가 감소하고, 모든 타입의 최종 수량과 총량이
  유지되는 것을 확인한다.
- batch 생성, 남은 queue 초과 방지, spawn cell 순환, wave clear 회귀를
  확인한다.

### 필수 runtime 검증

현재 worktree의 Vite 서버 URL을 오케스트레이터가 지정하고
`integration-tester`가 같은 서버·포트에서 한 번 실행한다.

1. `enemies.json` 적별 `spawnWeight`가 runtime에 로드된다.
2. test map의 Wave 1에서 실제 적이 생성되고 HUD 카운트가 증가한다.
3. Wave 2로 진행해 적 생성과 기존 총량·웨이브 흐름이 유지된다.
4. 콘솔 오류와 런타임 예외가 없다.

차량 이동·카메라·terrain collision은 변경 범위 외이므로 `SKIP-N/A`로
기록한다. 필수 시나리오가 `FAIL` 또는 `BLOCKED`이면 커밋하지 않는다.

## 구현 결과

- `EnemyDefinition`과 `enemies.json`의 `standard`/`tanker`에 `spawnWeight`를
  추가하고 양수·유한 값으로 검증했다.
- `WaveManager`가 남은 queue 항목을 가중 랜덤 선택하고 선택한 quota만 제거하도록
  변경했다. 테스트에서는 RNG를 주입해 선택을 결정적으로 검증한다.
- 초기 weight는 밸런스 수치를 임의로 바꾸지 않도록 두 타입 모두 `1`로 유지했다.

## 2026-09-13 검증 결과

- `npm.cmd test`: 15개 test file / 61개 테스트 통과
- `npm.cmd run qa:art`: 오류 0, 기존 경고 2개
- `npm.cmd run build`: 통과
- `git diff --check`: 통과
- integration-tester: `plan-10-enemy-spawn-weight-runtime-1`,
  `http://127.0.0.1:5185/?test=1`에서 observer·Wave 1/2 생성·HUD·콘솔을
  PASS로 확인했다. 차량 이동·카메라·terrain collision은 `SKIP-N/A`다.

## 검증 명령

1. `npm test`
2. `npm run qa:art`
3. `npm run build`
4. `git diff --check`

## 변경 예상 파일

- `src/data/enemies.json`
- `src/entities/Enemy.ts`
- `src/core/ProgressionManager.ts`
- `src/core/WaveManager.ts`
- `src/core/ProgressionManager.test.ts`
- `src/core/WaveManager.test.ts`
- `src/entities/Enemy.test.ts`
- `src/entities/Module.test.ts`
- `src/entities/Projectile.test.ts`
- `docs/adding-content/enemies.md`
- `plans/implementation/progress.md`
