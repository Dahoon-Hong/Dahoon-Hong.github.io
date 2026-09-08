# Plan 27 검증 기록

검증일: 2026-09-08

## 자동 검증

| 명령 | 결과 |
| --- | --- |
| `npm test` | 통과: 11개 파일, 37개 테스트 |
| `npm run qa:art` | 통과: 오류 0개, 기존 경고 2개 (galaxy 이미지 프레임 크기, unlisted `grid-core.png`) |
| `npm run build` | 통과: TypeScript와 Vite production build 완료 |
| `npm run dev -- --host 127.0.0.1 --port 5181` | Vite ready, root HTTP 200 |
| 개발 서버의 `aurelia-relay-fields-map.png` 요청 | HTTP 200, 7,219,090 bytes |

`MapDefinitionLoader` 테스트는 다섯 맵의 명시적 region 수를 확인한다: Aurelia landing-zone 3개, relay-fields 4개, Cinder ash-basin 4개, core-ruins 7개, terrain-test 11개. 모든 맵은 2880x2160 artwork metadata와 같은 월드 크기의 배경 manifest draw box를 사용한다.

`TerrainGrid` 테스트는 영역 내부 접합, polygon footprint·radius·raycast, 회전 사각형, 월드 경계, 구간 스윕을 확인한다. `Vehicle` 테스트는 전체 차체 회전, 큰 frame delta, 벽 슬라이드, 막힌 코너의 정지·후진, 30/60/120fps 경로 안정성을 확인한다. 적 경로와 projectile 테스트는 공통 `TerrainGrid` 판정을 계속 사용한다.

## 이미지와 경계 확인

`scripts/generate-test-terrain-map.ps1`와 `scripts/generate-campaign-terrain-maps.ps1`로 생성한 PNG 축소 미리보기를 로컬 이미지 뷰어로 확인했다. 다섯 이미지의 표시 hill 윤곽은 `maps.json` polygon과 같은 36px 셀 경계를 사용하고, runtime에서 hill sprite·tile·prop를 장애물처럼 반복 렌더링하지 않는다.

## 실제 브라우저 플레이 검증

개발 서버를 `npm run dev -- --host 127.0.0.1 --port 5182`로 실행하고 로컬 Chrome의 실제 캔버스 런타임을 조작했다. Computer Use 브라우저 공급자가 이 세션에서 `browsers: []`로 반환되어 연결되지 않았기 때문에, 동일한 로컬 페이지에 Chrome DevTools Protocol 입력을 보내고 캔버스 프레임을 PNG로 캡처하는 방식으로 검증했다. 테스트용 `window.__game` 노출과 CDP 스크립트는 검증 후 삭제했다.

### 테스트 맵 진입과 정지 화면

- 시작 메뉴에서 `Enter`로 월드맵을 열고 `ArrowLeft`로 `TEST RANGE // TERRAIN`을 선택한 뒤 `Enter`로 `test/terrain-test`에 진입했다.
- `F3` 디버그 overlay에서 이미지 위에 실제 polygon 경계와 회전 차체 사각형이 함께 표시되는 것을 확인했다. 테스트 맵은 별도 hill sprite나 반복 바위 오브젝트 없이 배경 이미지로 렌더링됐다.
- `Escape`로 `GAME PAUSED` 메뉴를 열고, `Escape`로 재개했다. 일시정지 화면에서 `ArrowDown` 후 `Enter`로 `ABANDON RUN`을 선택하면 월드맵으로 돌아갔다.

### 벽 접촉·슬라이드·코너 주행

테스트 맵 시작 위치는 `(1458, 1098)`, 차체 terrain footprint 반경은 가로·세로 각각 `60px`이었다. `hill-5` 왼쪽 경계(`x=1872`)를 향해 `D`를 누른 결과 다음을 확인했다.

| 조작 | 관찰 결과 |
| --- | --- |
| 직선으로 벽 접근 | `(1811.9997, 1098.0477)`에서 정지. `isTerrainPositionValid=true`, `isBlockedOrientedRect=false`로 벽 안쪽으로 들어가지 않음 |
| 같은 방향으로 추가 `D` 입력(약 0.8초) | 위치가 그대로 유지되고 유효 상태 유지. 벽 관통 없음 |
| 벽 접촉 상태에서 `D+S`(약 1초) | `x=1811.9997` 유지, `y=1225.3269`까지 이동. 벽면 접선 방향으로 슬라이드 |
| 코너를 지나도록 `D+S` 추가(약 1.2초) | `(1875.6393, 1380.1621)`까지 이동하고 회전각 `2.356rad`에서 유효 상태 유지. 코너에서 정지하지 않고 열린 바닥으로 전환 |

각 단계의 스크린샷은 디버그 overlay와 일시정지 메뉴가 표시된 캔버스 프레임으로 확인했다. 따라서 정면 관통 방지, 벽면 슬라이드, 코너 회전의 실제 입력 경로를 자동 테스트와 별도로 재현했다.

### 캠페인 맵 진입

- 월드맵의 첫 노드 `aurelia/landing-zone`을 실제 키 입력으로 선택해 진입했다.
- 시작 차체 `(1458, 1098)`에서 `isTerrainPositionValid=true`, region 수 `3`을 확인했다.
- 일시정지 해제 후 배경 이미지가 실제 플레이 화면을 채우고 차체가 카메라 중앙에 표시되는 프레임을 캡처했다. 짧은 실행 중 wave 1이 시작되는 것도 확인했다.

## 검증 범위와 남은 수동 항목

개발 서버와 실제 캔버스 조작으로 핵심 테스트 맵 상호작용과 캠페인 첫 맵 진입은 확인했다. 다음 항목은 이번 실행에서 끝까지 진행하지 않았으므로 통과로 기록하지 않는다.

- `aurelia/relay-fields`, `cinder/ash-basin`, `cinder/core-ruins`에서의 대표 주행과 각 맵의 협로·월드 외곽.
- 최대 wave까지의 적 경로, direct/arc 사격과 LOS, pointer 변환 및 장시간 Camera 추적.
- PAUSED 상태에서 모듈 설치·업그레이드 가능 여부와 생산·수집·전투의 완전 정지.
- 실제 지역 클리어와 다음 지역 해금 저장 흐름.
