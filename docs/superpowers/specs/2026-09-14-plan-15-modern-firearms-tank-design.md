# Plan 15: 현대 화기 탱크 설계

작성일: 2026-09-14

상태: 설계 확정, 문서 검토 대기

관련 문서:

- `plans/backlog`
- `docs/adding-content/weapon-modules.md`
- `docs/adding-content/tanks.md`
- `docs/superpowers/specs/2026-09-06-plan-25-gameplay-expansion-design.md`
- `plans/implementation/4-gameplay-expansion/4.3-armory-upgrade-web.md`
- `plans/implementation/4-gameplay-expansion/4.4-module-placement-and-firing-arc.md`

## 1. 목표

현재 `starter` 탱크에 현대 화기 컨셉의 전투 모듈 9종을 제공한다. 기존 직사·곡사 모듈의 ID와 시작 흐름은 유지하되, 무기별 구경 차이, 사격각, 모듈 크기, 최소 사거리, 범위 공격, 관통력, 적 장갑, 탄창과 재장전, 고유 외형·발사음·발사 연출을 구현한다.

핵심 목표는 다음과 같다.

1. 기관총·전차포·곡사포의 전투 역할을 수치와 공간 제약으로 분명히 나눈다.
2. 발사체 관통력과 적 장갑을 일관된 피해 규칙으로 처리한다.
3. 구경이 커질수록 발사 간격과 재장전 시간이 늘고, 피해·사거리·폭발범위가 커지도록 한다.
4. Armory 연구 → 구매 → 격자 설치 흐름과 기존 `UpgradeManager`·탄약 경제를 유지한다.
5. 적이 많은 상황에서도 발사체마다 전체 적 배열을 순회하지 않도록 경로 후보를 공간 인덱스로 줄인다.

## 2. 범위

### 포함

- `starter` 탱크의 현대 화기 9종
- 기존 `machine-gun-12.7mm`의 12.7mm 중기관총 현대화
- 기존 `mortar-60mm`의 60mm 박격포 현대화
- 20mm 기관포와 30mm 대공포
- 76mm·90mm 강선포와 120mm 활강포
- 105mm·155mm 곡사포
- 적 정의와 런타임의 `armor`
- 장갑-관통력 비교와 다중 적 관통
- 전차포의 직선 관통 후 목표 지점 폭발
- 곡사포의 최소 사거리와 목표 지점 폭발
- 무기별 탄창 잔량과 재장전 상태
- Armory 연구 lane, 구매 비용, 모듈별 고유 외형과 발사음
- 관통 발사체의 공간 후보 검색과 성능 검증
- 단위 테스트, asset/audio QA, 실제 runtime QA

### 제외

- 새 탱크 차체나 탱크 선택 UI
- 화염·전격·빔·레일건·드론·궤도포격·미사일
- 적의 원거리 공격과 새 적 종류
- 수동 조준 또는 수동 발사
- 전역 ammo 생산·저장 경제의 재설계
- 차량 장갑판의 방향별 보호 영역 변경
- 계정 단위 영구 연구와 세이브 슬롯
- 새 대형 맵이나 장애물 시스템

## 3. 확정된 게임 규칙

### 3.1 무기 분류

| 분류 | `behavior` | `weaponClass` | 사격각 | 점유 크기 | 역할 |
| --- | --- | --- | ---: | ---: | --- |
| 기관총류 | `direct` | `machine-gun` | 360° | 1×1 | 빠른 단일탄, 직선 다중 관통 |
| 전차포류 | `direct` | `tank-gun` | 30° | 1×2 | 최소 사거리, 직선 관통, 착탄 폭발 |
| 곡사포류 | `arc` | `howitzer` | 45° | 2×2 | 최소 사거리, 곡사, 폭발 범위 |

60mm 박격포만 1×1이며 `weaponClass: "howitzer"`로 처리한다.

### 3.2 장갑과 관통력

적 정의에 다음 초기 장갑을 추가한다.

- Standard: 기존 `hp: 45` 유지, `armor: 10`
- Tanker: 기존 `hp: 160` 유지, `armor: 40`

발사체는 `remainingPenetration`을 가진다.

```text
remainingPenetration = projectile.penetration

직선 경로의 적을 가까운 순서로 검사:
  remainingPenetration <= enemy.armor
    피해 없음
    발사체 정지

  remainingPenetration > enemy.armor
    enemy.takeDamage(projectile.damage)
    remainingPenetration -= enemy.armor
    발사체 계속 진행
```

- 관통력과 장갑이 같은 경우도 관통 실패다.
- 기관총은 관통 실패 지점에서 소멸한다.
- 전차포는 관통 실패 지점에서 폭발한다. 경로가 끝까지 열려 있으면 발사 시점에 고정한 목표 지점에서 폭발한다.
- 관통 성공 시 피해량은 줄이지 않고 관통력만 대상 장갑만큼 차감한다.
- 전차포 폭발의 각 피해 대상은 폭발 시점의 남은 관통력을 독립적으로 비교한다. 폭발 범위 안의 적끼리 관통력을 공유하지 않는다.
- 곡사포는 비행 경로상의 적을 관통하지 않고, 목표 지점 폭발만 처리한다. 폭발 범위 안의 각 적은 장갑과 관통력을 독립적으로 비교한다.
- 전차포의 직선 관통 피해와 착탄 폭발 피해는 별도 판정으로 취급한다. 같은 적이 두 판정에 모두 해당하면 두 피해가 적용될 수 있다.

### 3.3 사격각과 최소 사거리

- 실제 조준 방향은 탱크 방향과 모듈 orientation을 합산한다.
- 목표 후보는 사거리 안, 사격각 안, 살아 있는 적으로 제한한다.
- `distance >= minRange`만 유효하다.
- 후보가 없거나 ammo가 부족하면 발사하지 않고 새 발사 cooldown도 시작하지 않는다.
- 기관총류의 `minRange`는 0이다.
- 직사 기관총·전차포는 지형에 의해 경로가 차단된다.
- 전차포가 적보다 먼저 지형에 닿으면 지형 충돌 지점에서 폭발한다.
- 곡사포·박격포는 곡사 탄도이므로 지면의 중간 장애물을 넘고 목표 지점에서 폭발한다.
- 모든 투사체는 발사 시점의 목표 위치를 사용하며 유도하지 않는다.

## 4. 무기 목록과 초기 밸런스

수치는 1차 기준값이며 JSON에서 조정한다. 거리 단위는 현재 게임의 월드 px, 시간 단위는 초다. 현재 구현의 `fireRate` 명칭은 유지하되, plan15에서는 탄창 안에서 다음 발까지의 간격으로 정의한다.

| ID / 표시명 | 계열 | 피해 | 관통력 | 사거리 | 최소거리 | 탄창 | 발사 간격 | 재장전 | 폭발범위 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `machine-gun-12.7mm` / 12.7mm 중기관총 | 기관총 | 18 | 20 | 620 | 0 | 20 | 0.15 | 2.2 | - |
| `machine-gun-20mm` / 20mm 기관포 | 기관총 | 30 | 35 | 740 | 0 | 15 | 0.25 | 3.0 | - |
| `machine-gun-30mm` / 30mm 대공포 | 기관총 | 58 | 60 | 860 | 0 | 10 | 0.42 | 4.0 | - |
| `tank-gun-76mm` / 76mm 강선포 | 전차포 | 100 | 55 | 760 | 120 | 1 | 0 | 2.8 | 50 |
| `tank-gun-90mm` / 90mm 강선포 | 전차포 | 145 | 85 | 880 | 150 | 1 | 0 | 3.8 | 72 |
| `tank-gun-120mm` / 120mm 활강포 | 전차포 | 230 | 130 | 1000 | 190 | 1 | 0 | 5.2 | 96 |
| `mortar-60mm` / 60mm 박격포 | 곡사포 | 80 | 30 | 680 | 100 | 1 | 0 | 2.4 | 60 |
| `howitzer-105mm` / 105mm 곡사포 | 곡사포 | 140 | 65 | 840 | 180 | 1 | 0 | 4.0 | 92 |
| `howitzer-155mm` / 155mm 곡사포 | 곡사포 | 245 | 105 | 1000 | 280 | 1 | 0 | 6.0 | 130 |

추가 투사체 기준값은 다음과 같다.

- 기관총 projectile speed: 12.7mm 1050, 20mm 950, 30mm 900
- 전차포 projectile speed: 76mm 900, 90mm 850, 120mm 780
- 전차포 `maxDistance`는 각 무기의 사거리와 같다.
- 곡사포 flight time: 60mm 1.0, 105mm 1.4, 155mm 1.8
- 폭발 피해는 기존 `ArcProjectile`의 중심 최대·가장자리 감쇠 규칙을 유지한다.

이 기준에서 12.7mm·20mm·60mm 박격포는 Tanker 장갑에 막히고, 30mm·76mm 이상부터 중장갑 대응이 가능하다. 각 계열에서 구경이 커질수록 피해·관통력·사거리·폭발범위·재장전 시간이 증가하고 탄창 크기·연사성이 감소한다.

## 5. 탄창, 재장전과 Armory

### 5.1 탄약 상태

- 전역 `ammo` 자원은 유지한다.
- 모듈은 `loadedShots`를 가진다. 새 모듈과 런 재시작 시 탄창은 가득 찬 상태다.
- 기관총은 탄창 잔량을 줄이며, 0이 되면 재장전 시작 시 ammo 1을 소비하고 `reloadTime` 동안 재장전한다. ammo 1개로 12.7mm는 20발, 20mm는 15발, 30mm는 10발을 발사한다.
- 전차포와 곡사포는 `magazineSize: 1`이므로 매 발사 후 재장전한다.
- 전차포와 곡사포는 유효한 발사 1회마다 ammo 1을 소비한다.
- 기관총은 재장전용 ammo가 없으면 재장전을 시작하지 않고 빈 탄창 상태로 대기한다. 전차포와 곡사포는 ammo가 없으면 발사하지 않는다.
- 재장전 중에는 발사하지 않는다. 재장전 완료 후 기관총 탄창을 가득 채운다.
- 모듈 파괴·수리와 런 재시작 시 탄창/재장전 상태를 초기화한다.
- HUD는 탄창 잔량과 재장전 진행 상태를 표시한다.

### 5.2 연구 트리

Armory는 세 개의 독립 lane을 가진다.

```text
기본 연구
├─ 기관총: 20mm → 30mm
├─ 전차포: 76mm → 90mm → 120mm
└─ 곡사포: 60mm 박격포 → 105mm → 155mm
```

12.7mm 중기관총은 기본 연구·시작 설치 상태다. 60mm 박격포는 기존 연구 흐름을 유지하며, 나머지 무기는 해당 lane의 선행 노드가 선택되어야 한다. 계열 lane끼리는 배타적이지 않으며, 같은 lane의 단계만 순차적으로 선택한다.

| 무기 | 연구 비용 | 구매 비용 |
| --- | ---: | ---: |
| 12.7mm 중기관총 | 기본 제공 | 30 |
| 20mm 기관포 | 45 | 65 |
| 30mm 대공포 | 70 | 95 |
| 60mm 박격포 | 30 | 50 |
| 105mm 곡사포 | 75 | 130 |
| 155mm 곡사포 | 130 | 220 |
| 76mm 강선포 | 60 | 90 |
| 90mm 강선포 | 90 | 140 |
| 120mm 활강포 | 130 | 200 |

기존 일반 모듈의 형제 배타 규칙은 유지한다. `UpgradeNodeDefinition`에 선택적 `exclusiveGroup`을 추가하고, Armory의 독립 lane 시작 노드는 `null`을 사용한다. 필드가 생략된 기존 노드는 현재처럼 같은 부모의 선택된 형제가 있으면 disabled 상태가 된다.

구매 1회마다 stock이 1 증가하고, 설치 성공 시 stock 1을 소비한다. 연구·stock은 런 단위 상태이며 restart 시 초기화한다.

## 6. 데이터 계약

전투 모듈 정의는 기존 `behavior: "direct" | "arc"`를 유지하면서 다음 필드를 추가한다.

```json
{
  "id": "machine-gun-20mm",
  "kind": "combat",
  "name": "20mm Autocannon",
  "behavior": "direct",
  "weaponClass": "machine-gun",
  "size": { "width": 1, "height": 1 },
  "installCost": { "matter": 65 },
  "purchaseCost": { "matter": 65 },
  "fireArcDegrees": 360,
  "defaultOrientation": 0,
  "moduleAssetId": "tank.module.modern.autocannon-20",
  "fireSoundId": "sfx.weapon.autocannon-20-fire",
  "fireEffectId": "effect.muzzle.machine-gun",
  "baseStats": {
    "maxHp": 100,
    "range": 740,
    "minRange": 0,
    "damage": 30,
    "penetration": 35,
    "fireRate": 0.25,
    "magazineSize": 15,
    "reloadTime": 3.0,
    "projectileSpeed": 950,
    "maxDistance": 740
  },
  "upgradeTree": {
    "rootId": "root",
    "nodes": [
      { "id": "root", "parentId": null, "cost": {}, "effects": [] }
    ]
  }
}
```

필드 규칙:

- `weaponClass`는 `machine-gun`, `tank-gun`, `howitzer` 중 하나다.
- `moduleAssetId`, `fireSoundId`, `fireEffectId`는 정의 기반 렌더링·사운드·FX 선택에 사용한다.
- `minRange`는 0 이상, `penetration`은 0보다 커야 한다.
- `fireRate`는 0 이상, `reloadTime`은 0보다 커야 한다.
- `magazineSize`는 양의 정수이며, 단발 무기는 1이다.
- `tank-gun`은 `behavior: "direct"`, `aoeRadius`, `projectileSpeed`, `maxDistance`를 가진다.
- `howitzer`는 `behavior: "arc"`, `aoeRadius`, `flightTime`을 가진다.
- `machine-gun`은 `aoeRadius`를 사용하지 않는다.
- 모든 combat module은 기존 `size`, `fireArcDegrees`, `defaultOrientation`, cost, upgrade tree 계약을 계속 만족한다.
- 새 stats는 `TankDefinitionLoader`의 허용 목록과 유효성 검사에 추가한다.

파일 배치는 다음을 따른다.

- 수정: `src/data/tanks/starter/machine-gun-12.7mm.json`
- 수정: `src/data/tanks/starter/mortar-60mm.json`
- 신규: `src/data/tanks/starter/machine-gun-20mm.json`
- 신규: `src/data/tanks/starter/machine-gun-30mm.json`
- 신규: `src/data/tanks/starter/tank-gun-76mm.json`
- 신규: `src/data/tanks/starter/tank-gun-90mm.json`
- 신규: `src/data/tanks/starter/tank-gun-120mm.json`
- 신규: `src/data/tanks/starter/howitzer-105mm.json`
- 신규: `src/data/tanks/starter/howitzer-155mm.json`
- 수정: `src/data/enemies.json`

## 7. 런타임 구조

### 7.1 전투 모듈

`CombatModule`는 조준 후보 필터, 탄창, 재장전과 공통 발사 이벤트를 관리한다. 기존 직사/곡사 subclass는 다음 세 projectile mode를 선택한다.

- 기관총: 관통 직사탄
- 전차포: 관통 직사 폭발탄
- 곡사포: 곡사 폭발탄

새 무기 9종마다 별도 클래스를 만들지 않는다. `weaponClass`와 데이터 stats에 따라 공통 로직을 재사용한다. existing `CombatModule.render()`의 behavior별 asset 하드코딩은 `moduleAssetId` 우선, fallback asset 차순으로 변경한다.

### 7.2 발사체

- 관통 직사탄은 빠른 이동에서 적을 통과하지 않도록 이전 위치와 현재 위치의 swept segment를 검사한다.
- 직사 폭발탄은 동일한 segment 관통 판정을 거친 후 현재 남은 관통력으로 목표 지점 폭발을 처리한다.
- 곡사 폭발탄은 현재 `ArcProjectile`의 목표 지점·비행 시간·범위 감쇠 구조를 유지하되, 목표 지점 지형의 중간 blocker는 검사하지 않는다.
- 모든 발사체는 처리한 적의 runtime identity를 저장해 여러 frame에 걸쳐 동일 적을 반복 적중하지 않는다.
- 폭발 효과와 projectile sprite는 계열 공통 asset을 사용하고, `aoeRadius`·구경·반동 수치로 크기와 강도를 조절한다.

### 7.3 대상 검색과 성능

현재 `EnemySpatialIndex`를 확장해 다음 질의를 제공한다.

- `queryCircle(point, range)`: 조준 가능한 범위 후보
- `querySegment(start, end, radius)`: 관통 경로와 교차할 수 있는 후보

Game update에서 살아 있는 적으로 combat index를 한 번 구축하고, target selection과 projectile update가 공유한다. `querySegment`는 선분의 확장 AABB에 포함되는 bucket만 순회한 뒤 정확한 선분-원 교차를 확인하고, 진행률 기준으로 정렬한다. 따라서 전체 적 수가 늘어도 실제 경로와 무관한 적은 관통 계산에 참여하지 않는다.

성능 QA fixture는 120개의 active enemy와 여러 무기가 동시에 발사하는 상황을 재현한다. desktop 개발 서버에서 30 FPS가 지속되고 50ms 이상 프레임이 연속 발생하지 않아야 한다. 이 기준을 공간 인덱스 적용 후에도 제품 동작으로 충족하지 못하면, plan15의 허용 fallback으로 enemy armor 비교·관통력 차감을 제거하고 무기별 고정 `maxPenetrationTargets`를 사용하는 다중 적 관통만 남긴다. fallback이 적용되면 armor 추가는 후속 plan으로 이동한다.

## 8. 외형, 사운드와 FX

고유 모듈 외형과 발사음은 다음 ID 규칙을 사용한다.

| 무기 | module asset ID | fire sound ID |
| --- | --- | --- |
| 12.7mm | `tank.module.modern.hmg-12-7` | `sfx.weapon.hmg-12-7-fire` |
| 20mm | `tank.module.modern.autocannon-20` | `sfx.weapon.autocannon-20-fire` |
| 30mm | `tank.module.modern.aa-30` | `sfx.weapon.aa-30-fire` |
| 76mm | `tank.module.modern.rifle-76` | `sfx.weapon.rifle-76-fire` |
| 90mm | `tank.module.modern.rifle-90` | `sfx.weapon.rifle-90-fire` |
| 120mm | `tank.module.modern.smoothbore-120` | `sfx.weapon.smoothbore-120-fire` |
| 60mm | `tank.module.modern.mortar-60` | `sfx.weapon.mortar-60-fire` |
| 105mm | `tank.module.modern.howitzer-105` | `sfx.weapon.howitzer-105-fire` |
| 155mm | `tank.module.modern.howitzer-155` | `sfx.weapon.howitzer-155-fire` |

필수 asset은 9개 module body와 9개 Armory/HUD icon이다. projectile, 총구 화염, 폭발과 피격 FX는 기관총·전차포·곡사포 계열별 공통 asset을 사용한다. `assets.json`에 manifest와 fallback을 등록하고 `qa:art`를 통과해야 한다.

발사 연출은 다음과 같다.

- 기관총: 짧은 총구 화염과 tracer, 구경별 탄속·길이 차이
- 전차포: 큰 총구 화염, 포연, 포탄, 착탄 폭발, 발사 순간의 차체·카메라 반동
- 곡사포: 포연, 포물선 포탄, 착탄 지점 표시, 폭발과 흙먼지
- 반동은 `recoilTimer` 기반 시각 상태이며 모듈 점유 셀, 조준 방향과 충돌 위치를 바꾸지 않는다.
- `AudioManager`는 `CombatSoundEvent.soundId`를 받아 `audio.json`의 승인된 procedural sound를 재생한다.
- 9개 발사음은 동일한 합성 계약에서 pitch, noise burst, decay, 저주파 폭을 구경별로 다르게 한다.
- 고연사 sound는 sound별 cooldown과 voice 상한을 둬 음성 중첩으로 인한 성능·청취성 저하를 막는다.

## 9. 변경 파일과 책임

| 파일 | 책임 |
| --- | --- |
| `src/core/TankDefinitionLoader.ts` | 새 필드, stats, weapon class, asset/sound 참조 검증 |
| `src/core/UpgradeManager.ts` | Armory `exclusiveGroup: null` 처리, 기존 일반 분기 보존 |
| `src/core/ArmoryManager.ts` | 9종 연구·stock·구매 상태 제공 |
| `src/core/ProgressionManager.ts` | 적 armor validation 및 데이터 노출 |
| `src/entities/Enemy.ts` | `armor` 보관 |
| `src/entities/Module.ts` | 공통 탄창·재장전·대상 필터·무기별 projectile/sound 선택 |
| `src/entities/Projectile.ts` | 관통, 직사 폭발, 곡사 폭발, 장갑 판정 |
| `src/core/EnemySpatialIndex.ts` | 원형·선분 후보 검색 |
| `src/core/Game.ts` | combat index, sound event, recoil/FX 연결 |
| `src/core/AudioManager.ts` | 무기별 sound ID 정책과 재생 |
| `src/ui/HUDManager.ts` | 9종 연구·구매 카드와 탄창/재장전 표시 |
| `src/data/enemies.json` | Standard/Tanker armor 값 |
| `src/data/tanks/starter/*.json` | 9종 무기 정의와 연구 연결 |
| `src/data/assets.json` | module/icon/projectile/FX manifest |
| `src/data/audio.json` | 9종 발사음과 라이선스 메타데이터 |

기존 콘텐츠 추가 guide의 직사/곡사 제한과 현재 hard-coded asset 계약이 달라지는 부분은 구현 후 가이드 갱신 대상으로 검토한다. 이번 설계 문서에는 승인된 plan15 규칙만 기록한다.

## 10. 테스트와 runtime QA

### 단위·통합 테스트

- `ProgressionManager.test.ts`: armor 누락·음수 거부, 기존 enemy data 회귀
- `TankDefinitionLoader.test.ts`: 9종 필드, 크기, 사격각, weapon class, stats 검증
- `UpgradeManager.test.ts` 또는 Armory 테스트: lane 간 동시 연구, lane 내부 선행 노드, 일반 모듈 형제 배타 회귀
- `Enemy.test.ts`: armor 보관과 reset 동작
- `Projectile.test.ts`: 장갑 이하 정지, 장갑 초과 피해·관통력 차감, 다중 적 관통, 전차포 폭발, 곡사포 폭발, 지형 규칙, 중복 frame 방지
- `Module.test.ts`: 탄창 소진·재장전, 단발 무기, 최소거리·사격각, ammo 부족과 무효 target 처리
- `EnemySpatialIndex.test.ts`: 원형·선분 질의의 후보 제한과 경로 정렬
- `AudioManager` 관련 테스트: sound ID fallback, voice/cooldown 정책

### 필수 runtime 시나리오

1. Armory에서 세 lane의 연구 노드를 각각 독립적으로 선택한다.
2. 9종 구매·stock 증가·설치와 restart 초기화를 확인한다.
3. 기관총 탄창이 여러 발 발사되고 소진 후 재장전되는지 확인한다.
4. 전차포·곡사포가 단발 발사 후 재장전되는지 확인한다.
5. 표준 적과 탱커 적을 직선으로 배치해 장갑 실패·성공·다중 관통을 확인한다.
6. 전차포가 경로 적을 관통한 뒤 목표 지점에서 폭발하고, 지형 충돌 시 충돌 지점에서 폭발하는지 확인한다.
7. 곡사포가 중간 지형을 넘어 목표 지점에서 폭발하는지 확인한다.
8. 최소거리 안쪽, 최대거리 밖, 사격각 밖의 적에게 발사하지 않는지 확인한다.
9. 9종 module body와 9종 발사음이 서로 다른 ID로 재생되는지 확인한다.
10. 밀집 적 성능 fixture에서 지속적인 프레임 정지 없이 관통 계산이 완료되는지 확인한다.

검증 명령:

```text
npm test
npm run qa:art
npm run qa:audio
npm run build
npm run dev
```

문서만 변경하는 현재 단계에서는 runtime QA를 실행하지 않는다. 구현 단계에서 AGENTS.md의 project `integration-tester` 계약에 따라 실제 URL, port, worktree, runtimeId와 fixture를 전달한다.

## 11. 완료 기준

- starter 탱크가 9종 현대 화기 정의를 오류 없이 로드한다.
- machine-gun-12.7mm은 12.7mm 중기관총, mortar-60mm은 60mm 박격포로 표시된다.
- 기관총 360°/1×1, 전차포 30°/1×2, 곡사포 45°/2×2, 박격포 1×1 규칙이 설치·조준·렌더링에 일치한다.
- 적 장갑과 발사체 관통력이 승인된 수식대로 처리된다.
- 기관총은 다중 적 관통과 탄창 연사를 수행한다.
- 전차포는 직선 관통과 최소 사거리·목표 지점 폭발을 수행한다.
- 곡사포는 최소 사거리·곡사·목표 지점 범위 폭발을 수행한다.
- 구경 증가에 따른 피해·사거리·폭발범위·발사 간격·재장전·탄창 차이가 데이터로 확인된다.
- Armory 연구 lane, 구매 stock, 설치와 restart 초기화가 정상 동작한다.
- 각 무기의 고유 외형과 발사음이 manifest·runtime에서 확인된다.
- 자동 테스트, art/audio QA, build와 필수 runtime QA가 통과한다.
- 성능 문제가 실제로 확인될 경우에만 승인된 다중 관통-only fallback을 적용하고 그 범위를 plan 결과에 기록한다.
