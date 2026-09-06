# Art direction and asset contract

이 문서는 Platform Vehicle Defense의 월드와 UI raster asset을 위한 실행 기준이다. 11단계 이후의 모든 art 작업은 이 문서와 `src/data/assets.json`을 기준으로 한다.

## Design read

Reading this as: PC 브라우저용 2D 탑다운 차량 방어 게임, 전투 중 식별성이 우선인 기술적·산업적 픽셀 아트 언어, native Canvas와 데이터 기반 asset manifest를 사용하는 방향.

이 프로젝트는 랜딩 페이지가 아니므로 React, Tailwind, CTA, hero, marquee 규칙은 적용하지 않는다. 적용 대상은 시각 계층, 한 가지 테마, restrained motion, 실제 raster asset 우선, reduced motion, fallback이다.

## Visual dials

| Dial | Value | Applied meaning |
| --- | ---: | --- |
| `DESIGN_VARIANCE` | 6 | tank, enemy, region silhouette에 차이를 주되 grid와 collision 중심은 규칙적으로 유지한다. |
| `MOTION_INTENSITY` | 5 | 발사, 피격, 폭발, 수집 같은 상태 피드백만 움직인다. |
| `VISUAL_DENSITY` | 7 | 전투 viewport와 우측 HUD가 함께 읽히도록 명도, 크기, 선으로 계층을 만든다. |

## Theme and palette

전체 화면은 어두운 남색 전장과 기술 패널을 공유한다. 기본 상호작용 강조색은 cyan 하나이며, 다른 색은 실제 게임 의미가 있을 때만 사용한다.

| Token | Value | Meaning |
| --- | --- | --- |
| `surface.page` | `#121216` | HTML body 바탕 |
| `surface.field` | `#1a1a24` | Canvas 전장 바탕 |
| `surface.grid` | `#1d1d28` | grid 선과 낮은 대비 지형 |
| `surface.panel` | `rgba(16, 18, 30, 0.97)` | HUD 패널 |
| `accent.primary` | `#4deaea` | 선택, 설치 가능, 핵심 상호작용 |
| `state.success` | `#00e676` | 생존, 성공, 완료 |
| `state.resource` | `#ffd54f` | 자원과 수집 피드백 |
| `state.danger` | `#ff1744` | 피해, 위험, game over |
| `enemy.standard` | `#b71c1c` | 빠른 일반 적 |
| `enemy.tanker` | `#e65100` | 느린 고체력 적 |
| `weapon.direct` | `#00e5ff` | 직사 무기 |
| `weapon.arc` | `#ab47bc` | 곡사 무기 |
| `text.primary` | `#d0d8e0` | 주요 텍스트 |
| `text.secondary` | `#899bb1` | 보조 텍스트 |

`#000000` 배경과 pure white의 큰 면적 사용은 피한다. 큰 bloom, 무작위 purple gradient, 배경 전체의 danger red는 사용하지 않는다.

## Coordinate and geometry contract

- 논리 Canvas는 `1280x720`이다.
- HUD panel 폭은 `HUDManager.PANEL_WIDTH = 340`이다.
- 전투 viewport는 Canvas 오른쪽 340px을 제외한다.
- 차량 grid 한 칸은 `44x44` 논리 크기다.
- Core Engine의 world position은 차량 중심이며, grid 좌표나 설치 모듈을 소유하지 않는다.
- 1x1 module은 `44x44`, 2x1 module은 `88x44`, 2x2 module은 `88x88` draw box를 사용한다.
- standard enemy는 `24x24` draw box와 `radius = 12`, tanker는 `36x36` draw box와 `radius = 18`을 기준으로 한다.
- resource pickup은 `20x20` draw box를 사용한다.
- UI small icon은 `16x16` 또는 `20x20` logical draw box를 사용한다.
- sprite의 transparent padding은 draw box 안에만 두며, padding이 collision center를 바꾸지 않는다.
- Canvas는 nearest-neighbor를 사용하고 `imageSmoothingEnabled = false`를 기본으로 한다. 실제 적용은 16단계 renderer가 담당한다.

## View and shape rules

- 모든 월드 asset은 2D top-down orthographic 시점이다.
- 탱크는 frame과 module footprint가 먼저 읽히고, Core 상태는 HUD에서 읽힌다.
- standard enemy는 작고 날카로운 실루엣, tanker는 크고 무거운 실루엣으로 구분한다.
- resource는 형태와 semantic color를 함께 사용한다.
- UI icon은 월드 sprite의 축소 복사본이 아니라 16~20px에서 읽히는 단순 문양이다.
- 그림자는 actor 아래쪽에 얇게 두고 hitbox, 선택, 사거리 판정에 영향을 주지 않는다.
- 사진 질감, 부드러운 3D bevel, 등각 투영, 강한 bloom, 텍스트가 포함된 결과는 채택하지 않는다.

## State contract

| State | Visual treatment |
| --- | --- |
| `idle` | 기본 frame |
| `active` | 작은 내부 표시 또는 짧은 강조 |
| `hit` | 짧은 밝기 상승 또는 semantic outline |
| `damaged` | 균열, 연기, 낮은 명도 overlay |
| `disabled` | 낮은 명도, pattern, 입력 불가 표시 |
| `selected` | `accent.primary` outline과 별도 상태 표시 |
| `preview-valid` | 낮은 alpha와 허용 outline |
| `preview-invalid` | 금지 pattern과 danger outline |
| `dead` | 사망 frame 또는 짧은 파편 후 제거 |

색상만으로 상태를 전달하지 않는다. reduced-motion 환경에서는 반복 frame, pulse, shake, 큰 scale 변화를 정적 표시로 낮춘다.

## Logical ID and file rules

코드는 파일명을 직접 조합하지 않고 manifest의 logical ID를 사용한다.

```text
tank.starter.frame.center
enemy.standard.idle
resource.resource.idle
ui.icon.resource
```

파일은 `public/assets/game/` 아래에 소문자 kebab-case로 둔다. 한 PNG에 서로 다른 logical asset을 섞지 않는다. 이미지 안에는 text, number, label, logo, UI button을 넣지 않는다.

## Manifest contract

실제 runtime asset 목록은 `src/data/assets.json`에서 관리한다.

```json
{
  "version": 1,
  "sprites": {
    "enemy.standard.idle": {
      "src": "/assets/game/enemies/standard-idle.png",
      "draw": { "width": 24, "height": 24 },
      "pivot": { "x": 0.5, "y": 0.5 },
      "frames": { "columns": 1, "rows": 1, "duration": 0 },
      "layer": "actors",
      "fallback": "shape.enemy.standard"
    }
  }
}
```

각 sprite 항목은 `src`, logical draw size, normalized pivot, frame metadata, render layer, fallback key를 모두 가진다. 첫 manifest는 실제 생성된 기준 샘플만 등록하며, 12~17단계에서 새 asset을 만들 때 항목을 추가한다.

## Generation protocol

기준 샘플과 후속 raster asset은 built-in `imagegen`으로 생성하고, 생성 후 transparent background, 단일 대상, 시점, 광원, 외곽선, 색온도, no text/no UI를 확인한다.

공통 prompt:

```text
2D top-down pixel art game sprite of [SUBJECT],
industrial orbital-drop tank defense, orthographic view,
hard pixel clusters, limited dark navy and cyan technical palette,
strong readable silhouette, centered composition,
transparent background, consistent single light direction,
no text, no labels, no logo, no UI, no perspective, no isometric view,
no photorealism, no 3D render, no soft bloom, no decorative background.
```

생성 결과는 먼저 원본을 확인하고, transparent bounds를 crop한 뒤 nearest-neighbor로 logical draw box에 맞춘다. 원본과 normalized 파일을 provenance 기록에서 연결한다.

## Current implementation boundary

11단계는 이 contract, manifest skeleton, 기준 샘플과 provenance만 만든다. `AssetManager`, sprite renderer, entity render 교체, map loader, HUD icon 연결은 16~17단계의 책임이다.

이미지가 없거나 로딩에 실패하면 기존 Canvas 도형 fallback으로 동작해야 한다. art asset은 게임 규칙, collision radius, module size, reward, pause semantics를 소유하지 않는다.

## References

- 상세 작업 계획: `plans/implementation/11-art-direction-and-asset-contract.md`
- runtime manifest: `src/data/assets.json`
- asset provenance: `docs/art-asset-provenance.md`
- generated raster assets: `public/assets/game/`
