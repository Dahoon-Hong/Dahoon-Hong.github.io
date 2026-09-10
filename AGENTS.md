- branch/PR 지침
  - 브랜치는 `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/` 중 하나로 시작한다. `ai/`, `codex/`는 사용하지 않는다.
  - PR 전 `git fetch --prune origin defence`로 최신 `origin/defence`를 확인한다. 실패하면 작업을 중단한다.
  - 최신 `origin/defence`에서 브랜치를 만들고, 사용자 변경을 제외한 의도한 diff와 PR template을 확인한 뒤 `defence` 대상으로 PR을 생성한다.

- commit 지침
plan 구현시 commit 진행. commit message는 plan 번호를 반드시 포함한다.
plan구현이 아닌 경우 내용을 commit message는 짧은 설명으로 진행한다.

- 기여 작업 지침
branch 생성, commit, push, PR 생성·수정 등 repository 기여 활동을 시작하기 전에 `docs/contribution/README.md`를 읽고 따른다.
기본 브랜치 `defence`는 보호되어 있으므로 직접 push하지 않고, 문서에 정의된 prefix의 작업 브랜치에서 작업한 뒤 `defence`를 대상으로 PR을 생성한다.
PR 본문은 `.github/pull_request_template.md`를 사용한다.

- 구현 지침
  - 과구현을 피하고 간결한 구조를 우선한다.
  - 구현 전 plans/implementation/progress.md와 대상 plan directory를 확인하고, 구현할 plan과 범위를 정한다.
  - 구현 후 plans/implementation/progress.md에 yyyy-mm-dd | plan dir | 진행내용 형식으로 진행 내용을 업데이트한다.
  - 구현 후 npm run dev나 이미 떠있는 서버를 확인하여 정상 구현되었는지 확인한다.
  - 변경용이성을 높은 우선순위로 두고, 변수 사용시 설정(json)으로 분리하는 것을 고려한다.

코드 작성이나 대화 중 agent가 나중에 기억해야할 내용은 여기에 기록한다.

- 콘텐츠 추가 가이드 지침
무기/weapon/전투 모듈, 업그레이드/강화, 탱크/tank/차체, 맵/map/지역/스테이지, 적/enemy/몹을 추가하거나 수정하는 요청을 받으면 사용자가 가이드 이름을 말하지 않아도 먼저 `docs/adding-content/README.md`와 해당 종류의 세부 가이드를 읽는다.
예: "이런 컨셉으로 tank 추가해줘", "새 몹을 넣어줘", "이 무기에 강화 노드를 추가해줘"도 가이드 적용 대상이다. 여러 종류가 함께 바뀌면 관련 가이드를 모두 읽는다.
가이드와 구현이 다르면 현재 로더, 타입, 테스트를 기준으로 판단하고 같은 작업에서 가이드 갱신 필요 여부를 사용자에게 알린다. 밸런스 수치, 아트 요구, 캠페인 연결처럼 결과를 바꾸는 필수 정보가 없으면 임의로 확정하지 않는다.
가이드 작성 및 변경은 plan 구현이 아닌 `guide 작업`으로 분류하며, 사용자가 별도 plan을 지정하지 않은 한 plan 번호를 붙이지 않는다.
`docs/` 아래 파일을 작성하거나 수정하기 전에 `docs/agents.md`를 읽고 따른다.

- 일시정지 중에는 01 기준으로 모듈 설치·업그레이드를 허용하고, 자동 생산·자원 수집은 중지한다.
- 맵의 벽·언덕은 완성 맵 이미지 안에서 표현하며 별도 장애물 오브젝트나 반복 바위 스프라이트를 얹지 않는다. 이미지와 숨겨진 지형 윤곽을 함께 맞추고, 회전한 차체의 벽 관통 방지와 부드러운 코너 이동을 검증한다. 후속 설계와 구현 순서는 `plans/implementation/6-map-art-terrain/6-map-art-terrain.md`를 따른다.

- 스킬 사용 지침
plan 문서를 작성하거나 plan 작업을 시작할 때 `brainstorming` 스킬을 먼저 사용한다.
설계 및 구현 작업을 시작할 때 `ponytail` 스킬을 사용한다. 기본 강도는 `full`로 한다.

- QA 지침
문서 작업이 아닌 기능 개발(게임플레이, UI, 입력, 런타임 또는 빌드 결과 변경)은 PR을 생성하기 전에 반드시 실제 게임을 로컬에서 실행해 확인한다.
이 검증은 프로젝트 sub-agent인 `integration-tester`(`.codex/agents/integration-tester.toml`)를 사용한다. 해당 agent는 저장소 루트에서 `npm run dev`를 실행하고 Computer Use로 브라우저에서 실제 게임을 조작해 변경된 기능을 검증한다.
`integration-tester`의 결과가 PASS가 아니면 PR을 생성하지 않는다. 서버 실행이나 브라우저 검증이 막힌 경우에도 원인을 해결하거나 명확한 BLOCKED 결과를 남긴 뒤 PR 생성을 중단한다.
문서만 변경한 작업은 이 런타임 QA 대상이 아니며 `git diff --check`와 링크·명령어 확인을 수행한다.
