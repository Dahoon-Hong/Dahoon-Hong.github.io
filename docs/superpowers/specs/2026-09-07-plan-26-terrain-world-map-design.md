# Plan 26: 지형·월드맵·지역 선택 설계

## 목표

현재 장식 전용인 맵을 실제 이동과 전투에 영향을 주는 지형 기반 맵으로 확장한다.

- 언덕처럼 탱크, 적, 탄환이 통과할 수 없는 지형을 추가한다.
- 지형별 차단 대상을 데이터로 정의해 이후 대상별 통과 조합을 추가할 수 있게 한다.
- 36px terrain grid를 탱크 충돌, 적 A* 경로 탐색, 탄환 및 시야 차단의 공통 기준으로 사용한다.
- 모든 지형 요구사항을 검증하는 `terrain-test` 맵을 먼저 만든다.
- 테스트 통과 후 기존 네 지역을 컨셉과 난이도에 맞춰 순차 전환한다.
- 시작 메뉴와 은하계형 월드맵에서 지역을 선택하고, 클리어한 지역의 다음 지역을 해금한다.
- 캠페인 진행도는 저장소 인터페이스 뒤의 `localStorage`에 저장하며 향후 Steam 저장소로 교체할 수 있게 한다.

## 현재 구조와 변경 이유

- `src/data/maps.json`의 네 맵은 `gameplay.decorativeOnly: true`이며 충돌 정보를 갖지 않는다.
- `Game`은 고정 `WORLD_SCALE`로 월드 크기를 만들고 배경, tile, prop을 반복 렌더링한다.
- `Vehicle`은 월드 경계만 검사하며 지형과 충돌하지 않는다.
- 적은 탱크를 향해 직선 이동하므로 장애물을 우회할 수 없다.
- 탄환과 자동 조준은 지형을 고려하지 않는다.
- 앱은 시작 메뉴 없이 첫 지역 전투를 즉시 시작하고, `ProgressionManager`가 지역을 순서대로 진행한다.

Plan 26은 이미지의 픽셀을 충돌 데이터로 해석하지 않는다. 지형 JSON을 판정의 권위 있는 원본으로 두고 이미지는 그 데이터를 시각화한다.

## 확정된 사용자 흐름

### 시작과 지역 선택

```text
시작 메뉴
 ├─ 게임 시작 → 은하계형 월드맵
 │               ├─ 해금된 실제 지역 선택 → 새 전투 시작
 │               └─ 좌하단 terrain-test 선택 → 테스트 전투 시작
 ├─ 설정
 │    ├─ 음악 볼륨
 │    ├─ 효과음 볼륨
 │    └─ 화면 효과 감소
 └─ 종료 → 현재 런을 버리고 시작 메뉴 유지
```

- 앱은 자동 전투 대신 시작 메뉴에서 시작한다.
- `게임 시작`은 월드맵을 연다.
- 설정 화면의 `BACK`은 시작 메뉴로 돌아간다.
- 실제 지역은 기존 순서대로 연결하며 첫 지역만 기본 해금한다.
- 실제 지역을 클리어하면 진행도를 저장하고 다음 지역을 해금한 뒤 결과 화면에서 월드맵으로 돌아간다.
- 지역 선택은 항상 해당 지역의 새 런을 만든다. 캠페인 해금 정보는 유지하고 전투 자원, 웨이브, 적, 탄환, 픽업, Armory 런타임 상태는 초기화한다.
- `terrain-test`는 월드맵 좌하단에 별도 노드로 표시하고 항상 선택 가능하게 한다.
- `terrain-test`의 클리어 여부는 캠페인 해금에 영향을 주지 않는다.
- `종료`는 브라우저 탭을 닫지 않고 현재 런을 초기화한 뒤 시작 메뉴로 돌아간다.
- Plan 26에서는 캠페인 해금만 영속화한다. 설정값은 현재 앱 실행 동안 유지하며 설정 저장과 Steam 설정 동기화는 후속 범위다.
- 화면 효과 감소의 초기값은 `prefers-reduced-motion`을 따르고, 설정 화면의 변경값은 현재 앱 실행 동안 이를 덮어쓴다.

### 화면 상태

현재 전투 상태와 앱 화면을 분리한다.

- `AppScreen`: `START_MENU`, `WORLD_MAP`, `SETTINGS`, `GAMEPLAY`
- 기존 `GameState`: `PLAYING`, `PAUSED`, `GAME_OVER`, 지역/행성 클리어, 승리 상태

메뉴와 월드맵은 기존 1280×720 Canvas에서 렌더링한다. 별도 UI 프레임워크나 웹 라우터는 추가하지 않는다. `GAMEPLAY`가 아닐 때는 전투 입력과 simulation update를 실행하지 않는다.

## 지형 데이터 계약

### 좌표와 크기

- 모든 지형 맵은 `cellSize: 36`을 사용한다.
- 맵은 cell 단위 `columns`, `rows`를 가지며 월드 크기는 각각 `columns * cellSize`, `rows * cellSize`다.
- Camera는 고정 배율이 아니라 현재 맵의 월드 크기를 사용한다.
- `terrain-test`는 `80 × 60 cell`, 즉 `2880 × 2160px`이다.
- 월드 좌표와 terrain cell 변환은 하나의 `TerrainGrid`가 담당한다.

### 차단 대상

현재 이동/충돌 대상은 다음 세 종류다.

```ts
type TerrainCollisionTarget = 'tank' | 'enemy' | 'projectile';
```

지형 타입은 대상별 차단 여부를 데이터로 가진다.

```json
{
  "open": {
    "blocks": {
      "tank": false,
      "enemy": false,
      "projectile": false
    }
  },
  "hill": {
    "blocks": {
      "tank": true,
      "enemy": true,
      "projectile": true
    }
  }
}
```

Plan 26에서는 `open`과 모든 대상을 차단하는 `hill`을 구현한다. 이후 `tank`만 통과하거나 특정 대상만 차단하는 지형은 이 데이터 조합을 추가해 지원하며 판정 코드는 바꾸지 않는다.

### Cell 배치

맵 데이터는 읽기 쉬운 문자 row와 legend로 terrain type을 연결한다.

```json
{
  "world": {
    "cellSize": 36,
    "columns": 8,
    "rows": 3
  },
  "terrain": {
    "legend": {
      ".": "open",
      "H": "hill"
    },
    "rows": [
      "HHHHHHHH",
      "H......H",
      "HHHHHHHH"
    ]
  }
}
```

실제 row 수와 각 row 길이는 `rows`, `columns`와 정확히 일치해야 한다.

### 맵별 필수 위치

각 플레이 가능한 맵은 다음 cell 위치를 가진다.

- 탱크 시작 cell 1개
- 적 스폰 cell 1개 이상

시작 cell과 스폰 cell은 해당 대상이 통과 가능한 위치여야 한다. 적 스폰 cell은 맵 안쪽의 열린 외곽 cell로 두며 현재처럼 월드 밖에서 생성하지 않는다. 초기 자원 픽업 위치는 별도 map data를 늘리지 않고 탱크 시작점 주변의 접근 가능한 열린 cell에서 계산한다.

## TerrainGrid 책임

`TerrainGrid`는 지형 판정의 단일 진입점이다.

- world point와 cell 변환
- cell 경계와 terrain type 조회
- 대상별 `isBlocked(cell, target)` 판정
- footprint가 차지하는 cell 조회
- 8방향 이웃 cell 조회
- 선분이 처음 만나는 projectile 차단 cell과 충돌 지점 반환

`Game`, `Vehicle`, `Enemy`, `Projectile`은 terrain row를 직접 읽지 않는다. 이미지 asset도 충돌 판정에 참여하지 않는다.

## 탱크 이동과 충돌

- 탱크는 현재처럼 연속 월드 좌표로 이동하며 terrain cell에 스냅하지 않는다.
- 현재 3×3 전투 grid의 크기를 기준으로 axis-aligned 이동 footprint를 계산한다.
- 후보 위치에서 `tank` 차단 cell과 겹치면 X축과 Y축을 분리해 해결한다.
- 한 축이 막혀도 다른 축은 허용해 벽면을 따라 이동할 수 있게 한다.
- 월드 경계와 지형 경계를 모두 통과해야 위치를 확정한다.
- 지형 안에서 시작하는 맵 데이터는 로딩 단계에서 거부한다.

Plan 26에서는 회전된 tank grid와 정확히 일치하는 oriented-box 물리를 추가하지 않는다. 현재 3×3 정사각형 tank grid에 맞춘 축 정렬 footprint로 충분하며, tank shape가 달라질 때 별도 확장한다.

## 적 경로 탐색

### A* 규칙

- 적은 `enemy`가 통과 가능한 terrain cell만 사용해 A* 경로를 계산한다.
- 상하좌우와 대각선의 8방향 이동을 허용한다.
- 대각선 양옆의 직교 cell 중 하나라도 막혀 있으면 해당 대각선 이동을 금지한다.
- 적 radius를 반영해 중심 cell에서 실제 footprint가 지형과 겹치지 않는 경우만 통과 가능하게 한다.
- 경로 cell 중심을 waypoint로 사용하되 실제 적 이동은 기존 연속 좌표 방식을 유지한다.
- 연속된 같은 방향 cell은 하나의 구간으로 줄이되 별도 spline이나 navmesh smoothing은 추가하지 않는다.

### 재탐색과 실패

- 탱크가 다른 terrain cell로 이동했거나 현재 경로가 유효하지 않을 때만 재탐색한다.
- 적 하나는 최대 0.25초에 한 번만 재탐색하며, 생성 순서에 따라 검사 시점을 분산한다.
- 경로를 찾지 못한 적은 순간이동하지 않고 정지한 뒤 다음 간격에 다시 시도한다.
- 맵 검증은 모든 적 스폰 cell에서 초기 탱크 시작 cell까지 경로가 존재하는지 검사한다.
- 동적/파괴 가능한 지형, 적끼리의 회피, 군집 흐름장은 Plan 26 범위에 포함하지 않는다.

## 탄환 충돌과 자동 조준

### 공통 raycast

`TerrainGrid`의 선분 raycast를 다음 두 곳에서 공유한다.

1. 전투 모듈의 자동 조준 후보 필터
2. 실제 탄환의 프레임별 이동 충돌

무기와 적 사이에 `projectile` 차단 지형이 있으면 해당 적을 조준 후보에서 제외한다. 후보가 없으면 기존 규칙대로 탄약을 쓰지 않고 cooldown도 시작하지 않는다.

탄환은 이전 위치와 다음 위치 사이의 선분이 처음 만나는 차단 cell에서 소멸하고 충돌 효과를 만든다. 프레임 사이에 얇은 지형을 건너뛰지 않도록 현재 위치 한 점만 검사하지 않는다. Plan 26에서는 direct와 arc projectile 모두 같은 `projectile` 차단 규칙을 사용한다.

## 스폰과 자원

- `WaveManager`는 현재 맵이 제공한 적 스폰 cell 중 유효한 위치를 사용한다.
- `terrain-test`는 요구사항 재현이 가능하도록 고정된 스폰 순서와 웨이브를 사용한다.
- 초기 자원 픽업은 탱크가 접근할 수 있는 열린 cell에만 배치한다.
- 적이 떨어뜨리는 자원은 적이 서 있던 통과 가능 위치에 생성한다.
- 맵 로더는 시작 위치, 스폰 위치, 초기 픽업 후보의 범위와 통과 가능성을 검증한다.

## `terrain-test` 설계

### 목적

`terrain-test`는 플레이어용 캠페인 난이도를 표현하는 맵이 아니라 지형 시스템의 회귀 검증 맵이다. 일반 월드맵에서 선택할 수 있지만 캠페인 진행도와 분리한다.

### 레이아웃

```text
┌──────────────────────────────────────────────┐
│  적 스폰       언덕 벽        적 스폰          │
│       ┌────── 협로 ──────┐                   │
│       │                  │                   │
│  ┌────┘    넓은 광장     └────┐              │
│  │          시작 지점         │   언덕 군집   │
│  │                            ├───┐          │
│  └──── 협로 ─── 교차로 ───────┘   │          │
│                │                  │          │
│                └── 작은 막다른 길 ┘          │
│  적 스폰                                      │
└──────────────────────────────────────────────┘
```

- 중앙에 탱크가 움직이고 회전할 수 있는 넓은 광장을 둔다.
- 서쪽과 북쪽에 현재 탱크 footprint가 통과 가능한 좁은 길을 둔다.
- 세 개 이상의 길이 만나는 교차로를 둔다.
- 한 개 입구만 가진 작은 막다른 길을 둔다.
- 언덕 벽, 모서리, 섬 형태를 배치해 이동 차단, 벽면 이동, A* 우회, 대각선 모서리 금지를 검증한다.
- 여러 방향의 열린 외곽 cell에 적 스폰 지점을 둔다.
- 언덕 너머 적을 배치할 수 있는 구간을 두어 시야 차단과 탄환 충돌을 검증한다.

### 고정 웨이브

- Wave 1: standard 6, tanker 0 — 광장과 단일 우회 경로 확인
- Wave 2: standard 8, tanker 2 — 협로와 교차로에서 서로 다른 radius 확인
- Wave 3: standard 10, tanker 4 — 복수 스폰과 전체 경로/전투 회귀 확인

세 웨이브를 모두 완료하면 일반 결과 화면을 표시한 뒤 월드맵으로 돌아가며 진행도는 변경하지 않는다.

### 테스트 표시

`terrain-test`에서만 켤 수 있는 debug overlay를 제공한다.

- 36px terrain grid
- 대상별 차단 cell
- 적의 현재 A* path
- 탱크 movement footprint
- 탄환이 충돌한 terrain cell

overlay는 검증 보조 수단이며 일반 지역에서는 기본적으로 숨긴다.
`terrain-test` 실행 중 `F3`으로 overlay를 켜고 끈다.

## 지형 렌더링과 아트

### 원칙

- 충돌 cell과 시각적 언덕 경계가 일치해야 한다.
- 배경 원화에 통과 불가 구조만 그려 넣지 않는다. 실제 지형 asset을 terrain cell 위치에 배치한다.
- 기존 map background는 지면 분위기에 재사용할 수 있으나 충돌 지형과 모순되면 다시 그린다.
- 지형은 탱크, 적, 자원, 투사체보다 낮은 대비를 유지하되 통과 불가 경계는 명확하게 보이게 한다.
- 기존 prop과 debris는 계속 장식 전용이다. 이동을 막는 이미지는 반드시 terrain grid에서 파생해 렌더링한다.

### `terrain-test` asset

- `map.test.terrain-test.background`
- `map.test.terrain-test.ground`
- `map.test.terrain-test.hill-center`
- `map.test.terrain-test.hill-edge`
- `map.test.terrain-test.hill-corner`
- `map.test.terrain-test.spawn-edge`

거대한 완성 맵 한 장 대신 terrain grid에 맞는 중심, edge, corner 조각을 사용한다. asset ID와 runtime path는 `assets.json`, 생성 및 정규화 정보는 `docs/art-asset-provenance.md`에 기록한다.
각 hill cell은 인접한 hill cell을 확인해 필요한 edge와 corner 조각을 고른다. 이웃 판정은 시각 표현에만 쓰며 충돌 범위는 항상 원래 cell이다.

### 렌더 순서

```text
background and ground
terrain center/edge/corner
pickup and actor shadows
vehicle and enemies
projectiles and effects
terrain debug overlay
HUD and screen overlays
```

## 월드맵과 캠페인 데이터

### 월드맵 표현

- 정적 은하계 배경 asset 위에 node와 연결선을 Canvas로 그린다.
- 배경 이미지에 잠금이나 클리어 상태를 합성하지 않는다.
- node 상태는 `locked`, `available`, `cleared`, `test`로 표시한다.
- 위치는 1280×720 기준 정규화 좌표로 데이터에 저장한다.
- `terrain-test` node는 좌하단에 고정한다.

### 데이터 소유권

- `progression.json`: 실제 지역과 `terrain-test`의 웨이브 및 전투 규칙
- `maps.json`: terrain type catalog, 맵 크기, 시작/스폰 위치, terrain row, map/terrain asset 참조
- 새 `world-map.json`: node 위치, 실제 지역 순서, 다음 map ID, test 여부

각 playable map은 `${planetId}/${regionId}` 형태의 안정적인 map ID를 사용한다. 월드맵, 진행도, map data, progression data는 같은 ID를 참조한다.

### 진행도 저장 계약

Steam 등 비동기 저장소를 고려해 처음부터 Promise 기반 계약을 사용한다.

```ts
interface CampaignProgressStore {
  load(): Promise<CampaignProgress>;
  save(progress: CampaignProgress): Promise<void>;
}

type CampaignProgress = {
  version: 1;
  clearedMapIds: string[];
};
```

- 현재 구현은 `LocalStorageCampaignProgressStore`다.
- 저장 key는 `platform-vehicle-defense.campaign-progress.v1`로 고정한다.
- 저장하는 값은 실제 캠페인에서 클리어한 map ID뿐이다.
- 첫 지역과 다음 해금 상태는 `world-map.json`으로부터 계산한다.
- test map ID, 알 수 없는 ID, 중복 ID는 로드 시 제거한다.
- 손상된 JSON, 접근 거부, 저장 공간 오류가 발생하면 메모리의 기본 진행도로 실행하고 사용자 진행을 덮어쓰지 않는다.
- 실제 지역 클리어 직후 메모리 진행도를 갱신하고 저장을 시도한 다음 월드맵으로 돌아간다.
- 저장 실패는 현재 실행의 해금을 되돌리지 않는다. 경고를 남기고 다음 저장 시 전체 `clearedMapIds`를 다시 기록한다.
- 향후 Steam 구현은 같은 계약을 사용하며 인증, 동기화 충돌, cloud merge는 별도 plan에서 다룬다.

## 실제 네 지역 전환

공통 시스템과 `terrain-test`가 통과한 뒤 다음 순서로 전환한다.

1. `aurelia/landing-zone`: 넓은 광장, 드문 언덕 섬, 넓은 진입로
2. `aurelia/relay-fields`: 선형 길, 교차로, 중간 밀도의 협로
3. `cinder/ash-basin`: 비대칭 언덕, 우회로, 더 긴 협로
4. `cinder/core-ruins`: 높은 지형 밀도, 복수 우회로, 제한적인 막다른 숨숨길

초반 지역은 열린 면적과 대체 경로를 넉넉히 두고, 후반 지역으로 갈수록 협로와 시야 차단 밀도를 높인다. 모든 맵은 탱크 시작 위치와 각 적 스폰 위치 사이에 최소 한 개의 유효 enemy 경로가 있어야 하며, 유일 경로가 현재 tank footprint보다 좁아서는 안 된다.

기존 지역 이미지는 지형 데이터와 시각적으로 맞지 않는 부분만 교체한다. 각 지역의 배경 색, 행성 분위기, 기존 asset ID 체계는 유지한다.

## 오류 처리와 검증

### 데이터 로딩 실패

- row 수/길이 불일치, 미등록 terrain symbol/type, 잘못된 차단 값, 범위 밖 위치는 개발 오류로 즉시 보고한다.
- world-map node가 map/progression ID를 찾지 못하거나 순환/중복된 실제 지역 연결을 가지면 로딩을 거부한다.
- 누락된 그림 asset은 기존 SpriteRenderer fallback을 사용하되 충돌 데이터는 유지한다.

### 자동 검증

- world point ↔ terrain cell 경계 변환
- 대상별 차단 조합
- tank axis 분리 충돌과 벽면 이동
- A* 8방향, 대각선 모서리 금지, 경로 없음
- enemy radius에 따른 통과 가능성
- projectile 선분 raycast의 첫 충돌점
- 가려진 적의 자동 조준 제외와 무탄약/무 cooldown
- 모든 spawn에서 초기 tank 위치까지의 enemy path
- localStorage 정상/손상/알 수 없는 ID 처리
- 실제 지역 클리어 후 다음 node 해금과 reload 유지

### 수동 QA

1. 시작 메뉴의 세 action과 설정을 확인한다.
2. 첫 실행 월드맵에서 첫 지역과 `terrain-test`만 선택 가능한지 확인한다.
3. `terrain-test`에서 광장, 협로, 교차로, 막다른 길을 탱크로 이동한다.
4. standard와 tanker가 언덕을 통과하지 않고 우회하는지 확인한다.
5. 적이 언덕 모서리를 대각선으로 비집고 통과하지 않는지 확인한다.
6. 언덕 뒤 적을 자동 조준하지 않고 탄약과 cooldown이 유지되는지 확인한다.
7. 발사된 탄환이 프레임 간 지형을 관통하지 않고 첫 언덕에서 소멸하는지 확인한다.
8. test map 클리어가 캠페인 해금을 바꾸지 않는지 확인한다.
9. 실제 지역 클리어 후 다음 node가 열리고 새로고침 후에도 유지되는지 확인한다.
10. 네 실제 지역에서 모든 웨이브가 도달 가능하며 정상 클리어되는지 확인한다.
11. `npm run dev`, `npm run build`, `npm run qa:art`를 실행한다.

## 범위 제외

- 파괴 가능하거나 움직이는 지형
- 고저차 물리, 이동 속도 보정, 경사
- 적끼리의 충돌 회피와 군집 pathfinding
- navmesh, polygon collider, 별도 맵 편집기
- 특정 무기나 투사체의 지형 관통/곡사 예외
- 분기형 캠페인과 자유로운 행성 이동
- 설정값 영속화
- Steam 인증, cloud save, 동기화 충돌 해결

## 구현 sub plan

### 26.1 지형 데이터 계약과 TerrainGrid

- 36px cell 기반 map schema와 validation
- map ID, world size, terrain legend/rows, 시작/스폰 cell
- 좌표 변환, 대상별 차단, footprint, raycast 기초

### 26.2 탱크 지형 충돌

- 연속 이동 후보와 tank footprint 검사
- X/Y 분리 해결과 벽면 이동
- 월드/terrain 경계 통합

### 26.3 적 A*와 스폰

- radius-aware 8방향 A*
- 대각선 corner cutting 금지
- 경로 재계산과 실패 처리
- map-defined spawn과 도달 가능성 검증

### 26.4 탄환 충돌과 시야 차단

- terrain 선분 raycast
- 자동 조준 line-of-sight 필터
- direct/arc projectile 첫 충돌과 효과

### 26.5 `terrain-test` 맵과 art

- 80×60 테스트 레이아웃
- 광장, 협로, 교차로, 막다른 길, 언덕 배치
- 고정 세 웨이브와 debug overlay
- 테스트 지형 asset 생성, manifest, provenance

### 26.6 시작 메뉴와 설정

- 시작 화면과 `GAME START`, `SETTINGS`, `EXIT`
- 음악, 효과음, 화면 효과 감소
- 앱 화면과 전투 상태/입력 분리

### 26.7 은하계 월드맵과 진행도 저장

- galaxy background, node, 연결선, 잠금/클리어 표시
- `terrain-test` 좌하단 상시 해금 node
- `CampaignProgressStore`와 localStorage 구현
- 지역 선택, 클리어, 월드맵 복귀 흐름

### 26.8 실제 지역 지형 전환

- 네 지역 terrain row와 스폰/시작 위치
- 지역별 난이도와 컨셉에 맞는 지형 배치
- 필요한 background/terrain asset 교체

### 26.9 통합 회귀

- terrain-test와 네 실제 지역 수동 QA
- 진행도 reload와 손상 데이터 복구
- art readability와 collision alignment
- `npm run dev`, `npm run build`, `npm run qa:art`

## 완료 기준

- 탱크, 적, direct/arc 탄환이 `hill`을 통과하지 않는다.
- 적은 8방향 A*로 협로와 교차로를 우회하며 모서리를 가로지르지 않는다.
- 언덕 뒤 적은 자동 조준 후보에서 제외된다.
- `terrain-test`에서 네 가지 요구 레이아웃과 고정 웨이브를 반복 검증할 수 있다.
- 시작 메뉴에서 월드맵으로 이동하고 해금된 실제 지역과 test map을 선택할 수 있다.
- 실제 지역 클리어 후 다음 지역이 열리고 새로고침 후에도 유지된다.
- test map은 항상 열려 있고 캠페인 진행도를 바꾸지 않는다.
- 네 실제 지역이 컨셉과 난이도에 맞는 지형을 가지며 모든 스폰에서 탱크까지 유효 경로가 존재한다.
- 이미지와 충돌 데이터가 일치하고 누락 asset fallback에서도 게임 판정은 유지된다.
- `npm run build`와 `npm run qa:art`가 성공하며 `npm run dev`에서 전체 흐름을 수동 검증한다.
