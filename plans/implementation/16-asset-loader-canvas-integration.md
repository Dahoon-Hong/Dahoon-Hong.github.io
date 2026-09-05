# 16. Asset loader와 Canvas 연결 상세 계획

## 현재 적용 계획

이 단계는 11~15단계에서 준비한 asset과 manifest를 실제 TypeScript + HTML5 Canvas 렌더링에 연결한다. 게임 규칙, 물리, 충돌, progression 수치는 바꾸지 않고 기존 entity의 도형 renderer를 asset renderer와 fallback renderer로 교체할 수 있게 만든다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [13-enemy-art.md](13-enemy-art.md)
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md)
- [15-map-art.md](15-map-art.md)

후속 계획:

- [17-hud-upgrade-ui-art.md](17-hud-upgrade-ui-art.md)
- [18-asset-integration-performance-fallback.md](18-asset-integration-performance-fallback.md)
- [19-art-qa-release.md](19-art-qa-release.md)

## 목표

- asset 로딩과 cache의 단일 소유자를 만든다.
- asset이 준비되지 않았거나 실패해도 게임 첫 화면과 전투가 fallback으로 계속 실행된다.
- 논리 좌표, pivot, draw size를 유지해 art 교체가 hitbox와 gameplay를 바꾸지 않게 한다.
- 현재 Canvas 렌더 순서를 맵, actor, 효과, UI 순서로 확장한다.
- `dt` 기반 애니메이션과 pause 상태를 유지한다.
- 실제 이미지와 도형 fallback의 전환이 한 프레임씩 튀거나 검은 화면을 만들지 않게 한다.

## 현재 코드 기준

- Vite + TypeScript 프로젝트이며 JSON import를 사용한다.
- `Game`이 `CanvasRenderingContext2D`, 게임 loop, update, render를 소유한다.
- `Vehicle`, `Enemy`, `ResourcePickup`, `Projectile`, `VisualEffect`가 각자 render를 호출한다.
- `HUDManager`도 Canvas에 직접 그리며, 설치 버튼과 upgrade node의 hitbox를 함께 관리한다.
- `main.ts`가 `Game`을 만들고 시작한다.
- 현재 render는 grid, enemy, pickup, vehicle, projectile, effect, HUD 순서이며 맵 layer와 공통 asset manager는 없다.
- `public/assets`와 `src/assets`에는 게임 art 전용 구조가 아직 없으므로 11단계 manifest의 경로를 기준으로 추가한다.

## 범위

### 포함

- `src/data/assets.json` 또는 typed equivalent의 manifest 로딩
- `AssetManager`의 preload, cache, 상태, 오류 보고
- sprite frame, pivot, draw size를 처리하는 Canvas adapter
- 이미지가 없을 때의 category별 fallback 도형
- 맵, 탱크, 모듈, 적, 자원, 투사체, 효과 asset 연결
- `imageSmoothingEnabled`, 논리 해상도, device pixel ratio, 입력 좌표 변환 검토
- `prefers-reduced-motion`에 따른 애니메이션 축소

### 제외

- ECS, 렌더링 framework, React, WebGL 도입
- entity update와 collision 수식 변경
- actor의 radius, module grid, projectile damage 변경
- pause 중 자동 생산과 자원 수집 재개
- 새 적, 무기, 지역, 업그레이드 규칙 추가

## 권장 최소 구조

기존 구조를 크게 바꾸지 않고 다음 책임만 분리한다.

```text
src/data/assets.json
src/core/AssetManager.ts
src/rendering/SpriteRenderer.ts
src/rendering/RenderContext.ts
src/rendering/VisualTheme.ts
```
- `assets.json`: 논리 asset ID, 파일 경로, pivot, frames, layer, fallback 정보를 가진다.
- `AssetManager`: manifest 검증, 이미지 생성과 로딩, cache, 상태, 오류 보고를 소유한다.
- `SpriteRenderer`: 논리 좌표에서 sprite 또는 fallback을 그리며 frame 선택과 transform을 처리한다.
- `RenderContext`: Game이 한 frame 동안 공유할 시간, asset manager, renderer, reduced-motion 상태를 전달한다.
- `VisualTheme`: 11단계에서 확정한 색상과 UI token을 Canvas renderer가 공통으로 사용한다.

entity는 전역 singleton을 직접 만들지 않고 render 시 `RenderContext`를 받는다. entity의 update는 art 파일을 알지 않으며, `tank.scout`, `enemy.standard`, `projectile.direct` 같은 논리 ID만 선택한다.

## 최소 interface 초안

실제 타입명은 현재 코드의 naming convention에 맞춰 조정한다.

```ts
type AssetStatus = "pending" | "ready" | "failed" | "missing";

interface SpriteAsset {
  id: string;
  src: string;
  drawWidth: number;
  drawHeight: number;
  pivot: { x: number; y: number };
  frames?: { x: number; y: number; width: number; height: number }[];
  fallback: string;
}

interface AssetLoadReport {
  ready: string[];
  failed: { id: string; reason: string }[];
  missing: string[];
}

class AssetManager {
  preload(ids?: readonly string[]): Promise<AssetLoadReport>;
  get(id: string): SpriteAsset | null;
  has(id: string): boolean;
  getStatus(id: string): AssetStatus;
}
```

이 초안은 구현을 강제하는 API가 아니라 17~19단계가 의존할 안정적인 책임 경계다. manifest 형식과 실제 `Image` cache 타입을 먼저 확정하고 필요한 부분만 구현한다.

## 로딩 정책

1. Game은 manifest를 동기적으로 검증하고 fallback theme으로 첫 frame을 그릴 수 있어야 한다.
2. 필요한 asset을 preload하되, 모든 이미지가 준비될 때까지 게임 화면을 막지 않는다.
3. 이미지가 준비되면 다음 frame부터 해당 asset을 사용한다.
4. 경로 오류나 decode 오류는 한 asset ID당 한 번만 warning으로 보고한다.
5. 실패한 asset은 해당 category의 fallback으로 계속 그린다.
6. `new Image()`와 네트워크 요청은 render 함수 안에서 실행하지 않는다.
7. 재시작이나 지역 전환에서는 이미 cache된 asset을 다시 요청하지 않는다.

## Draw 계약

공통 draw 함수는 world 좌표가 entity의 중심 또는 11단계에서 정한 anchor를 의미하도록 한다.

```ts
renderer.drawSprite("enemy.standard", x, y, {
  rotation,
  frame: animationFrame,
  alpha,
  tint,
});
```

- draw size는 asset manifest 또는 entity의 logical size로 결정한다.
- pivot은 sprite의 중심과 실제 hitbox를 분리한다.
- `context.imageSmoothingEnabled = false`를 기본값으로 적용한다.
- actor와 projectile은 HUD 패널 영역에 그리지 않는다.
- sprite가 없으면 동일한 중심, 회전, 대략적인 bounds를 사용하는 도형 fallback을 그린다.
- fallback은 디버그용 격자나 텍스트가 아니라 제품 화면에서도 읽을 수 있는 단순 형태로 만든다.
- 이미지 교체로 `Enemy.radius`, `Vehicle.tileSize`, projectile collision radius를 수정하지 않는다.

## 렌더 순서

`Game.render()`는 다음 구조로 옮긴다.

```text
clear logical canvas
map background and low-contrast tile/debris
enemy and pickup shadows
vehicle grid/frame
enemies and resource pickups
vehicle modules and Core
projectiles and target markers
impact, contact, and explosion effects
selection and install preview overlays
HUD and result/pause overlays
```

맵은 HUD 패널 뒤에 깔리지 않도록 전투 viewport로 clip한다. UI overlay는 기존 HUDManager의 hitbox와 같은 논리 좌표를 사용한다.

## 애니메이션과 일시정지

- entity 상태가 `idle`, `active`, `hit`, `destroyed`, `selected` 같은 frame key를 선택한다.
- frame 진행 시간은 Game loop가 전달한 `dt`와 누적 animation time으로 계산한다.
- entity 안에서 `Date.now()`를 직접 읽지 않는다.
- pause 중에는 update가 멈추므로 애니메이션 시간도 진행하지 않는다.
- reduced motion에서는 idle pulse, muzzle flash, 반복 shimmer를 정적 frame으로 줄이고 피해·폭발의 최소 피드백은 남긴다.
- 설치와 upgrade는 pause 중 허용하고, 자동 생산과 자원 수집은 중지한다.

## 구현 순서

### 16.1 loader 없는 baseline 보존

- 현재 도형 renderer가 동작하는 상태에서 `RenderContext`와 fallback renderer를 먼저 추가한다.
- asset이 하나도 없어도 기존 Canvas 화면과 입력이 유지되는지 확인한다.

### 16.2 manifest 검증

- ID 중복, 빈 경로, 잘못된 frame, 음수 draw size, pivot 범위를 검사한다.
- 검증 오류는 화면을 중단하지 않고 load report에 기록한다.

### 16.3 entity 연결

- 12~14단계의 logical ID를 entity별로 연결한다.
- 도형 fallback을 sprite draw 호출 뒤의 동일한 renderer 경로로 이동한다.
- 탱크 모듈, 적 상태, projectile target marker, 효과의 alpha와 rotation을 유지한다.

### 16.4 Game과 map 연결

- 현재 지역 ID가 선택되면 15단계 map data의 background와 tile asset을 조회한다.
- 전투 viewport clip, grid, actor, effects, HUD 순서를 적용한다.

### 16.5 오류와 reduced motion

- 부분 로딩, 이미지 오류, manifest 누락의 화면 결과를 각각 확인한다.
- `prefers-reduced-motion`을 읽고 renderer의 animation policy에 전달한다.

### 16.6 resize와 입력 좌표

- CSS로 Canvas가 축소 또는 확대돼도 논리 1280x720 좌표가 유지되는지 검토한다.
- device pixel ratio용 backing resolution과 `getBoundingClientRect()` 기반 pointer 변환이 기존 hitbox에 맞는지 확인한다.

## 예상 변경 영역

- `src/core/AssetManager.ts` 신규
- `src/rendering/` 아래 공통 renderer와 context 신규 또는 기존 render 보조 코드 정리
- `src/data/assets.json` 신규 및 manifest 타입
- `Game.ts`의 render pipeline과 preload 호출
- entity render 메서드의 renderer/context 인자
- `HUDManager`의 Canvas context 설정과 viewport clip 보조
- `public/assets/game/`의 11~15단계 산출물

게임 규칙 파일과 progression 수치는 이 단계에서 수정하지 않는다. 기존 변경이 필요해 보이면 19단계 회귀 목록에 기록하고 먼저 원인을 분리한다.

## 검증 방법

- manifest가 정상일 때 첫 frame, preload 완료 후 frame, cache 재사용을 확인한다.
- 파일 하나를 임의로 누락했을 때 해당 entity만 fallback으로 보이고 다른 asset은 계속 표시되는지 확인한다.
- malformed manifest, 잘못된 경로, decode 실패, 부분 로딩을 각각 확인한다.
- pause에서 설치·upgrade는 가능하고 자동 생산·수집·애니메이션 시간이 진행되지 않는지 확인한다.
- 지역 전환과 restart에서 background가 바뀌고 asset 요청이 중복되지 않는지 확인한다.
- high-DPI와 브라우저 크기 변경 후 탱크, HUD, click target의 위치가 일치하는지 확인한다.
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `git diff --check`

## 완료 조건과 인계

- [ ] loader, manifest, sprite renderer의 책임이 분리되어 있다.
- [ ] 모든 art category가 sprite와 fallback 중 하나로 표시된다.
- [ ] render 중 `Image` 생성이나 fetch가 발생하지 않는다.
- [ ] logical 좌표, pivot, hitbox가 분리되어 있다.
- [ ] pause와 reduced-motion 계약이 보존된다.
- [ ] 17단계가 사용할 UI icon 로딩 및 draw API가 확인되었다.
- [ ] 18단계가 재현할 수 있는 load report와 오류 로그가 있다.
- [ ] 19단계에서 실행할 viewport, region, asset failure 시나리오가 기록되었다.

## 검증 기록 템플릿

```text
manifest 버전:
로드 대상:
ready/failed/missing 수:
fallback 확인 asset:
pause 확인:
high-DPI 확인:
빌드 결과:
수정 사항:
검증 일시:
```
