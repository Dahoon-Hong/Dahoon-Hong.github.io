# Project C 브랜치 문서

Project C의 요구사항과 작업 기준은 이 브랜치의 문서로 관리합니다. 이후 구현과 변경은 먼저 이 로컬 문서를 확인하고 갱신합니다. Notion은 최초 자료의 출처로 보존합니다.

- [Unity 프로젝트 환경과 현재 기술 경계](UnityProjectContext.md)

## 작업 시작 순서

1. [Project C 작업 지침](../AGENTS.md)
2. [Q-494 인계 및 전체 문서 목차](Notion-Q-494/INDEX.md)
3. [Q-494 개발 인계](Notion-Q-494/source/development-handoff.md)
4. [최신 기획 원문](Notion-Q-494/source/planning.md)
5. [Project C MVP 구현 플랜](../../plans/implementation/1-project-c-mvp/1-project-c-mvp.md)

현재 요구사항은 Q-494 전체 인계, development-handoff, 최신 planning.md의 확정 내용이 우선합니다. 세부 규칙 문서는 분야별 동작과 검증 기준을 설명합니다. reference 아래의 기준본과 이력은 변경 추적용이며 더 최근에 확정된 기준을 덮어쓰지 않습니다.

## 원본 스냅샷

[Notion Q-494 자료](Notion-Q-494/INDEX.md)에 인계 페이지와 ZIP의 전체 31개 파일을 저장했습니다. 20개 원문 Markdown은 SHA-256을 확인했고, 11개 동기화 인덱스·기록 JSON도 함께 보존했습니다. 원본 planning.md와 planning-history.md는 이제 완전한 단일 파일로 읽습니다.

압축을 푼 Markdown과 JSON을 브랜치에 보존했습니다. 압축 해제 시 20개 Markdown의 SHA-256이 원문 해시와 모두 일치함을 확인했습니다. planning.md의 Notion 이미지 블록은 로컬 PNG 링크로 바꾸었고, 저장소 공백 검사에 맞춰 planning.md, planning-baseline.md, planning-history.md 끝의 빈 줄을 정리했습니다. 원본 해시와 페이지 ID/URL은 notion-source-index.json에 유지했습니다.

ZIP 자체는 캐시에서만 사용하고 압축을 푼 31개 파일을 브랜치에 포함했습니다. ZIP에 포함되지 않았던 UI 와이어프레임과 지도 배치 PNG는 Notion 첨부에서 받아 [assets 폴더](Notion-Q-494/assets)에 넣었습니다. 지도 원문의 좌표·진입점·산 영역은 [지도 초안 기록](Notion-Q-494/maps/map-layout-draft-01.md)에 출처와 함께 요약했습니다. [planning.md](Notion-Q-494/source/planning.md)에서도 UI 로컬 이미지를 볼 수 있습니다. 배치·색·예시 수치·통계는 검토용 제안이며 확정 요구와 구분합니다.

## 문서 변경 원칙

- Project C 요구사항 변경은 이 브랜치의 대응 문서와 플랜에 기록합니다.
- 새 구현은 [MVP 구현 플랜](../../plans/implementation/1-project-c-mvp/1-project-c-mvp.md)을 기준으로 진행합니다.
- 계획, 구현, 자동 검증, Windows 실행, 성능 측정, 직접 플레이 결과를 서로 구분해 기록합니다.
- 기존 defence2 게임 코드와 과거 개발 플랜은 Project C 요구사항의 근거로 사용하지 않습니다.
