# FreeTest

FreeTest는 Unity로 개발 중인 게임 프로젝트입니다. PC 및 Steam 배포를 목표로 하며, 현재 웹 버전은 GitHub Pages에서 실행할 수 있습니다.

[게임 바로 시작하기](https://dahoon-hong.github.io/)

## 프로젝트 구조

| 경로 | 설명 |
| --- | --- |
| `Build/` | Unity WebGL 빌드 결과물 (`.wasm`, `.data`, 로더 및 프레임워크 JavaScript 파일) |
| `TemplateData/` | WebGL 템플릿의 스타일, 로딩 화면, 아이콘 및 이미지 리소스 |
| `index.html` | GitHub Pages 진입점이자 WebGL 게임을 불러오는 HTML 페이지 |
| `README.md` | 프로젝트 설명, 실행 방법 및 라이선스 주의사항 |

## 기술 스택

- Unity WebGL
- HTML / CSS / JavaScript
- GitHub Pages
- Electron — 현재 구현된 실행 설정은 없으며, 향후 PC·Steam 배포를 위한 목표 기술

## 로컬 실행 및 테스트

저장소 루트에서 정적 HTTP 서버를 실행합니다.

```bash
python -m http.server 8000
```

그다음 브라우저에서 [http://localhost:8000](http://localhost:8000)에 접속합니다.

다음 항목을 확인합니다.

- WebGL 콘텐츠가 오류 없이 로딩되는지 확인
- 키보드와 마우스 등 게임 입력이 정상적으로 동작하는지 확인
- 전체화면 기능이 정상적으로 동작하는지 확인
- 브라우저 개발자 도구의 콘솔에 오류가 없는지 확인

현재 Electron 실행 설정은 아직 없으므로, PC·Steam 배포 준비 단계에서 추후 추가할 예정입니다.

## 라이선스 및 외부 리소스 주의사항

- 오픈소스 라이브러리와 외부 리소스는 상업적 사용을 허용하는 라이선스인지 확인합니다.
- 게임 소스 공개 의무가 발생하지 않는 라이선스를 우선적으로 검토합니다.
- 저작권, 출처 표시 및 라이선스 고지 의무를 반드시 준수합니다.
- 사용한 외부 리소스의 출처와 라이선스를 기록하고 관리합니다.

## 콘텐츠 추가 가이드

콘텐츠를 추가하기 전 아래 가이드를 확인합니다.

- [콘텐츠 추가 공통 안내](docs/adding-content/README.md)
- [무기 모듈 추가](docs/adding-content/weapon-modules.md)
- [업그레이드 추가](docs/adding-content/upgrades.md)
- [탱크 추가](docs/adding-content/tanks.md)
- [맵 추가](docs/adding-content/maps.md)
- [적 추가](docs/adding-content/enemies.md)
