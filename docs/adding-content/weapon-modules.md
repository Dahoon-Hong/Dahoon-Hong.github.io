# 무기 모듈 추가

## 적용 대상

다음과 같은 요청에 이 가이드를 적용한다.

- “연사형 기관포를 추가해줘.”
- “2칸을 차지하는 장거리 곡사포를 추가해줘.”
- “벽을 관통하는 새로운 무기 방식을 만들어줘.”

무기 모듈은 탱크 격자에 설치되는 `kind: "combat"` 모듈이다. 설치된 각 모듈은 별도 체력과 업그레이드 상태를 가지며, 현재 구현은 적을 자동 조준하고 발사당 `ammo` 1을 사용한다.

## 먼저 필요한 정보

구현 전에 아래 정보를 요청에서 확인한다. 결과를 크게 바꾸는 항목이 없으면 사용자에게 질문한다.

- 컨셉: 이름, 전투 역할, 기존 무기와의 차이
- 행동: 기존 `direct` 또는 `arc` 재사용인지, 새로운 발사 방식인지
- 크기: 격자 너비와 높이, 기본 방향, 사격 가능 각도
- 비용: 구매 비용, Armory 연구 비용, 시작 장비 여부
- 전투 수치: 체력, 사거리, 피해량, 발사 간격
- 투사체: 속도와 최대 거리 또는 비행 시간과 범위 피해 반경
- 업그레이드: 노드 관계, 비용, 효과, 배타 분기
- 표현: 차체 위 이미지, UI 아이콘, 투사체/피격 효과, 사운드 재사용 여부
- 지형 상호작용: 시야 차단, 투사체 지형 충돌, 범위 피해 규칙

## 확장 수준 판단

### 기존 행동을 재사용하는 무기

`behavior: "direct"` 또는 `behavior: "arc"`를 사용하면 기본 전투 동작은 새 JSON으로 재사용할 수 있다. 다만 UI 아이콘, 구매 해금, 시작 배치는 별도로 연결해야 한다.

### 새로운 행동을 가진 무기

관통, 연쇄 공격, 빔, 지뢰처럼 기존 두 행동으로 표현할 수 없으면 런타임 코드가 필요하다. JSON에 새로운 `behavior` 문자열만 적으면 로더는 읽더라도 `createCombatModule()`이 인스턴스를 만들지 못한다.

## 파일 위치

| 목적 | 파일 |
| --- | --- |
| 무기 정의 추가 | `src/data/tanks/<tank-id>/<module-id>.json` |
| 시작 장비로 배치 | `src/data/tanks/<tank-id>/module.json` |
| 구매 연구 연결 | `src/data/tanks/<tank-id>/armory.json` |
| 행동과 렌더링 | `src/entities/Module.ts` |
| 새 투사체 또는 피해 방식 | `src/entities/Projectile.ts` |
| 새 사운드 이벤트 연결 | `src/core/Game.ts`, `src/core/AudioManager.ts`, `src/data/audio.json` |
| UI 아이콘 | `public/assets/game/ui/icon-<module-id>.png` |
| 무기/효과 이미지 | `public/assets/game/tank/`, `public/assets/game/effects/` |
| 이미지 등록 | `src/data/assets.json` |

## 무기 JSON 계약

가장 가까운 예제는 `src/data/tanks/starter/direct-weapon.json`과 `arc-weapon.json`이다.

```json
{
  "id": "example-weapon",
  "kind": "combat",
  "name": "Example Weapon",
  "behavior": "direct",
  "size": { "width": 1, "height": 1 },
  "installCost": { "matter": 30 },
  "purchaseCost": { "matter": 30 },
  "fireArcDegrees": 180,
  "defaultOrientation": 0,
  "baseStats": {
    "maxHp": 100,
    "range": 600,
    "damage": 30,
    "fireRate": 0.2,
    "projectileSpeed": 1000,
    "maxDistance": 1000
  },
  "upgradeTree": {
    "rootId": "root",
    "nodes": [
      { "id": "root", "parentId": null, "cost": {}, "effects": [] }
    ]
  }
}
```

주요 규칙:

- 파일 이름은 `<module-id>.json`이고 `id`와 정확히 같아야 한다.
- `kind`는 `combat`이어야 한다.
- `size.width`와 `size.height`는 1 이상의 정수다.
- `fireArcDegrees`는 0보다 크고 360 이하여야 한다.
- `defaultOrientation`은 `0 | 1 | 2 | 3`이며 생략하면 0이다.
- `fireRate`는 초당 발사 수가 아니라 발사 사이의 쿨다운 초다. 값이 작을수록 빠르다.
- direct가 사용하는 추가 스탯은 `projectileSpeed`, `maxDistance`다.
- arc가 사용하는 추가 스탯은 `aoeRadius`, `flightTime`이다.

정의 파일은 `TankDefinitionLoader`의 `import.meta.glob('../data/tanks/*/*.json')`로 자동 발견된다. 일반 무기 정의를 별도 목록에 등록할 필요는 없다.

## 시작 배치와 구매 연결

시작 장비라면 탱크의 `module.json`에 배치한다.

```json
{
  "moduleId": "example-weapon",
  "anchor": { "x": 1, "y": 0 },
  "orientation": 0
}
```

Armory에서 연구하고 구매해야 한다면 `armory.json`의 업그레이드 노드가 새 무기를 해금해야 한다.

```json
{
  "id": "research-example-weapon",
  "parentId": "root",
  "cost": { "matter": 50 },
  "effects": [],
  "unlocksModuleId": "example-weapon"
}
```

- 실제 연구 비용은 이 노드의 `cost`다. 무기 정의의 `researchCost`는 현재 연구 선택 흐름에서 사용되지 않는다.
- 구매 시 `purchaseCost`를 사용하고, 없으면 `installCost`를 사용한다.
- 설치 시 `installCost`가 별도로 한 번 더 차감되지는 않는다.
- Armory의 같은 부모 아래 연구 노드는 하나를 선택하면 형제가 비활성화된다. 여러 무기를 모두 연구할 수 있어야 한다면 노드 구조나 업그레이드 규칙을 먼저 결정한다.

## 아트와 사운드

UI는 `ui.icon.<module-id>`를 동적으로 찾으므로 다음 두 항목이 필수다.

- `public/assets/game/ui/icon-<module-id>.png`
- `src/data/assets.json`의 `ui.icon.<module-id>` 항목

현재 direct와 arc 모듈의 차체 이미지는 각각 `tank.module.direct-weapon`, `tank.module.arc-weapon`으로 코드에 고정되어 있다. 같은 행동을 재사용하는 새 무기에 고유한 차체 이미지를 넣으려면 정의 기반 asset ID를 지원하도록 코드를 바꾸거나 별도 행동 클래스를 만들어야 한다.

기존 direct/arc 발사음을 재사용하면 오디오 파일 수정이 필요 없다. 새 사운드 종류를 추가하면 `CombatSoundEvent`, `Game`의 매핑, `AudioManager`, `audio.json`, `qa-audio`와 `docs/audio/`의 라이선스 기록을 함께 갱신한다.

## 코드 확장이 필요한 경우

새 `behavior`를 추가할 때 최소 확인 범위는 다음과 같다.

1. `src/entities/Module.ts`에 `CombatModule` 하위 클래스 추가
2. `createCombatModule()`에 생성 분기 추가
3. 필요하면 `src/entities/Projectile.ts`에 새 투사체 추가
4. 새 스탯이면 `TankDefinitionLoader.ts`의 `ALLOWED_STATS`와 실제 소비 코드 추가
5. 새 효과 및 사운드 asset 등록
6. 행동과 투사체 테스트 추가

## 검증과 완료 조건

- 로더가 새 JSON을 오류 없이 읽는다.
- Armory 연구, 구매 또는 시작 배치 중 의도한 경로로 무기를 얻을 수 있다.
- 회전한 크기가 격자 밖이나 다른 모듈과 겹치지 않는다.
- 설치 인스턴스별 업그레이드가 서로 독립적이다.
- 사거리, 사격각, 지형 시야와 ammo 소비가 의도대로 동작한다.
- 공격할 수 없는 상황에서는 ammo와 쿨다운을 소비하지 않는다.
- UI 아이콘과 차체 이미지가 올바르게 표시된다.
- `npm test`, `npm run qa:art`, `npm run build`가 통과한다.
- 오디오 변경 시 `npm run qa:audio`가 통과한다.
- `npm run dev`에서 실제 발사, 피격, 업그레이드 결과를 확인한다.
