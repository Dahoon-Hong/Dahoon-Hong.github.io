# 22. 배경음악 라이선스·재생·게임 상태 통합 상세 계획

## 현재 적용 계획

이 단계는 20단계의 상업 이용 승인 기준을 통과한 배경음악을 21단계에서 만든 AudioManager와 현재 GameState에 바로 연결한다. 대사, 보이스오버, ChatGPT Voice, 검증되지 않은 AI 생성 음악은 포함하지 않는다.

선행 계획:

- [20-sound.md](20-sound.md)
- [21-sound-effects.md](21-sound-effects.md)

후속 계획:

- [100-release-verification.md](100-release-verification.md)

## 목표

- gameplay에서 하나의 안정적인 loop 음악을 재생한다.
- pause, region transition, result, restart 상태에 따라 음악을 중복 생성하지 않고 전환한다.
- SFX와 music volume을 분리하고, 효과음과 음악이 서로 음량을 침범하지 않게 한다.
- 음악이 로딩되지 않아도 게임과 SFX가 계속 동작하도록 한다.
- 음악 파일마다 20단계 provenance와 상업 이용 검토를 연결한다.

## 범위

### MVP 음악 ID

| 용도 | logical ID | 기본 상태 |
| --- | --- | --- |
| 일반 gameplay loop | music.gameplay.default | 필수 |
| pause ambience 또는 gameplay duck | music.gameplay.default | 동일 loop를 낮은 volume으로 유지 |
| 결과 화면용 음악 | music.result.victory 또는 music.result.game-over | 선택. 없으면 gameplay 음악을 fade out |

첫 구현은 gameplay loop 1개로 시작한다. 네 지역마다 다른 음악을 추가하는 것은 manifest와 state mapping이 검증된 뒤의 확장으로 남긴다. Cinder/Aurelia별 곡을 만들기 위해 AudioManager를 복제하지 않는다.

## 라이선스 및 asset 규칙

- 기본 release asset은 공식 Kenney CC0, 직접 제작, 또는 상업 배포·수정 권리를 명시한 계약 음원만 사용한다.
- CC-BY는 20단계의 예외 승인과 credits가 없으면 사용하지 않는다.
- 무료 스트리밍 링크, YouTube rip, 게임 OST 추출, 라이선스가 보이지 않는 preview는 사용하지 않는다.
- AI로 생성한 음악은 이번 release profile에 포함하지 않는다.
- 원본 loop를 trim, normalize, fade, format conversion한 경우 원본·runtime hash와 변경 내역을 모두 기록한다.
- 실행 manifest에서 licenseStatus가 approved가 아닌 music entry는 재생하지 않는다.

라이선스 판단은 20단계 문서를 따른다.

- [20-sound.md](20-sound.md)
- [Kenney Digital Audio](https://kenney.nl/assets/digital-audio)
- [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

## AudioManager 확장

21단계의 AudioManager를 공통 runtime으로 재사용하고, 별도 MusicManager를 새로 만들지 않는다.

추가 책임:

- music bus와 sfx bus를 분리한다.
- 현재 music source와 다음 source를 최대 하나씩만 관리한다.
- loop 가능한 AudioBufferSourceNode를 생성하고, source가 중복되지 않게 한다.
- setMusicVolume, fadeMusicTo, playMusic, stopMusic, pauseMusicDuck API를 제공한다.
- track 변경 시 짧은 fade 또는 crossfade를 사용한다.
- decode 실패 시 music만 silence fallback으로 만들고 SFX와 gameplay를 보존한다.
- hidden tab, browser suspend, AudioContext resume 후 현재 상태를 재동기화한다.

기본 volume은 설계상 music을 SFX보다 낮게 시작한다. 실제 수치는 수동 플레이에서 조정하되, master, music, sfx의 세 값을 독립적으로 저장할 수 있어야 한다.

## GameState 연계

Game은 매 frame마다 음악을 다시 시작하지 않고, state 또는 현재 region이 실제로 바뀐 순간에만 AudioManager를 호출한다.

| 전환 | 동작 |
| --- | --- |
| Game 시작 후 첫 사용자 gesture | gameplay loop를 시작하거나 pending 상태에서 resume |
| PLAYING 진입 | gameplay loop를 정상 volume으로 fade in |
| PAUSED 진입 | loop를 정지시키지 않고 music bus를 약 20%로 duck. gameplay update는 계속 멈춤 |
| PAUSED에서 PLAYING 복귀 | music bus를 이전 volume으로 fade |
| REGION_CLEARED, PLANET_CLEARED | gameplay loop를 fade out. 선택 result track이 있으면 fade in |
| GAME_OVER | gameplay loop를 fade out. 선택 game-over track이 있으면 fade in |
| VICTORY | gameplay loop를 fade out하고 victory track 또는 silence |
| restartGame | terminal track을 정리하고 현재 gameplay loop를 한 번만 재시작 |
| region transition | region mapping이 존재할 때만 crossfade. 없으면 기존 gameplay loop 유지 |

pause에서 음악을 duck하는 것은 오디오 표현이고 게임 시간 진행이 아니다. 일시정지 중 자동 생산, 자원 수집, 적, 발사체, 효과 update가 진행되어서는 안 된다. pause 중 명시적 HUD 업그레이드 SFX는 21단계 규칙에 따라 재생할 수 있다.

## HUD 및 사용자 설정 연계

21단계의 audio settings 경계를 재사용한다.

- master mute
- master volume
- SFX volume
- music volume

현재 HUD가 Canvas 기반이므로 설정 영역을 새 DOM 설정 화면으로 확장하지 않는다. 기존 HUD panel 또는 top bar에 작고 명확한 music toggle/volume control을 추가하고, 클릭 hitbox와 render 상태를 같은 HUDManager가 관리한다.

설정은 새로고침 후에도 유지할 수 있도록 localStorage에 저장한다. 저장 실패나 private browsing 제한이 있어도 기본 volume으로 게임을 계속할 수 있어야 한다.

## 파일과 구현 대상

- src/core/AudioManager.ts 확장
- src/data/audio.json의 music entries
- public/assets/audio/music/의 approved loop 파일
- src/core/Game.ts의 GameState와 progression location 동기화
- src/ui/HUDManager.ts의 music toggle, volume control, feedback
- docs/audio-asset-provenance.md의 music 기록
- 필요 시 docs/audio-licensing.md의 credits 목록

ProgressionManager나 WaveManager가 음악을 직접 재생하지 않는다. Game이 state와 location을 읽고 AudioManager에 전달한다.

## 음악 format 및 성능 기준

- 브라우저가 안정적으로 decode할 수 있는 OGG 또는 WAV를 사용한다. 배포 크기와 loop 품질을 비교해 최종 format을 고정한다.
- loop 파일은 시작·끝 sample의 click, 과도한 silence, clipping을 검사한다.
- 음악은 시작 시 비동기 preload하되 게임 첫 화면을 막지 않는다.
- gameplay에서는 한 곡만 active로 유지한다.
- crossfade는 최대 두 source까지만 임시로 허용하고 fade 완료 후 이전 source를 정리한다.
- frame loop 안에서 fetch, decode, AudioBufferSourceNode 생성을 반복하지 않는다.
- 음악 재생 실패가 console을 frame마다 오염시키지 않도록 ID별 한 번만 기록한다.

## 구현 및 검증 순서

### 22.1 라이선스 gate

- 20단계 provenance의 approved music만 선택한다.
- 원본과 runtime 파일 hash를 비교하고, loop 편집 내역을 기록한다.
- credits와 배포 package에 포함할 license 안내를 확정한다.

### 22.2 music bus 연결

- 21단계 AudioManager의 music bus와 settings를 확장한다.
- 한 곡 loop, fade in/out, duck, stop, resume을 구현한다.
- AudioContext가 suspended인 브라우저에서 사용자 gesture 후 재동기화한다.

### 22.3 GameState 연결

- GameState 변화 지점을 한 곳에서 감지한다.
- PLAYING, PAUSED, terminal, restart, region transition을 각각 재현한다.
- 같은 state를 여러 frame 유지해도 source가 중복 생성되지 않는지 확인한다.

### 22.4 HUD 설정 연결

- music toggle와 volume control을 기존 Canvas HUD에 연결한다.
- 설정 변경 즉시 music bus에 반영한다.
- localStorage 실패와 잘못된 저장 값은 기본값으로 복구한다.

### 22.5 실패·성능·회귀 검증

- music file missing, decode 실패, AudioContext 차단, tab 숨김/복귀를 확인한다.
- 음악 실패 중에도 SFX, 전투, 업그레이드, restart가 정상인지 확인한다.
- pause 중 게임 state가 변하지 않고 음악만 duck되는지 확인한다.

### 22.6 명령과 수동 플레이

- npx.cmd tsc --noEmit
- npm.cmd run build
- git diff --check
- 첫 click 이후 gameplay loop가 한 번만 시작되는지 확인
- pause/resume에서 duck/fade가 정상인지 확인
- region clear, game over, victory, restart에서 source가 누적되지 않는지 확인
- music mute와 volume 설정이 즉시 반영되고 새로고침 후 복구되는지 확인
- license provenance와 runtime hash를 다시 확인

## 완료 조건

- [ ] 20단계 승인 asset으로 gameplay music이 등록되었다.
- [ ] 21단계 AudioManager의 music bus를 재사용한다.
- [ ] gameplay loop가 한 번만 재생되고 frame마다 source가 생성되지 않는다.
- [ ] PLAYING, PAUSED, terminal, restart, region transition이 GameState와 연결되었다.
- [ ] pause 중 자동 생산·수집·전투 시간이 진행되지 않고 음악만 duck된다.
- [ ] master, music, sfx volume과 mute가 독립적으로 동작한다.
- [ ] 누락·decode 실패·AudioContext 차단이 게임을 중단시키지 않는다.
- [ ] 결과 track이 없을 때 gameplay music fade out 또는 silence fallback이 정상이다.
- [ ] provenance, hash, credits가 20단계 규칙을 만족한다.
- [ ] tsc, build, git diff --check와 수동 플레이 결과가 기록되었다.

## 검증 기록 템플릿

    build version:
    music manifest version:
    gameplay track:
    result tracks:
    license gate:
    original/runtime SHA-256:
    first gesture:
    PLAYING:
    PAUSED duck:
    resume:
    region transition:
    GAME_OVER:
    VICTORY:
    restart:
    music mute/volume:
    SFX coexistence:
    missing/decode failure:
    localStorage failure:
    source count after repeated state frames:
    tsc --noEmit:
    npm run build:
    git diff --check:
    verification date:

