# 맵 추가

## 적용 대상

다음과 같은 요청에 이 가이드를 적용한다.

- “얼음 협곡 컨셉의 새 캠페인 지역을 추가해줘.”
- “적 경로를 확인할 테스트 맵을 만들어줘.”
- “두 번째 행성 마지막에 보스 스테이지를 연결해줘.”

맵은 완성 배경 이미지, 같은 좌표를 사용하는 숨겨진 지형 윤곽, 시작·스폰 위치, 웨이브와 월드맵 연결을 묶는 콘텐츠다.

## 먼저 필요한 정보

- 행성 ID, 지역 ID, 표시 이름
- `mapId`와 캠페인 또는 테스트 맵 여부
- 앞뒤로 연결될 맵
- 배경 컨셉, 팔레트, 지형 실루엣
- 월드 크기와 탱크 시작 위치
- 적 스폰 위치와 예상 이동 경로
- 벽·언덕의 위치와 투사체 시야 차단 여부
- 웨이브별 적 구성과 스폰 간격
- 월드맵 노드 위치
- 새 이미지 생성이 필요한지, 승인된 원본이 있는지

아트 컨셉, 지형 배치, 캠페인 순서와 웨이브 수치가 없으면 임의로 확정하지 않는다.

## 맵의 핵심 규칙

벽과 언덕은 완성된 월드 크기 맵 이미지 안에 표현하고, 실제 충돌은 같은 좌표의 `terrain.regions`가 담당한다. 별도 장애물 오브젝트나 반복 바위 스프라이트를 덧붙이지 않는다.

맵 구현과 검증은 `plans/implementation/6-map-art-terrain/6-map-art-terrain.md`의 확정된 지형 원칙을 따른다.

## 파일 위치

| 목적 | 파일 |
| --- | --- |
| 월드, 지형, 스폰과 asset 참조 | `src/data/maps.json` |
| 행성, 지역, 웨이브 | `src/data/progression.json` |
| 월드맵 노드와 순서 | `src/data/world-map.json` |
| 이미지 logical ID | `src/data/assets.json` |
| 이미지 생성 원본 | `scripts/map-source/<map-name>-background.png` |
| 월드 크기 결과 이미지 | `public/assets/game/maps/<map-name>-map.png` |
| 캠페인 맵 생성 설정 | `scripts/generate-campaign-terrain-maps.ps1` |
| 데이터 검증 | `src/core/MapDefinitionLoader.ts`, `src/core/WorldMapDataLoader.ts` |

## ID 정합성

다음 세 파일에서 같은 ID를 사용해야 한다.

```text
mapId = <planetId>/<regionId>
```

- `maps.json`: `mapId`, `planetId`, `regionId`
- `progression.json`: 행성 `id`, 지역 `id`, 지역 `mapId`
- `world-map.json`: 노드 `mapId`, 이전 노드의 `nextMapId`

한 파일만 추가하면 맵 로드, 캠페인 진행 또는 월드맵 검증이 실패한다.

## `maps.json` 계약

현재 캠페인 맵은 `cellSize: 36`, `columns: 80`, `rows: 60`으로 2880×2160 월드를 사용한다.

```json
{
  "mapId": "planet/region",
  "planetId": "planet",
  "regionId": "region",
  "world": { "cellSize": 36, "columns": 80, "rows": 60 },
  "tankCollisionScale": 1,
  "tankCollisionShape": "rect",
  "tankStartCell": { "x": 40, "y": 30 },
  "enemySpawnCells": [
    { "x": 3, "y": 8 },
    { "x": 76, "y": 8 },
    { "x": 4, "y": 52 }
  ],
  "safeMargin": { "top": 64, "right": 64, "bottom": 64, "left": 64 },
  "repeat": { "background": false, "tile": false },
  "assets": {
    "background": "map.planet.region.background",
    "ground": "map.planet.region.background",
    "tiles": [],
    "props": [],
    "spawnEdge": "map.planet.region.spawn-edge"
  },
  "terrain": {
    "regions": [
      {
        "id": "hill-0",
        "type": "hill",
        "polygon": [
          { "x": 360, "y": 360 },
          { "x": 720, "y": 360 },
          { "x": 720, "y": 720 },
          { "x": 360, "y": 720 }
        ]
      }
    ]
  },
  "gameplay": { "decorativeOnly": false, "campaign": true },
  "artwork": {
    "worldSize": { "width": 2880, "height": 2160 },
    "origin": { "x": 0, "y": 0 }
  }
}
```

규칙:

- 현재 로더는 `cellSize`를 36으로 강제한다.
- `terrain`은 `rows` 또는 `regions` 중 하나만 가져야 한다. 완성 이미지 맵은 `regions`를 사용한다.
- 각 region ID는 맵 안에서 고유해야 한다.
- polygon은 월드 범위 안의 3점 이상 볼록 다각형이어야 한다.
- 오목하거나 복잡한 형상은 여러 볼록 polygon으로 나눈다.
- terrain type은 루트 `terrainTypes`에 존재해야 한다.
- `open` terrain type은 반드시 존재한다.
- `tankCollisionScale`은 선택적 terrain footprint 배율이며 기본값은 `1`이다.
- `tankCollisionShape`은 선택적 `rect` 또는 `circle`이며 기본값은 `rect`다. 시각 차체와 전투 격자 크기는 이 설정으로 바꾸지 않는다.
- tank 시작 셀과 enemy 스폰 셀은 대응 대상에게 막히지 않아야 한다.
- 로더는 스폰 셀 하나 이상을 허용하지만 현재 생산 맵 테스트와 프로젝트 정책은 맵마다 세 개 이상을 요구한다.
- `artwork.worldSize`는 `columns × cellSize`, `rows × cellSize`와 같아야 한다.
- `artwork.origin`은 `{ "x": 0, "y": 0 }`이다.

## 아트 제작과 등록

1. 승인된 배경 원본을 `scripts/map-source/`에 둔다.
2. `maps.json`에 최종 지형 polygon을 정의한다.
3. `generate-campaign-terrain-maps.ps1`의 `$backgrounds` 설정에 source, output, palette를 등록한다.
4. 스크립트로 배경과 polygon 경계를 같은 좌표에 합성한다.
5. 결과 PNG를 `public/assets/game/maps/`에 둔다.
6. `assets.json`에 background와 필요한 보조 asset을 등록한다.
7. 아트 출처 기록이 요구되면 사용자가 승인한 문서 위치에 원본, 결과, 크기와 생성 방법을 기록한다.

현재 생성 스크립트는 2880×2160 크기와 캠페인 맵 목록을 하드코딩한다. 다른 크기가 승인되면 JSON만 바꾸지 말고 스크립트도 함께 일반화하거나 갱신한다.

## 캠페인과 월드맵 연결

`progression.json` 지역에는 다음 정보가 필요하다.

- `id`, `mapId`, `campaign`, `name`
- `spawnInterval`, `spawnIntervalStep`, `minimumSpawnInterval`
- 하나 이상의 `waves`

`world-map.json` 노드에는 다음 정보가 필요하다.

- `id`, `mapId`, `label`
- 0..1 범위의 `position.x`, `position.y`
- 다음 캠페인 맵의 `nextMapId` 또는 마지막 노드의 `null`
- 테스트 노드 여부인 `test`

캠페인 노드는 진행 배열 순서와 `nextMapId` 연결이 일치해야 하며 순환하거나 끊기면 안 된다. 테스트 맵은 `maps.json`과 `progression.json`에서도 캠페인 제외 상태가 일치해야 한다.

## 검증과 완료 조건

- 세 데이터 파일의 `mapId`와 캠페인 순서가 일치한다.
- 배경 draw 크기, artwork 크기와 지형 좌표가 일치한다.
- 보이는 모든 벽·언덕에 대응하는 숨겨진 polygon이 있다.
- 별도 장애물 또는 반복 바위 스프라이트를 사용하지 않는다.
- 탱크의 회전된 전체 차체가 시작 위치에 들어간다.
- 모든 스폰에서 탱크 시작점까지 현재 모든 적 반지름으로 경로가 존재한다.
- 스폰, 자원 위치와 핵심 이동로가 벽 안에 있지 않다.
- 벽 관통 방지, 벽 미끄러짐과 코너 이동이 정상이다.
- 투사체 시야 차단이 이미지 경계와 일치한다.
- 기존 사용자의 캠페인 해금 상태가 새 순서에서 안전한지 확인한다.
- `npm test`, `npm run qa:art`, `npm run build`가 통과한다.
- `npm run dev`에서 월드맵 선택, 실제 전투와 지형 상호작용을 확인한다.

맵 수나 캠페인 체인을 바꾸면 `MapDefinitionLoader.test.ts`와 `WorldMapDataLoader.test.ts`의 개수 및 연결 기대값을 함께 갱신한다.
