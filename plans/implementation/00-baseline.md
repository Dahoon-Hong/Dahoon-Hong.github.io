# 구현 계획 기준선

## 재설계 이후 실행 기준

06.5에서 기존 구현 점검과 모듈·전투 그리드 재설계를 함께 수행한다. 실제 실행 순서는 `06.5(재설계 포함) → 07 → 99 → 100`이다.

- 탱크별 조립도는 `src/data/tanks/<tankId>/module.json`으로 관리한다.
- 모듈별 수치와 업그레이드 선택지는 같은 디렉터리의 `<moduleId>.json`으로 관리한다.
- 전투 모듈만 그리드에 설치하고, 나머지는 탱크 생성 시 활성화된 내장 시스템으로 시작한다.

## 목적

`plans/concept.md`, `plans/system.md`, `plans/user_guide.md`를 기준으로 게임을 단계적으로 구현한다. 각 단계는 이전 단계가 동작하는 상태에서 시작하며, 한 단계의 완료 조건을 확인한 뒤 다음 단계로 넘어간다.

## 개발 원칙

- 1단계 목표는 TypeScript + HTML5 Canvas 기반의 와이어프레임이다.
- 한 단계에서는 하나의 플레이 경험 또는 시스템만 완성한다.
- 새 기능을 추가하기 전에 현재 기능의 빌드와 플레이 가능 여부를 확인한다.
- 수치와 규칙은 코드에 흩어 놓지 말고 해당 시스템의 설정으로 모은다.
- 탱크별 조립도는 `src/data/tanks/<tankId>/module.json`, 모듈별 수치와 선택지는 같은 디렉터리의 `<moduleId>.json`으로 관리한다.
- 전투 모듈만 그리드에 설치하며, 나머지 기능은 탱크 생성 시 활성화된 내장 시스템으로 시작한다.
- 아직 필요하지 않은 행성 저장, 픽셀 아트, 복잡한 모듈 연결은 뒤 단계로 미룬다.
- 각 단계가 끝나면 `npm run build`와 수동 플레이 검증을 실행한다.

## 현재 코드 기준

- Vite + TypeScript 프로젝트이며 Canvas 크기는 1280x720이다.
- `Game.ts`가 게임 루프, 상태, 자원, 적, 발사체를 관리한다.
- `Vehicle.ts`는 3x3 격자와 코어·자원 생산기·직사 무기를 생성한다.
- `Module.ts`에는 코어, 자원 생산기, 직사 무기, 곡사 무기가 있다.
- `Projectile.ts`에는 직선 발사체와 포물선 발사체가 있다.
- `WaveManager.ts`는 화면 가장자리에서 적을 생성하고 웨이브를 증가시킨다.
- `HUDManager.ts`는 모듈 선택, 설치, 업그레이드, 상태 표시를 담당한다.

## 알려진 기준선의 한계

- 코어를 제외한 모듈에는 공통 HP가 없다.
- `VICTORY` 상태가 선언되어 있지만 마지막 웨이브 승리 전환이 연결되지 않았다.
- 자원은 단일 숫자이며 수집기·재활용기·무기고·저장고·탄약은 없다.
- 탈것은 동력 장치나 무한궤도 없이 8방향 속도 이동을 사용한다.
- 방어 모듈, 장갑, 사격 각도, 행성 간 진행 보존은 없다.
- 재시작하면 코어·모듈·자원이 초기화된다.

## 단계 목록

1. [01-playable-loop.md](01-playable-loop.md) - 한 지역을 끝까지 플레이할 수 있는 루프
2. [02-module-foundation.md](02-module-foundation.md) - 모듈 공통 상태와 격자 기반
3. [03-combat-mvp.md](03-combat-mvp.md) - 직사·곡사 전투의 최소 규칙
4. [04-resource-collection.md](04-resource-collection.md) - 자원 획득과 저장
5. [05-production-and-logistics.md](05-production-and-logistics.md) - 자원 가공, 탄약, 운송
6. [06-mobility-defense.md](06-mobility-defense.md) - 기동 모듈과 방어 판정
7. [06.5-mid-term-review.md](06.5-mid-term-review.md) - 기존 구현 점검과 모듈·전투 그리드 재설계
8. [07-progression-content.md](07-progression-content.md) - 탱크 콘텐츠, 적, 지역·행성 진행
99. [99-ui-tutorial-polish.md](99-ui-tutorial-polish.md) - 업그레이드 그래프 튜토리얼과 사용자 경험
100. [100-release-verification.md](100-release-verification.md) - 새 구조 기준 밸런스와 배포 전 검증

## 공통 완료 조건

- 해당 단계의 완료 기준을 수동으로 재현할 수 있다.
- `npm run build`가 성공한다.
- 기존 단계의 완료 조건이 깨지지 않는다.
- 문서와 실제 조작이 다르면 다음 단계 전에 문서를 갱신한다.
