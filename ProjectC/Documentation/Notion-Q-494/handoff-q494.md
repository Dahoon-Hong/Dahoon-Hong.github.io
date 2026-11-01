## 로컬 Codex용 전체 파일 묶음

노션 연결이 없는 로컬 Codex에서는 이 ZIP을 내려받아 압축을 풀고 `project-c` 폴더를 작업 폴더로 엽니다. 원문 Markdown20개와 동기화/인계 기록을 포함한31개 파일입니다.

> Notion 첨부 참조: `notion-file-block://60f1431e-1a73-497f-85f4-bdaae6b85007/984b5634-ed86-4f29-8a35-3cf623926256?space_id=cc17d682-9c6a-8119-8cb9-00030c947e75&name=project-c-handoff-q494.zip`

그 폴더에서 다음 한 문장으로 시작합니다.

```txt
Project C 개발을 이어서 진행해. AGENTS.md와 development-handoff.md부터 읽어.
```

## 동기화 상태

- 동기화 상태: Q-494 전체 자료 반영·재조회 확인 완료. 원문20개/30개 페이지와 기존10개 페이지의 최신 기준을 확인했습니다.
- Q-494까지 확정한 기획·설계·검증 계획·질의 이력과 원문 문서20개를30개 페이지로 보존했습니다. 긴 파일은 순서대로 나누고 각 조각의 앞뒤와 모든 조각 링크를 연결했습니다.
- 문서 최신성이 구현·빌드·플레이·성능 검증 완료를 뜻하지 않습니다. 현재 미응답 질문은 없습니다.

## 다른 Codex 세션에서 한 문장으로 시작

노션 접근이 연결된 Codex 세션에 다음 문장을 입력합니다.

```txt
아래 노션 페이지의 개발 인계와 연결 문서를 읽고 Project C 개발을 이어서 진행해: https://app.notion.com/p/40b7d6829c6a81e9aec2ff8a0b6959b0
```

노션이 연결되지 않은 로컬 Codex는 이 페이지를 자동으로 읽을 수 없습니다. 로컬 문서 묶음을 받은 경우에는 그 폴더를 열고 다음 문장을 입력합니다.

```txt
Project C 개발을 이어서 진행해. AGENTS.md와 development-handoff.md부터 읽어.
```

- 우선 읽을 문서: [AGENTS.md](https://app.notion.com/p/40b7d6829c6a81f88e54da3b3930bec3) → [development-handoff.md](https://app.notion.com/p/40b7d6829c6a8174a32fc55f910a82a4) → [planning.md — 1/4](https://app.notion.com/p/40b7d6829c6a817c931ef9b5133935ed) → [software-architecture.md](https://app.notion.com/p/40b7d6829c6a8164b3a4ea4a79fb5a1b). 나머지는 작업 범위에 맞춰 읽습니다. 이전 대화 이력을 요구하지 않습니다.

## 최신 기준 — Q-494

- 확정 답변: Q-494까지. 현재 미응답 질문은 없습니다.
- Unity+C#·Windows10/11 x64, 고정 쿼터뷰 직교 카메라의3D 모델·게임 장면 픽셀 느낌·선명한 UI로 확정했습니다.
- 실제 개발은 다른 Windows 머신의 Codex 세션에서 진행합니다. 현재는 기획·큰 구조 초안·인계 문서 단계이며 게임 코드·Unity 프로젝트·실행/성능 검증은 아직 없습니다.
- 성능 목표는1080p·1/2/4배60FPS·내장GPU/RAM8GB입니다. 실제 측정은 미실행입니다.
- 무료 자산+보정, 총 에셋 구매5만원 이하/음향 우선, 공개 Git 저장소 방침, 첫 Windows 실행물은ZIP입니다.
- 기존 원칙에서 도출 가능한 세부 설계는 AI가 진행합니다. 목표·범위·예산·핵심 경험의 변경이나 중요한 충돌, 실제 엔진 제약/자산 부족만 근거·대안을 갖춰 질문합니다.
- 전체 원문과 개발 시작점: [개발 인계·전체 문서 — Q-494](https://app.notion.com/p/40b7d6829c6a81e9aec2ff8a0b6959b0). 아래의 과거 미정·중단·엔진 유보 문구는 작성 당시 이력이며 최신 GR과 이 절을 우선합니다.

## 확정 방향

| 영역 | 개발 기준 |
| --- | --- |
| 도구·플랫폼 | Unity+C#, 다른 Windows 머신의 Codex 세션, Windows10/11 x64 독립 실행·오프라인 |
| AI 작업 | 초기 설정부터 가능한 한 AI가 처리. 실제 인증·사람의 조작이 필요하면 해당 절차 설명 |
| 규칙 구조 | 화면 없이 검증 가능한 C# 시뮬레이션 코어와 Unity 입력·표현·플랫폼 연결 분리 |
| 데이터 | 가격·레시피·시설·웨이브 수치는 데이터, 작동 규칙은 코드. 시설·품목·적 추가까지의 확장성 |
| 표시 | 고정 쿼터뷰 직교 카메라의3D 모델, 게임 장면에 픽셀 느낌, 선명한 UI·글자 |
| 가독성 | 일정한 조명·절제된 그림자, 가림을 줄이는 모델 형태·높이, 선택 윤곽 강조 |
| 자산 | 무료 자산+보정, AI 열람·수정·검증 가능, 원본·가공 방법·최종본·출처/조건 연결 |
| 비용·음향 | 에셋 구매 총5만원 이내·음향 우선, 기본 분위기의 차분한 산업·전자 BGM 반복 |
| 성능 | 1080p·1/2/4배60FPS, 내장GPU·RAM8GB 목표. 실제 구체 기기·성능 미확인 |
| 검증 | 재고·거래·승패 자동 검사 우선, 직접 플레이+지표, 정확성 결함 수정·재검증 우선 |
| 첫 버전 | 임시 그래픽·기본 UI의 작은 수입→생산→보급→방어→수출 흐름. 대표 시설·지형에 새 표현도 적용 |
| 인계·실행물 | 공개 Git 저장소 방침, 실제 권한이 허용하는 자산 포함. 첫 Windows 실행물은 필수 데이터 포함ZIP |

게임 판정은 기존 격자·시간·재고·충돌·공격 규칙을 유지합니다.3D 외형이나 애니메이션이 실제 점유·명중·소비·도착 시각을 결정하지 않습니다.

## 먼저 읽을 자료

1. [planning.md — 1/4](https://app.notion.com/p/40b7d6829c6a817c931ef9b5133935ed): 최신 상태·사용자 답변/GR·질문 방식. 오래된 상태 문구와 충돌하면 상단 및 최신 답변 우선.
2. [software-architecture.md](https://app.notion.com/p/40b7d6829c6a8164b3a4ea4a79fb5a1b): 모듈·책임·상태 소유권·명령/데이터 흐름·시간 처리·검증 경계.
3. [first-validation.md](https://app.notion.com/p/40b7d6829c6a81458b72ca668b73acd7), [technical-validation.md](https://app.notion.com/p/40b7d6829c6a812d9bcfe02e0fdc4c97): 작은 전체 흐름과 자동/직접/Windows/성능 검증 경계.
4. [asset-plan.md](https://app.notion.com/p/40b7d6829c6a81eb9d9fdf9ab35b21ac), [engine-review.md](https://app.notion.com/p/40b7d6829c6a818182d7fae922f45e88): 자산·예산·엔진 선정과 실제 미확인 사항.
5. [event-rules.md](https://app.notion.com/p/40b7d6829c6a814ba9b4fa47c69046af), [drone-rules.md](https://app.notion.com/p/40b7d6829c6a816ba053f9243a742653), [ui-flow.md](https://app.notion.com/p/40b7d6829c6a81518249c7d825d04cb7), [play-flow.md](https://app.notion.com/p/40b7d6829c6a814f94fef858882cb1e3): 연결 시나리오·경계 규칙. 모두 계획/명세이며 실행 결과와 구분.
6. [reference/planning-baseline.md](https://app.notion.com/p/40b7d6829c6a815aae60ef80508e2626), [reference/planning-history.md — 1/8](https://app.notion.com/p/40b7d6829c6a81b7b4dbde84ad52ecba): 세부 규칙 참고. 이후 최신 GR이 수정한 부분은 최신 결정 적용.

## 개발 세션에서 수행할 순서

1. 인계 문서를 읽고 실제 머신·프로젝트/저장소 존재 여부·기존 Unity/CLI/MCP 구성을 확인합니다. 기획 세션의 임시 환경 상태로 판단하지 않습니다.
2. 확정 구조와 호환성을 기준으로 구체 Editor·렌더 파이프라인·무료 패키지·검증 도구를 선택하고 근거를 기록합니다. 보통의 기술 선택은 사용자 설문으로 돌리지 않습니다.
3. 기존 연결을 우선 사용하고 실제 Editor 조회·코드 반영·컴파일·작은 검사·Windows 빌드의 작업 경로를 확인합니다. 확인한 증거와 미확인 항목을 구분합니다.
4. C# 코어의 데이터·재고/예약·거래·시계·승패 경계를 검증하고 작은 전체 흐름을 연결합니다. 개발용 단축 시험과 확정 조건의 한 판 검증은 구분합니다.
5. 첫 흐름 검증판에서 대표3D 시설·지형의 픽셀 표현과 선명한 UI를 함께 검토합니다. 전체 정식 자산 완성을 선행하지 않습니다.
6. 로컬 진단 파일과 실행 조건·변경·실제 검사 결과·미확인 사항을 함께 제공합니다. 후반/4배속 부하는 작은 전체 흐름 이후부터 확장과 병행합니다.

## 사용자 질문과 설계자 책임

- 사용자는 기술/관리 세부 선택을 상위 질문처럼 반복하는 방식을 지적했습니다. 질문 수나 묶음 수를 채우려는 추가 설문을 만들지 않습니다.
- 기존 원칙에서 도출 가능한 모듈 내부 구조·자료구조·파일 구성·검증 도구·일반 최적화·자산 가공 이력 관리는 AI가 결정하고 근거를 남깁니다.
- 사용자 판단이 필요한 목표·범위·예산·핵심 경험의 변경, 원칙 간 중대한 충돌만 근거와 대안이 준비된 상태로 질문합니다.
- GR-469: 실제 중요한 엔진 제약이 발견되면 원인·영향·대안을 정리해 질문합니다. 엔진 교체·요구 변경을 임의 확정하지 않습니다.
- GR-484: 무료 자산과 보정으로 필요한 표현을 확보하기 어려우면 해당 자산을 고르기 전에 사용자와 대안을 논의합니다. 신규 제작·구매·예산 재배분을 임의 대체하지 않습니다.
- 사용자에게는 자유 플레이와 체감 피드백을 받고 기록은 AI가 정리합니다. 사소한 구현 항목마다 확인을 요구하지 않습니다.

## 완료 판단

문서 계획은 구현·테스트·빌드 증거가 아닙니다. 브라우저/화면 없는 검사와 Windows 실행·성능·직접 플레이의 검증 범위를 구분합니다. 한 판은 기존 승리 조건으로 완료해야 하며 여러 합리적인 배치·증설 순서의 완주 가능성을 평가합니다.

## 전체 원문 문서 목록

| 원문 파일 | 모든 조각 |
| --- | --- |
| `AGENTS.md` | [AGENTS.md](https://app.notion.com/p/40b7d6829c6a81f88e54da3b3930bec3) |
| `README.md` | [README.md](https://app.notion.com/p/40b7d6829c6a81e19c57f17b5c94bf4d) |
| `START-HERE.md` | [START-HERE.md](https://app.notion.com/p/40b7d6829c6a816db280ee5513c9cb19) |
| `asset-plan.md` | [asset-plan.md](https://app.notion.com/p/40b7d6829c6a81eb9d9fdf9ab35b21ac) |
| `cycle-summary.md` | [cycle-summary.md](https://app.notion.com/p/40b7d6829c6a8107b6c3e22644305440) |
| `design-principles.md` | [design-principles.md](https://app.notion.com/p/40b7d6829c6a81bd8d8cf461a5f413a4) |
| `development-handoff.md` | [development-handoff.md](https://app.notion.com/p/40b7d6829c6a8174a32fc55f910a82a4) |
| `drone-rules.md` | [drone-rules.md](https://app.notion.com/p/40b7d6829c6a816ba053f9243a742653) |
| `engine-review.md` | [engine-review.md](https://app.notion.com/p/40b7d6829c6a818182d7fae922f45e88) |
| `event-rules.md` | [event-rules.md](https://app.notion.com/p/40b7d6829c6a814ba9b4fa47c69046af) |
| `first-validation.md` | [first-validation.md](https://app.notion.com/p/40b7d6829c6a81458b72ca668b73acd7) |
| `planning.md` | [planning.md — 1/4](https://app.notion.com/p/40b7d6829c6a817c931ef9b5133935ed) · [planning.md — 2/4](https://app.notion.com/p/40b7d6829c6a818d9f3de7538d6ae621) · [planning.md — 3/4](https://app.notion.com/p/40b7d6829c6a818f8339eb459d2ba1cc) · [planning.md — 4/4](https://app.notion.com/p/40b7d6829c6a81d398ffe74c1121e716) |
| `play-flow.md` | [play-flow.md](https://app.notion.com/p/40b7d6829c6a814f94fef858882cb1e3) |
| `question-cycle.md` | [question-cycle.md](https://app.notion.com/p/40b7d6829c6a815d943cd9e3fac12781) |
| `reference/planning-baseline.md` | [reference/planning-baseline.md](https://app.notion.com/p/40b7d6829c6a815aae60ef80508e2626) |
| `reference/planning-history.md` | [reference/planning-history.md — 1/8](https://app.notion.com/p/40b7d6829c6a81b7b4dbde84ad52ecba) · [reference/planning-history.md — 2/8](https://app.notion.com/p/40b7d6829c6a814981eeed0e755e6eb5) · [reference/planning-history.md — 3/8](https://app.notion.com/p/40b7d6829c6a8190aa89fc86f38ef15e) · [reference/planning-history.md — 4/8](https://app.notion.com/p/40b7d6829c6a81bda8afc88e79dace51) · [reference/planning-history.md — 5/8](https://app.notion.com/p/40b7d6829c6a8103b259f506c20d1e78) · [reference/planning-history.md — 6/8](https://app.notion.com/p/40b7d6829c6a81c0a785cc5833cc3ba7) · [reference/planning-history.md — 7/8](https://app.notion.com/p/40b7d6829c6a81fdb3b5d7cdfab6913b) · [reference/planning-history.md — 8/8](https://app.notion.com/p/40b7d6829c6a81e0aa68e2452694ac1a) |
| `review.md` | [review.md](https://app.notion.com/p/40b7d6829c6a8111af35ee7294643bcf) |
| `software-architecture.md` | [software-architecture.md](https://app.notion.com/p/40b7d6829c6a8164b3a4ea4a79fb5a1b) |
| `technical-validation.md` | [technical-validation.md](https://app.notion.com/p/40b7d6829c6a812d9bcfe02e0fdc4c97) |
| `ui-flow.md` | [ui-flow.md](https://app.notion.com/p/40b7d6829c6a81518249c7d825d04cb7) |

## 원문 보존과 적용 순서

- 각 원문 페이지는 파일명·원문 해시·전체 조각 목록·끝 표식을 포함합니다. 원문을 삭제하거나 과거 확정 기록을 덮어쓰지 않았습니다.
- 최신 답변/GR이 과거 참고본보다 우선합니다. DD와 구조 초안은 원칙에서 도출한 설계이며 실제 구현·실행 결과와 구분합니다.
- 이 페이지에서 연결한30개 원문 페이지와 기존 Project C 페이지는 같은 연결 권한 범위입니다. 공개 Git 방침이 노션의 공개 웹 게시를 뜻하지 않습니다.

## 기존 기획 자료

- [20261014 project C](https://app.notion.com/p/3f97d6829c6a81a2999decb377794963)
- [Notion 페이지](https://app.notion.com/p/4017d6829c6a8126af90d19f44b5e784)
- [Notion 페이지](https://app.notion.com/p/4027d6829c6a819484e2c617a2bf19f3)

## 원문 하위 페이지

아래 하위 페이지는 전체 문서 원문입니다. 현재 기준과 개발 시작 방법은 이 페이지 상단을 따릅니다.

## 개발 방향

Unity+C#·Windows x64·고정 직교 카메라의3D 모델·게임 장면의 픽셀 느낌·선명한 UI를 기준으로 합니다. 기존 원칙에서 도출 가능한 설계는 AI가 진행하고 중요한 목표·범위·예산·충돌만 사용자에게 질문합니다.

[AGENTS.md](source/AGENTS.md)

[README.md](source/README.md)

[START-HERE.md](source/START-HERE.md)

[asset-plan.md](source/asset-plan.md)

[cycle-summary.md](source/cycle-summary.md)

[design-principles.md](source/design-principles.md)

[development-handoff.md](source/development-handoff.md)

[drone-rules.md](source/drone-rules.md)

[engine-review.md](source/engine-review.md)

[event-rules.md](source/event-rules.md)

[first-validation.md](source/first-validation.md)

[planning.md](source/planning/README.md) — 1/4

[planning.md](source/planning/README.md) — 2/4

[planning.md](source/planning/README.md) — 3/4

[planning.md](source/planning/README.md) — 4/4

[play-flow.md](source/play-flow.md)

[question-cycle.md](source/question-cycle.md)

reference/[planning-baseline.md](source/reference/planning-baseline.md)

reference/[planning-history.md](source/reference/planning-history/README.md) — 1/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 2/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 3/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 4/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 5/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 6/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 7/8

reference/[planning-history.md](source/reference/planning-history/README.md) — 8/8

[review.md](source/review.md)

[software-architecture.md](source/software-architecture.md)

[technical-validation.md](source/technical-validation.md)

[ui-flow.md](source/ui-flow.md)
