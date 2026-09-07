# Plan 27: 맵 이미지와 지형·탱크 상호작용 개선

작성일: 2026-09-07

상태: 27.1~27.5 구현 및 검증 완료. 27.6 통합 검증 대기.

## 목표

벽·언덕·길을 하나의 완성 맵 이미지로 표현하고, 그 이미지에 맞는 숨겨진 지형 윤곽으로 이동과 전투를 판정한다. 탱크는 회전한 차체까지 벽을 관통하지 않으며, 벽면 이동과 코너 회전을 부드럽게 처리한다.

데이터 계약, 판정 방식, 아트 제작 원칙과 검증 기준은 [Plan 27 설계 명세](../../docs/superpowers/specs/2026-09-07-plan-27-map-art-and-terrain-interaction-design.md)를 따른다.

## 선행 조건과 실행 원칙

- Plan 26의 TerrainGrid, 적 A*, 탄환/LOS, 테스트 맵과 실제 네 지역을 기반으로 한다.
- 구현 직전에 관련 파일의 최신 변경을 확인한다. 특히 차체 렌더링, 궤도 애니메이션과 `vehicle-motion.json`을 재사용한다.
- 아래 27.1부터 27.6까지 순서대로 진행하고 단계별로 커밋한다.
- 단계에 해당하는 자동 검사와 개발 서버 확인을 수행한다. 문서 작성만으로 구현이나 검증을 완료 처리하지 않는다.
- 맵 이미지와 충돌 경계는 함께 수정하고 검증한다. 이미지에 맞지 않는 격자를 보이지 않게 숨기는 것으로 완료하지 않는다.

## 27.1 — 맵 이미지와 지형 경계의 제작 기준 통합

### 작업

- 현재 월드 크기와 원점을 공유하는 완성 이미지 및 정적 다각형 JSON 계약을 반영한다.
- 기존 `assets.background`를 완성 이미지 참조로 사용하고 전환한 맵의 반복 렌더링을 금지한다.
- `terrain.regions`에 영역 ID, type과 볼록 다각형 꼭짓점을 정의한다.
- 윤곽의 유한값, 월드 범위, 면적, 자기 교차, 볼록성과 참조를 검증한다.
- terrain row에서 regions로 순차 전환할 수 있게 하되 한 맵의 두 판정 원본은 허용하지 않는다.
- 이미지 제작 가이드와 윤곽을 겹쳐 확인하는 절차를 아트 문서에 반영한다.

### 주요 변경 대상

- `src/data/maps.json`, `src/core/MapDefinitionLoader.ts` 및 테스트
- `src/core/TerrainGrid.ts`의 map/type 계약
- `src/data/assets.json`, `scripts/qa-art.mjs`
- `docs/art-direction.md`, `docs/art-asset-provenance.md`

### 완료 기준

- 올바른 regions map은 로드되고 잘못된 윤곽과 이중 원본은 명확한 오류로 거부된다.
- 미전환 지역의 기존 실행이 유지된다.
- 이미지의 월드 크기, 원점과 논리 표시 크기를 검증할 수 있다.

커밋: `feat(plan 27.1): define map artwork and terrain outlines`

## 27.2 — 테스트 맵에서 이미지와 판정 연결

상태: 완료

### 작업

- `test/terrain-test`의 길·벽·언덕 윤곽을 먼저 정하고 이를 기준으로 완성 맵 이미지를 제작한다.
- 직선 벽, 비정형 언덕, 안쪽·바깥쪽 코너, 협로, 교차로, 막다른 길과 엄폐 구간을 포함한다.
- 전환한 맵에서 바위 tile과 고정 장식 반복 렌더링을 제거한다. 정적 벽과 언덕은 완성 이미지 안에만 표현한다.
- TerrainGrid의 36px grid를 주변 후보 검색에 재사용하고, footprint·반지름·raycast는 다각형으로 판정한다.
- 적 경로의 waypoint 사이, 압축 구간과 실제 이동에 반지름을 포함한 구간 검사를 적용한다.
- direct/arc와 자동 조준은 같은 정확한 지형 경계를 참조한다.
- 개발용 overlay에 실제 지형 윤곽과 접촉 위치를 표시하고 이미지 실패 시 실제 경계 기반 표시를 제공한다.

### 주요 변경 대상

- `src/core/Game.ts`, `src/core/TerrainGrid.ts` 및 테스트
- `src/core/TerrainPathfinder.ts`, `src/entities/Enemy.ts` 및 테스트
- `src/entities/Projectile.ts`, `src/entities/Module.ts`의 지형 연결부 및 관련 테스트
- `src/data/maps.json`, `src/data/assets.json`, 테스트 맵 PNG
- `scripts/qa-art.mjs`, `docs/art-asset-provenance.md`

### 완료 기준

- 테스트 맵의 보이는 벽과 실제 차단 윤곽이 일치하고 별도 바위 오브젝트처럼 보이는 렌더링이 없다.
- 영역 분할의 내부 접합선이 불필요한 벽으로 동작하지 않는다.
- 적 이동, 탄환과 LOS가 같은 지형 경계를 사용한다.
- 테스트 맵 이미지와 overlay를 실제 개발 서버에서 확인한다.

커밋: `feat(plan 27.2): align terrain test artwork and collision`

## 27.3 — 차체 전체의 벽 관통 방지

상태: 완료

### 작업

- 탱크 정의의 크기와 프레임을 반영한 회전 사각형으로 차체 외곽을 계산한다.
- 이동 구간의 최초 접촉을 검사하고 회전 시작각부터 끝각 사이의 경로도 검사한다.
- 월드 외곽에 동일한 자세 검사를 적용하고 이동 후 축 정렬 clamp 의존을 제거한다.
- 시작 위치는 초기 차체 전체와 방향으로 검증하며 잘못된 맵은 거부한다.
- 기존 테스트의 고정 AABB 기대값을 실제 차체 경계에 맞게 수정한다.
- 얇은 벽, 큰 frame delta, 중간 회전 충돌, 월드 경계와 다른 직사각형 차체 크기를 검증한다.

### 주요 변경 대상

- `src/entities/Vehicle.ts`, `src/entities/Vehicle.test.ts`
- `src/core/TerrainGrid.ts`, `src/core/TerrainGrid.test.ts`
- `src/core/MapDefinitionLoader.ts`, `src/core/Game.ts`의 초기 차체 검증 및 debug overlay

### 완료 기준

- 위치와 방향을 바꾸는 모든 경로에서 고형 차체가 지형 또는 월드 경계를 침범하지 않는다.
- 이동 끝점이나 회전 끝각만 유효한 관통 사례도 차단한다.
- 초기 차체와 겹치는 지형을 로딩 또는 런 생성 검증에서 거부한다.

커밋: `fix(plan 27.3): prevent tank translation and rotation penetration`

## 27.4 — 벽면 이동과 코너 회전 개선

상태: 완료

### 작업

- X 전체 이동 후 Y 전체 이동하는 방식을 최초 접촉 및 남은 접선 이동 처리로 교체한다.
- 두 벽 동시 접촉과 영역 접합부에서 안정적으로 정지하거나 진행하도록 한다.
- 접촉 여유와 제한된 반복을 적용하고 처리 한도를 넘으면 마지막 안전 자세를 유지한다.
- 확정된 실제 이동 방향을 따라 차체 각도를 부드럽게 정렬한다.
- 회전이 막혀도 유효한 이동은 유지하고, 이동이 없을 때 입력 방향의 안전한 제자리 회전을 허용한다.
- 궤도 애니메이션의 실제 이동량 사용, 모듈의 최종 차체 각도 사용과 일시정지 규칙을 유지한다.
- 회전 속도, 접촉 여유와 반복 한도는 기존 `vehicle-motion.json`에 필요한 값만 추가한다.

### 주요 변경 대상

- `src/entities/Vehicle.ts`, `src/entities/Vehicle.test.ts`
- `src/core/TerrainGrid.ts`의 접촉 결과
- `src/data/vehicle-motion.json`
- 필요 시 `src/core/Game.ts`의 최종 자세 기반 Camera 및 입력 연결부

### 완료 기준

- 직선 벽에서 접촉점보다 불필요하게 일찍 멈추지 않고 허용된 벽면 이동을 유지한다.
- 대칭 코너에서 축 순서에 따른 편향, 떨림과 순간 속도 증가가 없다.
- 코너와 좁은 입구에서 이동과 회전이 서로 기다리는 정체가 없다.
- 막힌 안쪽 코너에서는 안정적으로 멈추고 후진으로 나올 수 있다.

커밋: `fix(plan 27.4): smooth tank wall sliding and corner turns`

## 27.5 — 실제 네 지역의 이미지·경계 전환

상태: 완료

### 작업 순서

1. `aurelia/landing-zone`: 넓은 광장과 진입로, 드문 언덕.
2. `aurelia/relay-fields`: 선형 길, 교차로와 선택 가능한 우회로.
3. `cinder/ash-basin`: 비대칭 언덕과 긴 우회로.
4. `cinder/core-ruins`: 밀도 높은 폐허와 복수 통로.

### 지역별 작업

- 기존 이미지의 색감과 분위기를 참고해 실제 윤곽에 맞는 완성 맵을 편집·재제작한다.
- 시작/스폰, 탱크 주요 통로, 코너의 회전 공간과 픽업 접근성을 함께 조정한다.
- 각 지역의 이미지와 윤곽 overlay, 탱크 주행, 적 경로, 탄환/LOS와 기존 웨이브 흐름을 확인한 후 다음 지역으로 넘어간다.
- 개발 실행에서 실제 지역도 경계 overlay를 켤 수 있게 하되 일반 플레이에서는 기본 off로 유지한다.
- 다섯 맵 전환 후 더 이상 참조하지 않는 hill tile, 필수 terrain asset 계약과 구형 row 판정 경로를 정리한다. 다른 화면에서 사용하는 asset은 유지한다.
- 새 이미지의 manifest, 제작 이력과 검증 기록을 갱신한다.

### 주요 변경 대상

- `src/data/maps.json`, `src/data/assets.json`
- `public/assets/game/maps/`의 네 지역 완성 이미지
- `src/core/MapDefinitionLoader.ts`, `src/core/Game.ts` 및 관련 테스트
- `scripts/qa-art.mjs`, `docs/art-asset-provenance.md`

### 완료 기준

- 다섯 맵 모두 완성 이미지와 명시적인 지형 윤곽을 사용한다.
- 보이는 통로가 실제 차체로 통과 가능하고 시작/스폰·회전 공간 검증을 통과한다.
- 지역별 분위기와 기존 웨이브·전투·캠페인 수치를 유지한다.

커밋: `feat(plan 27.5): migrate campaign artwork and terrain outlines`

## 27.6 — 통합 회귀와 실제 플레이 검증

### 자동 검증

- 지형 데이터 검증, 정확한 접촉 위치, 이동·회전 비관통과 월드 경계.
- 내부 접합부, 안쪽·바깥쪽 코너, 좁은 입구와 좌우 대칭 이동.
- 30/60/120fps 입력 재생과 큰 frame delta에서 비관통 및 경로 완료.
- 적 반지름을 포함한 경로 구간과 스폰 도달 가능성, direct/arc 최초 접촉 및 LOS.
- `npm test`, `npm run qa:art`, `npm run build`.

### 실제 플레이 검증

- `npm run dev` 또는 이미 실행 중인 서버에서 테스트 맵과 실제 네 지역을 확인한다.
- 각 맵의 대표 경계 오차, 카메라 이동 중 정렬과 배경 반복 여부를 확인한다.
- 정면·대각선 주행, 코너 회전, 협로 진입, 후진과 월드 외곽을 직접 조작한다.
- 모듈 설치, 사격 각도, 궤도 애니메이션, Camera 추적과 pointer 변환을 확인한다.
- PAUSED 중 설치·업그레이드 가능, 이동·회전·전투·생산·수집 정지를 확인한다.
- 테스트 맵의 캠페인 제외, 실제 지역 클리어 및 다음 지역 해금 흐름을 확인한다.
- 최대 웨이브의 적 이동과 카메라 스크롤 성능을 확인한다.

### 검증 기록과 완료 기준

- `docs/plan-27-verification.md`에 실행 명령과 결과, 실제 주행한 맵/구간, 대표 경계 화면, 코너 재현 결과, 발견한 문제와 수정 내용을 기록한다.
- 실행하지 않은 시나리오나 웨이브는 통과했다고 기록하지 않는다.
- 보이는 벽은 막히고 열린 바닥에는 설명되지 않는 충돌이 없어야 한다.
- 차체 비관통, 부드러운 코너 이동, 공통 지형 판정과 기존 게임 흐름이 모두 검증되어야 Plan 27을 완료한다.

커밋: `test(plan 27.6): verify map alignment and terrain interactions`
