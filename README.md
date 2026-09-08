# Platform Vehicle Defense

Platform Vehicle Defense는 PC 브라우저용 2D 탑다운 차량 방어 게임 프로토타입입니다. 플레이어는 공수전차의 Core를 지키면서 차량 격자에 전투 모듈을 배치·업그레이드하고, 웨이브 단위로 접근하는 적을 막습니다.

현재는 TypeScript와 HTML5 Canvas로 구현한 와이어프레임 단계입니다. 웹 브라우저 실행을 기준으로 개발하며, Electron 패키징과 Steam 배포는 향후 목표입니다.

[게임 실행하기](https://dahoon-hong.github.io/)

## 현재 구현

- 시작 메뉴, 전투, 일시정지, 승리·패배 흐름
- WASD·방향키를 이용한 8방향 차량 이동
- 마우스를 이용한 격자 선택, 전투 모듈 설치, 업그레이드
- 자원 생산·수집·변환과 모듈 업그레이드
- 직사·곡사 무기, 발사체, 적 웨이브와 접촉 피해
- 지역·행성 기반 월드 맵과 캠페인 진행 데이터

## 기술 스택

- TypeScript
- HTML5 Canvas
- HTML / CSS
- Vite
- Vitest
- Node.js / npm
- GitHub Actions / GitHub Pages
- Electron — 현재 실행 설정은 없으며, 향후 PC·Steam 배포를 위한 목표 기술

## 프로젝트 구조

| 경로 | 설명 |
| --- | --- |
| `.github/workflows/deploy-pages.yml` | `defence` 브랜치의 빌드 결과를 GitHub Pages에 배포하는 workflow |
| `src/` | 게임 진입점, 핵심 로직, 엔티티, 렌더링, UI 및 데이터 로더 |
| `src/data/` | 탱크·모듈·적·맵·진행·오디오 등의 JSON 데이터 |
| `public/` | 게임에서 사용하는 이미지 및 기타 정적 리소스 |
| `scripts/` | 맵 생성 및 아트·오디오 QA 스크립트 |
| `docs/` | 기여, 콘텐츠 추가, 아트·오디오 라이선스와 검증 문서 |
| `plans/` | 게임 기획 및 단계별 구현 계획 |
| `index.html` | Canvas를 담는 HTML 셸과 `src/main.ts` 진입점 |
| `package.json` | 개발 서버, 테스트, 빌드, QA 명령과 의존성 정의 |
| `README.md` | 프로젝트 설명, 실행 방법 및 개발·배포 참고사항 |

콘텐츠를 추가할 때는 [콘텐츠 추가 공통 안내](docs/adding-content/README.md)와 해당 콘텐츠의 세부 가이드를 먼저 확인합니다.

## 로컬 실행

Node.js와 npm을 설치한 뒤 저장소 루트에서 의존성을 설치합니다.

```bash
npm ci
```

개발 서버를 실행합니다.

```bash
npm run dev
```

터미널에 표시된 주소로 접속합니다. Vite 기본 주소는 [http://localhost:5173](http://localhost:5173)입니다.

## 테스트 및 검증

자동 검증 명령은 다음과 같습니다.

```bash
npm test
npm run build
npm run qa:art
npm run qa:audio
```

릴리스 기준을 한 번에 확인하려면 다음 명령을 사용합니다.

```bash
npm run qa:release
```

개발 서버에서 다음 항목도 수동으로 확인합니다.

- 시작 메뉴에서 게임을 시작하고 전투·결과 화면으로 진행되는지 확인
- WASD·방향키 이동과 Space·P 일시정지가 동작하는지 확인
- 마우스로 전투 격자를 선택하고 모듈 설치·업그레이드를 수행할 수 있는지 확인
- 적 웨이브, 발사체, 자원 흐름, 승리·패배 조건이 정상 동작하는지 확인
- 브라우저 개발자 도구 콘솔에 오류가 없는지 확인

## GitHub Pages 배포

`.github/workflows/deploy-pages.yml`은 `defence` 브랜치에 push되거나 수동 실행될 때 다음 순서로 배포합니다.

1. Node.js 20 환경 구성
2. `npm ci` 실행
3. `npm run build` 실행
4. `dist/`를 GitHub Pages에 배포

배포된 게임은 [GitHub Pages에서 실행](https://dahoon-hong.github.io/)할 수 있습니다.

## 향후 배포 목표

- Electron 기반 PC 패키징
- Steam 배포 및 플랫폼 연동

Electron 실행 설정과 Steam 연동은 아직 구현되어 있지 않습니다.

## 라이선스 및 외부 리소스

- 외부 이미지·오디오·폰트·라이브러리는 상업적 사용을 허용하는지 확인합니다.
- 출처 URL, 정확한 라이선스, 파일 hash와 상업적 사용 검토 결과를 기록합니다.
- 저작권, 출처 표시 및 라이선스 고지 의무를 반드시 준수합니다.
- `docs/art-asset-provenance.md`, `docs/audio-asset-provenance.md`, `docs/audio-licensing.md`에 리소스 출처와 라이선스 정보를 기록합니다.
- 라이선스가 불명확하거나 배포 조건이 프로젝트와 맞지 않는 리소스는 사용하지 않습니다.
