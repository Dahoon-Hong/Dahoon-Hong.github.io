# 15. 메인 화면·테스트맵 배경음악 교체

## 요구사항 및 범위

- 사용자가 제공하고 사용 허가를 확인한 `breach_in_the_hull.mp3`를 메인 화면 테마 음악으로 연결한다.
- 사용자가 제공하고 사용 허가를 확인한 `locked_inside_the_shell.mp3`를 현재 canonical 테스트맵 `aurelia/landing-zone`의 배경음악으로 연결한다.
- 다른 캠페인 맵은 기존 procedural 기본 음악을 유지한다.
- 오디오 파일은 public asset으로 복사하고, manifest·runtime·QA·provenance 기록을 함께 갱신한다.
- 기존 사용자 변경사항과 전투 효과음 동작은 범위에서 제외한다.

## 구현 설계

1. `public/assets/game/audio/`에 두 MP3를 원본 그대로 추가한다.
2. `src/data/audio.json`에 `music.main-menu`와 `music.gameplay.test`를 추가하고, 기존 `music.gameplay.default`는 유지한다.
3. `AudioManager`가 approved procedural source와 approved bundled music source를 모두 처리하도록 확장한다. MP3는 `fetch`와 `AudioContext.decodeAudioData`로 한 번만 디코드하고, 기존 music gain·mute·duck·loop 계약을 유지한다.
4. `Game`의 화면·맵 전환 시 현재 컨텍스트에 맞는 music ID를 요청한다. 메인 화면은 `music.main-menu`, 테스트맵은 `music.gameplay.test`, 그 외 gameplay는 `music.gameplay.default`를 사용한다.
5. `scripts/qa-audio.mjs`, `docs/audio-licensing.md`, `docs/audio-asset-provenance.md`, `docs/audio-licenses/README.md`를 새 bundled asset 계약과 사용자 승인 provenance에 맞게 갱신한다.

## 검증 계획

### 자동 검증

- `npm test`
- `npm run qa:audio`
- `npm run build`
- `git diff --check`

### 런타임 검증

- required: 개발 runtime에서 첫 사용자 pointer/key gesture 후 메인 화면에 `breach_in_the_hull.mp3`가 반복 재생된다.
- required: GAME START 후 world map에서 첫 테스트맵 `aurelia/landing-zone`을 선택하면 `locked_inside_the_shell.mp3`로 전환된다.
- required: 테스트맵 pause/resume에서 같은 트랙이 유지되고 중복 재생·콘솔 오류가 없다.
- required: 다른 gameplay 맵 진입 시 기존 `music.gameplay.default` fallback이 유지된다.

Runtime fixture와 사전조건은 기본 앱 실행, 브라우저 pointer/key gesture, `aurelia/landing-zone` 선택이다. 관측값은 현재 화면, 요청된 music ID와 재생 상태, 브라우저 콘솔 오류이며, 통과 기준은 화면별 지정 트랙이 한 번만 loop되고 전환 후 이전 source가 남지 않는 것이다.
