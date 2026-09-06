# 18. Asset 통합·성능·fallback 상세 계획

## 현재 적용 계획

이 단계에서는 11~17단계의 asset, renderer, 맵, HUD를 하나의 실행 흐름으로 검증한다. 새로운 art style이나 gameplay를 추가하지 않고, 누락 asset과 로딩 지연이 있어도 플레이 가능한 상태를 유지하는 데 집중한다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [13-enemy-art.md](13-enemy-art.md)
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md)
- [15-map-art.md](15-map-art.md)
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md)
- [17-hud-upgrade-ui-art.md](17-hud-upgrade-ui-art.md)

후속 계획:

- [19-art-qa-release.md](19-art-qa-release.md)
- [99-ui-tutorial-polish.md](99-ui-tutorial-polish.md)
- [100-release-verification.md](100-release-verification.md)

## 목표

- manifest의 모든 asset이 실제 파일, loader, renderer, fallback과 연결된다.
- preload, cache, decode 실패가 게임 loop와 화면 조작을 막지 않는다.
- 전투 밀도가 높아졌을 때도 actor와 핵심 UI가 먼저 읽힌다.
- 효과와 sprite가 frame마다 불필요한 객체, 이미지, 네트워크 요청을 만들지 않는다.
- 지역 전환, restart, pause, game over에서 art state가 이전 상태와 섞이지 않는다.
- 19단계 release QA가 재현할 수 있는 검사 결과와 오류 목록을 남긴다.

## 범위

### 포함

- manifest coverage와 logical ID audit
- asset path, frame, pivot, alpha, image dimension 검사
- preload와 cache 재사용 검사
- background, actor, UI, projectile, effect의 fallback 검사
- 효과 동시 발생, 적 밀집, HUD 갱신, region transition 시나리오
- Canvas logical size, CSS resize, high-DPI 입력 변환
- reduced-motion과 pause의 통합 동작
- load report, 중복 warning, 개발용 debug 상태 기록
- 이미지 파일 크기와 과도한 배경 해상도 점검

### 제외

- 새로운 art category나 gameplay entity 추가
- 성능 문제를 이유로 규칙이나 난이도 수치 변경
- 대규모 렌더 framework 도입
- 자동으로 asset을 삭제하거나 덮어쓰는 정리 작업

## 통합 기준선

최소한 다음 시나리오를 같은 build에서 반복할 수 있어야 한다.

1. `aurelia/landing-zone`에서 시작해 탱크, 모듈, standard enemy, resource pickup을 표시한다.
2. direct projectile, arc projectile, hit, contact, enemy death 효과를 동시에 발생시킨다.
3. `aurelia/relay-fields`, `cinder/ash-basin`, `cinder/core-ruins`로 이동하거나 해당 지역을 시작해 맵 asset을 바꾼다.
4. 적이 많고 HUD의 wave, HP, resource 수치가 빠르게 갱신되는 상황을 확인한다.
5. pause에서 install과 upgrade를 수행하고, 자동 생산과 resource collection 및 animation 시간이 멈추는지 확인한다.
6. game over 또는 victory 후 restart하고 이전 region, effect, selection state가 남지 않는지 확인한다.
7. 브라우저 크기, device pixel ratio, pointer 위치를 변경해 Canvas와 hitbox가 일치하는지 확인한다.

## Asset coverage audit

다음 표를 실제 manifest와 파일 목록으로 채운다.

| 영역 | 필요한 논리 ID | 실제 파일 | fallback | 상태 |
| --- | --- | --- | --- | --- |
| tank | scout, striker, bulwark와 module IDs | 12단계 산출물 | tank silhouette | 미확인 |
| enemy | standard, tanker와 상태 frame | 13단계 산출물 | enemy shape | 미확인 |
| resource | pickup과 matter/ammo/nano icon | 14단계 산출물 | diamond/icon shape | 미확인 |
| map | 네 region background/tile/debris | 15단계 산출물 | solid field | 미확인 |
| projectile/effect | direct, arc, impact, contact, death | 14단계 산출물 | line/ring | 미확인 |
| UI | core, resource, state, upgrade icons | 17단계 산출물 | geometric icon | 미확인 |

검사 규칙:

- manifest ID는 중복되지 않는다.
- manifest의 모든 `src`가 실제 파일을 가리킨다.
- renderer가 요청하는 ID가 manifest에 있다.
- 파일이 있어도 draw size, frame, pivot이 비어 있으면 ready로 간주하지 않는다.
- 사용하지 않는 파일은 asset 삭제 대신 목록과 다음 정리 시점에 기록한다.
- 현재 gameplay 데이터에 없는 미래 자원과 모듈 icon은 사용하지 않는 상태로 명시한다.

## 로딩과 cache 검사

- 시작 시 load report에 `ready`, `failed`, `missing`을 기록한다.
- 같은 logical ID의 preload 요청이 여러 번 들어와도 하나의 promise와 cache를 공유한다.
- render loop 안에서 `new Image()`, fetch, decode, 배열 생성이 반복되지 않는지 확인한다.
- 실패 warning은 ID별 한 번만 기록한다.
- 최초 frame은 fallback으로 표시되고, 실제 이미지가 ready가 된 다음 frame부터 교체된다.
- 하나의 배경 이미지 실패가 전체 지역과 HUD의 loader를 실패시키지 않는다.
- 이전 지역의 일시적인 sprite 상태와 effect frame은 지역 전환 또는 restart 시 초기화한다.

## 성능 기준

- 일반 전투와 적 밀집 전투에서 지속적인 frame drop 또는 입력 지연이 없어야 한다.
- frame마다 생성되는 `Image`, `Path2D`, 큰 임시 배열과 문자열을 최소화한다.
- 큰 background는 실제 logical viewport에 필요한 해상도보다 과도하게 크지 않게 준비한다.
- 반복 타일은 cache된 이미지와 정해진 draw 영역을 사용한다.
- 효과 수가 급증하면 핵심 hit, contact, enemy death 피드백을 우선하고 장식성 반복 효과를 줄인다.
- 낮은 성능 환경에서는 reduced-motion 정책과 동일한 방향으로 pulse, shimmer, 잔상 수를 낮춘다.
- 성능을 맞추기 위해 enemy update, projectile collision, resource reward를 생략하지 않는다.

## Fallback 기준

| 실패 영역 | 화면 처리 | 반드시 보존할 의미 |
| --- | --- | --- |
| tank/module | 색이 구분되는 실루엣과 grid cell | 탱크 종류, 설치 위치, 선택 상태 |
| enemy | standard/tanker의 크기와 실루엣 차이 | hp, contact, target |
| resource | 형태와 semantic color | pickup 종류와 수량 |
| map | 지역별 낮은 대비 단색 또는 패턴 | 전투 viewport와 actor 위치 |
| projectile | 직선/곡선 궤적의 단순 선 | 방향, target, impact |
| effect | ring, flash, alpha 변화 | hit, death, contact 피드백 |
| HUD | text, 숫자, outline 기반 표시 | HP, resource, wave, 조작 상태 |

Fallback은 asset 실패를 숨기는 임시 debug 표시가 아니라 release에서도 플레이를 지속할 수 있는 제품 경로로 취급한다.

## 구현 순서

### 18.1 manifest와 파일 audit

- 11~17단계의 asset ID를 하나의 목록으로 합친다.
- 각 ID의 실제 파일, draw size, pivot, frame, fallback, 사용처를 확인한다.
- 누락은 종류별로 기록하고 19단계에서 release blocker인지 결정한다.

### 18.2 loader와 cache audit

- 정상, 부분 실패, 완전 실패, 중복 preload를 재현한다.
- load report와 console warning이 같은 문제를 여러 번 보고하지 않는지 확인한다.
- 지역 전환과 restart에서 cache와 state reset 범위를 확인한다.

### 18.3 render와 effect audit

- 맵, actor, projectile, effect, UI의 최종 draw order를 확인한다.
- 효과가 actor 또는 HUD를 가리지 않는지 확인한다.
- 여러 적이 동시에 hit될 때 효과 객체가 무한히 늘지 않는지 확인한다.

### 18.4 시나리오 실행

- 기준선의 일곱 시나리오를 각 region과 상태 조합으로 실행한다.
- normal, hit, destroyed, selected, preview valid/invalid, paused, terminal 상태를 캡처한다.

### 18.5 측정과 조정

- 브라우저 performance panel 또는 개발용 frame counter로 지속적인 frame drop을 관찰한다.
- 가장 큰 asset, 가장 많은 draw call, 가장 많은 효과가 발생하는 상황을 기록한다.
- 먼저 이미지 크기, 중복 draw, 불필요한 장식 효과를 줄이고 gameplay는 유지한다.

### 18.6 인계 자료 정리

- 최종 load report와 asset coverage 표를 19단계 입력으로 남긴다.
- 실패한 asset의 fallback 화면과 재현 방법을 기록한다.
- 99, 100의 functional verification에서 사용할 art 통합 항목을 연결한다.

## 완료 조건

- [ ] manifest와 실제 파일의 coverage audit이 완료되었다.
- [ ] 정상, 부분 실패, 완전 실패에서 플레이와 UI 조작이 유지된다.
- [ ] render loop 내부에 이미지 생성과 네트워크 요청이 없다.
- [ ] 네 지역, 주요 actor, UI, 효과가 최종 draw order로 표시된다.
- [ ] 적 밀집과 효과 동시 발생에서 핵심 피드백과 입력이 유지된다.
- [ ] pause, reduced motion, restart, terminal 상태가 통합 검증되었다.
- [ ] 19단계가 사용할 blocker, warning, fallback 목록이 남아 있다.

## 검증 기록 템플릿

```text
build 버전:
시나리오:
region:
ready/failed/missing:
fallback 동작:
관찰한 frame drop 또는 입력 지연:
최대 효과/적 밀도:
수정 사항:
검증 일시:
```

## 18단계 구현 기록

### 구현 결과

- `AssetManager`가 manifest 구조와 이미지 decode 후 실제 frame 분할 가능 여부를 검사하고, `manifestVersion`, `ready`, `failed`, `missing` load report를 반환한다. 같은 logical ID의 preload promise와 warning은 한 번만 공유한다.
- `SpriteRenderer`는 잘못된 이미지 크기나 frame contract를 만나도 category fallback으로 전환하며, fallback polygon을 frame마다 배열로 생성하지 않는다.
- `Game`은 logical 1280x720 좌표와 DPR backing canvas를 분리한다. DPR 1.75 환경에서 2240x1260 backing을 사용해도 HUD, terminal action, grid hitbox가 logical 좌표와 일치한다.
- 지역 전환·restart에서 enemy, projectile, effect, render time, HUD selection을 함께 초기화한다. `VisualEffect`는 장식 효과를 먼저 제한하고 hit/contact/death 같은 핵심 feedback을 우선한다.
- enemy hit/dead sprite, resource collect effect, enemy death effect를 실제 상태 흐름에 연결했다. pause 중에는 기존 update gate를 유지해 자동 생산·수집과 art timer가 진행하지 않는다.
- `resource.icon.matter`, `resource.icon.ammo`, `resource.icon.nano`의 HUD logical ID를 manifest와 일치시켜 누락 fallback을 제거했다.

### 정적·브라우저 검증

```text
manifest 버전: 1
manifest entries: 62
manifest 경로/PNG frame 검사: 0 error
미등록 runtime asset: public/assets/game/tank/grid-core.png (warning, 삭제하지 않음)
TypeScript: npx.cmd tsc --noEmit 통과
build: npm.cmd run build 통과
manual browser: initial art, combat density, pause overlay, paused subject selection, resume 확인
high-DPI: logical 1280x720 / backing 2240x1260 / DPR 1.75, browser warning 0건
검증 일시: 2026-09-06
```
