# Project C 작업 지침

이 파일은 ProjectC Unity 프로젝트 범위에 적용합니다. 저장소 공통 지침은 저장소 루트 AGENTS.md도 함께 따릅니다.

## 시작 자료

1. [Project C 문서 기준](Documentation/README.md)
2. [Q-494 원문 스냅샷 목차](Documentation/Notion-Q-494/INDEX.md)
3. [개발 인계](Documentation/Notion-Q-494/source/development-handoff.md)
4. [현재 기획 원문](Documentation/Notion-Q-494/source/planning.md)
5. [MVP 구현 플랜](../plans/implementation/1-project-c-mvp/1-project-c-mvp.md)

Project C의 요구사항 출처는 이 저장소에 보존된 Notion Q-494 스냅샷입니다. 매 작업마다 Notion에 다시 접속하지 말고 브랜치 문서를 기준으로 작업합니다. 요구사항이 바뀌면 이 브랜치 문서를 먼저 갱신하고 변경 출처와 날짜를 기록합니다.

## 범위와 상태

- Project C는 저장소의 기존 웹 게임과 별개인 Unity 3D URP 프로젝트입니다.
- 기존 defence2의 게임 구현·개발 자료·계획은 Project C의 요구사항이나 설계 근거로 재사용하지 않습니다.
- MVP 구현은 Plan 1의 범위·수락 기준·필수 시나리오를 따릅니다.
- 문서에 적힌 계획을 구현·테스트·빌드·플레이 완료로 표현하지 않습니다. 실제 수행한 증거만 완료 상태에 기록합니다.
- 확정되지 않은 밸런스나 자산 표현을 임의로 확정하지 말고, 기능을 검증하는 임시 표현을 먼저 사용합니다.

## Unity 작업

Unity Editor 6000.2.14f1, URP, Windows x64를 기준으로 합니다. 게임 규칙은 Unity의 Scene, GameObject, 렌더링, 물리 API와 분리해 화면 없이 검증할 수 있는 C# 코어에 둡니다. Unity 입력·화면·소리·Windows 연결은 코어에 명령을 보내고 코어 상태를 표시합니다.

원격 인증 정보, 사용자 라이선스 파일, 개인 Editor 설정은 저장소에 추가하지 않습니다. 실행 파일은 오프라인 Windows 10/11 x64를 대상으로 합니다.

## 기여와 검증

- 기능 구현 전 Plan 1 및 관련 로컬 기준 문서를 확인합니다.
- 기능 구현 완료 시 Plan 1에 적힌 자동·런타임·Windows·성능 시나리오를 수행하고 결과를 기록합니다.
- Project C 기능 변경은 브라우저 테스트 성공만으로 Unity Standalone runtime 검증을 대체하지 않습니다.
- 문서만 변경한 경우 링크와 명령을 검토하고 git diff --check를 실행합니다.
