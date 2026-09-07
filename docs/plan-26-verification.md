# Plan 26 verification

검증 기준일: 2026-09-07 (Asia/Seoul)

## 구현 범위

Plan 26.1~26.8을 순서대로 반영했다. 지형 데이터와 TerrainGrid, tank collision, radius-aware A*, map-defined spawn, terrain raycast/LOS, `test/terrain-test`, 시작 메뉴/설정, galaxy world map, localStorage 진행도, 네 실제 지역 explicit terrain 전환을 포함한다.

## 자동 검증

실행 위치: `C:\Users\slaye\ws\local_game`

| 명령 | 결과 |
| --- | --- |
| `npm test` | 통과, 27 tests |
| `npm run qa:art` | 통과, manifest 77 entries, 오류 0 |
| `npm run qa:audio` | 통과, approved procedural entries 7 |
| `npm run build` | 통과, TypeScript 및 Vite production build |
| `npm run qa:release` | 위 네 검증을 한 번에 통과 |

Art QA의 기존 미등록 `public/assets/game/tank/grid-core.png` 경고와 generated raster의 logical draw box 차이 경고는 오류가 아니다. runtime은 manifest draw box를 기준으로 36px terrain과 1280×720 world map에 맞춰 렌더링한다. Aurelia/test hill과 Cinder hill은 별도 manifest ID와 runtime PNG를 사용한다.

## 자동 커버리지

- 모든 5개 map의 `36 × 80 × 60` world/row/legend/asset 참조 및 spawn 경로 검증
- tank open/hill collision, wall sliding, world boundary, 큰 frame delta 관통 방지
- standard/tanker radius-aware A*, corner cutting 금지, no-route 정지/retry, spawn 순환 및 repath 분산
- 수평/수직/대각선 terrain raycast, direct/arc 첫 terrain hit, enemy hit 우선순위, LOS 기반 target 선택
- test map의 6/0, 8/2, 10/4 fixed waves 및 campaign 제외
- START_MENU/SETTINGS keyboard 전환, progress storage 정상·손상·접근 실패·save 실패 fallback
- world map chain, first/next/cleared/locked/test node 상태

## 수동 브라우저 검증

개발 서버 `npm run dev -- --host 127.0.0.1`와 Codex In-app Browser에서 확인했다.

- 새로고침 시 시작 메뉴가 먼저 표시되고, 전투 simulation은 시작되지 않았다.
- SETTINGS pointer 진입 및 Escape 복귀, music 40% / SFX 80% / reduced effects 표시를 확인했다.
- GAME START에서 galaxy background가 전체 Canvas에 표시되고, 첫 지역/test node만 초기 선택 가능했다.
- 잠금 node keyboard 선택 시 `NODE LOCKED // CLEAR THE PREVIOUS REGION`만 표시되고 전투는 시작되지 않았다.
- Landing Zone과 `terrain-test`를 각각 node에서 선택해 새 runtime이 생성되는 것을 확인했다.
- `terrain-test`에서 F3 grid/blocked cell/tank footprint/enemy path overlay와 wave 1 `6 HOSTILES`를 확인했다.
- SPACE pause 후 `STATUS PAUSED`와 `SPACE RESUME` 표시, retry 후 fresh runtime reset을 확인했다.
- browser console error/warning 없음.

## 저장소 검증

`CampaignProgressStore.test.ts`에서 정상 JSON, unknown/duplicate/test ID 제거, 손상 또는 접근 불가 storage의 memory fallback, save 실패 후 in-memory progress 유지를 확인했다. 실제 캠페인 clear 시 test map을 제외한 map ID만 in-memory 목록에 추가하고 비동기 저장을 시도한다.

## 범위 제외

- Steam/cloud merge, 인증, conflict resolution
- 새 UI framework 또는 screen-reader DOM overlay
- worker/flow-field/path cache 등 profiling 전 최적화
- 네 지역의 전체 wave를 브라우저에서 끝까지 수동 클리어하는 장시간 시나리오

최종 회귀 검증 커밋: 이 문서를 포함한 `test(plan-26.9)` 커밋.
