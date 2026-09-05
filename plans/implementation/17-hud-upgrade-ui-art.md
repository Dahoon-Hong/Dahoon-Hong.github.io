# 17. HUD·upgrade UI art 상세 계획

## 현재 적용 계획

16단계에서 확정한 asset loader와 Canvas renderer를 사용해 HUD, 모듈 설치, upgrade web, pause, 결과 화면의 시각 체계를 정리한다. 기존 UI의 좌표, hitbox, 텍스트 의미, 게임 규칙은 유지하고 visual hierarchy와 상태 표현을 개선한다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md)
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md)
- [99-ui-tutorial-polish.md](99-ui-tutorial-polish.md)

후속 계획:

- [18-asset-integration-performance-fallback.md](18-asset-integration-performance-fallback.md)
- [19-art-qa-release.md](19-art-qa-release.md)
- [100-release-verification.md](100-release-verification.md)

## 목표

- 전투 중 가장 먼저 읽어야 할 Core HP, 자원, wave, pause 상태가 안정적으로 보인다.
- 탱크 선택, 내장 시스템, combat module, 설치 미리보기, upgrade node의 상태가 색 하나에 의존하지 않는다.
- UI asset이 현재 Canvas 좌표와 hitbox를 바꾸지 않는다.
- HUD가 맵과 actor의 시각적 우선순위를 빼앗지 않으면서 조작 가능한 요소를 분명히 한다.
- pause, terminal, 결과 화면이 같은 visual language를 공유한다.

## 현재 코드 기준

- `HUDManager.PANEL_WIDTH`는 340px이고 HUD는 Canvas 오른쪽 패널에 그려진다.
- 상단 상태 bar 높이는 50px이다.
- HUD에는 Core HP, 자원, wave, controls, 시스템 목록, combat module 목록, module 설치 hitbox, upgrade web node, pause overlay, terminal overlay가 있다.
- UI는 DOM framework 없이 Canvas에 직접 그려진다.
- 설치와 upgrade의 클릭 좌표를 UI drawing 좌표와 공유하므로, 장식용 asset을 추가해도 hitbox를 별도 위치로 옮기지 않는다.
- `99-ui-tutorial-polish.md`는 현재 기능과 tutorial 문구의 기준이며, 이 단계는 문구를 임의로 다시 쓰지 않는다.

## 범위

### 포함

- top bar의 Core HP, 자원, wave, controls 표현
- 시스템과 combat module 목록의 아이콘, 상태, 비용, 선택 강조
- module grid 선택, 설치 가능, 설치 불가, 설치 미리보기
- upgrade web의 locked, available, selected, purchased, insufficient 상태
- pause, terminal, victory, game over, region transition overlay
- UI icon, panel texture, divider, selection frame, warning marker asset
- 텍스트와 숫자의 계층, 간격, 대비, 정렬
- mouse와 keyboard 상태에서의 focus/selected 표현

### 제외

- module 비용, 효과, unlock 조건 변경
- 새 UI interaction 또는 화면 전환 규칙 추가
- HUD를 별도 DOM 앱으로 재작성
- 모바일 전용 레이아웃과 새 화면 추가
- art 변경을 이유로 Canvas 논리 해상도와 기존 hitbox 변경

## Visual language

- 전체 theme은 어두운 navy 기반의 기술 패널로 유지한다.
- 기본 강조색은 cyan 하나로 두고, 자원·위험·성공·잠금은 semantic color token으로 분리한다.
- 패널은 직사각형 구조, 명확한 divider, 제한된 모서리 처리를 사용한다. 의미 없는 glass card와 과도한 glow는 사용하지 않는다.
- 숫자와 비용은 monospace 계열로 정렬하고, 설명 문구는 읽기 쉬운 system sans 계열을 사용한다.
- icon 안에 글자나 숫자를 baked-in하지 않는다. 실제 label과 icon을 별도로 그린다.
- selected는 outline과 배경 변화, disabled는 대비 저하와 아이콘 상태, warning은 색과 기호를 함께 사용한다.
- 11단계의 pixel scale과 `imageSmoothingEnabled = false`를 UI icon에도 적용한다.

## 좌표 계약

```text
logical canvas: 1280 x 720
top status bar: y = 0..50
gameplay viewport: x = 0..940
HUD panel: x = 940..1280
```
- 실제 상수는 기존 `HUDManager`를 기준으로 읽고 중복된 숫자를 새 코드에 만들지 않는다.
- UI asset의 draw box가 텍스트 baseline, icon 중심, click rect를 침범하지 않게 한다.
- Canvas가 CSS로 축소되어도 기존 1280x720 논리 좌표와 pointer 변환을 사용한다.
- 좁은 viewport에서는 전체 Canvas가 축소되어 보이게 하고, HUD 일부를 임의로 잘라내지 않는다.

## 상태 표현 표

| 상태 | 시각 처리 | 보조 신호 |
| --- | --- | --- |
| normal | 낮은 대비의 기본 panel | label과 icon |
| selected | cyan outline과 명도 상승 | 선택 label 또는 cursor |
| available | 강조 outline과 활성 icon | 구매/설치 안내 |
| insufficient | 낮은 채도의 비용과 warning mark | 부족한 자원 이름 |
| locked | muted icon과 잠금 표시 | unlock 조건 문구 |
| disabled | 낮은 alpha와 입력 무시 | disabled label |
| paused | 전체 overlay와 명확한 pause title | install/upgrade 가능 안내 |
| loading/error | 작은 상태 marker | fallback 또는 재시도 안내 |
| terminal | 결과 panel과 primary action | victory/game over 문구 |

`available`과 `selected`를 같은 색 하나로 표현하지 않는다. 선택은 조작 초점이고, available은 가능한 행동이라는 차이를 outline, fill, label로 함께 보여준다.

## UI asset inventory

11단계 manifest에 다음 logical ID를 등록한다.

- `ui.icon.core`
- `ui.icon.matter`
- `ui.icon.ammo`
- `ui.icon.nano`
- `ui.icon.wave`
- `ui.icon.pause`
- `ui.icon.locked`
- `ui.icon.warning`
- `ui.icon.confirm`
- `ui.icon.module-frame`
- `ui.icon.upgrade-node`
- `ui.icon.upgrade-node-purchased`
- `ui.icon.upgrade-node-available`
- `ui.icon.upgrade-node-locked`

모듈별 icon은 실제 module ID가 확정된 뒤 `ui.module.<moduleId>` 형식으로 추가한다. 존재하지 않는 module의 icon을 미리 만들거나 UI에 표시하지 않는다.

## 구현 순서

### 17.1 현재 UI inventory 고정

- `HUDManager`의 모든 draw section, label, hitbox, 상태 분기를 표로 만든다.
- `99-ui-tutorial-polish.md`의 문구와 현재 조작 흐름을 대조한다.
- 기능적으로 쓰이는 텍스트와 순수 장식 텍스트를 구분한다.

### 17.2 공통 token 적용

- panel, divider, text, selected, warning, success, disabled token을 `VisualTheme`에서 읽는다.
- 각 UI component가 임의의 hex 색상을 직접 선언하지 않게 한다.
- 숫자와 label의 baseline, padding, line height를 하나의 UI spacing 규칙으로 정한다.

### 17.3 icon과 frame asset 연결

- 16단계의 `renderer.drawSprite()`로 icon을 그린다.
- icon이 누락되면 해당 상태를 암시하는 단순 도형 fallback을 사용한다.
- frame, pivot, alpha가 click rect와 별개로 동작하는지 확인한다.

### 17.4 Canvas UI component 정리

- top bar, system list, combat module list, grid overlay, upgrade web, overlay를 작은 draw 함수로 분리한다.
- component는 기존 state와 hitbox 계산을 입력으로 받고 규칙을 새로 계산하지 않는다.
- panel과 overlay가 gameplay actor의 마지막 위치를 가리지 않는지 확인한다.

### 17.5 interaction state 연결

- hover, selected, pressed, disabled, insufficient, locked 상태를 기존 입력 처리와 연결한다.
- 설치 preview는 valid와 invalid를 색, outline, icon shape로 동시에 구분한다.
- upgrade node는 구매 전후와 현재 선택을 구분한다.
- pause 중에는 설치와 upgrade를 허용하고, 자동 생산과 자원 수집은 계속 중지한다.

### 17.6 resize와 접근성 검증

- 고해상도와 축소 viewport에서 text clipping, 숫자 겹침, click offset을 확인한다.
- 중요한 정보에 색 외에 아이콘, outline, label을 함께 둔다.
- reduced motion에서는 panel pulse와 선택 애니메이션을 정적 강조로 줄인다.

### 17.7 tutorial 기준과 교차 검토

- 첫 실행에서 필요한 조작 설명이 새 panel decoration에 묻히지 않는지 확인한다.
- 99단계에서 정한 tutorial completion, pause, install, upgrade 흐름을 다시 실행한다.
- 문구를 바꿔야 하면 이 파일에서 임의로 확정하지 않고 99단계 문서와 함께 수정한다.

## 화면별 수용 기준

### 전투 HUD

- Core HP와 wave 변화가 즉시 보인다.
- 자원 종류와 수량이 icon과 숫자로 함께 읽힌다.
- 전투 영역과 HUD panel 경계가 분명하다.

### 모듈 설치

- 선택 가능한 grid cell, 현재 설치된 cell, 설치 불가 cell을 혼동하지 않는다.
- 비용 부족과 설치 불가 이유를 색상 이외의 marker 또는 문구로 알 수 있다.
- preview가 실제 설치 결과와 같은 grid 좌표를 사용한다.

### Upgrade web

- 연결된 node의 구매 가능 여부가 선과 node 상태로 구분된다.
- 구매 후 node의 상태가 새로 고쳐지고 자원 비용과 현재 선택이 일치한다.
- 잠긴 node가 활성 button처럼 보이지 않는다.

### Pause와 결과

- pause title과 재개/종료 action이 시각적으로 가장 먼저 읽힌다.
- pause 중 허용되는 install/upgrade와 중지되는 자동 처리의 의미가 tutorial 규칙과 일치한다.
- terminal 화면이 전투 HUD와 겹쳐도 결과와 primary action이 잘리지 않는다.

## 완료 조건과 인계

- [ ] HUD의 기존 hitbox와 의미를 보존하면서 visual token과 icon이 연결되었다.
- [ ] 주요 상태가 색상 단독이 아니라 shape, outline, label 중 하나를 추가로 가진다.
- [ ] 16단계 loader의 missing/failed fallback이 UI에서도 동작한다.
- [ ] 18단계가 검사할 UI 상태와 viewport 목록이 기록되었다.
- [ ] 19단계에서 99, 100과 함께 기능 회귀를 재현할 수 있다.
- [ ] Canvas build 후 실제 click coordinate가 drawing coordinate와 일치한다.

## 검증 기록 템플릿

```text
검증 화면:
viewport와 DPR:
확인한 상태:
hitbox 오프셋:
텍스트 clipping:
색 외 보조 신호:
pause install/upgrade:
수정 사항:
검증 일시:
```
