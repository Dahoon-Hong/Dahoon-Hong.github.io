# Implementation Progress

구현 전 대상 plan directory와 이 기록을 확인하고, 구현 후 같은 형식으로 진행 내용을 추가한다.

| 날짜 (yyyy-mm-dd) | plan dir | 진행내용 |
| --- | --- | --- |
| 2026-09-10 | plans/implementation/1-core-gameplay/ | 기존 00~07을 1.1~1.8 세부 plan으로 정리하고 구현 진행 추적을 시작한다. |
| 2026-09-10 | plans/implementation/2-design-art/ | 기존 10~19를 2.1~2.9 세부 plan으로 정리하고 공통 art 계약부터 진행한다. |
| 2026-09-10 | plans/implementation/3-sound/ | 기존 20~22를 3.1~3.2 세부 plan으로 정리하고 라이선스·효과음·배경음악 순서를 유지한다. |
| 2026-09-10 | plans/implementation/4-gameplay-expansion/ | 기존 25.1~25.4를 4.1~4.4로 정리하고 월드·이동·Armory·모듈 배치 순서를 유지한다. |
| 2026-09-10 | plans/implementation/5-terrain-world-map/ | 기존 26.1~26.9를 5.1~5.9로 정리하고 지형·메뉴·월드맵·통합 회귀 순서를 유지한다. |
| 2026-09-10 | plans/implementation/6-map-art-terrain/ | 기존 27.1~27.6을 6.1~6.6 세부 plan으로 분리하고 맵 이미지·지형·차체 상호작용을 추적한다. |
| 2026-09-11 | plans/implementation/7-map-tile-terrain/ | 1번 맵을 18px tile rows 기반 160x120 지형으로 전환하고, 4개 enemy spawn marker·숨은 tank start·아트 정렬 QA·실제 브라우저 통합 검증(PASS)까지 7.1~7.10을 완료했다. |
| 2026-09-11 | plans/implementation/7-map-tile-terrain/ | 7.11에서 1번 맵 탱크 terrain hitbox를 3 tile 폭 수준으로 축소하고 좁은 연결부를 1 tile 확장했으며, 자동 QA와 실제 브라우저 검증(PASS)을 완료했다. |
| 2026-09-11 | plans/implementation/7-map-tile-terrain/ | 7.11.8에서 map1 terrain hitbox를 0.45(약 2.7 tile)로 완화하고 중심선 오차 통로 회귀 테스트를 추가했다. `npm run qa:release`는 45 tests/QA/build/audio 모두 통과했으며, 통합 QA는 REGION CLEARED 전환으로 실제 통로 완료 검증이 BLOCKED였다. |
| 2026-09-12 | plans/implementation/7-map-tile-terrain/ | 7.11-B1에서 map1 tank terrain hitbox를 원형으로 전환하고 corner clearance·열린 방향 이동 회귀 테스트, loader/아트 계약과 F3 원형 overlay를 추가했다. `npm run qa:release`는 47 tests/QA/build/audio 통과, 로컬 Computer Use는 이동·원형 판정·콘솔 오류 없음 확인, 공식 integration-tester는 키 입력 이동 관찰 불가로 BLOCKED라 원격 PR 갱신은 보류한다. |
