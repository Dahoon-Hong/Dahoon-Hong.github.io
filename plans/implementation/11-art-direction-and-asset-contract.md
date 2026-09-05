# 11. 아트 디렉션과 공통 asset 규격 상세 계획

## 현재 적용 계획

이 단계는 10단계 로드맵의 첫 실행 단계다. 와이어프레임 도형을 최종 픽셀 아트로 교체하기 전에, 모든 asset이 따라야 할 시점·팔레트·크기·pivot·명명·상태·폴백 규칙을 고정한다.

이 단계의 결과물은 12~19에서 반복해서 참조하는 아트 계약이다. 따라서 11단계가 끝나기 전에는 대량의 탱크·적·맵 asset을 만들거나 renderer 코드를 연결하지 않는다.

상위 계획: [10-design-art-roadmap.md](10-design-art-roadmap.md)

후속 계획:

- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [13-enemy-art.md](13-enemy-art.md)
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md)
- [15-map-art.md](15-map-art.md)
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md)

선행 기준:

- 모듈과 전투 그리드: [06.5-mid-term-review.md](06.5-mid-term-review.md)
- 적·행성·지역 콘텐츠: [07-progression-content.md](07-progression-content.md)
- 시스템 규칙: [../system.md](../system.md)
- 현재 사용자 조작: [../user_guide.md](../user_guide.md)
- 저장소 작업 규칙: [../../agents.md](../../agents.md)

## 목표

다음 단계의 구현자가 아래 질문에 추측 없이 답할 수 있는 상태를 만든다.

1. 어떤 시점과 픽셀 스타일로 그리는가
2. 어떤 색이 플레이어·적·자원·피해·선택 상태를 의미하는가
3. asset을 어느 논리 크기와 중심점으로 그리는가
4. 파일명과 logical ID를 어떻게 연결하는가
5. 정적·피격·파괴·선택 상태를 어떻게 표현하는가
6. 이미지 로딩에 실패하면 어떤 도형 fallback을 사용하는가
7. 생성 이미지가 같은 스타일인지 어떻게 검수하는가

## 범위

### 포함

- 현재 Canvas 렌더링 감사
- 2D 탑다운 픽셀 아트 방향 결정
- 공통 색상·형태·선·명도 규칙 결정
- 논리 좌표, draw box, pivot, 투명 여백 규칙 결정
- asset logical ID와 파일명 규칙 결정
- `assets.json` manifest 계약 결정
- 기준 샘플 4종의 생성·검수 계획
- asset 출처·prompt·변형 기록 규칙
- 12~19 단계로 넘길 handoff 체크리스트

### 제외

- 최종 탱크·적·맵·UI asset 전체 제작
- `AssetManager`와 sprite renderer 구현
- 게임 규칙, 충돌 반경, 사거리, 모듈 수치 변경
- 새 전투 모듈·적 종류·행성·지역 추가
- React, Tailwind, 별도 UI 프레임워크 도입
- 3D, WebGL, skeletal animation, 물리 기반 렌더링 도입
- 일시정지 중 자동 생산·수집·변환을 재개하는 변경

## 디자인 리드

`design-taste-frontend`의 브리프 추론과 pre-flight 원칙을 이 Canvas 게임에 맞게 적용한다.

> Reading this as: PC 브라우저용 2D 탑다운 차량 방어 게임, 전투 중 식별성이 우선인 기술적·산업적 픽셀 아트 언어, native Canvas와 데이터 기반 asset manifest를 사용하는 방향.

이 프로젝트는 랜딩 페이지가 아니므로 React 컴포넌트, Tailwind 레이아웃, CTA, hero, marquee, SEO 규칙은 적용하지 않는다. 적용하는 원칙은 다음과 같다.

- 한 프로젝트 안에서 하나의 어두운 전장 테마를 유지한다.
- 기본 강조색은 청록 하나로 고정한다. 초록·노랑·빨강·주황·보라 계열은 성공, 자원, 피해, 적 종류, 곡사 무기처럼 실제 의미가 있는 경우에만 semantic color로 사용한다.
- 색상만으로 상태를 표현하지 않는다. 외곽선, 명도, 패턴, 아이콘, 짧은 문구를 함께 사용한다.
- 모션은 발사, 피격, 폭발, 수집처럼 상태를 전달할 때만 사용한다. 장식성 무한 루프와 강한 화면 흔들림은 기본값으로 만들지 않는다.
- 이미지 안에 텍스트, 수치, 번역 대상 라벨을 굽지 않는다. 텍스트는 Canvas UI가 데이터와 함께 그린다.
- asset의 그림자와 장식은 hitbox를 변경하지 않는다.
- 생성 이미지가 기준을 벗어나면 코드를 맞추지 말고 asset을 다시 생성하거나 정리한다.

## 시각 다이얼

| 다이얼 | 결정값 | 이유 |
|---|---:|---|
| `DESIGN_VARIANCE` | 6 | 탱크·적·지역에 실루엣 차이를 주되, 격자와 충돌 경계는 규칙적으로 유지한다. |
| `MOTION_INTENSITY` | 5 | 전투 피드백은 즉시 전달하되, 화면 정보가 많은 상태에서 장식 모션이 판독을 방해하지 않게 한다. |
| `VISUAL_DENSITY` | 7 | 상단 상태 표시와 우측 업그레이드 웹이 동시에 존재하므로 명도·크기·선으로 정보 계층을 만든다. |

## 현재 코드 감사

11단계 구현 시작 시 아래 기준을 실제 코드에서 다시 확인하고, 변경점이 있으면 이 문서의 기준표를 먼저 갱신한다.

| 표면 | 현재 기준 | 11단계에서 지킬 계약 |
|---|---|---|
| 논리 Canvas | `1280x720` | asset draw 좌표와 게임 좌표를 분리하지 않고 논리 좌표를 그대로 사용한다. |
| 게임 영역 | 전체 폭에서 `HUDManager.PANEL_WIDTH`인 `340px`를 제외 | 오른쪽 패널 영역에 전장 asset을 그리지 않는다. |
| 차량 격자 | `Vehicle.tileSize = 44`, 기본 `3x3`, 코어 중심 | 1칸 asset은 `44x44` 논리 draw box를 기준으로 한다. |
| 코어 | `CombatGrid`의 `coreCell`이 원점 | 코어 sprite와 grid 원점의 pivot을 중앙으로 고정한다. |
| 다중 모듈 | `1x1`, `2x1`, `2x2` footprint | footprint 전체를 하나의 모듈 인스턴스로 보이게 하고 anchor를 좌상단으로 유지한다. |
| 표준 적 | `radius = 12` | 중심 pivot과 충돌 반경을 일치시키고, sprite 투명 여백이 반경을 속이지 않게 한다. |
| 탱커 적 | `radius = 18` | 표준 적과 다른 실루엣과 크기로 표현하되 데이터의 반경을 변경하지 않는다. |
| 자원 픽업 | 현재는 노란 마름모와 수량 텍스트 | 그림과 수량을 분리한다. 픽업 asset에는 텍스트를 넣지 않는다. |
| 직사 발사체 | 청록 원형 projectile, 적중 시 파란 효과 | 탄환의 진행 방향과 피격 위치는 현재 물리 계산을 따르고 asset은 모양만 담당한다. |
| 곡사 발사체 | 보라색 포탄, 지면 그림자, 착탄 AOE 표시 | 공중 sprite와 지면 표시를 분리하고, AOE 반경은 게임 데이터에서 계속 읽는다. |
| HUD | Canvas에서 상단 바와 오른쪽 패널을 렌더링 | 17단계 전까지 Canvas 좌표와 click hitbox 계약을 유지한다. |

### 현재 색상 감사

현재 코드에 흩어진 값을 아래 semantic token으로 정리한다. 11단계에서는 시각 계약을 문서화하고, 실제 코드의 상수 통합은 renderer 연결 단계에서 수행한다.

| Semantic token | 현재 사용 예 | 역할 |
|---|---|---|
| `surface.page` | `#121216` | HTML body 바탕 |
| `surface.field` | `#1a1a24` | Canvas 전장 바탕 |
| `surface.grid` | `#1d1d28` | 현재 전역 grid 선 |
| `surface.panel` | `rgba(16, 18, 30, 0.97)` | 우측 HUD 패널 |
| `accent.primary` | `#4deaea` | 선택, 업그레이드 가능, 핵심 상호작용 |
| `state.success` | `#00e676`, `#81c784` | 생존, 성공, 선택 완료 |
| `state.resource` | `#ffd54f`, `#ff8f00` | 원자원과 수집 피드백 |
| `state.danger` | `#ff1744`, `#ff5252` | 피해, 게임 오버, 적 경고 |
| `enemy.standard` | `#b71c1c`, `#ff5252` | 빠른 일반 적 |
| `enemy.tanker` | `#e65100`, `#ff9800` | 느린 고체력 적 |
| `weapon.direct` | `#00e5ff`, `#29b6f6` | 직사 무기와 적중 효과 |
| `weapon.arc` | `#ea80fc`, `#ab47bc` | 곡사 무기와 폭발 효과 |
| `text.primary` | 기존 흰색 계열 | 주요 텍스트 |
| `text.secondary` | `#899bb1`, `#8295aa` | 설명과 보조 정보 |

`#000000`은 현재 일부 글자와 결과 버튼에 사용되는 legacy 값이다. 최종 시각 구현에서는 배경과 충돌하지 않는 어두운 잉크 token으로 교체할 수 있으나, 11단계에서 임의의 새 색을 추가하지 않는다.

## 결정할 공통 계약

### 1. 시점과 실루엣

- 모든 월드 asset은 2D top-down orthographic 시점으로 만든다.
- 탱크는 중앙 축, 모듈 footprint, 외곽 frame이 먼저 보이고 세부 장식은 그 다음에 보이게 한다.
- 표준 적은 작고 날카로운 외곽 실루엣, 탱커는 크고 무거운 외곽 실루엣을 사용한다.
- 맵은 낮은 대비의 반복 지형을 사용해 actor와 projectile이 우선 보이게 한다.
- UI 아이콘은 월드 asset의 축소판을 그대로 쓰지 않고 16~24px에서도 인식되는 단순한 문양으로 별도 설계한다.
- 그림자 방향과 광원 방향을 모든 카테고리에서 공유한다. 그림자는 actor의 아래쪽에 얇게 두며, 충돌 영역으로 취급하지 않는다.

### 2. 형태와 선

- 픽셀 클러스터가 먼저 보이는 하드 엣지 스타일을 사용한다.
- 외곽선은 배경보다 충분히 어둡고, 선택·피해 상태의 외곽선은 semantic token을 사용한다.
- 1칸 모듈의 내부 형태를 과도하게 복잡하게 만들지 않는다. 44px 논리 draw box에서 핵심 실루엣이 먼저 읽혀야 한다.
- 둥근 모서리와 glass 효과는 기본값으로 사용하지 않는다. HUD 패널과 월드 격자는 직각 기반으로 통일한다.
- 생성 이미지에 사진 질감, 부드러운 3D bevel, 등각 투영, 과도한 bloom이 섞이면 기준 asset으로 채택하지 않는다.

### 3. 논리 크기와 pixel scale

- 게임의 논리 좌표는 현재 `1280x720`을 유지한다.
- 차량 grid 1칸의 논리 크기는 `44x44`다.
- 다중 셀의 논리 draw box는 다음과 같이 계산한다.

| 대상 | 논리 draw box | pivot 기준 |
|---|---:|---|
| 1칸 모듈 | `44x44` | 셀 중앙 `(0.5, 0.5)` |
| 2x1 모듈 | `88x44` | footprint 중앙 |
| 2x2 모듈 | `88x88` | footprint 중앙 |
| 표준 적 body | `24x24` 기준 | world position 중앙 |
| 탱커 적 body | `36x36` 기준 | world position 중앙 |
| 픽업 icon | `20x20` 기준 | world position 중앙 |
| UI small icon | `16x16` 또는 `20x20` | Canvas UI slot 중앙 |

- source PNG가 더 큰 경우에도 최종 asset은 위 논리 box에 맞춰 nearest-neighbor로 정규화한다.
- 비정수 배율로 sprite를 확대하지 않는다. 브라우저 표시 크기와 논리 Canvas 크기의 비율이 바뀌어도 내부 draw box는 유지한다.
- 투명 여백은 draw box 밖으로 넘기지 않는다. 여백이 필요한 경우 manifest의 pivot과 함께 명시한다.
- `imageSmoothingEnabled = false`는 16단계 renderer 연결 때 적용한다. 11단계에서는 모든 샘플을 이 규칙으로 검수한다.

### 4. 조립 가능한 탱크 구조

3x3와 향후 5x5를 하나의 큰 배경 PNG로 굽지 않는다. 다음 조각을 조합할 수 있도록 계약한다.

- `tank.frame.center`
- `tank.frame.edge.horizontal`
- `tank.frame.edge.vertical`
- `tank.frame.corner`
- `tank.grid.empty`
- `tank.grid.blocked`
- `tank.grid.core`
- 모듈별 1칸·다중 칸 body
- 선택·설치 미리보기용 overlay

이렇게 하면 코어 업그레이드로 grid가 확장되어도 3x3, 5x5를 별도 대형 이미지로 다시 제작하지 않아도 된다. 조립 규칙은 12단계에서 탱크 asset을 제작할 때 사용하고, 실제 조합 renderer는 16단계에서 구현한다.

### 5. 상태 모델

asset은 게임 로직의 상태를 대신 저장하지 않는다. renderer가 게임 상태를 읽어 아래 visual state를 선택한다.

| 상태 | 적용 대상 | 기본 표현 |
|---|---|---|
| `idle` | 탱크, 적, 픽업, 모듈 | 기본 frame |
| `active` | 코어, 전투 모듈, 내장 시스템 icon | 기능 중임을 알리는 작은 내부 표시 |
| `hit` | 적, 모듈, 코어 | 짧은 밝기 반전 또는 명도 상승 |
| `damaged` | 코어, 전투 모듈, 탱크 frame | 균열·연기·어두운 overlay. hitbox는 변경하지 않음 |
| `disabled` | 모듈, UI node | 낮은 명도, 비활성 pattern, 입력 불가 표시 |
| `selected` | grid cell, module, upgrade node | `accent.primary` outline과 별도 상태 표시 |
| `preview-valid` | 설치 대상 footprint | 낮은 불투명도의 asset과 허용 outline |
| `preview-invalid` | 설치 대상 footprint | 금지 pattern과 danger outline |
| `dead` | 적, projectile effect | 사망 frame 또는 짧은 파편 후 제거 |

`prefers-reduced-motion`이 켜지면 `hit`, `active`, `dead`의 반복 프레임을 정적 frame으로 낮추고, flash·shake·큰 scale 변화는 생략한다.

## asset logical ID와 파일명 계약

### ID 규칙

logical ID는 월드 타입, 대상 ID, 상태를 점으로 연결한다.

```text
tank.starter.frame.center
tank.starter.grid.core
tank.module.direct-weapon.active
tank.module.arc-weapon.active
enemy.standard.idle
enemy.tanker.hit
resource.resource.idle
effect.projectile.direct
effect.explosion.arc
ui.icon.resource
map.aurelia.landing-zone.background
```

- 게임 데이터에 존재하는 `starter`, `standard`, `tanker`, `aurelia`, `landing-zone` 같은 ID는 그대로 사용한다.
- 모듈 JSON의 `moduleId`와 asset ID를 임의로 번역하거나 표시명으로 바꾸지 않는다.
- 상태가 필요 없는 정적 asset은 상태 suffix를 생략할 수 있으나, 동일 카테고리 안에서 한 가지 규칙만 사용한다.
- logical ID는 코드에서 안정적으로 참조할 값이고, 파일명 변경은 manifest 내부에서만 처리한다.

### 파일명과 폴더

```text
public/assets/game/
  tank/
    starter-frame-center.png
    starter-grid-core.png
    module-direct-weapon-active.png
    module-arc-weapon-active.png
  enemies/
    standard-idle.png
    standard-hit.png
    tanker-idle.png
    tanker-hit.png
  resources/
    resource-idle.png
  effects/
    projectile-direct.png
    explosion-arc.png
  maps/
    aurelia-landing-zone-background.png
  ui/
    icon-resource.png
```

- 파일명은 소문자 kebab-case로 한다.
- 하나의 PNG에 서로 다른 logical asset을 섞지 않는다. sprite sheet가 필요한 경우에만 manifest가 frame 영역을 소유한다.
- 생성 원본과 정규화 결과를 분리한다. 원본은 별도 작업 공간이나 prompt 기록에 보관하고, 게임이 읽는 파일은 `public/assets/game/`에 둔다.
- 이미지 파일 안에는 텍스트·수치·브랜드 로고·UI button을 포함하지 않는다.

## manifest 계약

11단계에서 전체 파일을 구현할 필요는 없지만, 12단계의 첫 asset부터 아래 형식을 따른다. 실제 loader 타입은 16단계에서 추가한다.

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

필드 계약:

| 필드 | 필수 | 규칙 |
|---|---|---|
| `version` | 예 | manifest 구조 변경 시 올린다. 첫 버전은 `1`이다. |
| `sprites.<logicalId>` | 예 | logical ID와 실제 asset 정보를 한 곳에서 관리한다. |
| `src` | 예 | `/assets/game/`부터 시작하는 정적 URL이다. |
| `draw.width`, `draw.height` | 예 | 논리 Canvas에서 그릴 크기다. |
| `pivot` | 예 | 0~1 정규화 좌표다. actor 중앙은 `{x: 0.5, y: 0.5}`다. |
| `frames` | 예 | 단일 frame도 `columns: 1`, `rows: 1`, `duration: 0`으로 명시한다. |
| `layer` | 예 | `background`, `ground`, `actors`, `projectiles`, `effects`, `hud` 중 하나다. |
| `fallback` | 예 | 이미지가 없어도 사용할 도형 renderer의 stable key다. |

추가 필드가 필요하면 11단계 art bible과 manifest 예제를 먼저 갱신한다. renderer가 파일명 규칙이나 이미지 원본 크기를 추측하지 않게 한다.

## 기준 팔레트와 검수 규칙

### 팔레트 사용 규칙

1. 배경과 패널은 같은 남색 계열 안에서 계층을 만든다.
2. `accent.primary`는 선택, 설치 가능, 업그레이드 가능 상태에만 사용한다.
3. `state.resource`는 원자원과 자원 획득 피드백에 사용한다. 나중에 matter·ammo·nano 변형을 만들 때는 모양 차이를 우선하고 새 색은 최소화한다.
4. `state.danger`는 피해·위험·게임 오버에 사용한다. 일반 적 body 전체를 danger 색으로 채워 경고 UI와 섞지 않는다.
5. `weapon.arc`의 보라 계열은 곡사 무기 의미에 한정한다. 전역 강조색으로 재사용하지 않는다.
6. 배경과 actor 사이에는 작은 화면에서도 외곽선이 남을 만큼 명도 차이가 있어야 한다.
7. 빛나는 효과는 외곽선과 짧은 alpha 변화로 제한한다. 넓은 bloom이나 화면 전체의 색 번짐은 사용하지 않는다.

### 형태 검수

- 100% draw size와 실제 게임 화면 크기에서 핵심 실루엣이 읽힌다.
- 표준 적과 탱커 적은 색을 끄고 봐도 크기·실루엣·내부 구조로 구분된다.
- Core, direct weapon, arc weapon, armor plate가 서로 다른 기능을 암시한다.
- asset 경계가 logical draw box 밖으로 튀어나오지 않는다.
- alpha 가장자리에 밝은 배경색이나 검은 matte가 남지 않는다.
- 픽셀 크기가 asset 내부에서 일관되고, 부드러운 사진·3D 렌더 질감이 섞이지 않는다.
- 그림자는 시각적 깊이만 만들고 충돌·선택·사거리 판정에 영향을 주지 않는다.

## 이미지 생성 프로토콜

### 생성 도구와 적용 원칙

실제 이미지가 필요한 12~15단계에서는 `imagegen`을 사용해 기준 asset부터 만든다. 한 번에 모든 변형을 만들지 않고, 기준 샘플의 구도·팔레트·광원·투명 여백을 확인한 뒤 파생 asset을 만든다.

11단계에서 생성할 기준 샘플은 다음 4종이다.

1. `tank.starter.frame.center` 또는 starter 탱크의 대표 body
2. `enemy.standard.idle`
3. `resource.resource.idle`
4. `ui.icon.resource`

이 샘플은 최종 콘텐츠 전량이 아니다. 12~17에서 같은 스타일을 유지하기 위한 visual anchor다.

### 기본 prompt 템플릿

```text
2D top-down pixel art game sprite of [SUBJECT],
industrial orbital-drop tank defense, orthographic view,
hard pixel clusters, limited dark navy and cyan technical palette,
strong readable silhouette, centered composition,
transparent background, consistent single light direction,
no text, no labels, no logo, no UI, no perspective, no isometric view,
no photorealism, no 3D render, no soft bloom, no decorative background.
```

`[SUBJECT]`만 바꾸고 나머지 스타일 문장은 기준 샘플 사이에서 유지한다. 탱크·적·자원은 각자의 silhouette 설명만 추가한다.

### 생성 후 처리

1. 생성 결과를 `view_image`로 원본 크기와 투명 배경을 확인한다.
2. 기준 시점, 광원, 픽셀 클러스터, 외곽선, 색상 수를 검토한다.
3. 불필요한 배경·텍스트·로고·여분 오브젝트를 제거하거나 재생성한다.
4. manifest의 논리 draw box에 맞춰 정규화하고, nearest-neighbor 기준으로 저장한다.
5. 파일명과 logical ID를 기록한다.
6. prompt, 생성일, 기준 샘플, 수정 내역을 asset provenance 기록에 남긴다.
7. 게임 화면에 넣기 전 투명 배경 checker와 어두운 전장 배경에서 각각 확인한다.

### 채택하지 않는 결과

- 측면 시점, 등각 시점, 원근이 강한 결과
- 하나의 이미지에 여러 유닛이 섞인 결과
- 이미지 안에 글자·수치·UI가 들어간 결과
- 투명 배경 가장자리에 흰색 또는 검은색 matte가 남은 결과
- 원본마다 다른 광원·외곽선·색온도를 사용하는 결과
- 발광 때문에 actor와 배경의 경계가 사라지는 결과

## 구현 작업 순서

### 1. 기준선 기록

1. `npx.cmd tsc --noEmit`로 현재 TypeScript 기준선을 확인한다.
2. `npm.cmd run build`로 현재 빌드 기준선을 확인한다. 기존처럼 `dist` 권한 문제가 발생하면 100단계의 대체 Vite 출력 경로를 사용하고 이유를 기록한다.
3. 1280x720에서 시작, 이동, 일시정지, 전투, 업그레이드, 결과 화면을 한 번씩 확인한다.
4. 현재 색상·draw 순서·hitbox 위치를 표에 기록한다.

### 2. 아트 방향 문서 확정

1. 기술적·산업적 top-down pixel art 방향을 art bible에 기록한다.
2. `DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY` 값을 기록한다.
3. palette token, 선 두께, 픽셀 scale, 그림자 방향을 기록한다.
4. 탱크·적·자원·맵·UI에 공통으로 적용되는 금지 사례를 기록한다.
5. 이 문서와 실제 art bible 사이에 다른 값이 없도록 비교한다.

### 3. Geometry와 상태 계약 확정

1. `44x44` grid cell과 `1x1`, `2x1`, `2x2` draw box를 확정한다.
2. 적 `radius`와 sprite pivot을 비교하고, 투명 여백의 최대 범위를 정한다.
3. 코어·frame·grid가 조립 가능하도록 조각 단위를 확정한다.
4. `idle`, `active`, `hit`, `damaged`, `disabled`, `selected`, `preview-valid`, `preview-invalid`, `dead` 상태를 asset 또는 renderer 처리 중 어디에서 표현할지 기록한다.
5. 상태별로 이미지 frame이 필요한지, 단순 tint·outline·alpha로 충분한지 결정한다.

### 4. Manifest skeleton 작성

1. `src/data/assets.json`의 첫 schema를 만든다.
2. 기준 샘플 4종을 logical ID와 fallback key로 등록한다.
3. `src/data/assets.json`에는 존재하지 않는 파일을 대량으로 미리 등록하지 않는다. 실제 asset과 함께 항목을 추가한다.
4. manifest의 `draw`, `pivot`, `frames`, `layer`, `fallback` 필드를 모두 채운다.
5. manifest에 없는 파일명을 코드에서 직접 사용하지 않는다는 규칙을 기록한다.

### 5. 기준 샘플 생성

1. 기본 prompt 템플릿을 기준으로 starter 탱크, standard 적, resource 픽업, resource UI icon을 순서대로 생성한다.
2. 각 샘플은 같은 화면에 나란히 놓아 시점·광원·색온도를 비교한다.
3. 생성 결과와 정규화 결과를 구분해 보관하고, 게임용 파일만 `public/assets/game/`에 둔다.
4. 샘플을 100% 크기와 50% 축소 크기에서 확인한다.
5. 한 샘플이라도 계약을 만족하지 못하면 다음 asset 제작으로 넘어가지 않는다.

### 6. Handoff 검증

1. `12`단계가 필요한 탱크·모듈 logical ID를 추가 추측 없이 사용할 수 있는지 확인한다.
2. `13`단계가 `standard`, `tanker`의 body·hit·death 상태를 같은 규칙으로 확장할 수 있는지 확인한다.
3. `14`단계가 자원과 효과를 기존 수명·위치·물리 계산에 맞춰 추가할 수 있는지 확인한다.
4. `15`단계가 planet/region ID를 기반으로 맵 asset을 확장할 수 있는지 확인한다.
5. `16`단계가 loader와 fallback renderer를 이 계약만 보고 구현할 수 있는지 확인한다.
6. `17`단계가 같은 palette와 icon 규칙으로 HUD를 설계할 수 있는지 확인한다.

## 예상 산출물

11단계 구현이 끝났을 때 다음 항목이 존재해야 한다.

- `docs/art-direction.md` 또는 동등한 art bible
- `src/data/assets.json`의 첫 manifest schema와 기준 샘플 항목
- `public/assets/game/`의 기준 샘플 4종
- asset provenance와 재생성에 필요한 prompt 기록
- 현재 색상·레이어·좌표계 감사 기록
- 12~19 handoff 체크리스트

`AssetManager`, 전체 sprite renderer, 최종 탱크·적·맵·HUD asset은 이 단계의 산출물로 간주하지 않는다.

## 완료 조건

### 문서

- [ ] 디자인 리드와 세 가지 시각 다이얼이 문서에 명시되어 있다.
- [ ] 현재 Canvas 크기, HUD panel 폭, grid tile 크기, 적 radius가 기록되어 있다.
- [ ] palette token과 semantic color 사용 범위가 정의되어 있다.
- [ ] pivot, draw box, 투명 여백, z-order, 상태 규칙이 정의되어 있다.
- [ ] logical ID와 파일명 규칙에 모호한 예외가 없다.
- [ ] manifest 필드와 fallback 계약이 예시와 함께 정의되어 있다.
- [ ] 이미지 생성 prompt와 채택하지 않는 결과 기준이 기록되어 있다.

### 샘플 asset

- [ ] starter 탱크 대표 샘플이 top-down 시점과 중앙 pivot을 만족한다.
- [ ] `standard` 적 샘플이 `radius = 12` 기준 draw box에 맞는다.
- [ ] resource 픽업 샘플에 텍스트가 포함되지 않는다.
- [ ] UI resource icon이 16~20px에서 식별된다.
- [ ] 네 샘플이 같은 광원·시점·외곽선·색온도를 공유한다.
- [ ] 네 샘플 모두 투명 배경과 어두운 전장 배경에서 경계가 깨끗하다.
- [ ] 각 샘플에 logical ID, path, draw size, pivot, fallback이 연결되어 있다.

### 회귀와 명령

- [ ] 이미지 생성과 문서 작업 후 `npx.cmd tsc --noEmit`가 통과한다.
- [ ] 이미지 파일과 manifest 추가 후 `npm.cmd run build` 또는 대체 Vite 출력 빌드가 통과한다.
- [ ] `git diff --check`가 통과한다.
- [ ] 기존 01~07 기능과 99~100 선행 조건을 변경하지 않았다.
- [ ] 일시정지 중 모듈 설치·업그레이드만 가능하고 자동 생산·수집·변환은 계속 멈춘다.

## 다음 단계로 넘길 결정

11단계가 완료되면 아래 결정은 다시 논의하지 않고 12~19에서 사용한다.

- 월드 asset은 top-down orthographic pixel art다.
- 기본 테마는 어두운 남색 전장이고, 기본 상호작용 강조색은 청록이다.
- 월드 1칸은 44px 논리 draw box다.
- 다중 셀 모듈은 anchor와 footprint 중앙을 함께 사용한다.
- actor의 pivot과 collision center는 일치한다.
- 모든 생성 asset은 transparent background, no text, no UI 조건을 만족한다.
- 모든 asset은 manifest를 통해 접근하고, 누락 시 도형 fallback으로 내려간다.
- 이미지와 시각 효과는 게임 규칙과 hitbox를 소유하지 않는다.
- 모션은 gameplay state를 전달할 때만 사용하고 reduced-motion에서는 정적 표현으로 낮춘다.

## 검증 기록 템플릿

후속 구현자가 결과를 남길 때 아래 형식을 사용한다.

```text
Date:
Scope: 11 art direction and asset contract
Baseline build: pass / fail
Baseline manual play: pass / fail
Art bible: <path>
Manifest: <path>
Reference assets:
- <logical id> -> <path>
- <logical id> -> <path>
- <logical id> -> <path>
- <logical id> -> <path>
Prompt/provenance record: <path>
Fallback check: pass / fail
Reduced-motion check: pass / fail / not applicable
tsc --noEmit: pass / fail
npm run build: pass / fail / alternative output
git diff --check: pass / fail
Notes:
```

검증 기록에 실패 원인을 남기고, asset 계약을 바꾼 경우에는 12~19 단계의 선행 조건도 함께 갱신한다.

## 11단계 구현 기록

검증일: 2026-09-05

- [x] `docs/art-direction.md`에 design read, visual dials, palette, geometry, state, naming, manifest, generation 계약을 기록했다.
- [x] `src/data/assets.json`에 기준 샘플 4종의 logical ID, path, draw size, pivot, frame, layer, fallback을 등록했다.
- [x] `public/assets/game/`에 starter tank, standard enemy, resource pickup, resource UI icon의 normalized PNG를 추가했다.
- [x] `docs/art-asset-provenance.md`에 built-in imagegen, source output, prompt set, normalization과 review 기록을 남겼다.
- [x] JSON, 파일 존재 여부, 이미지 크기, 투명 모서리를 자동 검사했다.
- [x] `npx.cmd tsc --noEmit` 통과
- [x] `npm.cmd run build` 통과
- [x] `git diff --check` 통과
- [ ] 실제 브라우저 클릭을 포함한 manual play는 전용 browser 도구가 노출되지 않아 보류했다.

정적 대체 검증으로 Vite 개발 서버에서 `/`, 기준 샘플 4개 URL, `/src/data/assets.json`이 모두 HTTP 200으로 제공되는 것을 확인했다. 이번 단계는 runtime renderer 연결 전의 asset contract 단계이므로 기존 도형 renderer와 게임 규칙은 변경하지 않았다.
