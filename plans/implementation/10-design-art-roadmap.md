# 10. 디자인·아트 단계 분할 로드맵

## 현재 적용 계획

이 문서는 와이어프레임 단계의 Canvas 도형 렌더링을 최종 목표인 2D 픽셀 아트와 게임 UI로 확장하기 위한 상위 실행 계획이다. 11~19 단계는 한 번에 모든 이미지를 교체하지 않고, 공통 규격을 먼저 고정한 뒤 탱크·적·자원·맵·UI를 순서대로 제작하고 마지막에 코드 연결과 시각 QA를 수행한다.

기능 규칙과 콘텐츠 수치는 기존 계획을 따른다.

- 모듈·전투 그리드 구조: [06.5-mid-term-review.md](06.5-mid-term-review.md)
- 탱크·적·행성·지역 콘텐츠: [07-progression-content.md](07-progression-content.md)
- 업그레이드 웹과 튜토리얼 UI: [99-ui-tutorial-polish.md](99-ui-tutorial-polish.md)
- 배포 전 검증: [100-release-verification.md](100-release-verification.md)
- 전체 기준선: [00-baseline.md](00-baseline.md)

이 로드맵은 게임 규칙을 새로 설계하는 문서가 아니다. 이미지와 애니메이션을 추가해도 모듈 ID, 격자 좌표, 적의 충돌 반경, 자원 흐름, 일시정지 규칙은 유지한다.

## 디자인 리드와 적용 범위

`design-taste-frontend`의 브리프 추론 형식을 이 게임에 맞게 적용한다.

> Reading this as: PC 브라우저용 2D 탑다운 차량 방어 게임, 전투 중 식별성이 우선인 기술적·산업적 픽셀 아트 언어, native Canvas 렌더링과 최소한의 HTML/CSS 보조 레이어를 사용하는 방향.

이 프로젝트는 랜딩 페이지가 아니므로 해당 스킬의 React, Tailwind, 마케팅 페이지 블록 규칙은 적용하지 않는다. 대신 아래 원칙만 공통 계약으로 사용한다.

- `DESIGN_VARIANCE: 6`: 탱크와 맵은 약간 비대칭으로 개성을 주되, 격자·피격 판정·모듈 선택 상태는 즉시 읽혀야 한다.
- `MOTION_INTENSITY: 5`: 발사 반동, 피격 플래시, 폭발, 자원 획득처럼 상태를 전달하는 애니메이션만 사용한다. 장식 목적의 무한 모션은 만들지 않는다.
- `VISUAL_DENSITY: 7`: 전투 화면과 HUD에 정보가 많으므로 장식보다 명도·크기·간격으로 계층을 만든다.
- 현재의 짙은 남색 전장, 청록 선택 강조, 노랑 자원 계열, 초록 성공, 빨강 피해 신호를 기준으로 삼는다. 새 색을 추가할 때는 기능적 의미가 있어야 하며 무작위 네온·보라색 글로우는 추가하지 않는다.
- 모든 픽셀 아트는 공통 픽셀 그리드와 투명 여백 규격을 지킨다. Canvas에서는 `imageSmoothingEnabled = false`를 기본으로 하고, CSS 확대에서도 픽셀 경계를 보존한다.
- 이미지 생성이 필요한 경우 `imagegen`을 사용해 먼저 기준 asset을 만들고, 같은 프롬프트·팔레트·시점·광원 규칙으로 변형을 만든다. 생성 결과를 그대로 개별 구현에 흩뿌리지 않고 manifest와 메타데이터를 통해 연결한다.
- 상태 애니메이션은 `prefers-reduced-motion`이 켜진 환경에서 정적 프레임 또는 즉시 전환으로 낮춘다. 화면 흔들림과 강한 플래시는 생략할 수 있어야 한다.

## 공통 asset 계약

11 단계에서 아래 계약을 먼저 확정하고 12~19 단계에서 변경하지 않는다.

### 저장 위치

```text
public/assets/game/
  tank/
  enemies/
  resources/
  maps/
  effects/
  ui/
```

- 정적 PNG와 생성된 raster asset은 `public/assets/game/` 아래에 둔다.
- 실행 코드가 직접 파일명을 조합하지 않도록 `src/data/assets.json` 또는 동등한 타입화 manifest를 통해 logical ID와 URL을 매핑한다.
- 이미지 로딩은 하나의 `AssetManager`가 담당한다. 엔티티는 `Image` 객체를 직접 만들거나 매 프레임 파일을 조회하지 않는다.
- 각 asset에는 logical ID, 파일 경로, 원본 크기, draw 크기, pivot/anchor, frame 수, frame duration, z-order, 대체 렌더링 여부를 기록한다.
- 파일명은 소문자 kebab-case로 통일한다. 게임 데이터의 `standard`, `tanker`, `aurelia`, `landing-zone` 같은 ID를 그대로 사용해 연결 오류를 줄인다.

### 렌더링 규칙

- 게임 좌표계는 현재의 1280x720 논리 좌표를 유지한다. 이미지 교체 때문에 충돌·사거리·격자 좌표를 픽셀 좌표에 맞춰 재작성하지 않는다.
- 스프라이트의 중심, 탱크 격자 원점, 무기 발사점, 적의 충돌 중심은 메타데이터로 고정한다.
- 정적 이미지는 단일 PNG를 우선하고, 여러 프레임이 필요한 경우에만 sprite sheet를 사용한다.
- 이미지가 없거나 로딩에 실패하면 현재의 Canvas 도형 렌더러가 fallback으로 동작해야 한다. asset 오류가 게임 시작이나 재시작을 막아서는 안 된다.
- 시각 asset은 hitbox를 결정하지 않는다. 맵의 장식, 그림자, 파편은 충돌 영역을 변경하지 않으며, 실제 충돌 규칙은 기존 시스템 데이터가 계속 소유한다.

## 단계 의존성

```text
11 공통 규격
 ├─ 12 탱크·모듈
 ├─ 13 적
 ├─ 14 자원·효과
 └─ 15 맵
        ↓
16 asset 로더·Canvas 연결
        ↓
17 HUD·업그레이드 UI
        ↓
18 통합·성능·폴백
        ↓
19 시각 QA·릴리스
```

12~15는 11의 규격이 확정되면 병렬 제작할 수 있지만, 16의 코드 연결은 최소 한 종류의 기준 asset과 manifest가 준비된 뒤 시작한다. 17은 16에서 확정한 색·타이포그래피·아이콘 규칙을 사용한다.

## 11. 아트 디렉션과 공통 asset 규격

상세 실행 계획: [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md)

### 목표

와이어프레임의 도형을 대체할 수 있는 픽셀 아트 스타일, 팔레트, 스프라이트 크기, pivot, 명명 규칙, 생성 프롬프트, 검수 기준을 문서와 샘플 asset으로 고정한다.

### 작업

1. 현재 `Game.ts`, `Vehicle.ts`, `Enemy.ts`, `ResourcePickup.ts`, `Projectile.ts`, `HUDManager.ts`의 도형 렌더링 색상과 레이어 순서를 감사한다.
2. 전장 배경, 플레이어 탱크, 적, 자원, 효과, UI가 같은 시점과 광원을 공유하도록 art bible을 만든다.
3. 기준 팔레트와 의미를 확정한다. 배경·외곽선·플레이어·적·자원·피해·선택 상태를 구분하되, 대비가 필요한 의미 색만 추가한다.
4. 기준 캔버스 크기와 픽셀 단위를 정한다. 모듈 1칸, 탱크 전체, 적 표준형, 자원 픽업의 기준 draw 크기를 함께 기록한다.
5. `assets.json` manifest 형식, 파일명, 투명 여백, anchor/pivot, animation frame 명세를 만든다.
6. `standard` 적, starter 탱크, resource 픽업, UI 아이콘 중 각 1개를 기준 샘플로 생성한다. 이미지 생성 시 동일한 style prompt와 negative prompt를 재사용한다.

### 예상 산출물

- 아트 방향 문서 또는 이 파일의 확장 섹션
- 공통 팔레트와 렌더 레이어 표
- asset manifest 초안
- 4종 기준 샘플 asset 및 생성 프롬프트 기록

### 완료 조건

- 12~15에서 사용할 모든 asset의 logical ID와 상태 범위가 정해져 있다.
- 샘플만 놓고도 플레이어, 적, 자원, 선택 상태를 구분할 수 있다.
- 생성 asset과 fallback 도형의 anchor가 같은 기준점을 사용한다.
- 이미지 자체의 장식이 게임 규칙이나 hitbox를 암시적으로 바꾸지 않는다.

## 12. 탱크·코어·전투 모듈 asset

### 목표

starter 탱크와 현재 모듈 구조를 유지하면서 플레이어 탈것과 모듈 종류를 한눈에 식별할 수 있게 만든다.

### 대상 asset

- 탱크 외곽 프레임과 이동 상태
- Core와 코어 손상 상태
- 내장 시스템의 시각 구분: resource, gatherer, recycler, arsenal, composer, rail, power pack, caterpillar track, armor plate
- 전투 모듈: `direct-weapon`, `arc-weapon` 및 이후 탱크별 전투 모듈
- 격자 타일, 빈 셀, 설치 미리보기, 선택 outline
- 모듈 HP 손상·비활성 상태

### 작업

1. `Vehicle`의 논리 좌표와 `CombatGrid`의 anchor를 기준으로 스프라이트 pivot을 정의한다.
2. 모듈의 `size`가 `1x1`, `2x1`, `2x2`일 때 하나의 인스턴스와 하나의 visual footprint로 보이게 한다.
3. 설치 전 미리보기는 실제 asset을 낮은 불투명도로 표시하되, 설치 불가 상태는 색 하나만이 아니라 외곽선·패턴·문구로도 구분한다.
4. 발사 모듈은 발사점과 방향을 메타데이터로 기록한다. 현재의 자동 조준과 무기 규칙은 변경하지 않는다.
5. 이미지 생성 결과를 `public/assets/game/tank/`와 `public/assets/game/ui/`에 배치하고 manifest에 등록한다.

### 연결 지점

- `src/entities/Vehicle.ts`
- `src/entities/Module.ts`
- `src/entities/CombatGrid.ts`
- `src/core/Game.ts`
- 16 단계의 `AssetManager`와 탱크 renderer

### 완료 조건

- starter 탱크가 전장 배경과 겹쳐도 Core, 외곽, 장착 모듈, 빈 격자가 분리되어 보인다.
- 2x1·2x2 모듈은 하나의 인스턴스로 렌더링되고 점유 셀 전체가 시각적으로 일관된다.
- 손상·비활성·선택·설치 미리보기 상태가 동시에 필요한 상황에서도 구분된다.
- asset을 제거해도 기존 도형 fallback으로 게임 플레이가 가능하다.

## 13. 적 종류와 적 상태 asset

### 목표

진행 데이터의 적 ID와 실제 화면의 실루엣을 일치시키고, 속도·체력·위협도를 읽기 쉬운 상태 표현으로 전달한다.

### 대상 asset

- `standard`: 빠른 근접 적
- `tanker`: 느리지만 체력이 높은 적
- 이동, 정지 접촉, 피격, 사망, 외곽 접촉 공격 상태
- 적별 shadow, 체력 바, 접촉 피해 피드백

### 작업

1. `src/data/progression.json`의 적 ID를 기준으로 파일명과 manifest key를 확정한다.
2. 두 적의 실루엣·크기·색 대비를 차별화하되, `radius` 값과 시각 중심을 어긋나게 만들지 않는다.
3. 적의 체력 바와 접촉 상태는 별도 Canvas 오버레이로 유지해 asset 크기와 관계없이 읽히게 한다.
4. 피격 플래시, 처치 파편, 접촉 피해 신호는 14 단계 효과 규칙을 공유한다.
5. 웨이브 수가 많아지는 후반 지역에서도 작은 적이 배경에 묻히지 않는지 확인한다.

### 연결 지점

- `src/entities/Enemy.ts`
- `src/core/WaveManager.ts`
- `src/core/Game.ts`
- 16 단계의 enemy renderer

### 완료 조건

- `standard`와 `tanker`를 색을 보지 않고도 실루엣과 크기로 구분할 수 있다.
- 적이 탱크 grid 외곽에 도달했을 때 접촉 상태가 공격 중임을 알 수 있다.
- 적 사망 asset과 보상 픽업 생성이 같은 위치에서 자연스럽게 이어진다.
- 적 수가 많은 웨이브에서도 체력 바, 외곽선, 프레임이 과도하게 겹치지 않는다.

## 14. 자원·발사체·피격·폭발 효과 asset

### 목표

자원 흐름과 전투 피드백을 숫자만이 아니라 시각적 사건으로 전달한다.

### 대상 asset

- resource 픽업과 잔해
- matter, ammo, nano를 구분하는 아이콘 또는 픽업 변형
- 직사 발사체와 곡사 발사체의 궤적·착탄
- 피격 플래시, 장갑 흡수, Core 피해, 폭발, 처치 파편
- 자원 수집, 생산, 변환, 저장 한도 초과 피드백

### 작업

1. `ResourcePickup`, `Projectile`, `VisualEffect`의 현재 생성·수명·렌더 순서를 조사한다.
2. 자원 종류마다 모양을 먼저 차별화하고 색상은 보조 신호로 사용한다.
3. 발사체 asset의 발사점, 이동 방향, 곡사 착탄 위치가 기존 물리 계산과 일치하는지 확인한다.
4. Canvas 파티클로 충분한 효과와 생성 이미지가 필요한 효과를 구분한다. 단순한 짧은 파티클은 코드로 유지하고, 반복되는 핵심 실루엣과 폭발 중심은 생성 asset을 사용한다.
5. 효과 수명과 개수에 상한을 둔다. 일시정지 중에는 새로운 효과를 생성하지 않는다.

### 연결 지점

- `src/entities/ResourcePickup.ts`
- `src/entities/Projectile.ts`
- `src/core/Game.ts`
- `src/core/ResourceStorage.ts`

### 완료 조건

- 자원 획득과 변환 결과를 HUD를 보지 않고도 짧은 시각 피드백으로 알 수 있다.
- 직사와 곡사 공격의 궤적과 착탄이 혼동되지 않는다.
- 장갑에 막힌 피해와 Core에 전달된 피해가 다른 피드백을 낸다.
- 효과가 누적되어도 전장, 적, 탱크의 실루엣을 가리지 않는다.

## 15. 행성·지역 맵 asset

### 목표

현재 진행 데이터의 행성과 지역을 화면 분위기와 지형 차이로 표현하되, 장식과 게임 판정을 분리한다.

### 대상 맵

- `aurelia / landing-zone`
- `aurelia / relay-fields`
- `cinder / ash-basin`
- `cinder / core-ruins`

### 작업

1. 행성별 색조와 지역별 배경·지형·잔해 motif를 정한다. Aurelia와 Cinder가 시작 즉시 구분되어야 한다.
2. 배경, 중경 장식, 전투 영역, 탱크 grid 외곽, 스폰 영역을 별도 레이어로 나눈다.
3. 맵 asset은 `planetId`와 `regionId`를 기준으로 연결한다. 지역을 추가해도 renderer 코드를 수정하지 않도록 manifest와 맵 정의를 분리한다.
4. 장애물은 우선 시각 장식으로 추가하며, 실제 이동·충돌을 막는 장애물은 별도 콘텐츠 규칙과 판정 데이터가 준비된 경우에만 추가한다.
5. 반복 타일은 단순 반복이 보이지 않도록 최소한의 변형을 준비하되, 랜덤 배치가 적 스폰과 탱크 grid를 침범하지 않게 한다.

### 연결 지점

- `src/core/Game.ts`
- `src/core/WaveManager.ts`
- `src/data/progression.json`
- 후속 `src/data/maps/<planetId>/<regionId>.json` 및 map renderer

### 완료 조건

- 네 지역이 배경만으로도 구분된다.
- 맵 장식이 적 스폰, 적의 grid 외곽 정지, 탱크 이동, 발사체 경로를 가리지 않는다.
- 지역 변경 시 코드의 if/else 분기 대신 지역 ID 기반으로 맵 asset이 선택된다.
- 현재 1280x720 화면에서 반복 타일의 이음새와 빈 공간이 눈에 띄지 않는다.

## 16. asset 로더·Canvas 렌더링 연결

### 목표

이미지 로딩과 게임 로직을 분리하고, 기존 도형 렌더링을 안전하게 asset-backed renderer로 교체한다.

### 작업

1. manifest를 검증하는 타입과 `AssetManager`를 추가한다. 중복 ID, 잘못된 경로, frame 정보 누락을 시작 시 명확한 경고로 표시한다.
2. 게임 시작 시 필요한 asset을 preload하고, 로딩 실패 시 해당 asset만 fallback으로 전환한다. 전체 게임이 멈추지 않게 한다.
3. entity의 update/충돌 로직은 유지하고, `render()`가 asset manager에서 준비된 sprite와 메타데이터를 읽도록 연결한다.
4. 맵 → 그림자/배경 → 탱크 grid → 적/픽업 → 발사체 → 효과 → HUD 순서의 z-order를 고정한다.
5. 논리 좌표와 CSS 표시 크기를 분리하고, `devicePixelRatio`나 브라우저 크기 변화가 hitbox를 어긋나게 하지 않는지 확인한다.
6. 프레임 애니메이션은 `dt` 기반으로 재생한다. 매 프레임 `new Image()`를 만들거나 파일을 요청하지 않는다.
7. `prefers-reduced-motion`을 감지해 애니메이션을 첫 프레임 또는 짧은 상태 전환으로 낮추고, 화면 흔들림을 비활성화한다.

### 예상 파일

- `src/core/AssetManager.ts`
- `src/data/assets.json` 또는 동등한 타입화 manifest
- 필요 시 `src/rendering/` 아래의 얇은 sprite/map renderer
- `src/core/Game.ts`
- `src/entities/Vehicle.ts`, `Enemy.ts`, `Projectile.ts`, `ResourcePickup.ts`

### 완료 조건

- asset-backed 렌더링과 도형 fallback이 같은 논리 좌표·hitbox를 사용한다.
- 첫 실행, 재시작, 지역 전환에서 로딩 경합이나 깜빡임이 없다.
- 이미지 파일을 일부러 누락해도 오류 메시지와 fallback이 나타나며 플레이가 계속된다.
- 발사, 피격, 사망, 자원 획득 애니메이션의 수명은 게임 일시정지 규칙과 일치한다.

## 17. HUD·업그레이드 웹·일시정지 UI 시각화

### 목표

현재 `HUDManager`의 조작 계약을 유지하면서 정보의 우선순위와 상태 피드백을 최종 시각 체계로 정리한다.

### 대상 UI

- 상단 Core HP, 자원, Wave, 조작 안내
- 우측 `UPGRADE WEB`과 시스템·전투 모듈 선택 목록
- 격자 선택, 설치 가능/불가 미리보기, 모듈 footprint 표시
- 업그레이드 root·선택·잠금·비활성·비용 부족 상태
- 일시정지 오버레이, 결과 화면, 오류·성공 피드백
- resource, matter, ammo, nano, HP, wave용 아이콘과 숫자 표현

### 작업

1. 기존 텍스트와 클릭 hitbox를 먼저 목록화하고, 기능 명칭과 데이터 ID는 임의로 바꾸지 않는다.
2. 현재의 짙은 패널과 청록 선택 강조를 기반으로 색·선·두께·픽셀 아이콘 규칙을 통일한다.
3. 숫자, 아이콘, 짧은 상태 문구의 시각 순서를 정한다. 자원 부족·잠금·선택 상태는 색상 외에 명도, 외곽선, 아이콘, 문구로도 표현한다.
4. `UPGRADE WEB`의 노드와 연결선은 배경 장식이 아니라 실제 parent/child 관계를 읽히게 하는 구조로 그린다.
5. 일시정지 중 허용되는 전투 모듈 설치와 업그레이드는 활성 상태로 유지하고, 이동·적·발사체·자동 생산·수집·변환은 정지 상태로 명확히 보인다.
6. 우선 Canvas UI를 유지해 현재 hitbox와 좌표계를 보존한다. DOM overlay가 필요해질 때도 조작의 단일 소유자를 정한 뒤 단계적으로 도입한다.
7. `index.html`의 컨테이너와 Canvas 크기 조정은 좁은 화면에서 패널이 전장을 가리지 않도록 검증한다.

### 연결 지점

- `src/ui/HUDManager.ts`
- `src/core/InputManager.ts`
- `src/core/Game.ts`
- `index.html`
- `src/data/assets.json`의 UI asset 항목

### 완료 조건

- 처음 플레이하는 사람이 Core HP, 자원, Wave, 일시정지 상태를 즉시 파악할 수 있다.
- 빈 격자 선택, 설치 가능, 비용 부족, 선택된 모듈, 업그레이드 잠금 상태가 서로 겹치지 않는다.
- 일시정지 중 가능한 조작과 중지된 시스템이 UI에 일치한다.
- 1280x720에서 텍스트 잘림, 노드 겹침, 클릭 영역과 표시 영역의 불일치가 없다.

## 18. 전체 asset 통합·성능·폴백 검증

### 목표

12~17에서 만든 asset과 renderer를 전체 게임 루프에 연결하고, 생성 이미지가 실제 플레이 성능과 안정성을 해치지 않도록 정리한다.

### 작업

1. manifest의 모든 logical ID가 실제 파일, renderer, fallback 중 하나와 연결되는지 자동 또는 수동 체크리스트로 검사한다.
2. 시작 화면·지역 전환·재시작·게임 오버·승리 화면에서 이미지 로딩과 상태 초기화를 확인한다.
3. 이미지 디코딩과 preload는 게임 시작 시 한 번만 수행하고, 매 프레임 할당·네트워크 요청·불필요한 큰 캔버스 복사를 제거한다.
4. 다수 적, 다수 발사체, 동시 폭발, 자원 픽업 누적 상황에서 draw call과 효과 개수를 관찰한다.
5. 원본 이미지가 지나치게 크면 적절한 draw 크기로 재수출하고, 투명 여백과 압축 상태를 정리한다.
6. 누락 asset, 손상 PNG, 잘못된 frame index, 잘못된 anchor를 의도적으로 시험한다.
7. `agents.md`의 일시정지 규칙과 `plans/system.md`의 모듈·전투 규칙이 시각 상태와 실제 동작에서 일치하는지 확인한다.

### 완료 조건

- 모든 주요 entity가 asset 사용 여부와 관계없이 동일한 update·충돌 결과를 낸다.
- 가장 많은 적이 나오는 `core-ruins`에서도 화면이 지나치게 끊기거나 입력이 늦지 않다.
- asset 오류는 어느 한 entity의 fallback으로 제한되고, 게임 전체의 검은 화면이나 무한 대기로 이어지지 않는다.
- 일시정지, 재시작, 승패 전환에서 자동 생산·수집·변환이 잘못 진행되지 않는다.

## 19. 아트 QA·폴리시·릴리스 체크

### 목표

이미지 품질, 플레이 식별성, 문서·코드 연결, 배포 산출물을 한 번에 검수해 디자인·아트 작업을 완료한다.

### 시각 QA

- 탱크, Core, 전투 모듈, `standard`, `tanker`, resource 픽업을 작은 크기에서도 식별할 수 있는가
- 탱크와 적의 외곽선이 맵 배경과 충분히 대비되는가
- 모듈 손상, 비활성, 선택, 설치 미리보기, 업그레이드 선택 상태가 색상 하나에만 의존하지 않는가
- 자원 종류와 발사체 종류가 모양과 동작으로 구분되는가
- `aurelia`와 `cinder`, 네 지역의 배경 분위기가 일관되면서도 구별되는가
- 효과가 핵심 플레이어·적·HUD·클릭 영역을 가리지 않는가
- 픽셀 경계, 투명 가장자리, sprite pivot, animation frame 전환이 튀지 않는가
- `prefers-reduced-motion`에서 과한 플래시·흔들림·반복 모션이 사라지는가

### 기능 회귀 QA

- 이동, 적 스폰, 직사·곡사 발사, 충돌, 처치 보상
- 모듈 선택, 1x1·2x1·2x2 설치, 업그레이드, 잠금·비용 부족 처리
- 일시정지 중 모듈 설치·업그레이드만 가능하고 자동 생산·자원 수집은 중지되는가
- 지역 클리어, 다음 지역·다음 행성 전환, 게임 오버, 재시작
- Canvas 표시 크기를 바꿔도 마우스 hitbox와 실제 선택 위치가 일치하는가

### 완료 명령과 산출물

1. `npx.cmd tsc --noEmit`
2. `npm.cmd run build` 또는 저장소의 Vite 대체 출력 경로를 사용한 빌드
3. `git diff --check`
4. 1280x720 기준 수동 플레이 기록과 주요 화면 캡처
5. asset manifest 누락·중복·fallback 검사 결과
6. 생성 asset의 출처와 재생성에 필요한 prompt 기록

### 최종 완료 조건

- 11~19의 완료 조건을 순서대로 재현할 수 있다.
- 실제 플레이 화면은 asset을 사용하지만, 누락 asset이 있어도 fallback으로 기능을 잃지 않는다.
- 디자인 리드의 색·형태·모션·밀도 원칙이 탱크, 적, 자원, 맵, UI 전체에 일관되게 적용된다.
- 문서의 logical ID, manifest, 코드 renderer, 실제 파일명이 서로 일치한다.
- 기존 01~07 및 99~100의 기능·튜토리얼·배포 완료 조건이 깨지지 않는다.

## 작업 방식과 단계별 검증

각 단계는 다음 순서로 진행한다.

1. 기준선 빌드와 수동 플레이를 실행한다.
2. 해당 단계의 생성·수정 asset과 manifest 항목을 추가한다.
3. 최소 한 화면에서 실제 asset과 fallback을 각각 확인한다.
4. 기능 로직과 시각 로직을 분리한 상태로 `tsc --noEmit`, `npm.cmd run build`, `git diff --check`를 실행한다.
5. 완료 조건을 문서에 체크하고 다음 단계로 넘어간다.

새 이미지가 필요할 때마다 먼저 공통 art bible과 기존 샘플을 참조해 생성하고, 개별 화면에만 맞춘 일회성 스타일이나 무작위 팔레트를 만들지 않는다.

## 상세 실행 계획

각 단계는 바로 앞 단계의 산출물을 입력으로 받고, 다음 단계가 사용할 asset ID, manifest, renderer, 검증 결과를 명시적으로 인계한다.

- [11-art-direction-and-asset-contract.md](11-art-direction-and-asset-contract.md): 공통 art direction, logical ID, manifest, fallback 계약
- [12-tank-and-module-art.md](12-tank-and-module-art.md): 탱크·Core·내장 시스템·전투 모듈 asset
- [13-enemy-art.md](13-enemy-art.md): standard/tanker와 피해·접촉·파괴 상태 asset
- [14-resource-projectile-effects-art.md](14-resource-projectile-effects-art.md): 자원·투사체·피격·폭발 효과 asset
- [15-map-art.md](15-map-art.md): 행성·지역 배경, 타일, 장식 asset
- [16-asset-loader-canvas-integration.md](16-asset-loader-canvas-integration.md): loader, cache, Canvas sprite/fallback 연결
- [17-hud-upgrade-ui-art.md](17-hud-upgrade-ui-art.md): HUD, 설치, upgrade web, pause/result UI art
- [18-asset-integration-performance-fallback.md](18-asset-integration-performance-fallback.md): 전체 asset coverage, 성능, 오류와 fallback 통합 검증
- [19-art-qa-release.md](19-art-qa-release.md): 시각·기능 QA, release candidate, 최종 승인
