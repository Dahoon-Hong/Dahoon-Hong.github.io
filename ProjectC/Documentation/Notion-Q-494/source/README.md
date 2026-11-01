# Project C 작업 방식

- 로컬 Codex 시작점: START-HERE.md 및 AGENTS.md. 대화 이력 없이 development-handoff.md에서 이어갑니다.
- 전체 자료 노션 진입점: https://app.notion.com/p/40b7d6829c6a81e9aec2ff8a0b6959b0
- 주 작업 파일: planning.md.
- 연속 질의10묶음 완료 요약: cycle-summary.md (Q-415~464). 이후 질문을 재개해 최신 확정 범위는 Q-494이며 미응답 질문은 없습니다. Unity+C#과 고정 카메라의 3D 모델/픽셀 느낌, Windows x64를 확정했고 구현·실측은 미실행입니다.
- 실제 개발은 다른 Windows 머신의 Codex 세션에서 진행하며, 코드와 Markdown은 Git으로 인계하고 큰 소프트웨어 구조를 미리 설계합니다.
- 사용자 지시: 로컬 MD에서 기획을 진행하고 노션에는 나중에 한 번에 반영합니다.
- 매 답변마다 노션을 읽거나 수정하거나 검증하지 않습니다.
- 질문은 사용자 판단이 필요한 목표·범위·예산·핵심 경험·중대한 충돌에 한정합니다. 기존 원칙에서 도출할 기술/관리 선택은 AI가 책임지고, 질문 개수·묶음을 채우려고 새 질의를 만들지 않습니다.
- 확정 답변과 제안을 구분하고 기존 Q/GR 번호를 유지합니다.
- 최신 확정 범위·미응답 질문·노션 동기화 대기 범위는 planning.md 상단에서 확인합니다.
- 기존 노션 페이지별 복사 갱신은 중단합니다. 일괄 반영할 때만 대상 페이지와 최신 상태를 확인하고 누적 변경분을 적용합니다.
- reference의 두 파일은 전환 시점 참고본이며 이후에는 반복 수정하지 않습니다.

## 노션 대상

- UI 명세: https://app.notion.com/p/4017d6829c6a81bfb789e07489697954
- 현재 기준: https://app.notion.com/p/4017d6829c6a8126af90d19f44b5e784
- 진행 기록: https://app.notion.com/p/3fe7d6829c6a815e8c2ed815c6600ec1
- 기술 검토 이력: https://app.notion.com/p/4027d6829c6a819484e2c617a2bf19f3


- 큰 소프트웨어 구조 초안: [software-architecture.md](software-architecture.md). 엔진 공통 모듈·상태 소유권·실행 순서·검증 경계를 정리했습니다.

- 엔진 비교·Unity+C# 확정 근거: [engine-review.md](engine-review.md). 실제 개발 머신의 연결·실행 확인은 후속입니다.

- 실제 개발 세션 시작점: [development-handoff.md](development-handoff.md). 공개 Git 저장소 방침과 확정 규칙·문서·실제 미검증 항목을 연결합니다.

- 2026-11-01: Q-494 전체 자료 노션 반영·재조회 확인 완료. 최신 기획·설계·인계 원문20개를30개 페이지로 보존하고 기존10개 페이지의 기준을 갱신했습니다.
