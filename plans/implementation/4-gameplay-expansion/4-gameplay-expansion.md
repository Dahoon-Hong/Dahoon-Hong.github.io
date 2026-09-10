# 4. 게임성 확장

## 목적

기존 화면 중심 전투를 확장 월드, 카메라 추적, 탱크 이동 애니메이션, Armory, 모듈 배치와 사격각으로 확장한다. 세부 plan은 기존 Plan 4.1~4.4의 범위와 완료 기준을 유지하며 4.1부터 순서대로 진행한다.

## 선행 계획

- [1.1 플레이 가능한 게임 루프](../1-core-gameplay/1.1-playable-loop.md)
- [1.8 진행과 콘텐츠](../1-core-gameplay/1.8-progression-content.md)
- [게임성 확장 설계 명세](../../../docs/superpowers/specs/2026-09-06-plan-25-gameplay-expansion-design.md)

## 실행 순서

1. [4.1 월드 확장과 카메라](4.1-world-expansion-camera.md)
2. [4.2 탱크 방향과 이동 애니메이션](4.2-tank-movement-animation.md)
3. [4.3 Upgrade Web Armory](4.3-armory-upgrade-web.md)
4. [4.4 모듈 회전·드래그 배치·사격각](4.4-module-placement-and-firing-arc.md)

## 완료 기준

- 확장 월드와 카메라 좌표 변환이 gameplay와 HUD를 분리한다.
- 탱크 방향·이동 애니메이션이 실제 이동과 일치한다.
- Armory 구매와 모듈 배치, 사격각 preview가 같은 데이터 계약을 사용한다.
- npm run build와 관련 수동 QA를 통과한다.
