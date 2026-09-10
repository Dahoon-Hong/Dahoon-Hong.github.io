# 90. Level 및 난이도 Design

## 1. 목표

스토리 모드와 무한 모드의 레벨 구조, 플레이어 선택형 난이도, 적 난이도 곡선, 모듈·무기 성장 수치를 하나의 밸런스 계약으로 정의한다.

이 플랜의 핵심 목표는 두 가지다.

1. 개발자가 JSON의 배수와 콘텐츠 수치를 수정해 난이도를 빠르게 조절할 수 있어야 한다.
2. 클리어 가능성이 운이나 단순한 수치 차이가 아니라 이동, 타깃 우선순위, 자원 소비, 업그레이드 선택 같은 플레이 실력에 의해 갈려야 한다.

현재 구현의 `planet → region → wave` 구조와 모듈별 `baseStats/upgradeTree` 구조를 최대한 유지한다. 플레이어에게 보이는 용어는 `Chapter → Stage → Wave`로 정리하되, 기존 `planet/region` 데이터는 당장 중복 정의하지 않고 Chapter/Stage의 기술적 호환 계층으로 사용한다.

## 2. 확정된 게임 규칙

### 2.1 런 설정

런 시작 시 다음 두 항목을 선택한다.

- 모드: `story` 또는 `endless`
- 난이도: `easy`, `normal`, `hard`

난이도는 런 전체에 적용하며 진행 중 변경하지 않는다. 지역 재시작도 동일한 난이도 설정을 사용한다. 난이도를 바꾸려면 메뉴 또는 런 종료 후 새 런을 시작한다.

난이도 선택은 플레이어 모듈·무기의 공격력을 직접 낮추거나 올리지 않는다. 적 압력과 웨이브 규모를 변경해 실력 차이가 드러나도록 한다.

### 2.2 난이도 배수의 적용 순서

최종 적 수치는 다음 계층을 순서대로 합성한다.

```text
최종 적 수치
= 기본 적 정의
× 플레이어 난이도 배수
× Chapter/Stage 콘텐츠 배수
× Wave 또는 Endless 위협 배수
```

최종 모듈·무기 수치는 별도로 계산한다.

```text
최종 모듈/무기 수치
= 레벨 1 baseStats
+ 선택한 upgradeTree 효과
```

두 계산을 분리하면 Hard가 플레이어 무기 성능을 몰래 깎는 방식이 되지 않고, 적을 피하는 능력과 빌드 선택의 결과가 클리어 여부에 반영된다.

## 3. 개발자 조정용 난이도 JSON

신규 파일은 `src/data/difficulty.json`으로 둔다. 런타임은 `defaultId`를 기본 난이도로 사용하고, UI는 `profiles`의 `id`와 `name`을 읽어 선택지를 만든다.

초기 튜닝 후보는 다음과 같다. 이 값들은 최종 밸런스가 아니라 첫 플레이테스트를 위한 기준선이다.

```json
{
  "defaultId": "normal",
  "profiles": [
    {
      "id": "easy",
      "name": "쉬움",
      "enemy": {
        "hpMultiplier": 0.85,
        "countMultiplier": 0.85,
        "speedMultiplier": 0.90,
        "contactDamageMultiplier": 0.80,
        "spawnIntervalMultiplier": 1.10
      }
    },
    {
      "id": "normal",
      "name": "보통",
      "enemy": {
        "hpMultiplier": 1.00,
        "countMultiplier": 1.00,
        "speedMultiplier": 1.00,
        "contactDamageMultiplier": 1.00,
        "spawnIntervalMultiplier": 1.00
      }
    },
    {
      "id": "hard",
      "name": "어려움",
      "enemy": {
        "hpMultiplier": 1.15,
        "countMultiplier": 1.15,
        "speedMultiplier": 1.08,
        "contactDamageMultiplier": 1.20,
        "spawnIntervalMultiplier": 0.90
      }
    }
  ],
  "endless": {
    "tierWaveCount": 5,
    "hpPerTier": 1.12,
    "countPerTier": 1.08,
    "speedPerTier": 1.03,
    "contactDamagePerTier": 1.08,
    "spawnIntervalPerTier": 0.96,
    "speedMultiplierCap": 1.40,
    "minimumSpawnInterval": 0.30
  }
}
```

### 3.1 배수 의미

- `hpMultiplier`: 적의 최대 HP
- `countMultiplier`: 각 Wave의 적 수
- `speedMultiplier`: 적의 이동 속도
- `contactDamageMultiplier`: Core 접촉 피해
- `spawnIntervalMultiplier`: 적 생성 간격. 1보다 작으면 더 빠르게 생성된다.

보상은 기본적으로 난이도 배수의 영향을 받지 않는다. Hard에서 보상만 증가시켜 적 압력을 상쇄하거나 Easy를 반복해 자원을 파밍하는 구조를 만들지 않는다. 보상 조정이 필요해지는 경우에도 별도의 명시적인 `rewardMultiplier`를 추가하고 기본값은 `1.0`으로 둔다.

### 3.2 정수와 안전 하한

- Wave 적 수는 `round`로 계산한다.
- 원본 Wave의 해당 적 수가 1 이상이면 배수 적용 후 최소 1마리를 보장한다.
- 원본 수가 0이면 배수 적용 후에도 0이다.
- HP와 피해는 0보다 큰 실수값을 허용하되, 생성 직전에 유효성 검사를 한다.
- 이동 속도는 0보다 작아지지 않는다.
- 기본 콘텐츠의 `minimumSpawnInterval`은 Wave 스케줄을 계산할 때 먼저 반영한다. 그 뒤 난이도·Endless 배수를 적용하고, 최종 결과에는 엔진 안전 하한을 적용한다. 따라서 Hard의 생성 간격 배수가 Stage의 기본 하한에 막혀 효과가 사라지지 않게 한다.
- 기본 정의 객체를 직접 변경하지 않고, Wave 생성 시 스케일된 복사본을 만든다.

## 4. 스토리 모드 레벨 설계

스토리 모드는 다음 계층으로 표현한다.

```text
Chapter(현재 Planet)
└─ Stage(현재 Region)
   └─ Wave
```

현재 지도 데이터가 `planetId`와 `regionId`를 사용하므로 1차 구현에서는 이 기술적 이름을 유지한다. `ProgressionManager`의 `currentPlanet/currentRegion`은 플레이어에게 표시할 때 각각 Chapter/Stage로 매핑한다. 데이터 전체를 두 이름으로 중복 저장하지 않는다.

### 4.1 Stage 콘텐츠 배수

Stage는 기존 Wave 구성 외에 선택적인 `difficulty` 블록을 가진다.

```json
{
  "id": "relay-fields",
  "name": "Relay Fields",
  "difficulty": {
    "hpMultiplier": 1.05,
    "countMultiplier": 1.10,
    "speedMultiplier": 1.02,
    "contactDamageMultiplier": 1.00,
    "spawnIntervalMultiplier": 0.96
  },
  "waves": [
    { "standard": 14, "tanker": 0 },
    { "standard": 12, "tanker": 2 },
    { "standard": 10, "tanker": 4 }
  ]
}
```

생략된 Stage 배수는 모두 `1.0`으로 처리한다. Stage 배수는 플레이어 난이도와 곱하며, 난이도 선택이 Stage 고유 설계를 덮어쓰지 않게 한다.

### 4.2 Chapter/Stage 난이도 곡선

스토리의 난이도는 적 HP만 높이는 방식으로 진행하지 않는다.

1. 첫 Chapter의 첫 Stage는 이동·조준·자원 수집을 학습하는 구간이다.
2. 중간 Stage는 적 수와 생성 간격을 높여 지속적인 위치 선정과 자원 소비를 요구한다.
3. 후반 Stage는 Tanker 비율, Wave 길이, 접촉 피해를 조합해 현재 빌드를 검증한다.
4. 새 Chapter는 소폭의 수치 상승과 새로운 적 구성 또는 패턴을 우선 추가한다. 새로운 적 종류가 없으면 HP 상승을 최소화하고 수·구성·등장 타이밍으로 차이를 만든다.

Stage별 시작 후보는 다음 범위를 넘지 않도록 한다.

| 구간 | HP | 적 수 | 속도 | 생성 간격 |
| --- | ---: | ---: | ---: | ---: |
| 첫 Stage | 1.00 | 1.00 | 1.00 | 1.00 |
| 같은 Chapter 중간 | 1.05~1.12 | 1.05~1.15 | 1.00~1.04 | 0.96~1.00 |
| Chapter 마지막 | 1.12~1.25 | 1.15~1.30 | 1.04~1.08 | 0.90~0.96 |

이 범위는 Normal 기준이다. Easy/Hard는 `difficulty.json`의 배수를 추가로 적용한다.

## 5. 무한 모드 설계

무한 모드는 하나의 시작 아레나와 반복 가능한 Wave 패턴으로 시작하고, Wave가 끝나도 승리 상태로 전환하지 않는다. 5 Wave마다 `threatTier`를 1 올린다.

```text
threatTier = floor((currentWave - 1) / tierWaveCount)
```

위협 배수는 다음과 같이 적용한다.

```text
hp       × hpPerTier ^ threatTier
count    × countPerTier ^ threatTier
speed    × min(speedPerTier ^ threatTier, speedMultiplierCap)
damage   × contactDamagePerTier ^ threatTier
interval × spawnIntervalPerTier ^ threatTier
```

최종 생성 간격은 `max(engineSafetyFloor, scaledInterval)`로 계산한다. Story와 Endless의 콘텐츠 정의는 각자의 기준 간격을 제공하고, `difficulty.json`의 Endless `minimumSpawnInterval`은 Endless용 안전 하한으로 사용한다. Story에도 동일한 목적의 엔진 하한을 두되, 콘텐츠 JSON의 Stage 하한과 혼동하지 않는다.

초기 1~5 Wave는 빌드 준비 구간으로 둔다. 이후에는 적 수, Tanker 비율, 생성 간격을 순차적으로 높인다. 속도는 상한을 두어 플레이어가 반응할 수 없는 적을 만들지 않는다. 현재 적 타입이 Standard와 Tanker뿐이므로 Boss/Elite 추가는 이 플랜의 범위에서 제외한다.

무한 모드는 최종 Wave가 없으므로 결과 화면에 다음 기록을 남긴다.

- 도달 Wave
- 최고 `threatTier`
- 처치한 적 수
- 선택한 난이도
- Core 잔여 HP

## 6. 모듈 및 무기 초기 power

여기서 말하는 초기 `power`는 별도의 자원 `power`가 아니라, 레벨 1에서 제공하는 기능 성능이다. 현재 모듈 JSON의 `baseStats`를 초기 power의 단일 원천으로 사용한다.

### 6.1 현재 기준선

| 모듈 | 초기 기준 수치 | 역할 |
| --- | --- | --- |
| Core | `maxHp: 100` | 생존과 격자 확장 |
| Power Pack | `movementSpeed: 180` | 이동 속도 |
| Caterpillar Track | `trackMaxSpeed: 180` | 최대 주행 속도 |
| Armor Plate | `armorValue: 20` | 접촉 피해 완화 |
| Direct Weapon | `damage: 30`, `fireRate: 0.2`, `range: 600` | 단일 대상 처리 |
| Arc Weapon | `damage: 90`, `fireRate: 0.9`, `aoeRadius: 120`, `range: 800` | 군중 처리 |

직사 무기의 이론상 단일 대상 DPS는 `30 / 0.2 = 150`이다. 곡사 무기는 단일 대상 DPS만 비교하지 않고, `90 / 0.9`에 동시 피격 수와 폭발 범위를 포함해 평가한다. 따라서 두 무기를 같은 DPS로 맞추지 않고 서로 다른 상황에서 선택 가치가 있도록 한다.

### 6.2 초기 power 원칙

- 레벨 1 기본 무기만으로 첫 Story Stage를 숙련자가 클리어할 수 있어야 한다.
- 초기 무기는 적을 자동으로 모두 지우지 않는다. 이동과 조준 우선순위가 필요해야 한다.
- Core HP, 이동 속도, 장갑, 생산 속도는 서로 다른 생존·경제 축으로 유지한다.
- 난이도 선택은 위 초기 power를 변경하지 않는다.
- 새 모듈을 추가할 때는 실제 수치와 역할을 함께 기록하고, 단일 `power` 숫자 하나로 기능을 압축하지 않는다.

## 7. 모듈 및 무기 강화 수치

강화는 현재의 모듈별 `upgradeTree`와 `add/multiply` 효과를 유지한다. 전역 레벨 공식이나 JSON 스크립트는 추가하지 않는다.

### 7.1 강화량 기준

- 첫 선택지는 해당 역할의 실전 성능을 약 10~20% 높인다.
- 후속 선택지는 약 8~15% 높인다.
- 한 노드는 피해·공격속도·사거리·범위를 동시에 크게 올리지 않는다.
- 공격속도 강화는 현재 `DirectWeapon`의 최소 `0.075`, `ArcWeapon`의 최소 `0.4` 제한을 넘지 않는다.
- Core HP·Armor·이동 속도 강화도 첫 선택에서 약 10~25% 범위로 시작한다.
- 생산·수집 모듈은 생산량 증가와 간격 감소를 같은 가지에 중복 배치하지 않는다.

### 7.2 강화 선택지의 역할 분리

무기 선택지는 다음 중 서로 다른 두 가지 이상을 선택하게 만든다.

- DPS 증가: `damage` 또는 `fireRate`
- 안정성 증가: `range`, `projectileSpeed`, `maxDistance`
- 군중 처리 증가: `aoeRadius` 또는 다중 대상 관련 효과

플레이어는 모든 상황에서 같은 노드를 고르는 것이 아니라, 현재 Stage의 적 구성과 자신의 조작 방식에 따라 선택해야 한다. 강화 비용은 현재 `matter` 기반을 유지하고, 효과 대비 비용이 낮은 노드가 한 가지 빌드를 고정하지 않도록 플레이테스트에서 조정한다.

## 8. 실력 기반 클리어 기준

난이도는 다음 원칙을 지킨다.

- 동적 난이도 보정과 플레이어 HP 기반 rubber-banding을 사용하지 않는다.
- 같은 모드·Chapter/Stage·난이도에서는 적 압력이 예측 가능해야 한다.
- 적 접촉은 이동 실수나 위험한 위치 선정의 결과여야 하며, 화면 밖에서 즉시 맞는 피해를 만들지 않는다.
- 실패 원인을 `DPS 부족`, `접촉 허용`, `자원 소비 지연`, `업그레이드 선택`, `위험한 이동` 중 하나로 설명할 수 있어야 한다.
- Normal 첫 Stage는 초기 직사 무기와 기본 이동만으로 숙련자가 클리어 가능해야 한다.
- Hard는 같은 빌드로도 최적의 이동·타깃 우선순위·업그레이드 순서를 선택하면 클리어 가능해야 한다.
- Easy는 실수를 허용하는 여유를 늘리되, 무적이나 자동 클리어를 제공하지 않는다.

플레이테스트에서 다음 값을 기록한다.

- Wave별 Core 피해량과 접촉 횟수
- 적이 생존한 평균 시간과 Tanker 처치 시간
- Wave 종료 시 남은 적 수
- 획득·소비한 Matter와 Ammo
- 선택한 업그레이드와 클리어 여부

특정 Stage의 실패가 대부분 DPS 부족으로만 발생하면 무기 강화량과 적 HP를 함께 재검토한다. 접촉 피해가 대부분이면 속도·생성 위치·경고 시간을 먼저 검토하고, 적 HP를 낮추는 방식으로만 해결하지 않는다.

## 9. 구현 대상

### 신규 파일

- `src/data/difficulty.json`: 플레이어 난이도와 무한 모드 배수
- `src/core/DifficultyManager.ts`: 프로필 검증, 난이도 선택, 적/Wave 스케일 계산

### 수정 파일

- `src/core/ProgressionManager.ts`: Stage 콘텐츠 배수와 Chapter/Stage 표시 정보
- `src/core/WaveManager.ts`: 난이도·Stage·무한 위협 배수를 적용한 Wave 생성
- `src/entities/Enemy.ts`: 스케일된 적 정의를 받아 HP·속도·접촉 피해를 초기화
- `src/core/Game.ts`: 모드·난이도 런 설정, 무한 모드 종료 조건과 기록
- `src/ui/HUDManager.ts`: 모드/난이도 선택, 현재 Chapter·Stage·난이도 표시
- `src/data/progression.json`: Stage별 선택적 `difficulty` 블록과 Story Wave 조정
- `src/data/tanks/starter/*.json`: 초기 power와 강화 효과의 기준값 조정

`TankDefinitionLoader`는 현재의 `baseStats`, `upgradeTree`, 허용 stat 검증을 유지한다. 밸런스 메모용 필드가 필요해질 때도 런타임 수치와 분리하고, 임의 수식·스크립트는 허용하지 않는다.

## 10. 구현 순서

1. `difficulty.json`의 타입과 유효성 규칙을 정의한다.
2. `DifficultyManager`에서 `easy/normal/hard` 프로필을 읽고 선택 상태를 관리한다.
3. 적 정의를 복사해 HP·속도·접촉 피해 배수를 적용한다.
4. Wave 적 수와 생성 간격에 난이도·Stage 배수를 적용한다.
5. 기존 Planet/Region 진행을 Chapter/Stage 표시와 연결한다.
6. 반복 Wave와 `threatTier`를 사용해 Endless 모드를 추가한다.
7. 메뉴 또는 시작 화면에서 모드·난이도를 선택하고 런 중에는 고정한다.
8. 현재 모듈·무기 JSON의 초기 power와 강화량을 기준 범위에 맞춰 조정한다.
9. 플레이테스트 지표를 기록하고 Stage별 수치를 조정한다.
10. 일시정지 시 기존 규칙을 유지한다. 모듈 설치·업그레이드는 가능하고, 이동·적·자동 생산·자원 수집·전투 진행은 멈춘다.

## 11. 검증 계획

### 자동 검증

- `npm run build`
- `git diff --check`
- 존재하지 않는 난이도 ID, 중복 프로필 ID, 음수 배수, 0 이하 생성 간격이 데이터 검증에서 실패하는지 확인
- Easy/Normal/Hard의 최종 HP·수·속도·접촉 피해·생성 간격 순서가 의도와 일치하는지 확인
- 원본 적 정의와 원본 Wave가 스케일링 후 변형되지 않는지 확인
- 원본 Wave의 적 수가 0일 때 Easy/Hard에서도 0인지 확인
- 무한 모드의 `threatTier`가 5 Wave마다 한 번만 상승하는지 확인
- Endless 속도가 상한을 넘지 않고 생성 간격이 하한보다 작아지지 않는지 확인

### 브라우저 검증

- 런 시작 화면에서 Story/Endless와 Easy/Normal/Hard를 선택할 수 있는지 확인
- 같은 Stage를 세 난이도로 시작했을 때 적 HP·수·속도·접촉 피해·생성 간격이 JSON 배수대로 달라지는지 확인
- 난이도 선택이 플레이어 무기와 모듈 초기 수치를 변경하지 않는지 확인
- Chapter/Stage 전환 시 난이도가 유지되는지 확인
- Story 마지막 Wave에서 적을 모두 처치하면 기존 지역/행성 진행이 유지되는지 확인
- Endless에서 Wave가 계속 생성되고 5 Wave 단위로 압력이 상승하는지 확인
- 일시정지 중에는 자동 생산·수집·전투·적 이동이 멈추고 모듈 설치·업그레이드만 가능한지 확인
- Easy가 자동 클리어가 아니고 Hard가 수치상 불가능한 상태가 아닌지 확인

## 12. 범위 제외

- 계정 기반 메타 진행과 난이도별 영구 보너스
- 플레이어 성과에 따른 실시간 난이도 보정
- JSON 안에 임의 수식·스크립트를 실행하는 시스템
- 난이도별 별도 무기 수치 테이블
- Boss/Elite 전용 Endless 규칙
- Chapter/Stage 데이터의 전면적인 `planet/region` 이름 변경
- 새 적 행동을 JSON만으로 생성하는 기능
