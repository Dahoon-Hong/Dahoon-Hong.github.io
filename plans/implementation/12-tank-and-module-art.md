# 12. 탱크·코어·전투 모듈 asset 상세 계획

## 현재 적용 계획

11단계의 공통 asset 계약을 기준으로 starter 탱크와 모듈 시각 asset을 제작한다. 이 단계에서는 플레이어 탱크의 구성과 격자 설치 상태를 명확하게 만드는 데 집중하고, 실제 Canvas renderer 연결은 16단계에서 수행한다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [06.5-mid-term-review.md](06.5-mid-term-review.md)
- [07-progression-content.md](07-progression-content.md)

후속 계획:

- [13-enemy-art.md](13-enemy-art.md): 같은 팔레트와 외곽선 규칙으로 적을 제작한다.
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md): 무기 발사체와 피격 효과가 모듈 실루엣을 보완한다.
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md): 이 단계의 asset과 manifest를 실제 게임에 연결한다.
- [17-hud-upgrade-ui-art.md](17-hud-upgrade-ui-art.md): 모듈 world asset과 대응하는 UI icon을 사용한다.

## 목표

전투 화면에서 다음 정보를 짧은 시간 안에 읽을 수 있게 한다.

1. 플레이어 탱크의 전체 외곽과 이동 중심
2. 중앙 Core의 위치와 생존 상태
3. 빈 격자, 막힌 격자, 장착된 전투 모듈의 차이
4. `direct-weapon`과 `arc-weapon`의 차이
5. 다중 셀 모듈의 실제 footprint와 발사 중심
6. 모듈 손상·비활성·선택·설치 미리보기 상태

## 현재 코드 기준

| 코드 기준 | 현재 값 | asset 작업에서의 의미 |
|---|---|---|
| 논리 Canvas | `1280x720` | 탱크 asset은 논리 좌표에서 그릴 크기를 기준으로 만든다. |
| HUD panel | `HUDManager.PANEL_WIDTH = 340` | 탱크와 전투 영역은 오른쪽 panel 영역을 침범하지 않는다. |
| grid cell | `Vehicle.tileSize = 44` | 1칸 모듈의 draw box는 `44x44`다. |
| 기본 grid | `3x3` | 코어는 `coreCell: { x: 1, y: 1 }`에 있다. |
| 초기 전투 배치 | `direct-weapon` at `{ x: 1, y: 0 }` | 첫 화면에서 Core와 직사 무기가 즉시 구분되어야 한다. |
| 모듈 footprint | `1x1`, `2x1`, `2x2` | 하나의 모듈 instance와 하나의 visual footprint로 표현한다. |
| 내장 시스템 | grid 설치 대상이 아님 | world grid에 억지로 그리지 않고 UI icon과 tank 상태로 표현한다. |
| 차량 충돌 경계 | grid bounds와 padding으로 계산 | frame 장식과 그림자는 경계를 변경하지 않는다. |

관련 코드:

- `src/entities/Vehicle.ts`: grid 위치, module rect, world center, frame와 grid 렌더링
- `src/entities/Module.ts`: combat module render 호출, module size와 level
- `src/entities/CombatGrid.ts`: anchor, occupancy, blocked cell, 초기 배치
- `src/core/Game.ts`: draw 순서와 HUD panel을 제외한 gameplay 영역
- `src/core/TankDefinitionLoader.ts`: tank/module ID와 크기 데이터

## 범위

### 포함

- starter 탱크 frame과 grid 조립 조각
- Core, 빈 cell, blocked cell, selected cell asset
- `direct-weapon`, `arc-weapon` body와 icon
- built-in module의 UI용 icon 목록
- module active, damaged, disabled 상태의 시각 규칙
- 1x1, 2x1, 2x2 asset draw box와 pivot 검수
- 11단계 manifest에 탱크 관련 항목 추가
- `imagegen`을 사용한 기준 탱크와 전투 모듈 asset 제작

### 제외

- 탱크의 회전·방향별 sprite
- 새 tank definition이나 새 combat module 추가
- 모듈 수치, 설치 비용, 사거리, 발사 규칙 변경
- renderer 코드와 `AssetManager` 구현
- 내장 시스템을 격자에 개별 설치·파괴하는 규칙
- 최종 HUD 레이아웃 변경

## asset 목록

### World asset

| logical ID | 상태 | 논리 크기 | 비고 |
|---|---|---:|---|
| `tank.starter.frame.center` | `idle`, `damaged` | grid에 맞춰 조립 | 3x3와 5x5에 재사용 가능해야 한다. |
| `tank.starter.frame.edge` | `idle`, `damaged` | cell 단위 조각 | 상하좌우 조합을 renderer가 결정한다. |
| `tank.starter.frame.corner` | `idle`, `damaged` | cell 단위 조각 | 방향별 flip 가능 여부를 manifest에 기록한다. |
| `tank.grid.empty` | `idle`, `selected`, `preview-valid`, `preview-invalid` | `44x44` | 설치 상태 overlay와 충돌하지 않아야 한다. |
| `tank.grid.blocked` | `idle`, `selected` | `44x44` | 막힌 셀은 색상 외에 pattern이 있어야 한다. |
| `tank.grid.core` | `active`, `damaged`, `disabled` | `44x44` | 실제 Core cell 중심과 일치한다. |
| `tank.module.direct-weapon` | `active`, `damaged`, `disabled` | `44x44` | 발사점 위치를 manifest에 기록한다. |
| `tank.module.arc-weapon` | `active`, `damaged`, `disabled` | `88x44` | footprint 중앙에서 발사한다. |

### UI icon asset

다음 내장 시스템은 grid body가 아니라 `UPGRADE WEB`과 시스템 목록에 표시할 icon으로 제작한다.

```text
core
resource-generator
gatherer
recycler
arsenal
composer
rail
power-pack
caterpillar-track
armor-plate
direct-weapon
arc-weapon
```

각 icon은 20px 기준으로 의미가 읽혀야 하며, 이미지 안에 모듈명이나 `Lv.` 텍스트를 넣지 않는다.

## 시각 계약

### Grid와 pivot

1. `CombatGrid`의 anchor는 다중 셀 footprint의 좌상단으로 유지한다.
2. `Vehicle.getModuleWorldRect()`가 계산하는 폭과 높이를 asset draw box로 사용한다.
3. `Vehicle.getModuleWorldCenter()`가 계산하는 중심이 module sprite의 pivot이 된다.
4. 2x1 모듈은 `88x44`, 2x2 모듈은 `88x88` 논리 크기로 그린다.
5. sprite 내부 장식이 draw box를 넘어가도 collision bounds나 설치 가능 셀을 확장하지 않는다.
6. 현재 회전 기능이 없으므로 방향별 art를 만들지 않는다. 방향을 추가하려면 별도 규칙과 계획을 먼저 만든다.

### 탱크 조립

- frame은 center, edge, corner 조각으로 구성한다.
- grid cell은 frame 위에 독립적으로 그려진다.
- Core와 combat module은 cell 중심에 맞춰 그린다.
- module의 `size`는 점유 셀 전체를 표시하는 하나의 body로 렌더링한다.
- 선택 outline과 설치 미리보기는 sprite에 굽지 않고 Canvas overlay로 그린다.
- shadow는 actor 아래 layer에 두며 선택·hitbox와 무관하다.

### 상태 표현

| 상태 | 기본 처리 | asset frame 필요 여부 |
|---|---|---|
| `active` | 내부 중심부의 작은 pulse 또는 밝기 강조 | 정적 frame 우선 |
| `damaged` | 균열, 연기, 낮은 명도 overlay | Core/frame은 별도 frame 검토 |
| `disabled` | 낮은 명도와 사선 pattern | 정적 frame 또는 renderer tint |
| `selected` | 청록 outline과 slot 강조 | asset에 굽지 않음 |
| `preview-valid` | 낮은 alpha와 허용 outline | asset에 굽지 않음 |
| `preview-invalid` | 금지 pattern과 danger outline | asset에 굽지 않음 |

상태 frame을 늘리기 전에 tint, outline, alpha로 표현할 수 있는지 먼저 확인한다. frame이 필요해도 logical ID의 상태 suffix와 manifest 항목을 함께 추가한다.

## 이미지 생성과 정규화 순서

1. 11단계의 starter 기준 샘플을 먼저 확인한다.
2. `tank.starter.frame.center`와 `tank.grid.core`를 기준으로 탱크의 광원·외곽선·픽셀 크기를 고정한다.
3. 기준 탱크를 참조해 `direct-weapon`과 `arc-weapon`을 생성한다.
4. 1x1 모듈을 먼저 확정하고, 2x1 모듈은 같은 장비 언어를 가로로 확장한다.
5. 각 결과를 100%와 50% 크기로 확인한다.
6. 투명 배경, 흰색 또는 검은색 matte, 텍스트, side view, isometric 결과를 제거한다.
7. 최종 draw box에 맞춰 nearest-neighbor로 정규화한다.
8. `public/assets/game/tank/`와 `public/assets/game/ui/`에 저장하고 manifest에 등록한다.
9. 원본, 정규화 결과, prompt, 수정 내역을 provenance 기록에 남긴다.

기본 prompt의 subject 예시는 다음과 같다.

```text
a compact modular orbital-drop defense tank frame, viewed directly from above,
industrial salvage armor, readable central core socket, hard pixel clusters,
dark navy body with restrained cyan technical markings, one light direction,
centered sprite, transparent background, no text, no UI, no extra vehicles,
no perspective, no isometric view, no 3D render, no soft bloom.
```

## 구현 단계와 전후 연결

### 12.1 기준선과 데이터 대조

- `module.json`의 `starter`, `coreCell`, `blockedCells`, `initialCombatModules`를 확인한다.
- 모든 module JSON의 `id`, `kind`, `size`를 수집한다.
- 코드에 존재하는 render 대상과 UI icon 대상의 목록을 분리한다.
- 11단계의 palette와 draw box를 변경하지 않고 누락된 항목만 추가한다.

### 12.2 샘플 제작

- Core, frame center, direct weapon, arc weapon을 먼저 만든다.
- 2x1 모듈의 중심이 양쪽 셀 사이에서 어긋나지 않는지 확인한다.
- damaged와 disabled는 동일한 body를 재사용할 수 있는지 먼저 검토한다.

### 12.3 manifest와 provenance 연결

- 모든 탱크 asset에 logical ID, `src`, draw size, pivot, layer, fallback을 등록한다.
- manifest에 없는 파일명을 후속 renderer가 직접 사용하지 않도록 한다.
- `direct-weapon`과 `arc-weapon`의 발사점은 코드의 module world center와 다른 경우 별도 offset으로 기록하되, 기본값은 center로 둔다.

### 12.4 Handoff 검증

- 13단계가 적 asset을 만들 때 사용할 외곽선 두께와 배경 대비 샘플을 제공한다.
- 14단계가 직사·곡사 발사체와 효과를 모듈에 맞춰 제작할 수 있도록 무기 색상과 발사점 규칙을 제공한다.
- 16단계가 `Vehicle.render()`와 `CombatModule.render()`를 asset-backed draw로 바꿀 때 필요한 ID와 draw box를 제공한다.
- 17단계가 월드 모듈과 혼동되지 않는 UI icon을 선택할 수 있도록 icon 목록을 제공한다.

## 완료 조건

### asset

- [x] starter frame center, edge, corner의 조립 규칙이 정해져 있다.
- [x] Core, 빈 cell, blocked cell, direct weapon, arc weapon 기준 asset이 있다.
- [x] built-in module과 combat module의 UI icon 목록이 완성되어 있다.
- [x] 1x1, 2x1, 2x2 draw box와 pivot이 11단계 계약과 일치한다.
- [x] asset 안에 텍스트, 수치, UI가 없다.

### 시각

- [x] Core와 direct weapon이 asset preview에서 즉시 구분된다.
- [x] 2x1 module이 두 셀을 차지한다는 사실이 한 body로 읽힌다.
- [x] 선택·설치 가능·설치 불가는 sprite 변경 없이 outline, alpha, pattern overlay로 표현하는 규칙이 정해져 있다.
- [ ] damaged와 disabled가 active 상태와 구분된다.
- [x] frame과 shadow가 grid bounds와 충돌 반경을 암시적으로 변경하지 않도록 draw box 규칙을 고정했다.

### 회귀와 handoff

- [x] 기존 `Vehicle`의 위치 계산, `CombatGrid` 점유, module size를 수정하지 않았다.
- [x] 13, 14, 16, 17단계가 필요한 logical ID를 문서만 보고 확인할 수 있다.
- [x] asset을 제거한 상태에서도 기존 도형 fallback으로 게임 화면이 유지된다.
- [x] `git diff --check`가 통과한다.

## 검증 기록 템플릿

```text
Date:
Scope: 12 tank and module art
Reference contract: 11-art-direction-and-asset-contract.md
Module IDs checked:
World assets:
UI icon assets:
Draw box/pivot check: pass / fail
Transparency check: pass / fail
Visual distinction check: pass / fail
Fallback still playable: pass / fail
Next handoff: 13 / 14 / 16 / 17
Notes:
```

## 12단계 구현 기록

- [x] 12.1 data audit: `starter`, `coreCell`, `blockedCells`, `initialCombatModules`, module `id`·`kind`·`size` 기준을 현재 코드와 대조했다.
- [x] 12.2 imagegen: `tank.grid.core`, `tank.module.direct-weapon`, `tank.module.arc-weapon`을 생성하고 투명 bounds crop, padding, nearest-neighbor 정규화를 적용했다.
- [x] 12.2 deterministic raster: starter frame edge/corner, empty/blocked grid, built-in/combat UI icon 12종을 동일 palette의 투명 PNG로 제작했다.
- [x] 12.3 manifest: `src/data/assets.json`에 world asset 7종과 UI icon 12종의 logical ID, runtime path, draw box, pivot, layer, fallback을 등록했다.
- [x] 12.3 provenance: 생성 원본, 폐기된 direct weapon 시도, prompt set, 정규화 규칙, runtime 파일 목록을 `docs/art-asset-provenance.md`에 기록했다.
- [x] 12.4 draw box/pivot: 1x1은 44x44, 2x1은 88x44, UI icon은 20x20으로 확인했다. 2x2는 44px cell 두 축을 조합하는 규칙으로 유지한다.
- [x] 12.4 transparency: 신규 PNG의 투명 배경과 이미지 내부 텍스트·UI 부재를 확인했다.
- [x] 코드 회귀: `Vehicle`, `CombatGrid`, module size와 renderer 연결 코드는 수정하지 않았다. 실제 asset-backed draw는 16단계 handoff로 남겼다.
- [x] 검증: manifest JSON parse, asset path·pixel size 검사, `npx.cmd tsc --noEmit`, `npm.cmd run build`, `git diff --check`를 실행했다.
- [ ] 수동 브라우저 플레이: asset renderer 연결 전 단계이므로 16단계에서 fallback과 asset draw를 함께 확인한다.

### 검증 결과

```text
Date: 2026-09-05
Scope: 12 tank and module art
Reference contract: 11-art-direction-and-asset-contract.md
Module IDs checked: core, resource-generator, gatherer, recycler, arsenal, composer, rail, power-pack, caterpillar-track, armor-plate, direct-weapon, arc-weapon
World assets: starter frame edge/corner, empty grid, blocked grid, Core, direct weapon, arc weapon
UI icon assets: 12 built-in/combat icons at 20x20
Draw box/pivot check: pass, 19 manifest entries and runtime files validated
Transparency check: pass, transparent corners validated for all 19 new files
Visual distinction check: pass by exact-size visual inspection
Fallback still playable: pass by unchanged renderer/code path; browser click check deferred to 16
Next handoff: 13 / 14 / 16 / 17
Notes: No module placement, gameplay rule, or Canvas renderer code was changed in this stage.
```
