# 탱크 램 충돌 데미지 설계

## 상태

설계 승인 완료. 구현 전 검토용 설계 문서.

## 목표

탱크가 실제로 적 방향으로 이동해 적을 밀어낼 때, 탱크와 적의 상대 접근
속도에 비례한 충돌 피해를 적에게 적용한다. 기존 적-탱크 접촉 피해,
적-적 밀기, terrain-safe 위치 보정, 적 사망 보상 흐름은 유지한다.

## 범위

포함:

- 차량-적 접촉 결과에 충돌 법선과 속도 정보를 추가한다.
- 탱크의 실제 이동이 적 방향을 향할 때만 램 피해를 적용한다.
- 상대 접근 속도와 `dt`를 사용해 프레임률과 무관한 지속 피해를 계산한다.
- 충돌 수치를 `src/data/vehicle-motion.json`에서 조정할 수 있게 한다.
- 단위 테스트와 DEV 전용 `vehicle-ram` runtime fixture를 추가한다.
- 현재 충돌 규칙을 `plans/system.md`에 반영한다.

제외:

- 적 장갑·관통력 상호작용. 램 피해는 장갑을 무시한다.
- 속도 기반 질량, 적별 저항, 차량별 램 장비, 별도 램 쿨다운.
- 새로운 아트·사운드·무기·물리 엔진·충돌 라이브러리.
- 차량 지형 충돌 모델, 적 collider 반지름, 적 경로 탐색 규칙의 변경.
- 차량이 적을 한 프레임에 관통하는 새 swept-volume 모델. 첫 구현은 현재
  차량 bounds 접촉 판정을 재사용한다.

## 현재 구조와 제약

- `Game.update()`가 차량을 먼저 이동시키고 이후 적을 이동시킨다.
- `EnemyCollisionResolver.resolveAgainstVehicle()`가 적을 차량 bounds
  밖의 terrain-safe 위치로 보정한다.
- 적의 탱크 접촉 피해는 `Enemy.tryContactDamage()`와
  `Vehicle.takeDamage()`를 통해 처리한다.
- 적 장갑은 투사체 경로의 `applyArmoredDamage()`에서만 의미가 있으며,
  `Enemy.takeDamage()` 자체는 피해를 직접 차감한다.
- `EnemyCollisionResolver`는 이미 모든 적을 한 번씩 차량과 비교하는
  메인 루프 경로를 소유하므로 새 중첩 적 탐색을 추가하지 않는다.

## 선택한 접근

`EnemyCollisionResolver` 중심의 차량 충돌 이벤트를 사용한다.

`resolveAgainstVehicle()`는 접촉 여부만 반환하는 대신, 접촉 시 다음 정보를
담은 결과를 반환한다.

```ts
interface VehicleCollisionContact {
  normal: { x: number; y: number };
  vehicleClosingSpeed: number;
  relativeClosingSpeed: number;
  contactPoint: { x: number; y: number };
}
```

Resolver는 기존 순서대로 적 접촉을 판정하고 적을 안전 위치로 보정한다. 속도
계산은 보정 전 적 위치를 기준으로 하여, Resolver가 수행한 밀어내기 보정이
충돌 속도에 포함되지 않게 한다.

### 속도 계산

`Game`은 차량 이동 전후 위치와 적 이동 전후 위치를 Resolver에 전달한다.

```text
vehicleVelocity = (vehicleAfter - vehicleBefore) / dt
enemyVelocity = (enemyAfterBeforeResolve - enemyBefore) / dt

vehicleClosingSpeed = max(0, dot(vehicleVelocity, normal))
relativeClosingSpeed = max(0, dot(vehicleVelocity - enemyVelocity, normal))
```

`vehicleClosingSpeed`가 최소 속도 미만이면 램 피해를 적용하지 않는다. 따라서
정지한 탱크에 적이 걸어와 접촉하거나, 탱크가 적에게서 멀어지는 경우에는
램 피해가 발생하지 않는다. 적이 탱크 쪽으로 움직이는 동안 탱크도 적 쪽으로
움직이면 상대 접근 속도에는 양쪽 속도가 반영된다.

충돌 법선은 차량 bounds의 가장 가까운 점에서 적 중심을 향하는 방향으로
계산한다. 중심이 bounds 내부에 있어 법선을 얻을 수 없는 경우에는 차량 중심에서
적 중심으로 향하는 방향을 사용하고, 그것도 불가능하면 차량 이동 방향을
사용한다. 모든 fallback은 정규화하며, 영벡터는 피해를 만들지 않는다.

## 피해 모델과 설정

`src/data/vehicle-motion.json`에 다음 설정을 추가한다.

```json
{
  "ram": {
    "referenceSpeed": 180,
    "damagePerSecondAtReferenceSpeed": 45,
    "minVehicleClosingSpeed": 30
  }
}
```

피해는 매 simulation update에 누적한다.

```text
damagePerSecond = damagePerSecondAtReferenceSpeed
                × relativeClosingSpeed / referenceSpeed
damageThisFrame = damagePerSecond × dt
```

초기 기준은 기본 이동 속도 `180px/s`에서 정지한 Standard 적을 약 1초간
지속해서 밀면 처치하는 수준이다. 현재 HP 기준 Tanker는 약 3.5초가 걸린다.
수치는 runtime 관측 후 JSON만 조정한다.

- `referenceSpeed`, `damagePerSecondAtReferenceSpeed`는 유한한 양수여야 한다.
- `minVehicleClosingSpeed`는 유한한 0 이상 값이어야 한다.
- 계산 결과가 유한하지 않거나 0 이하이면 피해를 적용하지 않는다.
- 적 장갑은 확인하지 않고 `enemy.takeDamage(damageThisFrame)`를 호출한다.
- 별도 램 쿨다운이나 피해 상한은 넣지 않는다. `dt` 적분으로 프레임률을
  보정하며, 고속 업그레이드에서 폭주가 실제로 확인될 때만 후속 제한을 검토한다.

## 게임 루프 데이터 흐름

1. `Game.update()`가 차량 이동 전 위치를 저장한다.
2. `Vehicle.update()`가 terrain-safe 이동을 수행한다.
3. 차량 이동 후 위치로 실제 차량 속도를 계산한다.
4. 각 적 처리 직전에 적의 이전 위치를 저장한다.
5. 적을 기존 navigation 경로대로 이동시킨다.
6. `EnemyCollisionResolver.resolveAgainstVehicle()`가 접촉을 판정하고
   적을 안전 위치로 보정하며 `VehicleCollisionContact`를 반환한다.
7. 접촉 결과가 유효하면 계산된 램 피해를 적에게 적용하고 기존 contact
   impact effect를 재사용한다.
8. 이후 기존 적 사망, 보상 pickup, 사망 effect, 탱크 contact damage 처리를
   그대로 실행한다.

램 피해로 적이 사망한 경우에도 현재 루프의 사망 처리와 wave kill 집계가
중복되지 않도록 기존의 단일 사망 제거 경로를 사용한다.

## 테스트 설계

### 단위 테스트

`src/core/EnemyCollisionResolver.test.ts`에 다음을 추가하거나 확장한다.

- 탱크가 적 쪽으로 이동하면 contact 결과가 반환된다.
- 탱크가 정지하고 적만 이동하면 램 피해 조건이 성립하지 않는다.
- 탱크가 후진하거나 적에게서 멀어지면 `vehicleClosingSpeed`가 0이다.
- 상대 접근 속도가 2배가 되면 초당 피해도 2배가 된다.
- 서로 다른 `dt`로 같은 실제 시간을 시뮬레이션하면 피해 합계가 같다.
- 적 armor 값만 바꿔도 램 피해 합계는 변하지 않는다.
- 차량이 적을 벽 방향으로 밀어도 적 위치는 enemy terrain footprint를
  침범하지 않는다.

필요한 순수 피해 계산은 Resolver 내부의 작은 함수로 두고, 설정 경계와
유한수 검증을 같은 테스트에서 고정한다. 별도 물리 클래스나 새 추상화는
추가하지 않는다.

### 회귀 테스트

- 기존 적-탱크 contact damage interval이 유지된다.
- 적-적 push intent와 spawn admission이 변경되지 않는다.
- 적 사망 후 reward와 wave kill 집계가 한 번만 발생한다.
- pause 상태에서는 램 피해가 진행되지 않는다.
- terrain-safe 차량 이동과 적 위치 보정이 유지된다.

### DEV runtime fixture

`src/core/GameTestScenario.ts`에 `vehicle-ram`을 추가한다.

- canonical map인 `aurelia/landing-zone`을 사용한다.
- wave 자동 진행 대신 고정된 Standard/Tanker fixture를 차량 진행 방향의
  열린 위치에 배치한다.
- fixture 적은 `speed: 0`, `contactDamage: 0`, `reward: 0`으로 설정해
  램 피해 관측을 가리지 않게 한다.
- 차량 이동은 결정적인 전진·정지·후진 구간으로 수행한다.
- DEV observer에 접촉 횟수, 최대 closing speed, 이번 프레임 램 피해와
  fixture 적 HP를 노출한다.

필수 관측:

1. 전진 구간에서 두 적의 HP가 감소하고, 상대 접근 속도가 양수다.
2. 정지 구간에서 HP가 추가로 감소하지 않는다.
3. 후진 구간에서 램 피해가 발생하지 않는다.
4. Standard/Tanker 모두 terrain을 관통하지 않고 사망·보상 흐름이 한 번만
   실행된다.
5. 기존 normal-combat fixture에서 탱크가 적 contact damage를 계속 받는다.

문서 전용 변경이므로 이 설계 문서 작성 자체는 runtime QA 대상이 아니다.
구현 시에는 `AGENTS.md`의 integration-tester 계약에 따라 위 fixture를 실제
URL·port·worktree와 함께 required runtime QA로 실행한다.

## 예상 변경 파일

- `src/data/vehicle-motion.json`
- `src/core/EnemyCollisionResolver.ts`
- `src/core/EnemyCollisionResolver.test.ts`
- `src/core/Game.ts`
- `src/core/GameTestScenario.ts`
- `src/core/GameTestObserver.ts`
- 관련 observer 테스트 파일
- `plans/system.md`
- 구현 후 `plans/implementation/16-vehicle-ram-collision-damage/`
- 구현 후 `plans/implementation/progress.md`

새 파일은 기존 책임으로 해결할 수 없는 경우에만 추가한다.

## 완료 기준

- 탱크가 적 방향으로 실제 이동할 때만 램 충돌 피해가 발생한다.
- 피해량이 상대 접근 속도와 실제 `dt`에 비례한다.
- 적 장갑 값이 램 피해를 감소시키지 않는다.
- 적 위치 보정, terrain-safe 규칙, 기존 contact damage가 회귀하지 않는다.
- Standard/Tanker runtime fixture에서 전진·정지·후진 결과가 observer로 확인된다.
- 관련 단위 테스트, `npm test`, `npm run build`, `git diff --check`가 통과한다.
- 구현 완료 후 progress 기록에 runtime URL, fixture, 결과를 남긴다.

## 단순화와 후속 기준

첫 구현은 현재 bounds 접촉과 per-frame `dt` 적분만 사용한다. 한 프레임에
차량이 적을 통과하는 tunneling이나 고속 업그레이드의 피해 폭주가 실제
runtime에서 확인될 때만 swept-volume 접촉 또는 피해 상한을 별도 plan으로
추가한다. 현재 요구에는 질량·관통력·장비 업그레이드를 넣지 않는다.
