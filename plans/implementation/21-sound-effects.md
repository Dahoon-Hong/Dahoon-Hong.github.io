# 21. 전투·업그레이드 효과음 통합 상세 계획

## 현재 적용 계획

이 단계는 20단계의 라이선스 승인을 통과한 효과음을 현재 전투와 HUD 흐름에 바로 연결한다. 대사와 음성 안내는 포함하지 않는다. 효과음은 entity가 AudioManager를 직접 import하지 않고, 게임 도메인 event를 통해 Game이 한 곳에서 재생하도록 구성한다.

선행 계획:

- [20-sound.md](20-sound.md)
- 현재 pause 규칙: 일시정지 중 모듈 설치·업그레이드만 허용하고 자동 생산·수집과 게임 업데이트는 중지

후속 계획:

- [22-background-music.md](22-background-music.md)
- [100-release-verification.md](100-release-verification.md)

## 목표

- 발사, 폭발, 적 사망, 업그레이드 성공 효과음을 실제 시스템 event와 연결한다.
- direct weapon과 arc weapon의 행동을 구분하되, 같은 event가 frame마다 중복 재생되지 않도록 한다.
- 적 밀집 상황에서 효과음이 폭주하지 않도록 cooldown과 voice limit을 둔다.
- browser autoplay 정책을 지키면서 첫 사용자 입력 이후 안정적으로 재생한다.
- 음원 로딩 실패가 게임 시작, 전투, HUD 조작을 막지 않도록 한다.

## 범위

### 필수 효과음 logical ID

| Event | logical ID | 발생 위치 | 기본 정책 |
| --- | --- | --- | --- |
| 직사 무기 발사 | sfx.weapon.direct-fire | CombatModule이 DirectProjectile을 생성하는 순간 | 짧은 재생, 80ms 그룹 cooldown |
| 곡사 무기 발사 | sfx.weapon.arc-fire | CombatModule이 ArcProjectile을 생성하는 순간 | 직사 발사와 다른 음색 |
| 발사체 직접 적중 | sfx.weapon.impact | DirectProjectile이 적에게 피해를 적용하는 순간 | projectile 하나당 한 번 |
| 폭발 | sfx.weapon.explosion | ArcProjectile이 목표 지점에서 AOE 피해를 적용하는 순간 | frame당 중복 금지, 최대 voice 제한 |
| 적 사망 | sfx.enemy.death | 살아 있던 적이 dead 상태로 전환되는 순간 | 적 하나당 한 번 |
| 업그레이드 성공 | sfx.ui.upgrade-confirm | HUDManager가 UpgradeManager.select를 성공 처리한 순간 | pause 중에도 재생 가능 |

적 사망음은 최초 구현에서 standard와 tanker가 공통으로 사용할 수 있다. 두 음색이 꼭 필요할 때만 20단계 provenance를 거친 별도 ID를 추가한다.

## 시스템 연계 계약

### AudioManager

새 파일 src/core/AudioManager.ts를 추가한다. 외부 오디오 라이브러리는 사용하지 않고 Web Audio API를 사용한다.

AudioManager의 책임:

- src/data/audio.json에서 approved SFX만 읽고 fetch·decode한다.
- AudioContext를 첫 pointer, key, click 사용자 gesture 이후에 생성 또는 resume한다.
- playSfx(id, options)로 AudioBufferSourceNode를 생성한다.
- master volume과 sfx bus volume을 분리한다.
- id별 cooldownGroup, maxVoices, gain, playbackRate를 적용한다.
- 로딩 실패나 AudioContext 차단 시 조용히 fallback하고 console warning을 ID별 한 번만 남긴다.
- 모든 active SFX를 stopAll로 정리할 수 있다.

AudioManager는 entity의 규칙이나 피해 계산을 소유하지 않는다. entity는 domain event만 발생시키고 Game이 sound ID를 선택한다.

### Game event 흐름

현재 Game이 모든 entity update와 state 전환을 소유하므로 Game을 audio event dispatcher로 사용한다.

1. Game이 AudioManager를 생성한다.
2. 첫 사용자 입력 때 AudioManager.ensureReady를 호출한다.
3. CombatModule.update가 projectile을 생성하면 weapon-fired event를 Game에 전달한다.
4. Projectile.update가 적중 또는 폭발을 처리하면 impact 또는 explosion event를 전달한다.
5. Enemy가 alive에서 dead로 바뀐 시점을 한 번만 감지해 enemy-death event를 전달한다.
6. HUDManager는 upgrade 결과를 callback으로 Game에 전달하고, 성공 시 upgrade-confirm을 재생한다.
7. Game은 event를 AudioManager.playSfx로 변환하고, entity 내부에는 오디오 의존성을 추가하지 않는다.

권장 event 계약은 다음 의미를 가진다.

- weapon-fired: weapon kind와 world position을 포함
- projectile-impact: projectile kind와 world position을 포함
- explosion: aoe kind와 target position을 포함
- enemy-death: enemy type과 death position을 포함
- upgrade-confirm: upgrade node 또는 module ID를 포함

event payload는 사운드 선택과 spatialization을 위해 사용하지만, 현재 MVP에서는 위치에 따른 복잡한 3D 오디오 대신 global stereo pan 또는 global volume만 사용한다.

## 파일과 구현 대상

- src/core/AudioManager.ts
- src/data/audio.json의 sfx entries
- public/assets/audio/sfx/의 CC0 또는 승인된 효과음
- src/entities/Module.ts의 projectile 생성 event callback
- src/entities/Projectile.ts의 impact·explosion event callback
- src/entities/Enemy.ts 또는 Game.ts의 death transition event
- src/ui/HUDManager.ts의 upgrade 성공 callback
- src/core/Game.ts의 AudioManager 소유, event dispatch, GameState 동기화
- docs/audio-asset-provenance.md의 각 SFX 기록

기존 AssetManager는 이미지 전용으로 유지한다. 이미지 preload와 audio decode를 하나의 manager에 억지로 합치지 않는다.

## 재생 및 중복 방지 규칙

- direct-fire는 짧은 그룹 cooldown을 두고 다중 전투 모듈의 동시 발사를 제한한다.
- arc-fire와 explosion은 서로 다른 cooldownGroup을 사용한다.
- impact와 enemy-death는 같은 frame에 여러 개가 발생할 수 있으므로 각각 maxVoices를 둔다.
- 같은 적이 여러 경로에서 dead로 발견되어도 enemy-death는 한 번만 발생해야 한다.
- upgrade-confirm은 UpgradeManager.select가 비용 차감과 선택을 모두 성공시킨 경우에만 재생한다.
- insufficient, invalid placement, hover preview 사운드는 이번 단계에 추가하지 않는다.
- 효과음이 없어도 도형 fallback과 gameplay는 그대로 실행된다.

## pause 및 terminal 동작

- PLAYING에서는 무기·피격·폭발·사망 event를 재생한다.
- PAUSED에서는 Game update가 멈추므로 자동 전투 효과음이 새로 발생하지 않는다.
- PAUSED 중 사용자가 업그레이드를 성공시키면 upgrade-confirm만 재생한다.
- GAME_OVER, REGION_CLEARED, PLANET_CLEARED, VICTORY 전환 시 기존 gameplay SFX voice를 정리하고 결과음은 22단계 music 정책과 충돌하지 않게 별도 event로 남긴다.
- pause 처리 때문에 자동 생산·자원 수집·적·발사체 시간이 다시 진행되어서는 안 된다.

## 구현 및 검증 순서

### 21.1 라이선스 gate

- 20단계 provenance에서 approved인 SFX만 선택한다.
- runtime 파일과 manifest의 hash가 일치하는지 확인한다.
- 승인되지 않은 파일은 다운로드 폴더에 있어도 public/assets/audio에 복사하지 않는다.

### 21.2 공통 AudioManager 연결

- AudioContext lazy initialization, fetch/decode, buffer cache, failed fallback을 구현한다.
- master·sfx volume과 mute 상태를 만든다.
- 첫 click, keydown, pointer gesture와 연결한다.

### 21.3 전투 event 연결

- direct/arc projectile 생성 시 발사음을 연결한다.
- direct hit와 arc explosion 처리 지점에 impact/explosion event를 연결한다.
- enemy death transition을 한 곳에서 확정하고 death event를 한 번만 발행한다.

### 21.4 HUD event 연결

- HUDManager callback에 upgrade 성공 결과를 전달하는 경계를 추가한다.
- 성공한 업그레이드만 confirm 사운드를 재생한다.
- pause 중 업그레이드도 같은 경로로 테스트한다.

### 21.5 밀집도와 실패 경로 검증

- 여러 무기가 동시에 발사하는 상태에서 음량과 voice 수가 제한되는지 확인한다.
- audio file 1개 누락, decode 실패, AudioContext resume 실패를 각각 재현한다.
- 어떤 실패에서도 Game loop, Canvas render, module upgrade가 중단되지 않아야 한다.

### 21.6 명령과 수동 플레이

- npx.cmd tsc --noEmit
- npm.cmd run build
- git diff --check
- 시작 gesture 이후 direct fire, arc fire, impact, explosion, enemy death, upgrade를 순서대로 확인
- pause 중 5초 대기 후 자동 SFX가 발생하지 않는지 확인
- pause 중 업그레이드 성공음이 재생되는지 확인
- restart와 region transition 후 이전 voice가 남지 않는지 확인

## 완료 조건

- [ ] 6개 필수 SFX가 20단계 승인 asset에서 선택되었다.
- [ ] Game event와 실제 효과음 재생이 연결되었다.
- [ ] entity가 AudioManager를 직접 의존하지 않는다.
- [ ] direct/arc 발사, impact, explosion, death, upgrade-confirm이 중복 없이 재생된다.
- [ ] 밀집 전투에서 cooldown과 maxVoices가 동작한다.
- [ ] 첫 사용자 입력 전에는 autoplay 오류가 발생하지 않는다.
- [ ] 오디오 파일 실패가 게임 진행과 HUD 조작을 막지 않는다.
- [ ] pause 중 자동 생산·수집·전투가 진행되지 않고, 명시적 업그레이드음만 재생된다.
- [ ] 20단계 provenance와 runtime manifest의 hash가 일치한다.
- [ ] tsc, build, git diff --check와 수동 플레이 결과가 기록되었다.

## 검증 기록 템플릿

    build version:
    audio manifest version:
    SFX IDs:
    license gate:
    AudioContext gesture:
    direct fire:
    arc fire:
    impact:
    explosion:
    enemy death:
    upgrade confirm:
    max voices/cooldown:
    pause behavior:
    missing/decode failure:
    restart/region transition:
    tsc --noEmit:
    npm run build:
    git diff --check:
    verification date:

## 21단계 구현 기록

구현일: 2026-09-06

- 외부 파일을 배포물에 포함하지 않고, 20단계의 직접 제작 허용 경로를 적용했다. 여섯 ID 모두 Web Audio API 절차 합성으로 런타임 생성되며, audio.json의 licenseStatus는 approved이고 source는 procedural://이다.
- AudioManager, 오디오 manifest, 라이선스 정책·provenance 문서, audio QA 명령을 추가했다.
- CombatModule의 direct/arc 발사, Projectile의 impact/explosion, Game의 적 사망 확정, HUD의 업그레이드 성공 callback을 AudioManager에 연결했다.
- cooldown, max voices, master/sfx bus, mute/volume, lazy AudioContext, 사용자 gesture resume, stopAll 및 실패 시 무음 fallback을 적용했다.
- PAUSED에서는 기존대로 자동 생산·자원 수집·전투 update가 진행되지 않고, HUD 업그레이드 성공음만 callback으로 허용된다.
- 법적 보수성을 위해 fetch/decode 기반 외부 음원 대신 프로젝트 코드로 직접 합성했다. 따라서 public/assets/audio/sfx에 제3자 파일을 복사하지 않았다.

검증 결과:

- npm run qa:audio: 통과, approved procedural effects 6개
- npm run build: 통과, TypeScript 검사 및 Vite production build 완료
- git diff --check: 아래 구현 커밋 전에 실행
- 실제 브라우저 청취 확인: 별도 수동 확인 필요
