# Plan 15: 현대 화기 탱크

작성일: 2026-09-14

상태: 구현 완료 (runtime QA 환경 BLOCKED)

설계 문서: [Plan 15 현대 화기 탱크 설계](../../../docs/superpowers/specs/2026-09-14-plan-15-modern-firearms-tank-design.md)

## 요구사항 및 범위

현재 `starter` 탱크에 현대 화기 9종을 추가한다.

- 기존 `machine-gun-12.7mm`을 12.7mm 중기관총으로 현대화한다.
- 기존 `mortar-60mm`을 60mm 박격포로 현대화한다.
- 20mm 기관포, 30mm 대공포를 추가한다.
- 76mm·90mm 강선포, 120mm 활강포를 추가한다.
- 105mm·155mm 곡사포를 추가한다.
- 기관총은 360°/1×1, 전차포는 30°/1×2, 곡사포는 45°/2×2이며 박격포만 1×1이다.
- 기관총은 탄창 연사와 다중 적 관통을 사용한다.
- 전차포는 최소 사거리, 직선 관통, 목표 지점 또는 차단 지점 폭발을 사용한다.
- 곡사포는 최소 사거리, 곡사 탄도와 목표 지점 범위 폭발을 사용한다.
- 기관총은 재장전 시 ammo 1개를 소비하고, 12.7mm/20mm/30mm 순서로 20발/15발/10발을 발사한다. 전차포·곡사포는 발사당 ammo 1개를 소비한다.
- 자원별 최대 저장량은 `src/data/resources.json`에서 설정하고 `ResourceStorage`가 기본 설정으로 읽는다.
- 적 Standard/Tanker에 장갑을 추가하고, `penetration > armor`일 때만 피해를 준다.
- 관통 성공 후 남은 관통력은 대상 장갑만큼 줄어든다.
- 모든 무기는 고유 module body와 발사 sound ID를 사용한다.
- Armory 연구 lane, 구매 stock, 설치 흐름과 기존 ammo 자원 경제를 유지한다.

### 제외

- 새 탱크 차체, 새 적 종류, 수동 조준
- 화염·전격·빔·미사일 계열
- 전역 ammo 생산/저장 규칙 변경
- 차량 장갑판 규칙 변경

## 구현 순서

1. 데이터 계약과 9종 starter 무기 JSON, 적 armor, Armory 연구 연결
2. `UpgradeManager`의 Armory 비배타 lane 지원 및 Armory/HUD 표시
3. `CombatModule` 공통 탄창·재장전·최소거리·무기별 asset/sound 연결
4. 관통 직사탄, 전차포 직사 폭발탄, 장갑 적용 곡사 폭발탄
5. `EnemySpatialIndex` 원형/선분 후보 검색과 Game combat index 연결
6. runtime recoil/FX, assets/audio manifest와 procedural sound 추가
7. 단위 테스트, runtime fixture, art/audio/build QA

## 변경 대상

### 데이터·로더

- `src/data/resources.json`
- `src/data/enemies.json`
- `src/data/tanks/starter/machine-gun-12.7mm.json`
- `src/data/tanks/starter/mortar-60mm.json`
- `src/data/tanks/starter/machine-gun-20mm.json`
- `src/data/tanks/starter/machine-gun-30mm.json`
- `src/data/tanks/starter/tank-gun-76mm.json`
- `src/data/tanks/starter/tank-gun-90mm.json`
- `src/data/tanks/starter/tank-gun-120mm.json`
- `src/data/tanks/starter/howitzer-105mm.json`
- `src/data/tanks/starter/howitzer-155mm.json`
- `src/core/TankDefinitionLoader.ts`
- `src/core/ProgressionManager.ts`

### 런타임·UI

- `src/core/ResourceStorage.ts`
- `src/core/UpgradeManager.ts`
- `src/core/ArmoryManager.ts`
- `src/entities/Enemy.ts`
- `src/entities/Module.ts`
- `src/entities/Projectile.ts`
- `src/core/EnemySpatialIndex.ts`
- `src/core/Game.ts`
- `src/core/AudioManager.ts`
- `src/ui/HUDManager.ts`

### 자산·검증

- `src/data/assets.json`
- `src/data/audio.json`
- `public/assets/game/tank/`의 9개 module body
- `public/assets/game/ui/`의 9개 module icon
- 관련 `*.test.ts`
- `src/core/GameTestScenario.ts` 및 observer fixture가 필요한 경우
- `plans/implementation/progress.md`

## 데이터 및 밸런스 기준

적 장갑은 Standard 10, Tanker 40이다. 승인된 1차 무기 기준값은 설계 문서의 표를 그대로 사용하며, 거리 px와 시간 초 단위를 유지한다. 기관총 탄창은 12.7mm 20발, 20mm 15발, 30mm 10발이며 재장전마다 ammo 1개를 사용한다.

새 combat definition에는 `weaponClass`, `moduleAssetId`, `fireSoundId`, `fireEffectId`와 `minRange`, `penetration`, `magazineSize`, `reloadTime` stats를 추가한다. `fireRate`는 탄창 내 발사 간격이며 단발 무기는 0, `magazineSize`는 1이다.

## 테스트 시나리오

### Required 단위/통합

- loader가 9종을 읽고 class, 크기, 사격각, stats와 asset/sound 참조를 검증한다.
- enemy armor 누락/음수 검증과 기존 적 데이터 회귀를 확인한다.
- Armory 세 lane 동시 연구, lane 내부 선행 노드와 일반 업그레이드 배타 분기를 확인한다.
- 장갑 이하 관통력은 피해 없이 정지하고, 초과 관통력은 피해와 장갑 차감을 수행한다.
- 한 발이 경로상의 여러 적을 거리순으로 관통하고 같은 적을 반복 적중하지 않는다.
- 전차포 직선 관통·지형 차단 폭발·목표 폭발과 곡사포 지형 통과 폭발을 확인한다.
- 최소 사거리, 사격각, ammo 부족, 탄창 소진과 재장전을 확인한다.

### Required runtime fixture

- Armory에서 세 lane을 연구하고 9종을 구매/설치할 수 있어야 한다.
- 표준/탱커와 직선 복수 적을 배치해 armor/penetration 결과를 관측한다.
- 최소거리 안팎과 사격각 안팎의 적을 배치한다.
- 120 active enemy와 다중 발사체 성능 fixture에서 지속적인 50ms 이상 frame spike가 없어야 한다.

### 명령

```text
npm test
npm run qa:art
npm run qa:audio
npm run build
npm run dev
```

runtime QA는 AGENTS.md의 `integration-tester` 계약에 따라 실제 URL, port, worktree, 고유 runtimeId와 위 fixture/timeout을 전달한다. 성능 문제가 재현되면 armor 비교를 제거하고 고정 `maxPenetrationTargets` 기반 다중 관통만 남기는 승인된 fallback을 적용한다.

## 완료 기준

- 모든 데이터가 로드·검증되고 9종이 Armory에 표시된다.
- 9종의 점유 크기·사격각·최소거리·탄창/재장전·피해/사거리/폭발범위가 승인값과 일치한다.
- armor/penetration 및 다중 관통이 승인 규칙대로 동작한다.
- 고유 외형·발사음·계열별 FX·반동이 표시된다.
- 단위 테스트, art/audio QA, build와 required runtime QA가 통과한다.
- 구현 결과와 fallback 적용 여부를 `plans/implementation/progress.md`에 기록한다.
