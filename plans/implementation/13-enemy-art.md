# 13. 적 종류와 적 상태 asset 상세 계획

## 현재 적용 계획

11단계의 공통 시각 계약과 12단계의 탱크 대비 기준을 사용해 현재 진행 데이터에 정의된 두 적 `standard`, `tanker`의 asset을 제작한다. 새로운 적 AI나 전투 규칙은 추가하지 않고, 기존 상태를 화면에 읽히게 만드는 데 집중한다.

선행 계획:

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)
- [12-tank-and-module-art.md](12-tank-and-module-art.md)
- [07-progression-content.md](07-progression-content.md)

후속 계획:

- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md): 피격·사망·접촉 효과를 적 상태와 연결한다.
- [15-map-art.md](15-map-art.md): 적이 배경에 묻히지 않는 맵 대비 기준을 사용한다.
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md): `Enemy.render()`를 asset-backed draw로 연결한다.
- [19-art-qa-release.md](19-art-qa-release.md): 후반 웨이브의 밀집 상태까지 시각 검수한다.

## 목표

플레이어가 체력·속도·위협도를 HUD를 읽기 전에 실루엣과 동작으로 이해할 수 있게 한다.

- `standard`는 작고 빠른 근접 위협으로 읽힌다.
- `tanker`는 크고 느리며 높은 체력을 가진 위협으로 읽힌다.
- 적이 grid 외곽에 접촉해 지속 피해를 주는 상태가 보인다.
- 피격, 사망, 보상 픽업 생성이 끊기지 않고 이어진다.

## 현재 코드와 콘텐츠 기준

`src/data/progression.json`과 `src/entities/Enemy.ts`의 값이 시각 크기의 기준이다.

| 적 | hp | speed | radius | reward | 시각 기준 |
|---|---:|---:|---:|---:|---|
| `standard` | 45 | 95 | 12 | 10 | `24x24` body 중심 pivot |
| `tanker` | 160 | 45 | 18 | 25 | `36x36` body 중심 pivot |

현재 구현은 다음 상태를 갖는다.

- `Enemy.update()`가 Core 위치를 향해 이동한다.
- `Game.resolveEnemyAgainstGrid()`가 grid 외곽에서 적을 멈춘다.
- `Enemy.tryContactDamage()`가 `contactDamageInterval`마다 공격 가능 여부를 반환한다.
- `Enemy.takeDamage()`가 hp를 줄이고 0에서 dead 상태가 된다.
- `Game.update()`가 사망 적을 제거하고 `ResourcePickup`을 생성한다.
- `Enemy.renderHpBar()`가 적 위에 체력 바를 그린다.

asset은 이 상태를 새로 만들지 않는다. renderer가 현재 객체 상태와 timer를 읽어 visual state를 선택한다.

## 범위

### 포함

- `standard`와 `tanker`의 idle body
- 피격, damaged, dead 시각 변형
- grid 외곽 접촉 상태의 outline 또는 contact signal
- 적 shadow와 체력 바 대비 기준
- 적 asset logical ID와 manifest 항목
- `imagegen`으로 기준 적과 파생 상태 생성

### 제외

- 새로운 Enemy subclass 또는 `EnemyType` 추가
- hp, speed, radius, reward, contact damage 변경
- 적 pathfinding, 회피, 군집 AI 추가
- 체력 바를 이미지 안에 굽기
- 적별 별도 UI panel 추가

## asset 목록

| logical ID | draw box | 상태 | 의미 |
|---|---:|---|---|
| `enemy.standard.idle` | `24x24` | idle, active | 빠른 일반 근접 적 |
| `enemy.standard.hit` | `24x24` | hit | 피격 순간의 짧은 강조 |
| `enemy.standard.dead` | `24x24` | dead | 제거 직전의 파편 또는 frame |
| `enemy.tanker.idle` | `36x36` | idle, active | 느린 고체력 적 |
| `enemy.tanker.hit` | `36x36` | hit | 큰 body에서도 읽히는 피격 강조 |
| `enemy.tanker.dead` | `36x36` | dead | 제거 직전의 무거운 파괴 표현 |
| `enemy.shadow.standard` | `24x12` | idle | ground layer의 얇은 그림자 |
| `enemy.shadow.tanker` | `36x18` | idle | ground layer의 얇은 그림자 |
| `effect.enemy.contact` | effect 규격 | contact | 지속 접촉 피해의 semantic signal |

체력 바는 적 body asset에 포함하지 않고 `Enemy.renderHpBar()` 또는 16단계 renderer의 overlay로 유지한다.

## 시각 계약

### 실루엣

- `standard`는 작은 body 안에서 이동 방향과 근접성을 읽을 수 있는 날카로운 silhouette을 사용한다.
- `tanker`는 원형·육각형 도형 fallback과 비슷한 면적을 유지하면서 장갑 덩어리와 무게 중심을 표현한다.
- 두 적은 색을 낮춰도 크기와 외곽 형태로 구분되어야 한다.
- 적의 transparent padding은 `radius` 바깥으로 과도하게 커지지 않는다.
- 그림자 중심과 body 중심은 같고, shadow가 실제 body보다 넓어 보이지 않는다.

### 상태

| 게임 상태 | visual state | 처리 원칙 |
|---|---|---|
| hp가 max에 가까움 | `idle` | 기본 body와 얇은 shadow |
| 최근 피해 | `hit` | 짧은 밝기 반전 또는 흰색 외곽선 |
| hp가 낮음 | `damaged` | body의 균열·명도 저하. 체력 바는 별도 |
| grid 외곽에 접촉 | `contact` | body 아래 또는 외곽에 짧은 위험 signal |
| hp가 0 | `dead` | 짧은 파편·축소 후 Game이 제거 |

현재 `Enemy`에 hit timer나 contact state가 없다면 16단계에서 필요한 최소 상태 값을 추가한다. asset 제작 단계에서 게임 로직을 임의로 추측해 추가하지 않는다.

### 체력 바

- 체력 바 폭은 기존 `radius * 2` 기준을 유지한다.
- body 크기를 키우기 위해 hp bar 위치를 임의로 띄우지 않는다.
- 체력 비율은 green, amber, red의 semantic state를 사용하되, body 외곽과 겹치지 않는다.
- 후반 웨이브에서 겹침이 많아지면 모든 적에 긴 label을 추가하지 않고 bar 높이·outline·표시 조건을 조정한다.

## 이미지 생성 순서

1. 11단계 starter 샘플과 12단계 탱크 샘플의 광원·외곽선·픽셀 크기를 확인한다.
2. `enemy.standard.idle`을 작은 화면에서 읽히는 기준 asset으로 생성한다.
3. 같은 시점과 광원으로 `enemy.tanker.idle`을 만들고, 표준 적과 겹쳐 비교한다.
4. idle body가 확정된 뒤 hit·dead 파생 상태를 만든다.
5. `standard`의 작은 크기와 `tanker`의 큰 크기가 실제 `radius`와 맞는지 확인한다.
6. background, text, health bar, reward number가 생성 결과에 섞이면 채택하지 않는다.
7. shadow는 body와 별도 asset으로 만들거나 Canvas ellipse fallback으로 유지한다.
8. 각 asset을 `public/assets/game/enemies/`에 저장하고 manifest에 등록한다.

기본 subject 문장 예시:

```text
a small fast hostile scavenger creature for a top-down orbital tank defense game,
sharp compact silhouette, low profile, hard pixel clusters,
dark crimson body with restrained warning-red edge, centered sprite,
transparent background, one light direction, no text, no UI,
no health bar, no perspective, no isometric view, no 3D render.
```

탱커는 subject만 바꾼다.

```text
a large slow armored hostile tanker creature for the same top-down pixel art game,
heavy hexagonal silhouette, dense layered armor, readable larger body,
dark burnt orange body with restrained warning-orange edge, centered sprite,
transparent background, same light direction and pixel scale, no text, no UI,
no health bar, no perspective, no isometric view, no 3D render.
```

## 구현 단계와 handoff

### 13.1 데이터 대조

- `progression.json`의 적 ID가 `standard`, `tanker` 외에 추가되지 않았는지 확인한다.
- `Enemy.ts`의 radius와 health bar 계산을 기준으로 draw box를 검수한다.
- `WaveManager`가 두 적을 spawn하는 위치와 asset center의 관계를 확인한다.

### 13.2 샘플과 대비 검수

- 어두운 `landing-zone` 배경과 밝은 `relay-fields` 배경에 각각 적을 놓는다.
- 탱크 frame과 direct/arc projectile 옆에서 두 적의 외곽선이 묻히지 않는지 확인한다.
- 여러 `standard` 사이에 `tanker`를 놓아 silhouette만으로 구분되는지 확인한다.

### 13.3 manifest handoff

- `enemy.standard.idle`, `enemy.standard.hit`, `enemy.tanker.idle`, `enemy.tanker.hit`를 우선 등록한다.
- dead frame과 contact effect가 별도 renderer effect로 처리되는 경우 그 결정을 manifest 또는 art bible에 기록한다.
- fallback key는 기존 원형·육각형 도형 renderer와 매핑한다.

### 13.4 후속 단계 연결

- 14단계는 hit/dead/contact 상태의 시간 길이와 effect 위치를 참고한다.
- 15단계는 enemy silhouette이 묻히지 않는 배경 대비를 맵마다 검증한다.
- 16단계는 `Enemy.render()`에서 asset 선택을 수행하되, `Enemy.update()`와 충돌은 건드리지 않는다.
- 19단계는 가장 많은 `standard`가 동시에 존재하는 `core-ruins`를 최종 기준으로 사용한다.

## 완료 조건

### asset

- [x] `standard` idle/hit/dead 기준 asset이 있다.
- [x] `tanker` idle/hit/dead 기준 asset이 있다.
- [x] 두 적의 pivot이 world position 중심과 일치한다.
- [x] shadow와 body asset의 투명 여백이 radius를 속이지 않는다.
- [x] 체력 바와 reward text가 이미지에 포함되지 않는다.

### 시각 식별

- [x] 색을 낮춰도 `standard`와 `tanker`를 구분할 수 있다.
- [x] 피격과 접촉 상태가 body의 기본 idle과 구분되도록 hit/dead/contact asset을 준비했다.
- [ ] 적이 탱크 grid 외곽에 도달했을 때 지속 피해 상태가 보인다. 16단계 renderer 연결에서 확인한다.
- [x] 적 body와 contact signal의 transparent padding 및 외곽선을 exact-size preview에서 확인했다.

### 회귀와 handoff

- [x] 적 수치와 spawn 규칙을 변경하지 않았다.
- [x] 사망 시 ResourcePickup 생성 위치와 적 body pivot이 어긋나지 않도록 body center를 유지했다.
- [x] 14, 15, 16, 19단계가 필요한 logical ID와 대비 기준을 사용할 수 있다.
- [x] `git diff --check`가 통과한다.

## 검증 기록 템플릿

```text
Date:
Scope: 13 enemy art
Enemy IDs checked: standard / tanker
Radius check: pass / fail
Silhouette distinction: pass / fail
Contact-state readability: pass / fail
Late-wave density check: pass / fail
Fallback still playable: pass / fail
Next handoff: 14 / 15 / 16 / 19
Notes:
```

## 13단계 구현 기록

- [x] 13.1 data audit: `progression.json`, `Enemy.ts`, `WaveManager.ts`의 `standard`와 `tanker`, radius 12/18, hp·speed·reward·spawn 규칙을 대조했다.
- [x] 13.2 imagegen: 기존 `enemy.standard.idle`를 reference로 사용해 `enemy.tanker.idle`을 생성하고, 차량형으로 나온 첫 시안은 폐기했다.
- [x] 13.2 state variants: standard/tanker idle에서 hit/dead를 파생해 같은 중심과 silhouette을 보존했다.
- [x] 13.2 support assets: standard/tanker shadow와 grid 접촉 피해용 danger signal을 추가했다.
- [x] 13.3 manifest: `src/data/assets.json`에 body 6종, shadow 2종, contact effect 1종을 등록하고 logical draw box, pivot, layer, fallback을 지정했다.
- [x] 13.3 provenance: 채택·폐기된 imagegen 원본, prompt set, 정규화 결과, 파생 방식과 runtime 경로를 `docs/art-asset-provenance.md`에 기록했다.
- [x] 13.4 회귀 경계: 적 수치, `Enemy.update()`, 접촉 피해 timer, spawn queue, 사망 보상 처리는 수정하지 않았다.
- [x] 검증: manifest JSON parse, 파일 경로·pixel size·투명 모서리 검사, `npx.cmd tsc --noEmit`, `npm.cmd run build`, `git diff --check`를 실행했다.
- [ ] 수동 전투 화면: `Enemy.render()` asset 선택과 contact timer 연결은 16단계에서 수행한다.

### 검증 결과

```text
Date: 2026-09-05
Scope: 13 enemy art
Enemy IDs checked: standard / tanker
Radius check: pass, standard 24x24 and tanker 36x36 match radius 12/18
Silhouette distinction: pass by exact-size visual inspection
Contact-state readability: pass for contact signal asset, renderer connection deferred to 16
Late-wave density check: pending 16/19 renderer integration
Fallback still playable: pass by unchanged Enemy render fallback path
Next handoff: 14 / 15 / 16 / 19
Notes: No enemy subclass, AI, balance value, collision rule, or spawn rule was changed.
```
