# 5. 지형·월드맵

## 목적

지형 데이터와 TerrainGrid를 기준으로 탱크·적·투사체의 충돌을 통합하고, 테스트 맵·시작 메뉴·월드맵·캠페인 진행 저장·실제 지역 전환을 연결한다. 세부 plan은 기존 Plan 5.1~5.9를 5.1부터 순서대로 정리한 것이다.

## 선행 계획

- [4.4 모듈 회전·드래그 배치·사격각](../4-gameplay-expansion/4.4-module-placement-and-firing-arc.md)
- [지형·월드맵·지역 선택 설계 명세](../../../docs/superpowers/specs/2026-09-07-plan-26-terrain-world-map-design.md)

## 실행 순서

1. [5.1 지형 데이터 계약과 TerrainGrid](5.1-terrain-data-and-grid.md)
2. [5.2 탱크 지형 충돌](5.2-tank-terrain-collision.md)
3. [5.3 적 A* 경로 탐색과 스폰](5.3-enemy-pathfinding-and-spawn.md)
4. [5.4 탄환 지형 충돌과 시야 차단](5.4-projectile-terrain-line-of-sight.md)
5. [5.5 terrain-test 맵과 art](5.5-terrain-test-map-and-art.md)
6. [5.6 시작 메뉴와 설정](5.6-start-menu-and-settings.md)
7. [5.7 은하계 월드맵과 진행도 저장](5.7-world-map-and-progress-storage.md)
8. [5.8 실제 지역 지형 전환](5.8-production-map-terrain-migration.md)
9. [5.9 지형·메뉴·월드맵 통합 회귀](5.9-terrain-integration-regression.md)

## 완료 기준

- 탱크·적·투사체가 같은 지형 판정과 데이터 계약을 사용한다.
- 시작 메뉴에서 월드맵, 테스트 맵, 실제 지역, 진행도 저장 흐름이 연결된다.
- 6번 맵 아트·지형 상호작용 plan이 사용할 정렬·충돌 기준이 고정된다.
- npm test, npm run build, 관련 수동 QA를 통과한다.
