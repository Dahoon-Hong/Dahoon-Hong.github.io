# Plan 16: 탱크 램 충돌 데미지

작성일: 2026-09-15

상태: 구현 완료 · runtime MANUAL-PASS

관련 문서:

- [탱크 램 충돌 데미지 설계](../../../docs/superpowers/specs/2026-09-15-vehicle-ram-collision-damage-design.md)
- [모듈 시스템](../../system.md)
- [12번 적 충돌·경로 탐색](../12-enemy-navigation-worker-priority/12-enemy-navigation-worker-priority.md)

## 1. 목표

탱크가 실제로 적 방향으로 이동해 적을 밀어낼 때, 탱크와 적의 상대 접근
속도에 비례한 충돌 피해를 적에게 적용한다.

현재 적이 탱크에 접촉하면 탱크가 지속 피해를 받고, 적-적 충돌은 push intent로
처리된다. 이번 plan은 이 반대 방향인 “탱크가 전진해서 적에게 주는 램 피해”만
추가한다. 기존 terrain-safe 보정, 적 contact damage, 적 사망·보상·wave 흐름은
유지한다.

## 2. 요구사항 및 범위

### 포함

- `EnemyCollisionResolver`의 차량-적 접촉 결과에 충돌 법선과 속도 정보를 추가
- 탱크가 해당 적 방향으로 실제 이동할 때만 램 피해 적용
- 상대 접근 속도와 `dt`에 비례하는 프레임 독립 피해
- `src/data/vehicle-motion.json`의 `ram` 설정으로 수치 분리
- 적 장갑을 무시하는 충돌 피해
- `vehicle-ram` DEV runtime fixture와 observer telemetry
- 단위 테스트 및 기존 적 충돌·사망·pause 회귀 테스트
- 현재 충돌 규칙을 `plans/system.md`에 반영
- 구현 완료 후 `plans/implementation/progress.md` 갱신

### 제외

- 적 장갑·관통력 상호작용
- 속도 기반 질량, 적별 저항, 차량별 램 장비, 별도 램 쿨다운
- 새로운 아트·사운드·무기·물리 엔진·충돌 라이브러리
- 차량 지형 충돌 모델, 적 collider 반지름, 적 경로 탐색 규칙 변경
- 차량이 한 프레임에 적을 관통하는 swept-volume 모델
- 고속 업그레이드용 피해 상한. 실제 폭주가 확인될 때 별도 plan으로 분리

## 3. 현재 구조

- `Game.update()`가 차량을 먼저 이동시키고 적을 이후에 이동시킨다.
- `EnemyCollisionResolver.resolveAgainstVehicle()`가 적과 차량 bounds의 접촉을
  판정하고 적을 enemy terrain-safe 위치로 보정한다.
- `Game`은 적 이동 직전 위치를 저장한 뒤 Resolver를 호출한다.
- 적 contact damage는 `Enemy.tryContactDamage()`와 `Vehicle.takeDamage()`로
  처리한다.
- 투사체의 armor/penetration은 `applyArmoredDamage()`가 담당하지만,
  `Enemy.takeDamage()` 자체는 받은 피해를 직접 HP에서 차감한다.
- 현재 메인 루프가 모든 적을 한 번씩 차량과 비교하므로 램 판정에 별도 중첩
  적 탐색을 추가하지 않는다.

## 4. 선택 설계

### 4.1 Resolver 중심 이벤트

`resolveAgainstVehicle()`를 접촉 여부만 반환하는 API에서 다음 결과를 반환하는
API로 확장한다.

```ts
interface VehicleCollisionContact {
  normal: { x: number; y: number };
  vehicleClosingSpeed: number;
  relativeClosingSpeed: number;
  contactPoint: { x: number; y: number };
}
```

반환값은 접촉이 없으면 `null`이다. 기존 safe position 보정은 같은 메서드에서
계속 수행한다. 속도는 보정 전 적 위치로 계산해 Resolver의 밀어내기 결과가
램 속도에 포함되지 않도록 한다.

호출에 필요한 입력은 다음과 같다.

- 현재 차량 bounds
- 차량 이동 전후 위치
- 적 이동 전후 위치
- simulation `dt`

### 4.2 속도와 방향

```text
vehicleVelocity = (vehicleAfter - vehicleBefore) / dt
enemyVelocity = (enemyAfterBeforeResolve - enemyBefore) / dt

vehicleClosingSpeed = max(0, dot(vehicleVelocity, normal))
relativeClosingSpeed = max(0, dot(vehicleVelocity - enemyVelocity, normal))
```

차량의 실제 `vehicleClosingSpeed`가 `minVehicleClosingSpeed` 미만이면 램
피해를 적용하지 않는다. 따라서 다음은 램 피해가 아니다.

- 정지한 탱크에 적만 접근하는 접촉
- 탱크가 적에게서 멀어지는 이동
- 정지 상태에서 이미 겹쳐 있는 접촉 유지

법선은 차량 bounds의 가장 가까운 점에서 적 중심으로 향하는 방향으로 만든다.
중심이 bounds 내부라 법선이 0이면 차량 중심→적 중심, 그것도 0이면 차량 이동
방향을 fallback으로 사용한다. 정규화할 방향이 없으면 피해를 만들지 않는다.

### 4.3 피해 계산

`src/data/vehicle-motion.json`에 다음을 추가한다.

```json
{
  "ram": {
    "referenceSpeed": 180,
    "damagePerSecondAtReferenceSpeed": 45,
    "minVehicleClosingSpeed": 30
  }
}
```

```text
damagePerSecond = damagePerSecondAtReferenceSpeed
                × relativeClosingSpeed / referenceSpeed
damageThisFrame = damagePerSecond × dt
```

초기 기준은 기본 이동 속도 `180px/s`에서 정지한 Standard 적을 약 1초간
지속해서 밀면 처치하는 수준이다. 현재 HP 기준 Tanker는 약 3.5초가 걸린다.
수치는 runtime QA 후 JSON 값만 조정한다.

- 설정값은 유한수여야 한다.
- `referenceSpeed`와 `damagePerSecondAtReferenceSpeed`는 양수여야 한다.
- `minVehicleClosingSpeed`는 0 이상이어야 한다.
- 계산 결과가 유한하지 않거나 0 이하이면 피해를 적용하지 않는다.
- armor/penetration을 확인하지 않고 `enemy.takeDamage(damageThisFrame)`를
  호출한다.
- 별도 램 쿨다운 없이 `dt` 적분으로 지속 피해를 계산한다.

### 4.4 이펙트와 기존 흐름

새 아트·사운드는 추가하지 않는다. 램 피해 위치에 기존
`effect.contact-damage`를 재사용한다. 램 피해로 적이 사망해도 기존 단일
사망 제거 경로가 reward와 wave kill을 한 번만 처리한다. 적이 탱크에 주는
contact damage는 기존 `tryContactDamage()` 경로를 유지한다.

## 5. 구현 단계

### 16.1 차량 이동·적 이동 snapshot 고정

대상:

- `src/core/Game.ts`
- `src/core/EnemyCollisionResolver.ts`

작업:

- `Vehicle.update()` 전 차량 위치와 후 실제 위치를 저장한다.
- 각 적의 `enemy.update()` 전 위치를 저장한다.
- `dt <= 0`에서는 속도와 램 피해를 계산하지 않는다.
- 기존 호출 순서를 유지해 적 이동 후 차량 접촉 보정이 실행되게 한다.

완료 기준:

- terrain-safe 차량 이동량과 적의 보정 전 이동량을 각각 재현할 수 있다.
- 이전 위치 snapshot이 적 contact damage나 enemy push 로직을 변경하지 않는다.

### 16.2 `EnemyCollisionResolver` contact 결과 확장

대상:

- `src/core/EnemyCollisionResolver.ts`
- `src/core/EnemyCollisionResolver.test.ts`

작업:

- `VehicleCollisionContact` 타입과 `null` 반환 계약을 추가한다.
- 기존 bounds 접촉 및 terrain-safe clipping을 유지한다.
- 접촉 법선, contact point, 차량 closing speed, 상대 closing speed를 계산한다.
- 위치 보정 전 적 위치를 사용하고, normal fallback을 정규화한다.
- 기존 boolean을 기대하는 테스트와 `Game` 호출부를 새 결과 계약에 맞춘다.

완료 기준:

- 탱크가 적 방향으로 이동하면 양수 closing speed가 반환된다.
- 정지·후진·이탈 이동은 램 피해 조건을 만족하지 않는다.
- 적 위치는 기존과 동일하게 terrain-safe다.
- 적-적 push intent, spawn admission, collision telemetry가 변하지 않는다.

### 16.3 램 수치 설정과 순수 계산

대상:

- `src/data/vehicle-motion.json`
- `src/core/EnemyCollisionResolver.ts`
- `src/core/EnemyCollisionResolver.test.ts`

작업:

- `ram.referenceSpeed`, `damagePerSecondAtReferenceSpeed`,
  `minVehicleClosingSpeed`를 추가한다.
- 설정 경계와 유한수 검증을 추가한다. 기존 motion 설정 로딩 방식에 맞춰
  별도 설정 loader를 만들지 않는다.
- Resolver 내부의 작은 순수 함수로 `damageThisFrame`을 계산한다.
- armor/penetration과 연결하지 않는다.

완료 기준:

- 상대속도 2배가 초당 피해 2배를 만든다.
- 서로 다른 frame delta로 같은 실제 시간을 시뮬레이션해도 총 피해가 같다.
- armor 값이 다른 적의 램 피해가 같다.
- 음수·NaN·Infinity 입력이 HP를 변경하지 않는다.

### 16.4 `Game` 적용과 사망 흐름 연결

대상:

- `src/core/Game.ts`
- 관련 게임/observer 테스트

작업:

- Resolver 결과가 있을 때만 램 피해를 계산한다.
- `vehicleClosingSpeed` threshold를 통과한 결과만 적용한다.
- 기존 contact impact effect를 재사용한다.
- 램 피해 직후에도 현재 사망 제거·pickup·wave kill 흐름을 단일 경로로
  유지한다.
- 탱크가 받는 enemy contact damage와 GAME_OVER 처리를 건드리지 않는다.

완료 기준:

- 전진 중 적 HP가 감소한다.
- 정지·후진 중 적 HP가 추가 감소하지 않는다.
- 램 피해 사망 시 reward와 kill count가 중복되지 않는다.
- pause/terminal 상태에서는 Game update 자체가 진행되지 않는다.

### 16.5 DEV fixture와 observer

대상:

- `src/core/GameTestScenario.ts`
- `src/core/Game.ts`
- `src/core/GameTestObserver.ts`
- 관련 observer 테스트

작업:

- `vehicle-ram` 시나리오를 추가한다.
- canonical map `aurelia/landing-zone`의 열린 공간에 고정 Standard/Tanker를
  차량 진행 방향으로 배치한다.
- fixture 적은 `speed: 0`, `contactDamage: 0`, `reward: 0`으로 설정한다.
- 결정적인 전진·정지·후진 movement fixture를 사용한다.
- observer에 다음 개발 전용 필드를 추가한다.
  - 램 접촉 수
  - 이번 프레임 램 피해
  - 누적 램 피해
  - 최대 relative closing speed
  - fixture 적 HP/live 상태
- production HUD나 일반 runtime API에는 observer를 노출하지 않는다.

완료 기준:

- fixture가 wave 자동 생성과 적 contact damage에 의해 오염되지 않는다.
- 전진·정지·후진을 observer snapshot으로 구분할 수 있다.

### 16.6 문서와 진행 기록

대상:

- `plans/system.md`
- `plans/implementation/progress.md`

작업:

- `plans/system.md`의 현재 충돌 규칙에 “탱크 전진 램 피해는 상대속도 기반,
  armor 무시, `dt` 적분”을 추가한다.
- 구현과 필수 runtime QA가 끝난 뒤 progress에 날짜, plan directory,
  구현 결과, runtime URL/fixture/판정 상태를 기록한다.
- plan 구현 commit에는 `plan 16`을 포함한다.

## 6. 테스트 시나리오

### 6.1 단위 테스트

| 시나리오 | 관측값 | 통과 기준 | required |
| --- | --- | --- | --- |
| 전진 접촉 | `VehicleCollisionContact` | 정상 normal, 양수 closing speed, contact point 반환 | yes |
| 정지 접촉 | 차량 속도 0, 적만 이동 | 램 피해 0 | yes |
| 후진/이탈 | 차량 velocity가 normal 반대 | `vehicleClosingSpeed = 0`, 램 피해 0 | yes |
| 속도 배율 | 상대속도 1x/2x | 초당 피해 1x/2x | yes |
| frame delta | 30/60/120Hz | 같은 실제 시간의 총 피해 동일 | yes |
| armor 무시 | armor 0/10/40 | 동일한 HP 감소 | yes |
| terrain clipping | 벽 방향 밀기 | enemy terrain-safe 유지 | yes |
| 기존 collision | enemy push/spawn admission | 기존 테스트와 같은 결과 | yes |

### 6.2 필수 runtime fixture

시나리오 URL:

```text
/?test=1&scenario=vehicle-ram
```

사전조건:

- 현재 plan worktree에서 실행한 Vite runtime
- canonical map `aurelia/landing-zone`
- wave 자동 생성 중지, 고정 Standard/Tanker fixture
- fixture enemy `speed=0`, `contactDamage=0`, `reward=0`
- fixture가 사용하는 차량 이동과 terrain이 실제 production 경로를 사용

시간 순서:

1. 전진 구간: 차량이 열린 공간의 Standard/Tanker를 향해 이동한다.
2. 접촉 구간: 두 적의 HP, relative closing speed, 램 피해를 관측한다.
3. 정지 구간: 차량 입력이 0인 동안 HP가 더 감소하지 않는지 확인한다.
4. 후진 구간: 차량이 적에게서 멀어질 때 램 피해가 없는지 확인한다.
5. 사망 구간: 적 사망·reward·wave kill이 한 번만 처리되는지 확인한다.

통과 기준:

- 전진 접촉 중 두 적 HP가 감소하고 closing speed가 양수다.
- 정지·후진 구간에서 추가 램 피해가 없다.
- Standard/Tanker가 terrain을 관통하지 않는다.
- 적 사망·reward·kill 집계가 중복되지 않는다.
- console error와 runtime exception이 없다.

### 6.3 contact damage 회귀

일반 gameplay fixture 또는 `?test=1`의 정상 전투에서 다음을 확인한다.

- 적이 탱크에 접근하면 기존 contact damage interval대로 탱크 HP가 감소한다.
- 램 피해를 추가해도 탱크가 받는 피해 방향·armor·GAME_OVER 흐름이 변하지
  않는다.
- pause/resume, wave 진행, 적-적 push, reward가 정상이다.

이 시나리오는 램 fixture에서 `contactDamage=0`으로 완화한 범위를 보완한다.

## 7. 검증 명령

구현 후 다음 순서로 실행한다.

1. `npm test`
2. `npm run build`
3. `git diff --check`
4. 지정 runtime에서 `vehicle-ram` required QA
5. 정상 전투 contact damage 회귀 QA

문서만 변경하는 현재 plan 작성 단계에서는 `git diff --check`와 문서 링크
검사를 수행하고, runtime QA는 기능 구현 후에만 수행한다.

오케스트레이터는 integration-tester 실행 전에 현재 plan worktree 절대 경로,
실제 URL·port, 고유 `runtimeId`, 변경 요약, required 시나리오, timeout을 모두
전달한다. 정상 결론은 60초 내를 기대하고 단일 실행은 240초를 넘기지 않는다.
제품 동작 `FAIL`은 commit을 보류하며, 환경성 `BLOCKED`는 원인과 영향 범위를
기록하고 같은 원인으로 반복하지 않는다.

## 8. 예상 변경 파일

- `src/data/vehicle-motion.json`
- `src/core/EnemyCollisionResolver.ts`
- `src/core/EnemyCollisionResolver.test.ts`
- `src/core/Game.ts`
- `src/core/GameTestScenario.ts`
- `src/core/GameTestObserver.ts`
- 관련 observer 테스트
- `plans/system.md`
- 구현 후 `plans/implementation/progress.md`

새 물리 클래스·collision library·art/audio asset은 추가하지 않는다.

## 9. 최종 완료 기준

- 탱크가 적 방향으로 실제 이동할 때만 램 피해가 발생한다.
- 피해량이 상대 접근 속도와 실제 `dt`에 비례한다.
- 적 장갑 값이 램 피해를 감소시키지 않는다.
- 적 위치 보정과 terrain-safe 규칙이 회귀하지 않는다.
- 기존 enemy contact damage, enemy push, death, reward, wave, pause가 유지된다.
- `vehicle-ram`에서 전진·정지·후진 결과가 observer로 확인된다.
- 관련 단위 테스트, `npm test`, `npm run build`, `git diff --check`가 통과한다.
- 필수 runtime QA가 `PASS` 또는 사용자 확인 `MANUAL-PASS`다.
- 구현 결과와 runtime 판정이 `plans/implementation/progress.md`에 기록된다.
