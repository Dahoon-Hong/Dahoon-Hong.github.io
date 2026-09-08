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

## 검증 범위와 남은 수동 항목

개발 서버가 모든 월드 이미지와 앱 shell을 제공하는 것까지 확인했다. 이 실행에서는 브라우저 캔버스를 직접 조작하는 수동 플레이를 수행하지 않았으므로 다음 항목은 수동 확인 대상으로 남긴다.

- 각 지역에서 정면·대각선 주행, 안쪽·바깥쪽 코너, 좁은 입구, 후진과 월드 외곽을 직접 조작한다.
- 최대 웨이브의 적 경로, direct/arc 사격과 LOS, Camera 추적, pointer 변환을 확인한다.
- PAUSED 중 설치·업그레이드만 가능하고 이동·회전·전투·생산·수집이 멈추는지 확인한다.
- 실제 지역 클리어와 다음 지역 해금 흐름을 확인한다.
