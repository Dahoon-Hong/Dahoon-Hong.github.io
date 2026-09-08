# 탱크 추가

## 적용 대상

다음과 같은 요청에 이 가이드를 적용한다.

- “5×3 격자를 가진 중전차를 추가해줘.”
- “일부 칸이 막힌 고속 정찰 탱크를 만들어줘.”
- “새 탱크를 시작 화면에서 선택할 수 있게 해줘.”

탱크 정의는 모듈을 배치할 격자, 항상 장착된 내장 모듈, 처음 설치된 전투 모듈을 한 묶음으로 구성한다.

## 먼저 필요한 정보

- 탱크 ID, 이름, 전투 컨셉
- 격자 열과 행, 사용할 수 없는 칸
- 필수 내장 모듈과 각 기본 수치
- 시작 전투 모듈의 종류, 위치, 방향
- 기존 무기와 업그레이드를 공유할지 여부
- 이동 속도, 회전, 방어와 생산 특성
- 차체 실루엣과 아트 방향
- 단순히 로드 가능한 정의만 필요한지, 실제 선택 가능한 탱크가 필요한지
- 기본 탱크 또는 저장되는 플레이어 선택을 변경할지 여부

마지막 두 항목은 변경 범위를 크게 바꾸므로 요청에서 분명하지 않으면 사용자에게 확인한다.

## 현재 지원 범위

`TankDefinitionLoader`는 `src/data/tanks/<tank-id>/module.json`을 자동 발견하고 같은 폴더의 나머지 JSON을 그 탱크의 모듈로 묶는다. 폴더 사이의 모듈 공유나 상속은 없다.

하지만 현재 게임은 `new TankDefinitionLoader().getDefault()`가 반환하는 첫 정의만 사용한다. 새 폴더를 추가하는 것만으로는 플레이어가 새 탱크를 선택하거나 안정적으로 기본 탱크로 사용할 수 없다. `Vehicle`의 차체와 프레임 asset ID도 `tank.starter.*`로 고정되어 있다.

따라서 작업을 다음처럼 구분한다.

- 정의 추가: 새 폴더와 데이터가 로더 검증을 통과하게 함
- 플레이 가능한 탱크 추가: 명시적인 탱크 선택/기본값과 정의 기반 차체 렌더링까지 구현

## 파일 위치

| 목적 | 파일 |
| --- | --- |
| 탱크 manifest | `src/data/tanks/<tank-id>/module.json` |
| 탱크가 사용하는 모듈 정의 | `src/data/tanks/<tank-id>/*.json` |
| 로드와 데이터 검증 | `src/core/TankDefinitionLoader.ts` |
| 내장 시스템 생성 | `src/core/VehicleSystems.ts` |
| 차체 이동, 충돌, 렌더링 | `src/entities/Vehicle.ts` |
| 기본 탱크 생성 | `src/core/Game.ts` |
| 선택 UI가 필요할 때 | `src/ui/StartMenu.ts`와 관련 상태 저장 코드 |
| 차체 이미지 | `public/assets/game/tank/` |
| 이미지 등록 | `src/data/assets.json` |

## `module.json` 계약

```json
{
  "id": "example-tank",
  "name": "Example Tank",
  "grid": {
    "columns": 3,
    "rows": 3,
    "blockedCells": []
  },
  "builtinModuleIds": [
    "core",
    "resource-generator",
    "gatherer",
    "recycler",
    "arsenal",
    "composer",
    "rail",
    "power-pack",
    "caterpillar-track",
    "armor-plate",
    "armory"
  ],
  "initialCombatModules": [
    { "moduleId": "direct-weapon", "anchor": { "x": 1, "y": 0 } }
  ]
}
```

규칙:

- 폴더 이름, `module.json`의 `id`, 탱크 ID가 정확히 같아야 한다.
- `columns`와 `rows`는 1 이상의 정수다.
- `blockedCells`는 격자 안에 있고 중복되지 않아야 한다.
- `builtinModuleIds`는 같은 폴더에 존재하는 `kind: "builtin"` 모듈만 참조한다.
- `behavior: "core"`인 내장 모듈은 정확히 하나여야 한다.
- `initialCombatModules`는 존재하는 `combat` 모듈만 참조한다.
- 초기 배치는 격자 밖, 막힌 칸, 다른 초기 모듈과 겹칠 수 없다.
- 회전 방향은 `0 | 1 | 2 | 3`이고 회전 후 크기로 배치를 검사한다.

현재 탱크의 런타임 격자 한 칸은 `Vehicle.tileSize = 36`이다. 원본 UI/프레임 PNG의 44px draw box와 게임 월드의 실제 격자 간격을 혼동하지 않는다.

## 모듈 구성

새 탱크 폴더에는 참조하는 모듈 정의가 모두 있어야 한다. 현재 로더는 `starter` 폴더의 모듈을 새 탱크 폴더에 자동으로 공유하지 않는다.

선택지는 두 가지다.

- 현재 구조 유지: 필요한 모듈 JSON을 새 탱크 폴더에 명시적으로 둔다.
- 모듈 공유 구조 추가: 여러 탱크가 실제로 같은 정의를 공유해야 한다는 요구가 승인된 경우에만 별도 설계한다.

두 번째 선택은 탱크 추가 범위를 넘는 로더 구조 변경이므로 임의로 수행하지 않는다.

## 플레이 가능한 탱크로 연결

새 탱크를 실제로 선택하고 플레이해야 한다면 다음을 함께 결정한다.

1. `getDefault()`의 배열 순서에 의존하지 않는 명시적 탱크 ID 조회 방식
2. 시작 메뉴 또는 다른 선택 UI
3. 선택 상태의 저장 여부와 저장 키 마이그레이션
4. `Vehicle`이 `tank.starter.*` 대신 선택한 탱크의 차체 asset을 사용하도록 하는 계약
5. 서로 다른 격자 크기에 대한 시작 위치와 지형 footprint 검증

선택 기능이 요청되지 않았다면 새 정의를 기본 탱크로 몰래 바꾸지 않는다.

## 아트 계약

현재 starter 차체는 다음 역할로 나뉜다.

- 이동 차체 이미지
- 격자 가장자리와 모서리
- 빈 칸과 막힌 칸 오버레이
- 개별 전투 모듈 이미지
- HUD 아이콘

새 탱크 고유 아트를 지원하려면 tank ID에서 asset ID를 결정할 수 있어야 한다. 현재 `Vehicle.ts`의 `tank.starter.move`, `tank.starter.frame.edge`, `tank.starter.frame.corner`은 하드코딩되어 있으므로 이미지 파일과 manifest만 추가해서는 새 차체가 표시되지 않는다.

## 검증과 완료 조건

- 로더가 새 탱크 폴더와 모든 모듈을 읽는다.
- 내장 모듈 참조와 core 유일성 검증을 통과한다.
- 초기 전투 모듈이 격자 안에 있고 서로 겹치지 않는다.
- 격자 크기에 따라 차체 지형 footprint가 올바르게 계산된다.
- 회전 중 벽을 통과하지 않고 코너를 부드럽게 이동한다.
- 차체, 프레임, 모듈과 HUD 아트가 올바른 탱크를 표시한다.
- 선택 가능한 탱크가 요구되었다면 선택, 재시작과 저장 동작이 명시된 정책과 일치한다.
- `npm test`, `npm run qa:art`, `npm run build`가 통과한다.
- `npm run dev`에서 시작 위치, 이동, 회전, 설치, 업그레이드와 전투를 확인한다.

로더나 탱크 선택 방식을 바꾸면 `src/core/TankDefinitionLoader.test.ts`를 추가하고, 격자 크기나 차체 충돌을 바꾸면 `src/entities/Vehicle.test.ts`에 회귀 테스트를 남긴다.
