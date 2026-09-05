# 14. 자원·발사체·피격·폭발 효과 asset 상세 계획

## 현재 적용 계획

11단계의 공통 asset 계약과 12·13단계의 actor 시각 기준을 사용해 자원 흐름과 전투 사건을 제작한다. 이 단계는 플레이어가 무엇을 얻었고, 어떤 무기가 적중했으며, 장갑 또는 Core에 어떤 피해가 전달됐는지를 짧은 피드백으로 알아보게 만드는 단계다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [13-enemy-art.md](13-enemy-art.md)
- [04-resource-collection.md](04-resource-collection.md)
- [05-production-and-logistics.md](05-production-and-logistics.md)

후속 계획:

- [15-map-art.md](15-map-art.md): 효과가 잘 보이는 배경 명도 기준을 공유한다.
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md): projectile, pickup, effect draw를 연결한다.
- [17-hud-upgrade-ui-art.md](17-hud-upgrade-ui-art.md): world feedback와 HUD 숫자·icon을 일치시킨다.
- [18-asset-integration-performance-fallback.md](18-asset-integration-performance-fallback.md): 효과 누적 성능과 일시정지 동작을 검증한다.

## 목표

- resource pickup이 수집 대상임을 즉시 알 수 있다.
- 직사와 곡사 발사체의 궤적과 착탄 위치를 혼동하지 않는다.
- 적중, 폭발, 접촉 피해, Core 피해를 짧고 읽기 쉬운 effect로 구분한다.
- 자원 흐름의 시각 신호가 실제 저장·생산·변환 규칙보다 앞서가거나 거짓 정보를 주지 않는다.

## 현재 코드 기준

| 대상 | 현재 구현 | 시각 계획 |
|---|---|---|
| `ResourcePickup` | 노란 마름모, 수량 텍스트, `amount` 감소 | 마름모 또는 resource crystal asset과 수량 overlay를 분리한다. |
| `DirectProjectile` | 청록 원형, 직선 이동, 적중 시 파란 effect | 탄환 body와 짧은 trail을 분리한다. |
| `ArcProjectile` | 공중 포탄, 지면 shadow, AOE reticle, 포물선 | 공중 shell, shadow, target indicator, impact effect를 분리한다. |
| `VisualEffect` | 반경이 커졌다 작아지는 원형 effect, 0.3초 수명 | 핵심 사건은 asset 또는 제한된 particle preset으로 표현한다. |
| 적 사망 | `ResourcePickup` 생성 | dead effect 뒤 동일 위치에서 pickup이 생겨야 한다. |
| 접촉 피해 | 빨강 원형 effect, Core 피해 | contact signal과 Core 피해 signal의 의미를 구분한다. |

현재 world pickup은 `resource`를 생성한다. `matter`, `ammo`, `nano`는 HUD와 저장 시스템의 자원 타입이므로, 별도 world pickup 규칙이 정의되기 전까지 새로운 pickup spawn을 만들지 않는다.

## 범위

### 포함

- `resource` pickup과 잔해 visual
- `matter`, `ammo`, `nano`의 UI icon 또는 future pickup variant 계약
- direct projectile body/trail/hit
- arc projectile shell/shadow/reticle/explosion
- enemy hit, enemy dead, contact damage, armor absorb, Core damage effect
- resource collect, convert, storage full feedback의 시각 preset
- asset logical ID와 effect metadata
- `imagegen` 기준 effect asset 제작

### 제외

- 새로운 자원 타입이나 변환 비율 추가
- 탄약 소비 규칙, AOE 피해 계산, 관통력 변경
- 화면 전체의 camera shake, 강한 bloom, 무한 particle loop
- 효과가 충돌 또는 피해 판정을 대신하는 구조
- 일시정지 중 자동 생산·수집·변환 재개

## asset 목록

| logical ID | 종류 | 기본 상태 | 계약 |
|---|---|---|---|
| `resource.resource.idle` | world pickup | idle | 현재 `ResourcePickup.amount`와 위치를 사용한다. |
| `resource.resource.collect` | short effect | collect | 실제 수집 성공 후에만 재생한다. |
| `resource.debris.idle` | map/world prop | idle | 수집 가능 여부는 별도 data가 소유한다. |
| `effect.projectile.direct` | projectile | active | 직선 방향에 맞춰 회전 또는 trail을 적용한다. |
| `effect.projectile.direct-hit` | impact | hit | direct damage 발생 후 생성한다. |
| `effect.projectile.arc` | projectile | active | 공중 shell과 착탄 위치를 분리한다. |
| `effect.projectile.arc-target` | ground marker | active | 현재 AOE target만 표시한다. |
| `effect.explosion.arc` | explosion | explode | `aoeRadius`를 시각 반경의 기준으로 사용한다. |
| `effect.enemy.hit` | impact | hit | 적 hp가 실제로 감소한 경우만 생성한다. |
| `effect.enemy.dead` | death | dead | 적 제거 직전에 짧게 표시한다. |
| `effect.contact-damage` | warning | contact | 지속 접촉 피해 tick과 연결한다. |
| `effect.armor-absorb` | defense | absorb | 장갑이 피해를 흡수한 사건에만 사용한다. |
| `effect.core-damage` | damage | damage | Core에 실제 피해가 전달될 때 사용한다. |
| `resource.icon.matter` | UI icon | static | world pickup으로 사용하지 않아도 등록할 수 있다. |
| `resource.icon.ammo` | UI icon | static | 탄약 상태와 연결한다. |
| `resource.icon.nano` | UI icon | static | 나노 물질 상태와 연결한다. |

## 시각 계약

### 자원

- 현재 `resource` pickup은 월드에서 작고 밝은 중심 형태로 보인다.
- 수량은 이미지에 굽지 않고 renderer가 `amount`를 읽어 그린다.
- `matter`, `ammo`, `nano`는 모양 차이를 우선한다. 색상만 바꾸어 접근성 문제를 만들지 않는다.
- pickup shadow는 위치를 보여주되 collect radius를 시각적으로 확장하지 않는다.
- storage full, collect blocked, convert success는 동일한 icon을 재사용해도 별도 feedback state로 표시한다.

### 직사 발사체

- 발사점은 12단계의 direct weapon 중심과 일치한다.
- 이동 방향을 따라 짧은 trail을 만들 수 있지만 trail 끝이 projectile hitbox로 취급되지는 않는다.
- 적중 effect는 `DirectProjectile.update()`가 실제 적을 맞힌 뒤 생성한다.
- 화면 밖 또는 최대 거리 도달로 제거되는 경우 hit effect를 생성하지 않는다.

### 곡사 발사체

- 공중 shell의 위치는 현재 `ArcProjectile`의 ground position과 arc height 계산을 따른다.
- 지면 shadow는 공중 shell과 분리해 ground layer에 그린다.
- target reticle은 실제 target과 `aoeRadius`를 표시하며 장식용 원을 별도로 추가하지 않는다.
- 착탄 effect의 반경은 `aoeRadius`를 기준으로 하되, 화면을 가릴 정도로 과장하지 않는다.

### 피해와 방어

| 사건 | primary signal | 보조 signal |
|---|---|---|
| 적 hit | 짧은 밝기 반전 | 작은 impact ring |
| 적 dead | body 파편 또는 fade | resource pickup 생성 |
| 접촉 피해 | danger contact flash | Core 피해 text 또는 bar 변화 |
| Armor absorb | 차가운 금속성 spark | Core로 전달되지 않음을 짧게 표시 |
| Core damage | danger ring | Core HP bar 변화 |
| 폭발 | 중심 flash와 ring | 짧은 파편 |

모든 효과는 semantic color를 사용하지만, 한 프레임에 여러 효과가 겹치면 색상보다 shape와 위치가 우선 읽히게 한다.

## 효과 수명과 일시정지 계약

- 효과 수명은 실제 사건의 시각 피드백에 필요한 최소 시간으로 설정한다.
- `Game.update()`가 일시정지 중 효과를 update하지 않는 현재 흐름을 유지한다.
- 일시정지 중에는 새로운 projectile, pickup collect, production, conversion effect를 생성하지 않는다.
- 이미 화면에 있는 효과는 일시정지 화면에서 정지한 frame으로 남아야 한다.
- `prefers-reduced-motion`에서는 ring 확장, flash, shake를 정적 표시 또는 짧은 fade로 낮춘다.
- effect object 수에는 상한을 두고, 상한 초과 시 장식 particle부터 생략한다. 피해와 수집의 핵심 신호는 생략하지 않는다.

## 이미지 생성과 정규화 순서

1. 12단계의 direct/arc weapon과 13단계의 enemy silhouette을 기준으로 effect 색과 크기를 맞춘다.
2. resource crystal, direct projectile, arc shell, arc explosion 중심 순으로 기준 asset을 생성한다.
3. hit/dead/contact/armor effect는 공통 pixel scale과 광원을 공유한다.
4. 생성 이미지에 텍스트, 수량, 체력 바, 배경, 여러 effect가 섞이면 채택하지 않는다.
5. effect asset은 투명 배경을 유지하고 논리 중심점을 manifest에 기록한다.
6. 짧은 ring, spark, fade는 Canvas preset으로 남길지 이미지로 만들지 비교한다.
7. `public/assets/game/resources/`와 `public/assets/game/effects/`에 저장한다.
8. 동일 효과의 여러 프레임이 필요하면 sprite sheet보다 단일 frame + Canvas transform을 먼저 검토한다.

## 구현 단계와 handoff

### 14.1 데이터와 사건 목록 대조

- `ResourcePickup`, `DirectProjectile`, `ArcProjectile`, `VisualEffect`의 생성·update·remove 지점을 표로 만든다.
- 어떤 사건이 실제 gameplay event인지 확인하고, render only event를 추가하지 않는다.
- resource type별 현재 지원 범위를 확인해 future icon과 active pickup을 구분한다.

### 14.2 효과 preset 결정

- 각 효과에 logical ID, duration, max scale, layer, reduced-motion fallback을 기록한다.
- `VisualEffect` 하나로 충분한 효과와 별도 sprite가 필요한 효과를 나눈다.
- effect의 시각 radius와 damage/collect radius를 같은 값으로 추측하지 않는다.

### 14.3 다음 단계 연결

- 15단계는 배경 명도를 effect가 읽히는 수준으로 유지한다.
- 16단계는 update 코드와 render asset을 연결하며, 실제 사건 발생 위치에서만 effect를 생성한다.
- 17단계는 resource icon과 world pickup 의미를 맞춘다.
- 18단계는 많은 적과 동시 폭발에서 effect 상한과 preload를 검증한다.

## 완료 조건

### asset

- [x] resource pickup, direct projectile, arc shell, arc explosion 기준 asset이 있다.
- [x] direct와 arc의 궤적·착탄이 모양과 위치로 구분된다.
- [x] hit, dead, contact, armor absorb, Core damage 상태가 각각 정의되어 있다.
- [x] matter, ammo, nano UI icon의 scope가 실제 gameplay pickup과 구분되어 있다.
- [x] 모든 effect의 중심점과 layer가 manifest 또는 preset에 기록되어 있다.

### 동작 의미

- [ ] 적 hit effect는 실제 피해가 발생한 경우에만 보인다.
- [ ] 사망 effect와 reward pickup 생성 위치가 일치한다.
- [ ] AOE marker가 실제 `aoeRadius`를 표시한다.
- [ ] 일시정지 중 새로운 effect가 생성되지 않는다.
- [ ] reduced-motion에서 강한 flash·shake·반복 모션이 낮아진다.

### handoff

- [x] 15단계가 effect 대비를 고려한 배경을 만들 수 있다.
- [ ] 16단계가 각 effect의 생성 위치와 fallback을 연결할 수 있다.
- [ ] 17단계가 resource icon과 HUD 수치를 같은 의미로 사용할 수 있다.
- [ ] 18단계가 effect 개수 상한과 성능 검증을 수행할 수 있다.
- [ ] `git diff --check`가 통과한다.

## 검증 기록 템플릿

```text
Date:
Scope: 14 resource, projectile, and effects art
World resource scope: resource only / expanded by data
Projectile distinction: pass / fail
Impact meaning check: pass / fail
Pause check: pass / fail
Reduced-motion check: pass / fail
Effect-count budget checked: pass / fail
Next handoff: 15 / 16 / 17 / 18
Notes:
```

## 14단계 구현 기록

### 범위 대조

- `ResourcePickup`, `DirectProjectile`, `ArcProjectile`, `VisualEffect`의 현재 생성·update·remove 흐름을 확인했다.
- 현재 world pickup은 `resource` 한 종류이며 `matter`, `ammo`, `nano`는 HUD 또는 future pickup scope로 분리했다.
- pause 중 자동 생산과 자원 수집이 멈추는 기존 규칙은 유지하고, 14단계에서는 gameplay event나 수치 계산을 변경하지 않았다.

### 결과

- built-in `image_gen`으로 resource debris, direct projectile, arc projectile 기준 asset을 생성하고 투명 alpha bounds crop 및 nearest-neighbor 정규화를 적용했다.
- `resource-collect`, direct hit, arc target, arc explosion, enemy hit/dead, contact damage, armor absorb, Core damage를 결정적 raster preset으로 추가했다.
- `matter`, `ammo`, `nano` icon은 실제 pickup spawn이 아닌 resource HUD scope로 추가했다.
- `src/data/assets.json`에 draw box, center pivot, layer, fallback을 등록하고 `docs/art-asset-provenance.md`에 source와 정규화 결과를 기록했다.

### 완료 범위와 handoff

- 14단계 asset 및 visual contract는 완료했다.
- 실제 hit 위치, 사망과 reward pickup 위치, AOE radius transform, pause 중 effect 생성 차단, reduced-motion 동작은 renderer가 연결되는 16단계와 성능·접근성 검증 18단계에서 확인한다.
- 효과 개수 상한과 preload는 18단계에서 결정하며, 이 단계에서는 무한 particle loop나 camera shake를 추가하지 않았다.

### 검증 기록

```text
Date: 2026-09-05
Scope: 14 resource, projectile, and effects art
World resource scope: resource only, matter/ammo/nano are HUD scope
Projectile distinction: pass
Impact meaning check: pass for asset shape and semantic color
Pause check: deferred to 16/18 runtime integration
Reduced-motion check: deferred to 18 runtime integration
Effect-count budget checked: deferred to 18
Next handoff: 15, 16, 17, 18
Notes: No gameplay rules, damage, collision, resource, or pause flow changed.
```
