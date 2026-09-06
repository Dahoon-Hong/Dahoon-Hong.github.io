# 모듈·전투 그리드 재설계 명세

- 작성일: 2026-08-31
- 상태: 설계 승인 완료
- 대상: Vite + TypeScript Canvas 프로토타입

## 1. 목표

이번 변경은 모듈의 설치 단위를 전투에 한정하고, 탱크별 업그레이드 콘텐츠를 JSON으로 분리하는 것을 목표로 한다.

1. 전투 모듈을 제외한 기능은 전차 생성 시 활성화된 내장 기본 시스템으로 취급한다.
2. 업그레이드는 우측 패널의 노드 그래프에서 진행한다.
3. 그래프는 중앙 루트에서 시작해 2~3개의 선택지와 파생 선택지로 확장된다.
4. 하나의 선택지를 고르면 같은 부모의 형제 가지와 그 하위 가지는 현재 런 동안 잠긴다.
5. 탱크별 고유 그리드와 고유 업그레이드 콘텐츠를 디렉터리 단위로 관리한다.
6. 전투 그리드는 다중 칸 전투 모듈을 배치할 수 있어야 한다.

## 2. 현재 구현과 변경 경계

현재 구현은 다음과 같은 구조다.

- `src/entities/Module.ts` 하나에 코어, 생산, 물류, 기동, 방어, 전투 모듈이 함께 있다.
- `Vehicle`은 3×3 `(BaseModule | null)[][]`에 모든 모듈을 설치한다.
- `Game`은 그리드 배열을 순회해 모듈을 업데이트한다.
- `HUDManager`는 하단에 모든 모듈을 설치하는 상점을 그리고, 선택 모듈에 단일 레벨 업그레이드 버튼을 제공한다.
- `ResourceStorage`는 `resource`, `matter`, `ammo`, `nano`를 관리한다.

이번 변경에서 보존하는 동작은 다음과 같다.

- WASD/방향키 이동, 웨이브, 적 조준, 발사체, 피해, 승리·패배, 재시작 흐름
- 생산·수집·변환·탄약 소비의 현재 자원 경제
- 일시정지 중 자동 진행 중지
- 일시정지 중 전투 모듈 설치와 업그레이드 허용

이번 변경에서 제거하는 동작은 다음과 같다.

- 비전투 모듈을 빈 칸에 설치하는 기능
- 하단의 전체 모듈 상점
- 비전투 모듈을 격자 한 칸으로 순회·렌더링하는 방식
- 모든 모듈에 공통으로 적용하는 단순 `level += 1` 업그레이드 버튼

내장 시스템은 그리드의 피격 대상이 아니며 1차 구현에서는 개별 시스템 파괴·수리까지 확장하지 않는다. 코어와 전투 모듈은 기존처럼 HP와 비활성 상태를 가진다. 내장 장갑은 차량 전체에 적용되는 기본 방어 시스템으로 취급한다.

## 3. 콘텐츠 파일 구조

탱크마다 하나의 디렉터리를 만들고, 그 디렉터리 안에 탱크 조립도와 모듈 파일을 둔다.

```text
src/data/tanks/
└── starter/
    ├── module.json
    ├── core.json
    ├── resource-generator.json
    ├── gatherer.json
    ├── recycler.json
    ├── arsenal.json
    ├── composer.json
    ├── rail.json
    ├── power-pack.json
    ├── caterpillar-track.json
    ├── armor-plate.json
    ├── direct-weapon.json
    └── arc-weapon.json
```

`module.json`은 해당 디렉터리의 탱크 조립도이며, `<moduleId>.json`은 해당 탱크에서 사용하는 개별 모듈 정의다. 같은 `moduleId`라도 탱크 디렉터리가 다르면 다른 수치·업그레이드 트리를 가질 수 있다.

### 3.1 탱크 조립도

```json
{
  "id": "starter",
  "name": "Starter Tank",
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
    "armor-plate"
  ],
  "initialCombatModules": [
    { "moduleId": "direct-weapon", "anchor": { "x": 1, "y": 0 } }
  ]
}
```

규칙:

- 그리드 크기와 금지 칸은 탱크마다 다를 수 있다.
- `blockedCells`에는 전투 모듈을 설치할 수 없다.
- `builtinModuleIds`의 모든 시스템은 레벨 1·활성 상태로 시작한다.
- `initialCombatModules`의 크기는 모듈 JSON에서 읽으며, 초기 배치는 시작 시 겹침과 경계 검사를 받는다.

### 3.2 모듈 정의

```json
{
  "id": "direct-weapon",
  "kind": "combat",
  "name": "Gatling Cannon",
  "behavior": "direct",
  "size": { "width": 1, "height": 1 },
  "installCost": { "resource": 30 },
  "baseStats": {
    "range": 600,
    "damage": 30,
    "fireRate": 0.2,
    "projectileSpeed": 1000,
    "maxDistance": 1000
  },
  "upgradeTree": {
    "rootId": "root",
    "nodes": [
      { "id": "root", "parentId": null, "cost": {}, "effects": [] },
      {
        "id": "rapid-fire",
        "parentId": "root",
        "cost": { "resource": 40 },
        "effects": [
          { "stat": "fireRate", "operation": "multiply", "value": 0.9 }
        ]
      },
      {
        "id": "heavy-round",
        "parentId": "root",
        "cost": { "resource": 40 },
        "effects": [
          { "stat": "damage", "operation": "add", "value": 12 }
        ]
      }
    ]
  }
}
```

내장 시스템 JSON은 `kind: "builtin"`을 사용하고 `size`와 `installCost`를 갖지 않는다. `behavior`는 TypeScript 동작 레지스트리의 키이며, JSON에서 임의 함수를 실행하지 않는다.

허용 효과는 타입으로 제한한다.

- 전투: `range`, `damage`, `fireRate`, `projectileSpeed`, `maxDistance`, `aoeRadius`, `flightTime`
- 이동: `movementSpeed`, `trackMaxSpeed`, `rotationSpeed`
- 방어: `armorValue`, `armorMaxHp`, `coreMaxHp`
- 생산·수집·물류: `productionAmount`, `productionInterval`, `collectionRadius`, `transferAmount`, `outputCapacity`

`operation`은 `add` 또는 `multiply`만 허용한다. 업그레이드 매니저가 허용 목록 밖의 `stat`을 발견하면 콘텐츠 로딩을 실패시킨다.

### 3.3 업그레이드 트리 규칙

- `rootId` 노드는 중앙에 표시되고 자동으로 해금된다.
- 각 노드는 `parentId` 하나만 가진다. 1차 구현은 DAG가 아닌 트리로 제한한다.
- 같은 `parentId`를 가진 노드가 하나의 선택 그룹이다.
- 선택 그룹에서 하나를 선택하면 같은 그룹의 나머지 노드는 `disabled`가 된다.
- 선택된 노드의 자식만 다음 선택지로 `available`이 된다.
- 노드에는 한 번만 비용을 지불하며, 선택 효과는 즉시 적용된다.
- 선택 상태와 효과는 현재 런에만 존재하고 재시작 시 초기화된다.
- 선택 가능한 노드가 없으면 해당 모듈의 트리는 완료 상태로 표시한다.

## 4. 런타임 구조

### 4.1 `TankDefinitionLoader`

Vite의 JSON 모듈 로딩 기능을 사용해 `src/data/tanks/*/module.json`을 자동 발견한다. 선택된 탱크의 `module.json`에 참조된 `<moduleId>.json`을 같은 디렉터리에서 읽는다.

로더는 다음을 검증한다.

- 탱크 ID·모듈 ID 중복
- 참조된 모듈 파일의 존재
- `kind`, `behavior`, 크기, 비용의 형식과 범위
- 전투 모듈 크기가 양의 정수인지 여부
- 업그레이드 루트 존재 여부
- 부모 ID가 존재하고 순환이 없는지 여부
- 동일 부모의 선택지 중복 여부
- 초기 배치가 그리드 밖이거나 코어·금지 칸을 점유하는지 여부
- 효과 키와 연산이 허용 목록에 포함되는지 여부

콘텐츠 오류는 게임 시작 시 명확한 오류로 노출한다. 일부 JSON만 조용히 제외해 플레이 상태를 만드는 방식은 사용하지 않는다.

### 4.2 `VehicleSystems`

`VehicleSystems`는 다음 내장 시스템을 보유한다.

- 코어 HP와 생존 상태
- 자원 생산기, 수집기, 재활용기, 무기고, 물질 합성기
- 물류 전송
- 동력 장치와 무한궤도
- 차량 전체 장갑

모든 시스템은 차량 생성 시 활성화된다. 각 시스템의 기본 수치는 JSON에서 읽고, 업그레이드 매니저가 계산한 유효 수치를 사용한다.

`VehicleSystems.update()`는 일시정지 여부에 따라 호출 간격을 받으며, 일시정지 중에는 타이머·생산·수집·전송이 진행되지 않는다. 이동 속도와 장갑 계산도 이 객체의 유효 수치에서 읽는다.

### 4.3 `UpgradeManager`

업그레이드 매니저는 모듈별 트리와 선택 상태를 관리한다.

```ts
getNodeStates(moduleId): UpgradeNodeState[]
canSelect(moduleId, nodeId): boolean
select(moduleId, nodeId, spend): boolean
getEffectiveStats(moduleId): Record<string, number>
reset(): void
```

`select()`는 다음을 하나의 상태 변경으로 처리한다.

1. 노드가 `available`인지 확인한다.
2. 비용을 지불할 수 있는지 확인한다.
3. 비용 지불에 성공하면 노드를 선택한다.
4. 같은 부모의 형제 노드를 잠근다.
5. 누적 효과를 다시 계산한다.
6. 런타임 시스템 또는 해당 전투 모듈이 다음 업데이트부터 새 수치를 사용하게 한다.

비용 부족·잠긴 노드·이미 선택된 노드는 비용과 상태를 변경하지 않는다.

### 4.4 전투 모듈

`Module.ts`는 전투 모듈 중심으로 정리한다.

- 공통 전투 모듈은 ID, 동작 키, HP, 점유 크기, 설치 위치를 가진다.
- `DirectWeaponModule`과 `ArcWeaponModule`은 현재의 자동 조준·발사체 동작을 유지한다.
- 전투 모듈의 유효 사거리·피해·발사 간격 등은 모듈 기본 수치와 업그레이드 결과로 계산한다.
- 모듈이 점유하는 여러 칸은 하나의 인스턴스로 처리한다.
- 비활성 전투 모듈은 조준·발사하지 않는다.

새 전투 동작이 JSON에 등장하는 것만으로 생기지는 않는다. 새로운 동작이 필요할 때 `behavior` 레지스트리와 전투 구현을 추가한다.

## 5. `CombatGrid` 규칙

```ts
type CombatPlacement = {
  moduleId: string;
  anchor: { x: number; y: number };
};
```

그리드 내부에서는 모듈 정의에서 읽은 크기를 사용해 점유 칸을 계산한다.

- `anchor`는 좌상단 칸이다.
- 점유 칸은 `[anchor.x, anchor.x + width)` × `[anchor.y, anchor.y + height)` 범위다.
- 모든 점유 칸이 그리드 내부여야 한다.
- 금지 칸을 점유할 수 없다.
- 기존 모듈 점유 칸과 하나라도 겹치면 설치할 수 없다.
- 초기 버전은 회전 입력을 지원하지 않는다.
- 설치 비용은 모듈 JSON의 `installCost`를 사용한다.

필수 API는 다음과 같다.

```ts
canInstall(moduleId, anchor): boolean
install(moduleId, anchor): boolean
getModuleAtCell(x, y): CombatModule | null
getPlacements(): readonly CombatPlacement[]
getOccupiedCells(placement): readonly GridCell[]
```

렌더링은 점유 영역 전체를 하나의 사각형으로 그리고, 모듈의 조준 위치는 그 영역의 중심으로 계산한다. 방향성 피해가 특정 칸을 조회했을 때 다중 칸 모듈이면 해당 모듈 하나에 피해를 전달한다.

## 6. 게임 흐름

초기화:

1. `TankDefinitionLoader`가 기본 탱크를 읽는다.
2. `VehicleSystems`가 모든 내장 시스템을 레벨 1·활성 상태로 만든다.
3. `CombatGrid`가 탱크별 그리드를 만들고 초기 전투 모듈을 배치한다.
4. `UpgradeManager`가 각 내장 시스템과 전투 모듈의 루트를 해금한다.
5. `HUDManager`가 선택 가능한 시스템·전투 모듈 목록을 준비한다.

업데이트:

1. 게임이 일시정지되지 않았으면 차량을 이동시킨다.
2. 내장 시스템의 생산·수집·물류를 업데이트한다.
3. 전투 모듈을 순회해 조준·발사한다.
4. 웨이브·적·발사체·효과를 업데이트한다.
5. 코어 HP와 승패 상태를 확인한다.

관리 입력:

- 전투 그리드 칸 클릭: 전투 모듈 또는 빈 칸을 선택한다.
- 내장 시스템/전투 모듈 목록 클릭: 해당 모듈의 업그레이드 트리를 연다.
- `available` 노드 클릭: 비용 지불 후 업그레이드한다.
- 빈 전투 칸에서 전투 모듈 선택: 설치 비용을 지불하고 다중 칸 검사를 수행한다.
- 일시정지 중에도 위 관리 입력은 동작한다.

## 7. 우측 패널 UI

Canvas를 유지하고 `HUDManager`가 우측 고정 패널을 그린다. 별도 UI 프레임워크나 새 의존성은 추가하지 않는다.

- 상단: 현재 탱크와 패널 제목
- 다음 영역: `Built-in Systems`와 `Combat Modules` 선택 목록
- 중앙: 루트가 가운데 있는 업그레이드 그래프
- 노드 연결선: 부모에서 자식으로 연결
- 하단 또는 노드 내부: 비용, 선택 상태, 다음 효과
- 빈 칸 선택 시: 업그레이드 그래프 대신 전투 모듈 설치 목록

그래프는 노드 깊이와 형제 순서에서 위치를 자동 계산한다. 현재 2~3개 선택지와 몇 단계의 파생 트리를 패널에 표시하는 것을 기준으로 하며, 콘텐츠가 패널 높이를 초과할 경우 그래프 영역을 클리핑하고 가장 낮은 노드까지 접근 가능한 최소 스크롤 상태를 둔다.

상태 표현:

- `selected`: 강조 색상과 선택 완료 표시
- `available`: 클릭 가능 색상과 비용 표시
- `locked`: 선행 선택이 없어 비활성 표시
- `disabled`: 다른 형제 선택으로 탈락했음을 표시
- 자원 부족: `available` 노드를 비활성 색상으로 표시하고 클릭 시 피드백만 표시

패널 입력 hitbox는 매 프레임 계산한 노드 위치를 재사용한다. 그래프와 그리드의 클릭 영역이 겹치지 않도록 패널 입력을 먼저 처리한다.

## 8. 파일별 작업 계획

### 신규 파일

- `src/data/tanks/starter/module.json`: 기본 탱크 그리드·내장 시스템·초기 전투 모듈
- `src/data/tanks/starter/<moduleId>.json`: 기본 탱크 모듈 수치와 업그레이드 트리
- `src/core/TankDefinitionLoader.ts`: 탱크·모듈 JSON 자동 발견과 검증
- `src/core/UpgradeManager.ts`: 트리 상태·비용·분기 잠금·효과 계산
- `src/core/VehicleSystems.ts`: 내장 시스템의 상태와 업데이트
- `src/entities/CombatGrid.ts`: 전투 모듈 다중 칸 점유·설치·조회

### 수정 파일

- `src/entities/Module.ts`: 비전투 모듈 설치 클래스를 제거하거나 내장 시스템 구현으로 이전하고 전투 모듈을 JSON 수치와 연결
- `src/entities/Vehicle.ts`: 탱크 정의·내장 시스템·`CombatGrid` 사용, 이동 경계와 피해 조회 갱신
- `src/core/Game.ts`: 새 초기화·업데이트 흐름, 내장 시스템과 전투 모듈 분리 호출, 재시작 초기화
- `src/ui/HUDManager.ts`: 하단 전체 상점 제거, 우측 업그레이드 그래프와 전투 모듈 설치 목록 구현
- `plans/system.md`: 내장 시스템/전투 모듈/JSON/다중 칸 규칙으로 갱신
- `plans/user_guide.md`: 우측 업그레이드 패널과 전투 모듈 전용 그리드 안내로 갱신
- `plans/implementation/07-progression-content.md`: 기존 일반 모듈·코어 레벨 업 계획을 새 트리 데이터 계획으로 갱신
- `plans/implementation/99-ui-tutorial-polish.md`: 하단 상점 전제와 단일 업그레이드 버튼을 제거하고 그래프 UI 튜토리얼로 갱신

## 9. 구현 순서

1. JSON 타입과 기본 탱크 콘텐츠를 추가한다.
2. 로더와 콘텐츠 검증을 구현한다.
3. `VehicleSystems`로 내장 기능을 이전하고 기존 자원 흐름을 보존한다.
4. `CombatGrid`와 전투 모듈 크기·점유 조회를 구현한다.
5. 전투 모듈을 새 그리드와 초기 배치에 연결한다.
6. `UpgradeManager`와 허용 효과 계산을 구현한다.
7. 게임 루프와 일시정지·재시작 경로를 연결한다.
8. 우측 Canvas 패널, 그래프 자동 배치, hitbox, 설치 목록을 구현한다.
9. 기존 계획 문서와 사용자 가이드를 실제 동작과 대조해 갱신한다.
10. 빌드와 브라우저 수동 검증을 수행한다.

## 10. 검증 계획

### 자동 검증

- `npm run build`
- `git diff --check`
- JSON 로더 검증 경로에서 잘못된 ID, 순환 부모, 중복 점유, 허용되지 않은 효과 키가 실패하는지 확인

### 브라우저 검증

- 기본 탱크가 모든 내장 시스템을 설치 화면 없이 시작하는지 확인
- 전투 모듈만 빈 그리드에 설치할 수 있는지 확인
- 1×1, 2×1, 2×2 모듈의 경계·코어 칸·겹침 검사를 확인
- 다중 칸 모듈이 하나의 모듈로 조준·피격·렌더링되는지 확인
- 루트에서 2~3개 선택지를 표시하고 하나를 선택하면 형제와 하위 가지가 잠기는지 확인
- 선택된 노드의 효과가 즉시 수치에 반영되는지 확인
- 자원 부족, 잠긴 노드, 점유 칸, 그리드 밖 설치 실패 피드백을 확인
- 일시정지 중 자동 생산·수집·물류·이동·전투는 멈추고 설치·업그레이드는 가능한지 확인
- 재시작 시 내장 시스템·전투 배치·업그레이드 선택이 초기화되는지 확인
- 우측 패널이 전장과 겹쳐도 입력 영역과 이동 경계가 꼬이지 않는지 확인

## 11. 1차 범위에서 제외하는 항목

- 전투 모듈 회전
- 업그레이드 되돌리기 또는 재설정
- 계정·세이브 기반 업그레이드 영속성
- JSON에 임의 수식·스크립트를 넣는 기능
- 복잡한 그래프 DAG 선행 조건
- 그래프의 자유 팬·줌
- 내장 시스템 개별 파괴·수리
- 새로운 전투 동작을 JSON만으로 생성하는 기능

이 항목들은 현재 데이터 계약과 런타임 경계를 유지한 채 후속 요구가 확정되면 별도 설계한다.
