# Plan 25: 게임성 확장 설계

## 목표

현재 한 화면에 고정된 전투를 확장된 월드 탐색형 전투로 바꾼다.

- 맵을 상하좌우로 확장하고 탱크 이동에 따라 카메라가 스크롤한다.
- 탱크의 이동 방향, 4프레임 이동 sprite, 화면 내 탱크 크기 축소를 추가한다.
- `UPGRADE WEB`의 시스템 목록에 `ARMORY`를 추가한다.
- Armory 연구 → 전투 모듈 구매 → grid 설치 흐름을 제공한다.
- 직사각형 전투 모듈의 시계방향 회전, 드래그 이동, 고유 사격각과 미리보기를 제공한다.

## 확정된 사용자 경험

### 월드와 카메라

전투 객체는 화면 좌표가 아닌 월드 좌표를 가진다. 월드는 현재 gameplay viewport보다 상하좌우로 넓으며, 카메라는 탱크를 부드럽게 따라간다. 카메라 위치는 월드 경계 안으로 clamp하고, HUD는 화면 좌표에 고정한다.

기존 map background/tile/prop asset은 먼저 반복 배치해 확장 월드를 표현한다. 새 대형 배경 원화나 별도 맵 편집기는 범위에 포함하지 않는다.

웨이브 적 생성, 탱크 이동 제한, 적과 grid의 접촉 판정은 gameplay viewport가 아니라 확장된 월드 경계를 사용한다.

### 탱크 이동과 표시 크기

탱크는 마지막 non-zero 이동 입력 방향을 바라본다. 이동 중에는 4프레임 sprite를 순환하고, 정지 중에는 idle frame을 표시한다. `prefers-reduced-motion`에서는 정지 frame을 사용한다.

현재 44px grid cell을 약 36px로 줄여 화면에서 탱크가 차지하는 면적을 낮춘다. 이동 속도, 무기 range, 자원 생산량 등 게임 수치는 변경하지 않는다. grid와 module footprint의 표시/충돌 크기는 같은 cell size를 사용한다.

탱크의 로컬 grid와 module rendering은 탱크 방향을 따라 회전한다. grid 설치 가능 여부와 적 충돌 판정은 기존 grid 논리를 유지하며, 회전된 표시 때문에 물리 엔진이나 경로 탐색을 추가하지 않는다.

### Armory

Armory는 별도 탭이 아니라 기존 `UPGRADE WEB`의 시스템 목록에 `builtin:armory`로 표시되는 하나의 subject다. Armory는 생산이나 전투를 하지 않는다.

- Armory 연구 트리의 노드는 전투 모듈 해금과 연결된다.
- 연구 전투 모듈은 locked, 연구 후에는 purchase 가능 상태가 된다.
- purchase는 기존 `matter` 자원을 사용해 보유 수량을 늘린다.
- 시작 직사포는 연구·구매·설치 완료 상태로 유지한다.
- 구매한 모듈을 선택하고 `INSTALL`을 누르면 grid 위에 설치 ghost가 나타난다.
- 연구, 구매, 설치, 이동, 회전은 기존 정책과 동일하게 PAUSED 중에만 허용한다.

Armory 연구 상태와 구매 수량은 런 단위 상태로 관리하며, restart 시 초기화한다. 기존 per-instance `UpgradeManager` 흐름은 전투 모듈 개별 업그레이드에 그대로 사용한다.

### 모듈 배치와 방향

모듈 placement는 `anchor`와 `orientation`을 가진다. orientation은 `0`, `1`, `2`, `3` 중 하나이며 각각 기본 방향, 시계방향 90°, 180°, 270°를 뜻한다. 90°와 270°에서는 직사각형 footprint의 width/height를 교환한다.

- 설치 ghost는 현재 orientation을 반영한 footprint를 표시한다.
- 유효 배치는 월드 grid 경계, blocked cell, 다른 module 점유 여부를 모두 통과해야 한다.
- 설치된 module은 PAUSED 중 클릭-드래그로 이동할 수 있다.
- 드래그 중 `R` 입력은 orientation을 시계방향으로 한 단계 변경한다.
- 드롭이 실패하면 기존 placement를 유지한다.
- 기존 빈 cell 선택 → 설치 목록 흐름은 Armory의 구매/설치 흐름으로 통합하고 중복 설치 UI는 제거한다.

### 사격각

전투 module definition은 고유 `fireArcDegrees`와 기본 local direction을 가진다. 실제 공격 방향은 `tankFacing + moduleOrientation`으로 계산한다.

자동 조준은 module range 안에 있고 사격각의 절반 이내에 있는 살아 있는 적만 후보로 삼는다. 후보가 없으면 탄약을 소비하지 않고 cooldown도 시작하지 않는다. 직사/곡사 projectile의 기존 피해·탄약·비행 규칙은 유지한다.

설치 ghost와 선택/드래그 중인 module은 중심에서 방향 선과 사격각 부채꼴을 표시한다. 이를 통해 drop 전에 방향과 공격 가능 영역을 확인할 수 있다.

## 데이터 계약

기존 `TankModuleDefinition`에 필요한 선택 필드를 추가한다.

- `researchCost`: Armory 연구 비용. 없으면 연구 비용 없음.
- `purchaseCost`: Armory 구매 비용. 없으면 기존 `installCost`를 사용한다.
- `fireArcDegrees`: 0 초과 360 이하의 사격각.
- `defaultOrientation`: 0~3 범위의 시작 방향.
- Armory 연구 노드에는 해금 대상 combat module ID를 연결한다.

기존 `installCost`는 호환성을 위해 유지하되 새 UI와 로직에서는 purchase cost로 해석한다. 데이터 로더는 module size, costs, angle, orientation, research unlock 참조를 검증한다.

## 구조와 책임

### Camera

새 camera value object 또는 작은 클래스로 world bounds, viewport size, follow target, clamp, world-to-screen/screen-to-world 변환을 담당한다. Game loop와 renderer는 이 변환을 사용하고, HUD는 변환에 참여하지 않는다.

### Vehicle

movement facing, animation time, reduced-motion frame 선택, render scale/cell size를 관리한다. 이동 update는 월드 bounds를 받고, module world position은 tank facing을 반영한다.

### CombatGrid

orientation-aware footprint 계산, placement 검증, module 이동/회전, occupancy 재구성을 담당한다. Game/HUD가 occupancy map을 직접 수정하지 않는다.

### CombatModule

orientation과 fire arc accessor를 제공하고, target selection 전에 angle filter를 적용한다. 각 module subclass는 기존 projectile 생성과 sound callback 계약을 유지한다.

### Armory state

Armory 연구 상태와 구매 수량을 관리한다. 연구는 `UpgradeManager`에 등록된 `builtin:armory` 연구 tree와 연결하고, 구매 수량은 별도 작은 런타임 map으로 둔다. 구매와 설치를 한 메서드에 합치지 않아 연구/구매/배치 실패 시 자원과 수량이 보존되도록 한다.

### HUDManager

기존 subject list에 Armory를 포함하고, Armory subject 선택 시 연구 web과 module purchase/install controls를 렌더링한다. Canvas pointer 좌표는 camera를 통해 world 좌표로 변환해 grid hit test와 drag preview에 사용한다. HUD panel hit test는 계속 screen 좌표를 사용한다.

## 상태와 입력

- `WASD`/방향키: 월드에서 탱크 이동
- `Space`/`P`: 기존 pause toggle
- `R`: PAUSED 중 설치 ghost 또는 드래그 중 module을 시계방향 회전
- pointer down/move/up: PAUSED 중 module 선택, drag preview, drop
- panel click: 기존 upgrade 선택, Armory 연구, 구매, install 시작

pointer 이벤트가 panel hitbox에 해당하면 world drag로 전파하지 않는다. terminal state에서는 설치/연구/구매/drag를 무시한다.

## 구현 단계

1. 월드 경계, Camera 변환, 웨이브/적/픽업/탄환 렌더 좌표 전환, tank cell size 축소.
2. Vehicle facing과 4-frame sprite manifest/asset/fallback 연결.
3. Armory builtin definition, 연구 unlock, purchase inventory, Upgrade Web subject와 UI 연결.
4. orientation-aware CombatGrid 이동/회전, pointer drag, ghost preview.
5. module fire arc target filter, arc preview, 데이터 검증과 회귀 QA.

## 범위 밖

- 새 물리 엔진, 장애물 pathfinding, 적의 복잡한 월드 탐색 AI
- 계정/세이브 슬롯/영구 연구 저장
- 새 대형 맵 원화 제작 및 맵 에디터
- 마우스 조준이나 수동 발사
- 모듈 철거 환불 경제
- 비전투 내장 시스템의 설치/이동

## 완료 기준

- 화면보다 큰 월드에서 탱크가 상하좌우로 이동하고 카메라가 부드럽게 추적한다.
- 탱크가 화면 가장자리에서 잘리지 않고, 월드 경계 밖으로 이동하지 않는다.
- 탱크가 이동 방향을 바라보고 4-frame animation을 재생하며 reduced-motion에서는 정지한다.
- Upgrade Web 시스템 목록에 Armory가 보이고, 연구/구매 상태가 matter와 함께 정상 변경된다.
- 연구·구매한 모듈을 ghost로 설치할 수 있고, 회전된 직사각형 footprint의 경계/겹침 검사가 정확하다.
- 설치된 모듈을 일시정지 중 드래그 이동하고 `R`로 시계방향 회전할 수 있다.
- 모듈별 사격각 밖의 적에게는 발사하지 않으며, preview가 실제 판정 방향과 일치한다.
- PAUSED 중에는 설치/연구/구매만 가능하고 이동·적·발사체·자동 생산·수집은 멈춘다.
- `npm run build`가 성공하고 기존 전투·업그레이드·승패·재시작 흐름이 회귀하지 않는다.
