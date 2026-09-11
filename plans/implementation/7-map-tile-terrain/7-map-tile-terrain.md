# 7. 1번 맵 18px 타일 지형 전환

상태: 계획 승인, 구현 전

## 목적

첫 번째 캠페인 맵 `aurelia/landing-zone`만 기존 polygon 지형에서 18px tile grid 지형으로 전환한다. 첨부된 레이아웃을 기준으로 검정 영역은 통과 불가 지형, 투명 영역은 통과 가능 지형으로 만들고, 빨강 위치는 적 스폰 지점, 파랑 위치는 보이지 않는 탱크 시작 위치로 등록한다.

충돌 판정과 맵 그림이 서로 다른 데이터를 보지 않도록 다음 원칙을 고정한다.

- 1번 맵의 `terrain.rows`가 지형의 단일 원본이다.
- `TerrainGrid`의 충돌·경로·시야 판정은 같은 tile row를 읽는다.
- 최종 맵 PNG도 같은 tile row에서 생성한다.
- 시작점과 적 스폰점은 지형 row에 포함하지 않는 별도 위치 데이터다.
- 탱크 시작점은 일반 플레이에서 표시하지 않는다.
- 적 스폰점은 지형이 아니지만 게임 화면에서 빨강 계열 marker로 표시한다.
- 별도 장애물 엔티티, 런타임 이미지 픽셀 충돌, 1번 맵용 polygon 지형은 사용하지 않는다.

## 기준과 범위

### 기준 브랜치

- base: `origin/defence`
- 작업 브랜치: `feature/map-tile-terrain`
- 확인한 base commit: `65bd52e`

### 적용 범위

- 적용 맵: `aurelia/landing-zone` 하나
- 기존 월드 크기: `2880×2160px` 유지
- 기존 36px 셀을 18px로 축소
- 1번 맵 grid: `160 columns × 120 rows`
- 기존 다른 맵: 36px 및 현재 polygon/rows 계약을 유지
- 캠페인 순서, 웨이브 수치, 적 수치, 월드맵 연결, 탱크 크기와 게임 규칙은 변경하지 않음

### 첨부 이미지 해석

- 검정(opaque black): `hill` 또는 동등한 통과 불가 tile
- 투명/빈 영역: `open` tile
- 빨강 표시: 적 스폰 cell 4개
- 파랑 표시: 탱크 시작 cell 1개
- 첨부 파일의 임시 경로는 런타임에서 참조하지 않는다. 구현 시 승인된 원본을 `scripts/map-source/` 아래의 안정적인 파일로 등록한다.
- 원본과 기존 2880×2160 월드의 종횡비가 다르므로, 기본 매핑은 비율을 유지한 `contain + 중앙 정렬`로 고정한다. 매핑 offset/scale은 변환 결과에 기록하고, 임의의 픽셀 stretch는 사용하지 않는다.

## 데이터 계약

1번 맵은 다음 형태를 사용한다.

```text
{
  "world": { "cellSize": 18, "columns": 160, "rows": 120 },
  "tankStartCell": { "x": 0, "y": 0 },
  "enemySpawnCells": [
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 },
    { "x": 0, "y": 0 }
  ],
  "terrain": {
    "legend": { ".": "open", "#": "hill" },
    "rows": [120 strings; every string contains exactly 160 symbols]
  }
}
```

- `terrain.rows`는 정확히 120개다.
- 각 row는 정확히 160개의 symbol을 가진다.
- `#`가 있는 모든 cell은 현재 `tank`, `enemy`, `projectile`을 차단한다.
- `tankStartCell`과 모든 `enemySpawnCells`는 `.` cell이어야 한다.
- 시작점과 스폰점은 terrain row를 변경하지 않는다.
- 1번 맵은 `terrain.rows`와 `terrain.regions`를 동시에 가지지 않는다.
- artwork 크기는 계속 `2880×2160`이며 terrain grid 크기와 일치해야 한다.

## 실행 순서

| 단계 | 내용 | 단계 완료 시 검증 |
| --- | --- | --- |
| [7.1](7.1-map1-tile-contract.md) | 18px 좌표계와 레이아웃 계약 확정 | 계약 문서·차원·범위 검토 |
| [7.2](7.2-map1-layout-conversion.md) | 첨부 이미지에서 tile row와 marker 후보 추출 | 변환 report와 preview 확인 |
| [7.3](7.3-variable-cell-map-loader.md) | loader의 variable cell size와 map1 rows 검증 | loader unit test |
| [7.4](7.4-terrain-grid-18px-regression.md) | 18px TerrainGrid·경로·충돌 회귀 | TerrainGrid/pathfinder/관련 test |
| [7.5](7.5-map1-tile-data-migration.md) | map1 polygon을 160×120 tile data로 교체 | map loader·reachability test |
| [7.6](7.6-map1-tile-art-generation.md) | 동일 row에서 최종 맵 이미지를 생성 | `qa:art`와 이미지 정합성 검사 |
| [7.7](7.7-map1-spawn-rendering.md) | 스폰 marker 표시와 시작점 비표시 | 렌더 helper test·수동 화면 확인 |
| [7.8](7.8-map1-gameplay-integration.md) | 탱크·적·투사체·자원 흐름 통합 | 자동 회귀와 map1 시나리오 |
| [7.9](7.9-map1-tile-qa.md) | tile 전용 자동 검증과 debug overlay | 실패 케이스별 명확한 error |
| [7.10](7.10-map1-runtime-verification.md) | 실제 게임 실행 및 integration-tester 검증 | PASS일 때만 완료 |

앞 단계의 검증이 실패하면 다음 단계로 진행하지 않는다. 특히 7.5에서 모든 스폰의 적 경로가 확보되지 않으면 art와 런타임 QA를 진행하지 않는다.

## 변경 후보 파일

- `src/data/maps.json`
- `src/core/MapDefinitionLoader.ts`, `src/core/MapDefinitionLoader.test.ts`
- `src/core/TerrainGrid.ts`, `src/core/TerrainGrid.test.ts`
- `src/core/TerrainPathfinder.ts`, 관련 test
- `src/core/Game.ts`
- 필요 시 `src/entities/Vehicle.ts`, `src/entities/Enemy.ts`, `src/entities/Projectile.ts`
- `scripts/map-source/aurelia-landing-zone-layout.png`
- `scripts/convert-map1-layout.ps1`
- `scripts/generate-campaign-terrain-maps.ps1`
- `scripts/qa-art.mjs` 및 tile 정합성 검증 script
- `public/assets/game/maps/aurelia-landing-zone-map.png`
- 필요 시 `src/data/assets.json`과 신규 terrain art asset
- `docs/art-asset-provenance.md`

변경이 필요하지 않은 파일은 건드리지 않는다. 특히 다른 세 캠페인 맵과 `test/terrain-test`의 지형 원본은 이번 작업에서 변경하지 않는다.

## 최종 완료 기준

- 1번 맵이 18px/160×120 tile grid로 로드된다.
- 검정 지형 tile은 탱크·적·투사체가 통과하지 못한다.
- 열린 tile에는 설명되지 않는 충돌이 없다.
- 첨부 이미지의 4개 빨강 위치에서 적이 생성되고 화면에서 구분된다.
- 파랑 위치에서 탱크가 시작하지만 일반 플레이에서는 시작 marker가 보이지 않는다.
- 모든 스폰 cell에서 탱크 시작 cell까지 standard/tanker 경로가 존재한다.
- 탱크 이동·회전·벽면 이동·코너 이동이 18px grid에서도 관통 없이 유지된다.
- 언덕 뒤 적은 자동 조준에서 제외되고 투사체는 첫 차단 tile에서 소멸한다.
- 최종 맵 PNG의 지형 경계가 `terrain.rows`의 tile 경계와 일치한다.
- 다른 맵의 데이터와 게임 동작은 변경되지 않는다.
- `npm test`, `npm run qa:art`, `npm run build`가 통과한다.
- `npm run dev`에서 1번 맵을 실제 조작하고 `integration-tester` 결과가 PASS다.

## 범위 제외

- 나머지 맵의 18px 전환
- 동적/파괴 가능한 지형
- 런타임 이미지 분석 기반 collision
- 별도 맵 편집기
- navmesh 또는 새로운 pathfinding 알고리즘
- terrain 높이·경사·속도 보정
- 캠페인·웨이브·월드맵 규칙 변경
