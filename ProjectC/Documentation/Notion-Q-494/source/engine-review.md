# Project C 엔진 선택 검토·확정 — Q-484 반영

## 확정 상태

- Q-480에서 Unity+C#을 채택했습니다. Q-481은3D 모델을 고정 카메라로 보여주고 픽셀 느낌을 적용하는 방식, Q-482는 Windows x64입니다. 엔진 설치·프로젝트 생성·실제 연동은 아직 수행하지 않았습니다.
- Q-483은 핵심 게임 규칙 AI 구현/기반 기능에 확인한 무료 패키지 활용, Q-484는 무료 자산 보정으로 충족 어려우면 사용자와 대안 논의입니다.
- 아래 비교는 Q-480 제안 전 확보한 근거입니다. 비교 당시 가능 경로였던2D 스프라이트 구현을 현재 채택 방식으로 해석하지 않습니다.
- 비교 우선순위: AI 구현·수정·검증이 첫째, 무료 자산 적합성이 둘째입니다. 최종 Windows 독립 실행과 무료 그래픽+보정, 총 에셋 예산5만원/음향 우선 조건을 함께 적용합니다.
- 실제 개발은 다른 Windows 머신의 Codex 세션입니다. 현재 임시 환경에 Unity가 없거나 JavaScript 도구가 있다는 점은 비교 근거에서 제외했습니다. 정확한 엔진 버전도 이번 선택의 선행 결정으로 요구하지 않았습니다.
- 문서상 기능 확인과 실제 개발 머신의 동작 확인을 구분합니다. 두 엔진의 AI 성공률·개발 시간·성능을 같은 조건에서 실측한 비교는 없습니다.

## 비교 근거

| 기준 | Unity+C# | TypeScript+Phaser | Project C에서의 판단 |
| --- | --- | --- | --- |
| AI 편집·실행 연결 | 공식 CLI와 MCP 모드로 Editor 제어·테스트·빌드 가능. 실제 Editor 및 연결 설정 필요 | 코드 중심으로 수정하고 브라우저에서 실행하는 경로. 데스크톱은 별도 도구와 연결 | 두 경로 모두 가능. Unity의 Editor 수동 조작이 필수라는 이유만으로 배제하지 않음 |
| 화면 없는 규칙 검증 | Unity 표시 코드에 의존하지 않는 C# 코어와 검사 경계 설계 | Phaser 표시 코드에 의존하지 않는 TypeScript 코어와 검사 경계 설계 | GR-470의 분리 원칙은 양쪽에 적용 가능 |
| 최종 Windows 실행 | 엔진의 Windows 빌드 경로 | 웹 중심 엔진이며 독립 데스크톱 실행에 제3자 도구 필요 | 최종 실행물까지 AI가 관리할 연결을 한 엔진 도구 체계에 모으는 Unity 경로를 권고 |
| 초기 브라우저 미리보기 | 필수 경로로 정하지 않음. 필요 시 웹 빌드를 별도 검토 | 브라우저 실행이 기본 경로 | 브라우저는 허용 사항이므로 이 장점만으로 결정하지 않음 |
| 고정 쿼터뷰·픽셀 아트 | 비교 당시2D/3D 표현 경로 검토 가능 | 2D 중심으로 구현 가능 | 이후 Q-481에서3D 모델/고정 카메라/픽셀 느낌으로 확정 |
| 무료 그래픽 | 일반 이미지 자산을 선별·가공해 사용 가능 | 같은 일반 이미지 자산을 선별·가공해 사용 가능 | 엔진별 준비된 무료 산업/군사 픽셀 자산 수를 조사·검증하지 않았으므로 우열을 확정하지 않음 |
| 사용 조건·비용 | Personal은 자격 조건이 있는 무료 플랜. CLI/MCP와 유료 Editor 내 AI 서비스는 구분 | 오픈소스 Phaser는 MIT 라이선스 | 실제 주체의 사용 조건과 개별 자산/패키지 조건은 적용 전에 확인 |
| 성능 목표 | 설계·최적화·실제 측정 필요 | 설계·최적화·실제 측정 필요 | 어느 엔진도 이름만으로 내장GPU/RAM8GB/전 배속60FPS 달성을 보장하지 않음 |

## 권고의 해석

AI가 다루는 범위를 코드 작성뿐 아니라 화면 상태 확인·테스트·Windows 빌드·실행 오류 진단까지 포함해 평가했습니다. 공식 자동화 연결을 활용할 수 있다면 Unity의 최종 제품 제작 경로를 한 도구 체계로 관리하는 편이 Project C에 적합하다는 기술적 판단입니다. Unity가 모든 AI 코딩 과제에서 Phaser보다 정확하다는 실험 결과는 아닙니다.

Phaser는 가벼운 코드 중심 수정과 브라우저 확인에 강점이 있습니다. 최종 Windows 포장 도구를 함께 관리하는 경로를 우선한다면 여전히 유효한 대안입니다. 실제 개발 머신의 Unity 연결이나 필수 요건에 중대한 제약이 확인되면 GR-469에 따라 근거·영향·대안을 정리해 사용자에게 질문합니다.

이전 무료 자산 예시인 Kenney의 CC0 아이소메트릭 이미지는2D 비교 참고입니다. Q-481에서 선택한3D 모델의 확보 근거로 사용하지 않습니다. 실제3D 파일·포맷·포함 라이선스와 보정 결과는 아직 검사하지 않았으며 승인된 중간 묘사 수준의 산업·군사 시설 전체를 확보했다고 표시하지 않습니다.

## Unity 자동화 경로 검토

- 우선 검토 경로는 공식 Unity CLI와 Pipeline을 통한 로컬 Editor 제어입니다. 쉘 명령이 가능한 Codex에서는 직접 명령 경로를 우선 검토하고 필요한 경우 같은 CLI의 MCP 모드를 사용합니다.
- 공식 현행 문서는 이전 Editor 내 AI Assistant MCP 서버를 CLI 경로로 대체한다고 안내합니다. 따라서 과거 안내의 Unity AI 구독 요구를 현재 CLI/MCP의 필수 조건으로 옮기지 않습니다.
- 참조한 Unity MCP 워크플로 스킬의 기존 공급자 선택 설명은 구형 Editor 내 연결 방식을 포함합니다. 실제 설치 절차는 현행 공식 문서와 개발 머신의 기존 구성을 확인해 정합니다.
- 현재 세션에서 실제 Editor나 연결을 검사하지 않았습니다. 실제 프로젝트가 생기면 기존 MCP/CLI 구성을 먼저 확인하고 중복 브리지를 추가하지 않습니다.

## 실제 개발 세션 인계 시 확인

1. Unity 사용 자격·Editor 준비와 기존 CLI/MCP 구성 확인. 사람이 해야 하는 인증/승인이 있으면 해당 절차를 설명합니다.
2. 읽기 전용 프로젝트/Console 조회부터 연결 확인 후 코드 반영→컴파일→작은 검사→Windows 빌드 경로 확인.
3. Unity 표시 계층과 분리된 규칙 코어에 재고·거래·승패 자동 검증을 먼저 연결.
4. 작은 수입→생산→보급→방어→수출 흐름 구현. 단축 개발 시험과 확정 시간표의 한 판 검증을 구분.
5. 로컬 진단 기록과 ZIP 실행물 전달. 후반 물량·4배속·1080p를 실제 Windows에서 측정.

위 내용은 인계 계획입니다. 설치·연결·컴파일·테스트·빌드·측정을 완료한 기록이 아닙니다.

## 확인한 공식 자료 — 2026-11-01

- [Unity CLI의 MCP 대체 경로와 라이선스·자동화 범위](https://docs.unity.com/en-us/unity-cli/replace-mcp-server-unity-cli)
- [Unity CLI 소개](https://docs.unity.com/en-us/unity-cli/unity-cli)
- [Unity AI 도구의 CLI/MCP 비용 구분](https://unity.com/features/ai)
- [Unity 제품 플랜](https://unity.com/products)
- [Unity 사용 자격 안내](https://unity.com/pages/license-compliance)
- [Unity Windows 빌드 설정](https://docs.unity3d.com/kr/current/Manual/WindowsStandaloneBinaries.html)
- [Unity 아이소메트릭 타일맵](https://docs.unity3d.com/kr/6000.0/Manual/tilemaps/work-with-tilemaps/isometric-tilemaps/create-isometric-tilemap.html)
- [Phaser의 2D·브라우저 중심 범위와 데스크톱 경로](https://www.phaser.io/oss/docs/phaser/getting-started/what-is-phaser)
- [Phaser 공식 저장소와 MIT 라이선스](https://github.com/phaserjs/phaser)
- [Kenney 아이소메트릭 건물 이미지와 CC0 안내](https://kenney.nl/assets/isometric-tiles-buildings)
- [Kenney 상업 이용·라이선스 안내](https://kenney.nl/support)

## 관련 명세

- [확정 답변 및 미응답 질문](planning.md)
- [소프트웨어 구조 초안](software-architecture.md)
- [실행 환경·검증 계획](technical-validation.md)
- [자산 계획](asset-plan.md)
