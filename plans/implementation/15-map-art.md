# 15. 행성·지역 맵 art 상세 계획

## 현재 적용 계획

이 단계에서는 맵이 전투의 전경을 구성하되, 탱크·적·투사체·자원·HUD보다 시각적 우선순위가 낮은 배경과 장식 asset을 만든다. 11단계의 공통 art 계약과 12~14단계의 전경 asset 대비를 사용한다.

이 문서는 맵의 시각 표현과 asset 연결을 다룬다. 충돌, 이동 가능 영역, 엄폐, 시야, 스폰 규칙은 기존 시스템과 데이터가 계속 소유한다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [07-progression-content.md](07-progression-content.md)
- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [13-enemy-art.md](13-enemy-art.md)
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md)

후속 계획:

- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md)
- [18-asset-integration-performance-fallback.md](18-asset-integration-performance-fallback.md)
- [19-art-qa-release.md](19-art-qa-release.md)

## 목표

- Aurelia와 Cinder가 색과 지형 밀도로 구분된다.
- 같은 행성의 지역도 배치와 장식으로 구분된다.
- 맵 배경 위에서 탱크, 적, 투사체, 자원, HUD가 먼저 읽힌다.
- 장식이 스폰 위치, 이동 경로, 그리드 접촉, 투사체와 자원 표시를 가리지 않는다.
- 지역 ID와 배경 asset의 연결이 renderer의 조건문에 흩어지지 않는다.

## 현재 코드 기준

- `Game.render()`는 현재 전체 Canvas에 40px 그리드를 그리고 적, 자원, 탱크, 투사체, 효과, HUD 순서로 그린다.
- `Game.update()`의 전투 영역은 `canvas.width - HUDManager.PANEL_WIDTH`로 계산된다.
- 기준 논리 해상도는 1280x720이며 HUD 패널은 오른쪽 340px, 전투 영역은 940x720이다.
- 현재 지역 ID는 다음과 같다.
  - `aurelia/landing-zone`
  - `aurelia/relay-fields`
  - `cinder/ash-basin`
  - `cinder/core-ruins`
- 전용 맵 JSON이나 맵 asset manifest는 아직 없으므로, 이번 단계에서 새 데이터 계약을 정하고 16단계에서 loader에 연결한다.

## 범위

### 포함

- 행성별 기본 배경 톤
- 지역별 배경 이미지 또는 타일 변형
- 낮은 대비의 바닥 패턴과 장식물
- 스폰 가장자리와 플레이 영역 경계의 시각 규칙
- `planetId`, `regionId`와 map asset ID의 연결 데이터
- 맵 asset의 pivot, 타일 크기, 반복 여부, 안전 여백 정보
- 맵 asset 생성 프롬프트와 정규화 규칙

### 제외

- 장식물의 실제 충돌 판정
- 길찾기, 엄폐, 시야 차단, 지형 보너스
- 적 스폰·이동 규칙 변경
- 새 행성이나 새 지역 콘텐츠 추가
- 배경 이미지에 탱크, 적, 스폰 지점, HUD를 합성

## 지역별 art 방향

| 지역 | 배경 단서 | 전투 가독성 주의점 |
| --- | --- | --- |
| `aurelia/landing-zone` | 착륙 흔적, 드문 암석, 열린 평지, 차가운 청회색 | 열린 공간을 유지하고 큰 장식은 가장자리로 보낸다 |
| `aurelia/relay-fields` | 중계기 잔해, 선형 구조물, 얕은 빛의 방향성 | 직선 장식이 이동 경로나 투사체 방향으로 오인되지 않게 한다 |
| `cinder/ash-basin` | 재, 균열, 붉은 지층, 건조한 표면 | 위험 의미의 빨강을 배경 전체에 사용하지 않는다 |
| `cinder/core-ruins` | 큰 구조물 잔해, 링 형태, 조밀한 폐허 | 중앙 장식 대비를 낮추고 Core와 적의 실루엣을 비운다 |

## Asset ID와 파일 구성

11단계의 공통 규칙에 따라 파일 경로는 manifest가 소유하고, 코드에는 논리 asset ID만 전달한다.

권장 ID:

- `map.common.field-base`
- `map.aurelia.landing-zone.background`
- `map.aurelia.landing-zone.tile-variant-1`
- `map.aurelia.landing-zone.debris`
- `map.aurelia.landing-zone.spawn-edge`
- `map.aurelia.relay-fields.background`
- `map.aurelia.relay-fields.tile-variant-1`
- `map.aurelia.relay-fields.debris`
- `map.aurelia.relay-fields.spawn-edge`
- `map.cinder.ash-basin.background`
- `map.cinder.ash-basin.tile-variant-1`
- `map.cinder.ash-basin.debris`
- `map.cinder.ash-basin.spawn-edge`
- `map.cinder.core-ruins.background`
- `map.cinder.core-ruins.tile-variant-1`
- `map.cinder.core-ruins.debris`
- `map.cinder.core-ruins.spawn-edge`

초기 구현은 지역마다 background 1종, tile variant 1종, debris 1종, spawn-edge 1종이면 충분하다. 반복 타일이 필요할 때만 variant를 추가한다.

## 렌더 순서 계약

16단계의 Canvas 연결은 다음 순서를 기본값으로 사용한다.

```text
map background
map ground tile and low-contrast debris
enemy and pickup shadows
vehicle grid/frame
enemies and resource pickups
vehicle modules and Core
projectiles and target markers
impact/explosion effects
selection and install preview overlays
HUD and result/pause overlays
```

맵 장식은 탱크와 적의 hitbox를 변경하지 않는다. 장식이 전경을 가리는 경우 asset을 다시 낮은 대비로 만들거나 그리는 위치를 가장자리로 이동한다.

## 대비와 반복 규칙

- 배경의 명도 대비는 전경 실루엣보다 낮게 유지한다.
- 흰색 또는 밝은 청록을 넓은 배경 면적에 사용하지 않는다.
- 적의 피해 상태와 위험 피드백에 쓰는 빨강·주황을 장식의 반복 패턴으로 사용하지 않는다.
- `core-ruins`는 장식 밀도를 높일 수 있지만, 중앙 전투 영역에는 충분한 단순 면을 남긴다.
- 타일 경계가 그리드 선처럼 보이지 않도록 44px 전후의 게임 그리드와 다른 반복 주기를 선택한다.
- 장식의 그림자는 탱크와 자원 그림자보다 약하고, 그림자 때문에 이동 가능한 영역이 막혀 보이지 않아야 한다.

## Map 데이터 연결 예시

실제 스키마는 11단계 manifest 계약과 현재 progression 데이터에 맞춰 확정한다.

```json
{
  "planetId": "aurelia",
  "regionId": "landing-zone",
  "backgroundAsset": "map.aurelia.landing-zone.background",
  "tileAssets": ["map.aurelia.landing-zone.tile-variant-1"],
  "propAssets": ["map.aurelia.landing-zone.debris"],
  "spawnEdgeAsset": "map.aurelia.landing-zone.spawn-edge",
  "gameplay": {
    "decorativeOnly": true
  }
}
```

`decorativeOnly: true`인 장식은 충돌·스폰·길찾기 시스템에서 읽지 않는다. 지역 선택은 progression이 계속 담당하고, renderer는 선택된 `regionId`로 map asset을 조회한다.

## 생성 및 정규화 절차

1. 11단계의 색상 토큰과 12~14단계에서 확정된 전경 실루엣을 기준으로 지역별 mood board를 정한다.
2. 지역별 background를 생성할 때 “top-down 2D game background, no characters, no text, no UI”를 명시한다.
3. 타일과 debris는 투명 여백, 반복 경계, 중심 대비를 검사한다.
4. 이미지 생성 결과를 논리 해상도에 맞춰 crop 또는 resize하고, 가장자리 반복 시 눈에 띄는 이음새를 확인한다.
5. 최종 파일을 `public/assets/game/maps/` 아래에 저장하고 manifest에만 경로를 등록한다.
6. 실제 Canvas에서 전경 asset과 겹쳐 보며 대비를 조정한다.

예시 prompt:

```text
top-down 2D sci-fi tank defense game map, Aurelia landing zone,
cold desaturated blue-gray soil, sparse landing scars and small rocks,
clear open combat lanes, low contrast technical pixel-art texture,
no characters, no vehicles, no text, no interface, no neon bloom,
readable foreground silhouettes, seamless game background tile
```

## 구현 순서

### 15.1 지역 데이터와 기존 progression 비교

- 현재 지역 ID와 표시 이름을 먼저 대조한다.
- 새 asset ID가 progression ID와 일대일로 매칭되는지 확인한다.
- 지역 데이터에 게임 규칙을 복제하지 않고 art 참조만 둔다.

### 15.2 배경과 타일 renderer 입력 준비

- background, tile, debris의 논리 크기와 반복 여부를 기록한다.
- HUD 영역을 제외한 전투 영역에만 map layer가 그려지도록 계약한다.
- 16단계에서 fallback으로 대체할 수 있는 단순 색상 또는 도형을 함께 정의한다.

### 15.3 manifest 연결

- 11단계의 manifest에 맵 asset을 추가한다.
- 잘못된 경로, 누락된 region ID, 중복 asset ID를 로딩 단계에서 보고할 수 있도록 한다.

### 15.4 다음 단계 인계

- 16단계는 `regionId`로 background와 tile을 조회한다.
- 18단계는 네 지역을 모두 순회해 asset 누락과 성능을 검사한다.
- 19단계는 지역별 스크린샷과 가독성 회귀를 최종 승인한다.

## 완료 조건

- [x] 네 지역의 asset ID와 progression 지역 ID가 일치한다.
- [x] 지역별 background와 최소 하나의 tile/debris asset이 manifest에 등록되어 있다.
- [ ] 맵 장식이 actor, projectile, pickup, HUD의 의미를 가리지 않는다.
- [x] 맵 asset은 장식 전용이며 collision/pathfinding/spawn 규칙을 변경하지 않는다.
- [ ] 배경이 HUD 패널 아래에 그려지지 않는다.
- [x] 누락 asset을 위한 fallback 색상 또는 도형이 정의되어 있다.
- [x] 16, 18, 19단계가 사용할 인계 정보를 이 문서에 기록했다.

## 검증 기록 템플릿

```text
대상 지역:
검증 viewport:
전경 가독성:
배경 반복 이음새:
HUD 영역 침범 여부:
누락 또는 잘못된 asset:
수정 사항:
검증 일시:
```

## 15단계 구현 기록

### 지역과 asset 결과

- progression의 네 region ID `aurelia/landing-zone`, `aurelia/relay-fields`, `cinder/ash-basin`, `cinder/core-ruins`를 대조하고 일대일 map entry를 만들었다.
- 네 지역 모두 940x720 background, 96x96 tile variant, 48x48 debris, 940x64 spawn-edge를 제공한다.
- `field-base.png`는 background 누락 시 사용할 공통 fallback이며, manifest의 `map.common.field-base`에 등록했다.
- `src/data/maps.json`은 `planetId`, `regionId`, asset ID, repeat, safe margin만 보유하고 `gameplay.decorativeOnly: true`를 명시한다.

### 생성과 검수

- built-in `image_gen`으로 네 지역 background를 생성했다. Aurelia는 차가운 청회색 landing/relay field, Cinder는 숯·녹슨 ash/core ruins mood로 구분했다.
- 940x720 viewport에 맞춰 중앙 cover crop과 nearest-neighbor 정규화를 적용했다.
- tile, debris, spawn-edge는 지역 palette와 중심 여백을 맞추기 위해 결정적 raster asset으로 만들었다. 이 asset은 collision, pathfinding, spawn 정보를 포함하지 않는다.
- 15단계 map ID와 runtime path, draw box, pivot, layer, fallback은 `src/data/assets.json`, 생성 source와 정규화 내용은 `docs/art-asset-provenance.md`에 기록했다.

### 완료 범위와 handoff

- 네 지역의 art asset과 데이터 계약은 완료했다.
- 실제 foreground와의 overlap, combat effect 대비, HUD 패널 clipping은 map renderer가 연결되는 16단계와 최종 art QA 19단계에서 확인한다.
- 장식 asset은 기존 progression, collision, pathfinding, spawn 규칙을 변경하지 않는다.

### 검증 기록

```text
대상 지역: Aurelia landing-zone, Aurelia relay-fields, Cinder ash-basin, Cinder core-ruins
검증 viewport: 940x720 combat area
전경 가독성: pass by static background inspection; runtime overlap deferred to 16/19
배경 반복 이음새: background non-repeating, tile is one low-contrast repeat candidate
HUD 영역 침범 여부: deferred to 16 renderer layer verification
누락 또는 잘못된 asset: none in 15-stage manifest/data set
수정 사항: generated square backgrounds normalized by centered cover crop
검증 일시: 2026-09-05
```
