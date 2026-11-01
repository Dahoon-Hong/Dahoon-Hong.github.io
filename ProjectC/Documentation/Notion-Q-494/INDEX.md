# Notion Q-494 문서 스냅샷

- 기준 페이지: [개발 인계·전체 문서 — Q-494](https://app.notion.com/p/40b7d6829c6a81e9aec2ff8a0b6959b0)
- 기준 페이지 수정 시각: 2026-11-01 02:45:26 UTC
- 로컬 수집일: 2026-11-01
- Q-494 인계 페이지 본문: [handoff-q494.md](handoff-q494.md)
- ZIP에서 확장한 원본: source 폴더의 Markdown 20개와 동기화 JSON 11개
- Notion 원문 페이지 ID 인덱스: [notion-source-index.json](source/notion-source-index.json), 총 30개 페이지

이 스냅샷은 이후 Project C 작업에서 사용하는 브랜치 기준 자료입니다. 요구사항 변경은 먼저 이 브랜치 문서에 기록합니다. 원문 Notion 링크는 출처와 동기화 이력을 확인할 때 사용합니다. 원본 ZIP은 캐시에만 두고, 그 안의 31개 파일을 브랜치에 저장했습니다.

## 우선 읽기

- [Project C 작업 방식](source/README.md)
- [Project C Codex 지침](source/AGENTS.md)
- [개발 인계](source/development-handoff.md)
- [최신 기획 전체 파일](source/planning.md)
- [소프트웨어 구조](source/software-architecture.md)
- [첫 검증 버전](source/first-validation.md)
- [기술 검증 기준](source/technical-validation.md)

## 원문 Markdown 20개

| 원문 파일 | 브랜치 문서 |
| --- | --- |
| AGENTS.md | [source/AGENTS.md](source/AGENTS.md) |
| README.md | [source/README.md](source/README.md) |
| START-HERE.md | [source/START-HERE.md](source/START-HERE.md) |
| development-handoff.md | [source/development-handoff.md](source/development-handoff.md) |
| planning.md | [source/planning.md](source/planning.md) |
| asset-plan.md | [source/asset-plan.md](source/asset-plan.md) |
| cycle-summary.md | [source/cycle-summary.md](source/cycle-summary.md) |
| design-principles.md | [source/design-principles.md](source/design-principles.md) |
| drone-rules.md | [source/drone-rules.md](source/drone-rules.md) |
| engine-review.md | [source/engine-review.md](source/engine-review.md) |
| event-rules.md | [source/event-rules.md](source/event-rules.md) |
| first-validation.md | [source/first-validation.md](source/first-validation.md) |
| play-flow.md | [source/play-flow.md](source/play-flow.md) |
| question-cycle.md | [source/question-cycle.md](source/question-cycle.md) |
| reference/planning-baseline.md | [source/reference/planning-baseline.md](source/reference/planning-baseline.md) |
| reference/planning-history.md | [source/reference/planning-history.md](source/reference/planning-history.md) |
| review.md | [source/review.md](source/review.md) |
| software-architecture.md | [source/software-architecture.md](source/software-architecture.md) |
| technical-validation.md | [source/technical-validation.md](source/technical-validation.md) |
| ui-flow.md | [source/ui-flow.md](source/ui-flow.md) |

## 동기화 인덱스와 기록 JSON 11개

- [notion-source-index.json](source/notion-source-index.json): 원문 파일의 해시와 30개 Notion 페이지 ID/URL
- [notion-sync-q494-receipt.json](source/notion-sync-q494-receipt.json): Q-494 동기화 검증 기록
- [notion-sync-receipt.json](source/notion-sync-receipt.json): Q-494 동기화 기록 사본
- [notion-sync-20261101-receipt.json](source/notion-sync-20261101-receipt.json), [notion-sync-20261101-q434-receipt.json](source/reference/notion-sync-20261101-q434-receipt.json): 2026-11-01 동기화 기록
- [notion-sync-cycle-complete-receipt.json](source/notion-sync-cycle-complete-receipt.json), [notion-sync-q464-receipt.json](source/reference/notion-sync-q464-receipt.json): Q-464 질의 주기 동기화 기록
- [sync-20261101-payload.json](source/sync-20261101-payload.json): 규칙·원칙·UI 동기화 자료
- [sync-cycle-complete-payload.json](source/sync-cycle-complete-payload.json): 질의 주기 동기화 자료
- [notion-sync-20261023-payload.json](source/reference/notion-sync-20261023-payload.json), [notion-sync-20261023-receipt.json](source/reference/notion-sync-20261023-receipt.json): 이전 동기화 자료

## 우선순위와 첨부

현재 기준은 Q-494 인계, development-handoff, 최신 planning.md의 확정 내용을 우선합니다. 분야별 규칙 문서는 상세 경계를 설명하며, planning-baseline과 planning-history 및 과거 동기화 JSON은 과거 기록입니다.

압축 해제 시 20개 원본 Markdown의 SHA-256이 인덱스의 해시와 모두 일치함을 확인했습니다. planning.md의 Notion 이미지 블록은 로컬 PNG 링크로 바꾸었고, git diff --check를 위해 planning.md, planning-baseline.md, planning-history.md 끝의 빈 줄을 정리했습니다. 원본 해시는 notion-source-index.json에 그대로 보존했습니다.

압축 파일 자체는 브랜치에 포함하지 않았지만 ZIP 안의 Markdown과 JSON 31개는 source 폴더에 풀어 저장했습니다. ZIP에 없던 UI 와이어프레임은 Notion 첨부에서 별도로 받아 [project-c-ui-wireframes-01.png](assets/project-c-ui-wireframes-01.png)에 포함했습니다. 이 이미지는 플레이·항구 계약·설정·결과 화면 배치 검토용입니다. 색, 간격, 예시 수치와 통계는 확정 요구가 아닙니다.

## Project C 계획 문서

- 현재 확정 기획: [planning.md](source/planning.md)
- 기획 기준본과 변경 이력: [planning-baseline.md](source/reference/planning-baseline.md), [planning-history.md](source/reference/planning-history.md)
- 첫 전체 흐름 검증: [first-validation.md](source/first-validation.md)
- UI·플레이 흐름: [ui-flow.md](source/ui-flow.md), [play-flow.md](source/play-flow.md)
- MVP 구현 계획: [Plan 1](../../../plans/implementation/1-project-c-mvp/1-project-c-mvp.md)
