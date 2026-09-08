# 적 추가

## 적용 대상

다음과 같은 요청에 이 가이드를 적용한다.

- “빠르지만 약한 정찰 적을 추가해줘.”
- “일정 거리에서 공격하는 적을 만들어줘.”
- “새 적을 두 번째 행성 웨이브에 배치해줘.”

적은 데이터로 정의되는 기본 수치와 공통 이동·접촉 피해 로직, 타입별 생성과 렌더링을 결합한다.

## 먼저 필요한 정보

- 타입 ID, 표시 이름, 전투 역할
- HP, 이동 속도, 충돌 반지름, 처치 보상
- 접촉 피해와 피해 간격
- 기존 추적·접촉 AI를 재사용할지 여부
- 특수 이동, 원거리 공격, 분열 등 신규 행동
- 어느 지역과 웨이브에 몇 마리가 나오는지
- idle, hit, dead 실루엣과 그림자
- 기존 사운드와 공통 피격 효과를 재사용할지 여부

행동, 반지름, 웨이브 구성은 경로 탐색과 난이도에 직접 영향을 주므로 누락되면 확인한다.

## 현재 지원 범위

기본 `Enemy` 클래스가 다음을 공통 제공한다.

- 목표까지의 지형 경로 탐색과 이동
- 반지름 기반 지형 충돌
- 접촉 피해 재사용 간격
- HP, 사망과 보상 상태
- hit/dead 시각 상태

하지만 적 타입은 현재 `standard | tanker`로 여러 파일에 하드코딩되어 있다. `enemies.json`에 항목만 추가해서는 생성되거나 웨이브에 등장하지 않는다.

기존 추적·접촉 행동을 쓰는 새 타입도 타입 등록, 생성 클래스, 웨이브 구조와 asset QA 수정이 필요하다. 특수 AI나 공격이 있으면 별도 행동 코드가 추가된다.

## 파일 위치

| 목적 | 파일 |
| --- | --- |
| 기본 수치 | `src/data/enemies.json` |
| 타입, 공통 행동, 타입별 렌더링 | `src/entities/Enemy.ts` |
| 웨이브 데이터 타입과 검증 | `src/core/ProgressionManager.ts` |
| 웨이브 큐와 적 생성 | `src/core/WaveManager.ts` |
| 지역별 웨이브 수량 | `src/data/progression.json` |
| 경로 도달성 반지름 검사 | `src/core/MapDefinitionLoader.ts` |
| 이미지 | `public/assets/game/enemies/` |
| 이미지 등록 | `src/data/assets.json` |
| 적 asset 완전성 검사 | `scripts/qa-art.mjs` |
| 디버그 및 타입별 표현 | `src/core/Game.ts` |

## 적 데이터 계약

```json
{
  "example": {
    "hp": 80,
    "speed": 70,
    "radius": 14,
    "reward": 15,
    "typeName": "Example",
    "contactDamage": 8,
    "contactDamageInterval": 0.25
  }
}
```

필드 의미:

- `hp`: 최대 체력, 0보다 커야 함
- `speed`: 초당 이동 거리, 0 이상
- `radius`: 충돌, 지형 경로와 체력 바 크기에 사용하는 반지름
- `reward`: 사망 시 지급되는 보상
- `typeName`: 표시용 이름으로 인스턴스에 보관되지만 현재 UI에는 연결되지 않음
- `contactDamage`: 접촉 공격 한 번의 피해
- `contactDamageInterval`: 접촉 피해 사이의 초, 0보다 커야 함

반지름은 이미지 크기만의 값이 아니다. 큰 적은 더 넓은 길이 필요하며 `MapDefinitionLoader`가 모든 스폰 경로를 이 반지름으로 검증해야 한다.

## 타입과 생성 연결

현재 구조에 새 타입을 추가할 때 확인할 지점은 다음과 같다.

1. `Enemy.ts`의 `EnemyType` union
2. 기본 행동을 재사용하거나 확장하는 새 `Enemy` 하위 클래스
3. 하위 클래스의 body와 shadow asset ID
4. `ProgressionManager.ts`의 `WaveDefinition` 수량 필드와 검증
5. `WaveManager.ts`의 총 적 수, spawn queue와 생성 분기
6. `progression.json`의 모든 wave에 새 타입 수량
7. `MapDefinitionLoader.ts`의 경로 검증 대상 반지름
8. `scripts/qa-art.mjs`의 적 타입 목록
9. `Game.ts`의 타입별 디버그 또는 사망 표현 분기

새 타입을 추가할 때 모든 기존 wave에 `0`을 반복해서 넣는 방식과, 선택형 타입별 수량 구조로 일반화하는 방식 중 하나를 선택해야 할 수 있다. 후자는 데이터 계약 변경이므로 새 적 하나의 범위를 넘어서는지 먼저 판단하고 사용자 승인 없이 확장하지 않는다.

## 아트 계약

새 `<enemy-type>`에는 기본적으로 다음 logical ID가 필요하다.

```text
enemy.<enemy-type>.idle
enemy.<enemy-type>.hit
enemy.<enemy-type>.dead
enemy.shadow.<enemy-type>
```

권장 runtime 파일 이름:

```text
public/assets/game/enemies/<enemy-type>-idle.png
public/assets/game/enemies/<enemy-type>-hit.png
public/assets/game/enemies/<enemy-type>-dead.png
public/assets/game/enemies/shadow-<enemy-type>.png
```

body 이미지는 중심 pivot을 유지하고 게임의 `radius`와 시각적 크기가 맞아야 한다. 체력 바, 보상 값, 라벨을 이미지에 굽지 않는다. 공통 피격·사망 효과와 사운드를 재사용할 수 있으면 새 파일을 만들지 않는다.

## 특수 행동을 추가할 때

원거리 공격, 순간 이동, 분열, 비행처럼 기본 추적·접촉 흐름과 다르면 먼저 다음을 정의한다.

- 목표 선택과 공격 조건
- 지형을 막힘 또는 시야로 취급하는 방식
- 재사용 대기시간과 피해 처리
- 사망 및 보상 시점
- 웨이브 수량 계산 방식
- 필요한 투사체, 효과와 사운드

공통 `Enemy` 동작을 깨지 않고 하위 클래스에 최소한의 차이만 둔다. 무기와 투사체는 일반 `Enemy[]`를 대상으로 하므로 새 적 타입만을 이유로 수정하지 않는다.

## 검증과 완료 조건

- 새 타입 데이터가 유효하고 모든 필드를 실제 코드가 사용한다.
- 의도한 지역과 웨이브에서 정확한 수량으로 생성된다.
- 총 적 수와 wave 완료 조건이 새 타입을 포함한다.
- 모든 생산 맵의 스폰에서 새 반지름으로 경로가 존재한다.
- 이동 중 벽을 통과하거나 경로가 없을 때 순간 이동하지 않는다.
- 접촉 피해량과 간격, 처치 보상이 정확하다.
- idle, hit, dead와 그림자가 올바르게 표시된다.
- 특수 행동이 지형 및 일시정지 규칙과 충돌하지 않는다.
- `src/entities/Enemy.test.ts`, `src/core/WaveManager.test.ts`에 필요한 회귀 테스트가 있다.
- `npm test`, `npm run qa:art`, `npm run build`가 통과한다.
- 오디오 변경 시 `npm run qa:audio`가 통과한다.
- `npm run dev`에서 생성, 이동, 공격, 피격, 사망과 보상을 확인한다.
