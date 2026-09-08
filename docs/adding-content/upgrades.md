# 업그레이드 추가

## 적용 대상

다음과 같은 요청에 이 가이드를 적용한다.

- “기관포에 공격력 강화 두 단계를 추가해줘.”
- “속도와 방어 중 하나를 선택하는 분기를 만들어줘.”
- “연구하면 새로운 무기를 해금하게 해줘.”

업그레이드는 별도 전역 파일이 아니라 각 모듈 JSON의 `upgradeTree`에 정의된다. 내장 모듈은 모듈마다 한 인스턴스를 사용하고, 전투 모듈은 설치된 개체마다 별도 업그레이드 상태를 가진다.

## 먼저 필요한 정보

- 대상 탱크와 모듈 ID
- 강화 컨셉과 플레이 변화
- 노드 ID와 표시 순서
- 선행 노드와 배타 분기 여부
- 비용과 사용할 자원
- 대상 스탯, `add` 또는 `multiply`, 값
- 새 무기 해금 여부
- 한 게임 동안만 유지되는 현재 상태가 맞는지

비용, 효과 값, 분기 관계가 없으면 에이전트가 임의로 밸런스를 정하지 않는다.

## 확장 수준 판단

### 기존 스탯을 바꾸는 업그레이드

해당 모듈 JSON의 `upgradeTree`만 수정하는 것이 기본이다. HUD는 트리 정의를 읽어 자동으로 노드와 효과를 표시한다.

### 새로운 스탯 또는 규칙을 추가하는 업그레이드

새 스탯은 로더 허용 목록과 실제 소비 코드가 모두 필요하다. 새로운 연산 방식, 여러 형제 동시 선택, 영구 저장 같은 요구는 `UpgradeManager` 동작 변경이므로 데이터 작업으로 취급하지 않는다.

## 파일 위치

| 목적 | 파일 |
| --- | --- |
| 업그레이드 노드 정의 | `src/data/tanks/<tank-id>/<module-id>.json` |
| 허용 스탯과 구조 검증 | `src/core/TankDefinitionLoader.ts` |
| 노드 상태, 구매, 효과 계산 | `src/core/UpgradeManager.ts` |
| 내장 모듈 스탯 소비 | `src/core/VehicleSystems.ts` |
| 전투 모듈 스탯 소비 | `src/entities/Module.ts` |
| 업그레이드 UI | `src/ui/HUDManager.ts` |

## 노드 계약

```json
{
  "upgradeTree": {
    "rootId": "root",
    "nodes": [
      { "id": "root", "parentId": null, "cost": {}, "effects": [] },
      {
        "id": "heavy-round",
        "parentId": "root",
        "cost": { "matter": 40 },
        "effects": [
          { "stat": "damage", "operation": "add", "value": 12 }
        ]
      }
    ]
  }
}
```

노드 필드:

- `id`: 트리 안에서 고유한 ID
- `parentId`: 선행 노드 ID 또는 루트의 `null`
- `cost`: 자원별 0 이상의 비용
- `effects`: 적용할 효과 배열
- `unlocksModuleId`: Armory 연구에서 전투 모듈을 해금할 때만 사용

효과 필드:

- `stat`: `TankDefinitionLoader.ts`의 `ALLOWED_STATS`에 있는 이름
- `operation`: `add` 또는 `multiply`
- `value`: 0 이상의 유한 숫자

사용 가능한 자원 종류는 `resource`, `matter`, `ammo`, `nano`다.

## 현재 트리 동작

- 루트는 항상 선택된 상태로 보이지만 구매되지 않고 효과도 적용되지 않는다.
- 루트에는 실제 비용이나 효과를 넣지 않는다.
- 부모가 선택되어야 자식이 선택 가능해진다.
- 같은 `parentId`를 가진 형제 중 하나를 고르면 나머지 형제와 그 후손은 비활성화된다.
- 레벨은 `1 + 선택한 노드 수`다.
- 효과는 JSON의 노드 배열 순서대로 적용된다.
- 같은 스탯에 `add`와 `multiply`가 섞이면 순서에 따라 결과가 달라진다. 의도한 계산 순서를 테스트로 고정한다.
- 현재 선택 상태는 게임 런타임 상태이며 캠페인 저장소에 영구 저장되지 않는다.

`fireRate`, `productionInterval`처럼 시간 간격을 나타내는 스탯은 값이 작아질수록 성능이 좋아진다. 이름만 보고 양수를 더하지 말고 소비 코드를 확인한다.

## 새 스탯을 추가할 때

1. `src/core/TankDefinitionLoader.ts`의 `ALLOWED_STATS`에 이름을 추가한다.
2. 해당 모듈 또는 시스템에서 `getStat('<stat>')`로 값을 실제 사용한다.
3. 기본값, 단위, 값이 커질 때 좋아지는지 나빠지는지를 가이드 또는 코드 가까이에 명확히 한다.
4. HUD 효과 문구가 의미를 올바르게 보여주는지 확인한다.
5. 업그레이드 전후 행동 차이를 테스트한다.

허용 목록에만 추가하고 소비하지 않는 스탯은 만들지 않는다.

## 검증과 완료 조건

- 모든 노드 ID가 고유하고 부모 참조가 유효하다.
- 루트에서 모든 의도한 노드에 도달할 수 있다.
- 배타 분기와 순차 강화가 요청한 구조와 일치한다.
- 비용 부족 시 자원과 선택 상태가 변하지 않는다.
- `add`와 `multiply`의 적용 순서가 의도와 일치한다.
- 같은 종류의 전투 모듈 두 개가 독립적으로 강화된다.
- 새 스탯은 실제 런타임 코드에서 소비된다.
- Armory 해금이라면 대상이 존재하는 `combat` 모듈이다.
- `npm test`와 `npm run build`가 통과한다.
- 아트가 바뀌었다면 `npm run qa:art`가 통과한다.
- `npm run dev`에서 선택 가능 상태, 비용 차감, 효과와 비활성 분기를 직접 확인한다.

현재 `TankDefinitionLoader`와 `UpgradeManager` 전용 테스트 파일은 없다. 트리 규칙이나 계산 코드를 바꾸면 `src/core/UpgradeManager.test.ts` 또는 `src/core/TankDefinitionLoader.test.ts`를 추가해 핵심 규칙을 고정한다.
