# Art asset provenance

이 문서는 11단계 기준 샘플의 생성 원본, 정규화 결과, prompt 방향을 기록한다. 게임 runtime은 normalized 파일만 사용한다.

## Generation setup

- Tool: built-in `image_gen`
- Output type: transparent PNG raster
- Shared style: top-down orthographic, hard pixel clusters, dark navy technical palette, single upper-left light direction, no text, no UI
- Normalization: transparent bounds crop, 8% transparent padding with 4px minimum, nearest-neighbor resize
- Runtime root: `public/assets/game/`
- Manifest: `src/data/assets.json`

## Reference samples

| Logical ID | Generated source | Runtime file | Logical draw box |
| --- | --- | --- | ---: |
| `tank.starter.frame.center` | `exec-6852c218-756b-4ad9-a9f4-5d918726007e.png` | `public/assets/game/tank/starter-frame-center.png` | 44x44 |
| `enemy.standard.idle` | `exec-9646a68b-803a-4f48-8909-cc9f58e864ed.png` | `public/assets/game/enemies/standard-idle.png` | 24x24 |
| `resource.resource.idle` | `exec-bebee6b5-0f11-4b2c-abd0-5c26b94bf4eb.png` | `public/assets/game/resources/resource-idle.png` | 20x20 |
| `ui.icon.resource` | `exec-e1d47ce1-8236-43b3-a8aa-f7f04e5362b7.png` | `public/assets/game/ui/icon-resource.png` | 20x20 |

Generated source directory:

```text
C:\Users\slaye\.codex\generated_images\01a06efb-5500-77b0-ac41-2c1e599d5304\
```

## Prompt set

모든 샘플은 아래 공통 prompt를 사용하고, `Subject`, `Color palette`, `Composition/framing`만 asset 목적에 맞게 바꿨다.

```text
Use case: stylized-concept
Asset type: reference raster sprite for a top-down 2D tank defense game
Scene/backdrop: transparent background
Style/medium: hard-edged pixel-art sprite, crisp pixel clusters, limited palette, no anti-aliasing
Lighting/mood: one restrained upper-left light, tactical industrial mood
Constraints: one object only, centered pivot, transparent background, no text, no logo, no UI
Avoid: side view, isometric view, perspective camera, characters, scenery, soft 3D render,
photorealism, glossy bevels, bloom, purple gradient, orange background, watermark
```

Asset-specific subject notes:

- `tank.starter.frame.center`: compact industrial orbital-drop tank, dark armored chassis, central Core hatch, restrained cyan technical accents.
- `enemy.standard.idle`: small fast hostile crawler drone, pointed front, two short side fins, dark shell with restrained crimson warning panels.
- `resource.resource.idle`: small faceted energy crystal or resource shard, diamond-like silhouette, dark navy core and warm yellow accent.
- `ui.icon.resource`: simplified diamond energy crystal symbol derived from the pickup, readable at 16x16 and 20x20.

## Review record

- All four generated images were visually inspected before normalization.
- Each output contained one centered subject with no visible text or UI.
- Normalized outputs were inspected at their exact logical dimensions.
- The generated samples are reference anchors, not the complete final art set.
- Follow-up variants must preserve the same view, light direction, outline weight, pixel scale, and palette intent.

## Change log

| Date | Change |
| --- | --- |
| 2026-09-05 | Created four 11-stage reference samples and normalized them into the workspace. |

## 12단계 assets

12단계는 11단계의 스타일과 asset contract를 유지하면서 탱크 조립과 모듈 식별에 필요한 최소 세트를 추가했다. 실제 Canvas renderer 연결은 16단계에서 수행한다.

### Image generation 결과

| Logical ID | Accepted generated source | Runtime file | Logical draw box |
| --- | --- | --- | ---: |
| `tank.grid.core` | `exec-b7be5370-61cd-4d6e-8e64-dd108fff440b.png` | `public/assets/game/tank/grid-core.png` | 44x44 |
| `tank.module.direct-weapon` | `exec-7c256317-f4c0-42fc-aa26-69509262baa6.png` | `public/assets/game/tank/module-direct-weapon.png` | 44x44 |
| `tank.module.arc-weapon` | `exec-63d188e5-f752-43f7-b420-b0cc1198f1bd.png` | `public/assets/game/tank/module-arc-weapon.png` | 88x44 |

첫 direct weapon 생성 결과 `exec-952f6e8a-fb0c-4cd5-9673-572a7de00d49.png`는 탱크 전체에 가까운 구성이어서 폐기했다. 최종 결과는 섀시가 없는 독립형 1x1 포탑으로 다시 생성했다.

공통 prompt set은 `stylized-concept`, top-down detached module, hard-edged pixel clusters, transparent background, no text/UI를 사용했고, Core는 cyan reactor, direct weapon은 detached gatling turret, arc weapon은 2-cell horizontal mortar를 주제로 분리했다.

### Deterministic raster 결과

다음 단순 기하 asset은 동일 palette와 정수 좌표 규칙을 유지하기 위해 `System.Drawing`으로 투명 PNG를 rasterize했다. 이미지 안에는 라벨이나 UI 텍스트를 넣지 않았다.

- Tank assembly: `starter-frame-edge.png`, `starter-frame-corner.png`
- Grid state: `grid-empty.png`, `grid-blocked.png`
- Built-in and combat icons: `icon-core.png`, `icon-resource-generator.png`, `icon-gatherer.png`, `icon-recycler.png`, `icon-arsenal.png`, `icon-composer.png`, `icon-rail.png`, `icon-power-pack.png`, `icon-caterpillar-track.png`, `icon-armor-plate.png`, `icon-direct-weapon.png`, `icon-arc-weapon.png`

모든 산출물은 `public/assets/game/` 아래에 저장하고, `src/data/assets.json`에 logical ID와 runtime path, draw box, pivot, layer, fallback을 등록했다. 1x1 asset은 44x44, 2x1 asset은 88x44, UI icon은 20x20으로 확인했다.

## 12단계 change log

| Date | Change |
| --- | --- |
| 2026-09-05 | Added Core, direct weapon, arc weapon imagegen samples and normalized runtime files. |
| 2026-09-05 | Added tank frame/grid geometry and the built-in/combat UI icon set. |

## 13단계 assets

13단계는 `standard`와 `tanker`를 실루엣, 크기, warning color로 구분하는 적 asset 세트다. `Enemy.radius`와 world position은 기존 코드 값을 유지하고, asset은 renderer가 읽을 visual state만 담당한다.

### Image generation 결과

| Logical ID | Accepted generated source | Runtime file | Logical draw box |
| --- | --- | --- | ---: |
| `enemy.standard.idle` | `exec-9646a68b-803a-4f48-8909-cc9f58e864ed.png` from 11단계 | `public/assets/game/enemies/standard-idle.png` | 24x24 |
| `enemy.tanker.idle` | `exec-7dff2b48-35de-424a-a4e2-9171c5c1196e.png` | `public/assets/game/enemies/tanker-idle.png` | 36x36 |

첫 탱커 시안 `exec-2ad0ed6a-971e-42ac-94be-0abd4cc46a19.png`는 적 크롤러보다 우주선에 가까워 폐기했다. 최종 시안은 차량·터렛·우주선 요소를 제거한 6족 장갑 크롤러로 다시 생성했다.

공통 prompt set은 `stylized-concept`, top-down hostile enemy sprite, hard-edged pixel clusters, transparent background, no text/UI를 사용했다. `standard`는 작고 날카로운 crimson crawler, `tanker`는 크고 무거운 burnt-orange armored crawler를 기준으로 삼았다.

### Deterministic state and support 결과

idle silhouette을 보존하기 위해 hit/dead는 같은 base PNG에서 정수 픽셀 변형으로 파생했다. hit는 밝기 상승, dead는 저명도와 부분 alpha 및 소형 파편 accent를 사용한다.

- State variants: `standard-hit.png`, `standard-dead.png`, `tanker-hit.png`, `tanker-dead.png`
- Ground shadows: `shadow-standard.png` 24x12, `shadow-tanker.png` 36x18
- Contact signal: `contact-signal.png` 48x48, broken danger-red ring and short impact marks

모든 적 body는 중심 pivot을 유지하고 draw box 안에서 radius 경계를 넘지 않도록 정규화했다. 체력 바, reward text, label은 이미지에 포함하지 않았으며, 실제 hit timer와 contact 상태 연결은 16단계에서 처리한다.

## 13단계 change log

| Date | Change |
| --- | --- |
| 2026-09-05 | Added and normalized the tanker idle sprite after rejecting a vehicle-like first variant. |
| 2026-09-05 | Added standard/tanker hit and dead variants, shadows, and contact signal assets. |
