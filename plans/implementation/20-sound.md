# 20. 사운드 라이선스 및 상업 이용 안전 지침

## 현재 적용 계획

이 단계는 사운드 런타임을 먼저 만들기 위한 단계가 아니라, 21단계 효과음과 22단계 배경음악이 상업 배포에 사용할 수 있는 음원만 소비하도록 기준과 증빙 절차를 고정하는 단계다. 모든 사운드 asset은 이 문서의 승인 규칙과 provenance 기록을 통과한 뒤에만 시스템에 연결한다.

선행 기준:

- 현재 Canvas 게임 루프와 pause 규칙
- 기존 asset provenance 방식
- [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

후속 계획:

- [21-sound-effects.md](21-sound-effects.md)
- [22-background-music.md](22-background-music.md)
- [100-release-verification.md](100-release-verification.md)

## 목표

- 상업 이용이 가능한 사운드만 선택하고, 라이선스 근거를 파일별로 보존한다.
- 무료 다운로드, royalty-free, open-source라는 표현만으로 사용을 승인하지 않는다.
- 음원 출처와 라이선스가 빌드에 포함된 asset 목록에서 추적되도록 한다.
- 21단계와 22단계가 승인되지 않은 음원을 시스템에 연결할 수 없도록 한다.
- 대사와 음성 연기를 이번 사운드 범위에서 제외한다.

## 법적 안전성의 기준과 한계

법률 자문이나 모든 관할권에서의 무위험을 보장하는 문서가 아니다. 다만 출시 전 확인 가능한 저작권·라이선스 위험을 최대한 줄이기 위해, 기본 release profile은 CC0 또는 직접 권리를 보유한 음원만 허용한다. CC0도 제3자의 상표, 초상·음성, 사생활, endorsement 권리와 원저작자가 실제 권리를 보유했는지까지 보증하지 않으므로 출처와 파일 자체를 확인한다.

Creative Commons 공식 안내에 따르면 CC0는 상업 목적의 복제·수정·배포를 허용하지만 다른 권리까지 자동으로 소멸시키지는 않는다. [CC0 안내](https://creativecommons.org/publicdomain/zero/1.0/)

## 허용 라이선스 정책

| 출처 또는 라이선스 | 상업 이용 판단 | 20단계 기본 상태 | 조건 |
| --- | --- | --- | --- |
| 공식 Kenney CC0 audio pack | 허용 가능 | 승인 우선순위 1 | 공식 asset 페이지, 원본 파일, license 정보, 다운로드 날짜와 해시를 보관 |
| 직접 녹음·직접 합성한 음원 | 허용 가능 | 승인 우선순위 1 | 제작자와 녹음에 참여한 사람의 권리를 확인하고 프로젝트 기록에 남김 |
| 계약으로 권리를 양도받은 음원 | 계약 범위 내 허용 | 조건부 | 상업 배포, 수정, 게임 내 포함, 플랫폼 배포 권한이 명시된 계약 보관 |
| CC-BY 4.0 | 상업 이용 가능하지만 attribution 필요 | 기본 제외, 예외 승인 | 저작자·제목·라이선스 URL·변경 사항을 credits에 기록하고 추가 제한을 만들지 않음 |
| CC-BY-SA | 상업 이용 가능하지만 share-alike와 배포 방식 검토 필요 | 기본 제외 | 별도 법률 검토 없이는 사용하지 않음 |
| CC-BY-NC, CC-BY-ND, Sampling+, 비표준 라이선스 | 상업 이용 또는 수정에 제한 | 금지 | 서면으로 별도 허가받기 전에는 빌드에 포함하지 않음 |
| 라이선스 불명, 출처 불명, 다른 게임·영상에서 추출 | 확인 불가 | 금지 | 무료 다운로드 여부와 관계없이 사용하지 않음 |
| ChatGPT Voice 출력 | 상업용 standalone 음원으로 사용 불가 | 금지 | 게임 asset으로 저장·배포하지 않음 |

CC-BY는 상업 이용을 허용하지만 attribution, 변경 표시, 추가 제한 금지 조건이 있다. 따라서 기본 release에는 CC0만 사용하고, CC-BY는 예외 승인으로만 허용한다. [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## 우선 사용할 수 있는 소스

### 1. Kenney 공식 CC0 audio

Kenney의 Digital Audio 페이지는 라이선스를 Creative Commons CC0로 표시한다. All-in-1 bundle도 audio를 포함하고 CC0를 표시하지만, 실제로 사용하는 pack의 원본 license와 파일을 함께 보관한다.

- [Kenney Digital Audio](https://kenney.nl/assets/digital-audio)
- [Kenney Game Assets All-in-1](https://kenney.itch.io/kenney-game-assets)

Kenney asset을 사용하더라도 다음은 반드시 기록한다.

- 다운로드에 사용한 공식 URL
- pack 이름과 버전
- 다운로드 날짜
- 원본 파일명
- 프로젝트에 넣은 변환 파일의 SHA-256
- 파일을 자르거나 normalize, loop 처리, pitch 조정한 내역

### 2. Freesound와 OpenGameArt

두 사이트는 repository 전체를 한 번에 상업 사용 승인으로 취급하지 않는다. Freesound는 파일별로 CC0, CC-BY, CC-BY-NC가 나뉘고 업로더가 제3자 권리를 잘못 주장할 가능성도 안내한다. OpenGameArt도 제출물별 라이선스를 확인해야 하며 미리보기 음원이 다운로드 파일과 다른 권리일 수 있다.

- [Freesound FAQ](https://freesound.org/help/faq/)
- [OpenGameArt FAQ](https://opengameart.org/node/5571)

따라서 21·22단계의 기본 음원은 Kenney CC0 또는 직접 제작 음원으로 구성한다. Freesound/OpenGameArt는 대체 음원이 없고 파일별 검토 기록을 남길 때만 예외적으로 사용한다.

## GPT와 AI 생성 오디오 정책

OpenAI 공식 문서에서 확인되는 Audio API의 안정적인 파일 생성 기능은 text-to-speech다. 이 기능은 대사나 내레이션을 만들 수 있지만, 이번 범위에는 대사를 포함하지 않는다. 공식 문서에서 일반적인 게임 효과음·배경음악 생성 권한을 별도로 확인하지 못했으므로 21·22단계의 release asset으로 사용하지 않는다.

- [OpenAI Text to Speech](https://developers.openai.com/api/docs/guides/text-to-speech)
- API 사용 시 TTS 음성이 AI 생성임을 사용자에게 명확히 고지해야 한다.
- ChatGPT Voice Output은 비상업적 사용만 가능하고 standalone audio 파일로 배포할 수 없으므로 사용하지 않는다.
- API TTS를 추후 사용하려면 적용되는 API 약관, voice consent, AI disclosure, 출력 생성 일시와 모델 정보를 별도 기록하고 20단계 예외 승인을 다시 받는다.

## Provenance 및 manifest 계약

20단계 구현 시 다음 문서와 데이터 계약을 만든다.

- docs/audio-licensing.md: 승인 정책, 금지 정책, credits 작성 규칙
- docs/audio-asset-provenance.md: 실제 파일별 출처와 검토 기록
- docs/audio-licenses/README.md: 사용한 license URL과 배포 시 확인 사항
- src/data/audio.json: runtime asset ID와 파일 경로를 연결하는 manifest

각 audio manifest 항목은 최소한 다음 필드를 가진다.

| 필드 | 의미 |
| --- | --- |
| id | runtime에서 사용하는 고정 logical ID |
| src | public 기준의 실제 오디오 파일 경로 |
| kind | sfx 또는 music |
| bus | sfx 또는 music |
| licenseStatus | approved, exception, rejected 중 하나 |
| licenseName | CC0 1.0, 직접 제작, 계약 양도 등 |
| sourceUrl | 다운로드 또는 원제작 페이지 |
| licenseUrl | license 원문 URL |
| creator | 원저작자 또는 제작자 |
| downloadedAt | 원본을 확보한 날짜 |
| originalSha256 | 원본 파일 해시 |
| runtimeSha256 | 변환 후 게임 파일 해시 |
| modified | 수정 여부 |
| modificationSummary | trim, normalize, loop, format conversion 등 |
| attribution | credits에 넣을 문구. CC0라도 검토 결과를 기록 |
| reviewNote | 제3자 권리와 배포 조건을 확인한 메모 |

runtime은 licenseStatus가 approved가 아닌 항목을 preload하지 않는다. exception은 문서 검토와 명시적인 승인자가 있을 때만 허용하고, rejected는 개발·release 어느 단계에서도 요청하지 않는다.

## 검토 및 통합 순서

### 20.1 후보 수집

- 필요한 event를 21단계와 22단계 ID 목록으로 먼저 고정한다.
- 후보 파일을 다운로드하기 전에 license 페이지와 원출처를 확인한다.
- 기존 게임·영화·영상에서 추출한 파일, 출처가 바뀐 mirror 파일, 미리보기만 저장한 파일은 제외한다.

### 20.2 권리 검토

- CC0 원문 또는 권리 양도 계약을 확인한다.
- 파일 안에 사람의 목소리, recognizable brand sound, 제3자 sample이 포함되지 않았는지 확인한다.
- 상업 배포, 수정, 웹·Electron 패키징, Steam 등 배포 대상에 문제가 없는지 기록한다.
- 불확실성이 남으면 승인하지 않고 직접 제작 또는 별도 계약으로 대체한다.

### 20.3 증빙 고정

- 원본과 변환본의 해시를 기록한다.
- license URL, source URL, 버전, 확인일을 provenance에 저장한다.
- CC-BY 예외인 경우 credits 문구와 변경 사항을 함께 저장한다.
- 승인되지 않은 파일은 public/assets/audio에 복사하지 않는다.

### 20.4 시스템 연계 gate

- 21단계와 22단계는 src/data/audio.json에 등록된 approved ID만 AudioManager에 넘긴다.
- asset 제작만 완료하고 Game 또는 HUD event에 연결하지 않은 상태를 완료로 인정하지 않는다.
- audio manifest 검증 명령을 build 전에 실행한다.
- 21단계는 sfx bus, 22단계는 music bus를 사용하며 두 bus 모두 20단계 provenance ID를 역참조할 수 있어야 한다.

## 완료 조건

- [ ] 기본 release 후보가 CC0, 직접 제작, 또는 상업 배포 권리가 명시된 계약 음원으로만 구성되었다.
- [ ] 모든 파일에 source URL, license URL, 날짜, 원본·runtime hash가 있다.
- [ ] NC, ND, Sampling+, 출처 불명, raw game/movie sample이 제거되었다.
- [ ] ChatGPT Voice 파일과 검증되지 않은 AI 생성 SFX/music이 포함되지 않았다.
- [ ] audio manifest의 licenseStatus 검증 규칙이 정해졌다.
- [ ] 21단계가 사용할 SFX ID와 22단계가 사용할 music ID가 구분되었다.
- [ ] 21·22단계가 승인되지 않은 음원을 runtime에 연결하지 않는다는 인계 조건이 남았다.

## 검증 기록 템플릿

    asset ID:
    kind: sfx / music
    source URL:
    license URL:
    license name:
    creator:
    downloaded at:
    original SHA-256:
    runtime SHA-256:
    modified:
    modification summary:
    commercial-use review:
    third-party-rights review:
    credits text:
    approval:
    review date:

