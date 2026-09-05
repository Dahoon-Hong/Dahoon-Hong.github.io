# 19. Art QA와 release 승인 상세 계획

## 현재 적용 계획

이 단계는 11~18단계에서 만든 art direction, asset, Canvas 연결, HUD, fallback을 최종 release gate로 검증한다. 이 단계에서 새 gameplay나 새로운 시각 방향을 추가하지 않는다. 결함이 발견되면 원래 책임 단계로 되돌려 수정하고, 다시 이 문서의 해당 검사를 실행한다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [13-enemy-art.md](13-enemy-art.md)
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md)
- [15-map-art.md](15-map-art.md)
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md)
- [17-hud-upgrade-ui-art.md](17-hud-upgrade-ui-art.md)
- [18-asset-integration-performance-fallback.md](18-asset-integration-performance-fallback.md)
- [99-ui-tutorial-polish.md](99-ui-tutorial-polish.md)

후속 계획:

- [100-release-verification.md](100-release-verification.md)

## 목표

- 네 지역, 모든 주요 actor, projectile, resource, effect, UI 상태의 시각적 일관성을 최종 승인한다.
- art 연결이 이동, 충돌, 보상, 설치, upgrade, pause, progression을 깨지 않았는지 확인한다.
- asset 경로, frame, pivot, fallback, provenance를 release 전에 고정한다.
- 일반 viewport, 좁은 viewport, high-DPI, reduced-motion 환경에서 플레이 가능한 결과를 확인한다.
- 검증 결과와 남은 known issue를 100단계 release verification으로 넘긴다.

## 범위

### 포함

- region과 gameplay density별 시각 QA
- actor 상태, UI 상태, overlay 상태별 회귀
- mouse, keyboard, resize, high-DPI 입력 검증
- asset manifest와 실제 파일 무결성 검증
- fallback, 부분 로딩, 이미지 오류 검증
- 성능과 reduced-motion 최종 확인
- build, dist, 수동 플레이, 캡처 및 release 기록

### 제외

- 새 적, 무기, 맵, 업그레이드 규칙 추가
- art style을 근본적으로 바꾸는 재설계
- QA 중 발견한 문제를 무시한 채 release 승인
- 사용자가 요청하지 않은 asset 삭제나 자동 정리

## QA 매트릭스

### 지역

- `aurelia/landing-zone`
- `aurelia/relay-fields`
- `cinder/ash-basin`
- `cinder/core-ruins`

### 상태

- tank idle, moving, firing, hit, damaged, destroyed
- enemy standard/tanker idle, moving, hit, contact, destroyed
- resource idle, collected, amount visible
- projectile direct travel, direct impact, arc travel, arc target marker, arc impact
- module grid empty, occupied, selected, valid preview, invalid preview
- upgrade node locked, available, selected, purchased, insufficient
- HUD normal, selected, disabled, paused, loading, fallback, terminal

### 밀도와 환경

- 초기 전투와 적이 적은 상태
- standard와 tanker가 동시에 많은 상태
- projectile, hit, contact, death effect가 겹치는 상태
- Core HP, wave, resource가 빠르게 변하는 상태
- 1280x720 기준 viewport
- 좁은 브라우저 viewport와 CSS 축소 상태
- high-DPI display
- `prefers-reduced-motion: reduce`

## 시각 체크리스트

- 탱크별 silhouette과 module 위치가 한눈에 구분된다.
- standard와 tanker의 크기, 색, silhouette이 혼동되지 않는다.
- resource와 projectile이 background와 HUD에 묻히지 않는다.
- hitbox와 sprite pivot이 어긋나 보이지 않는다.
- hit, contact, death, install preview 같은 중요한 피드백이 실제 상태와 일치한다.
- map decoration이 spawn edge, movement lane, grid contact, Core를 가리지 않는다.
- 네 지역의 분위기는 구분되지만 전투 actor의 semantic color와 충돌하지 않는다.
- UI text가 잘리지 않고, 숫자와 icon의 baseline이 안정적이다.
- selected, available, locked, insufficient가 색상 외 신호를 가진다.
- panel, overlay, map, actor가 합쳐졌을 때 의도하지 않은 clipping이 없다.
- imagegen으로 만든 asset에 text, logo, watermark, 임의의 UI가 포함되지 않았다.
- asset 사이에 서로 다른 pixel scale, filtering, outline 규칙이 섞이지 않았다.
- 넓은 면적의 무작위 neon glow나 의미 없는 purple accent가 추가되지 않았다.

## 기능 회귀 체크리스트

- tank 생성, 이동, grid 중심, module 선택이 기존 규칙과 같다.
- 전투 module 설치와 upgrade의 비용, 조건, 효과가 변하지 않았다.
- enemy spawn, 이동, 접촉 피해, projectile collision, reward가 정상이다.
- resource pickup이 사라지고 reward가 한 번만 반영된다.
- wave 진행과 region/progression 전환이 정상이다.
- pause 중 install과 upgrade는 가능하다.
- pause 중 자동 생산, resource collection, enemy/projectile/effect update와 animation time은 진행하지 않는다.
- resume 후 이전 state에서 자연스럽게 이어진다.
- game over, victory, terminal overlay의 action과 restart가 정상이다.
- asset 오류가 있어도 fallback으로 플레이와 조작이 가능하다.
- resize 후 Canvas, HUD, pointer, click target의 좌표가 일치한다.

## Asset 무결성 체크

- [ ] manifest version이 기록되어 있다.
- [ ] 모든 manifest ID가 중복 없이 존재한다.
- [ ] 모든 `src` 경로가 release 산출물에 포함된다.
- [ ] background, sprite, icon의 실제 크기가 draw contract와 일치한다.
- [ ] frame rectangle이 원본 이미지 밖으로 나가지 않는다.
- [ ] pivot이 actor의 논리 중심과 일치한다.
- [ ] alpha와 filtering이 의도한 pixel scale을 보존한다.
- [ ] 각 category에 사용할 fallback이 있다.
- [ ] 파일 출처와 생성/수정 기록이 asset 목록에 남아 있다.
- [ ] 사용하지 않는 미래 asset이 runtime 요청 목록에 포함되지 않는다.

## 구현 및 검증 순서

### 19.1 release candidate 고정

- 18단계의 asset coverage, load report, 성능 결과를 기준선으로 복사한다.
- manifest와 art 파일을 임의로 바꾸지 않고 candidate 버전을 기록한다.
- 이전 단계의 미해결 항목을 blocker, warning, 다음 iteration으로 분류한다.

### 19.2 시각 매트릭스 실행

- 네 지역과 주요 상태 조합을 실행한다.
- 같은 화면을 normal motion과 reduced motion에서 비교한다.
- 기준 viewport와 좁은 viewport의 캡처를 남긴다.

### 19.3 기능 회귀 실행

- 99단계 tutorial 흐름을 처음부터 끝까지 수행한다.
- 100단계의 release verification 항목과 함께 전투, 설치, upgrade, pause, restart를 수행한다.
- art layer 때문에 발생한 입력 offset, state mismatch, timing 문제를 별도로 기록한다.

### 19.4 asset failure와 fallback 실행

- 하나의 tank, enemy, map, UI icon 파일을 각각 누락시켜 해당 fallback을 확인한다.
- 잘못된 path와 깨진 frame을 각각 확인한다.
- 오류가 다른 category의 ready asset이나 게임 loop를 중단하지 않는지 확인한다.

### 19.5 build와 수동 플레이

- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
- `git diff --check`
- 개발 서버 또는 build preview에서 수동 플레이
- 정상 실행, fallback 실행, reduced-motion 실행의 결과를 기록

Windows에서 build 출력 디렉터리 권한이나 잠금 때문에 기존 산출물 삭제가 실패하면, 삭제를 반복하지 말고 현재 build 도구의 출력 위치와 잠금 원인을 기록한 뒤 안전한 새 출력 위치에서 검증한다.

## 승인 기준

release 승인 전에 다음 항목은 모두 충족해야 한다.

- critical actor와 HUD가 모든 지역에서 읽힌다.
- 기능 회귀가 없다.
- manifest의 missing asset이 없거나, 의도적으로 승인된 fallback만 남아 있다.
- build와 TypeScript 검사가 통과한다.
- pause, reduced-motion, resize, high-DPI가 검증되었다.
- 성능 저하가 핵심 조작과 feedback을 방해하지 않는다.
- blocker가 0개이고 warning은 재현 방법과 후속 계획을 가진다.

다음은 release blocker로 분류한다.

- 탱크, 적, projectile, resource, Core HP 또는 주요 UI 상태를 읽을 수 없는 경우
- asset 로딩 실패로 게임 시작, 조작, restart가 막히는 경우
- sprite와 hitbox 차이로 충돌 또는 설치 결과를 오해하게 되는 경우
- pause 중 중지해야 할 자동 처리나 animation이 진행되는 경우
- 지역 전환 후 이전 지역의 asset 또는 state가 잘못 남는 경우
- build 산출물에서 manifest 경로가 깨진 경우

## 완료 조건과 인계

- [ ] QA 매트릭스의 지역, 상태, 밀도, viewport를 모두 실행했다.
- [ ] 시각, 기능, asset, 성능, fallback 결과를 기록했다.
- [ ] release blocker가 0개이거나 명시적인 수정 대기 상태로 승인되지 않았다.
- [ ] `npx.cmd tsc --noEmit`, `npm.cmd run build`, `git diff --check` 결과가 남아 있다.
- [ ] 99단계 tutorial과 100단계 release verification에 필요한 결과가 연결되었다.
- [ ] 최종 asset manifest 버전과 변경 목록을 기록했다.
- [ ] 알려진 warning, 재현 방법, 후속 계획이 남아 있다.

## 최종 기록 템플릿

```text
release candidate:
검증 환경과 viewport:
검증한 지역:
검증한 상태:
TypeScript 결과:
build 결과:
fallback 결과:
성능 결과:
blocker 수:
warning 수:
캡처 또는 로그 위치:
최종 승인자:
검증 일시:
```
