- branch/PR 지침
  - 브랜치는 `feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/` 중 하나로 시작한다. `ai/`, `codex/`는 사용하지 않는다.
  - PR 생성 전 작업 브랜치에서 `git fetch --prune origin` 후 `git pull --no-rebase origin defence`로 최신 `origin/defence`를 반영한다. 충돌이 발생하면 해결·검증을 마칠 때까지 push와 PR 생성을 진행하지 않는다.
  - 최신 `origin/defence`에서 브랜치를 만들고, 사용자 변경을 제외한 의도한 diff와 PR template을 확인한 뒤 `defence` 대상으로 PR을 생성한다.

- commit 지침
plan 구현시 commit 진행. commit message는 plan 번호를 반드시 포함한다.
plan구현이 아닌 경우 내용을 commit message는 짧은 설명으로 진행한다.

- 기여 작업 지침
branch 생성, commit, push, PR 생성·수정 등 repository 기여 활동을 시작하기 전에 `docs/contribution/README.md`를 읽고 따른다.
기본 브랜치 `defence`는 보호되어 있으므로 직접 push하지 않고, 문서에 정의된 prefix의 작업 브랜치에서 작업한 뒤 `defence`를 대상으로 PR을 생성한다.
PR 본문은 `.github/pull_request_template.md`를 사용한다.
- 신규 작업을 시작하기 전에 반드시 `origin/defence`를 `git pull --ff-only origin defence`로 최신화하고, 동기화가 실패하면 로컬 브랜치나 stale ref를 기준으로 작업을 시작하지 않는다.
- push 후에는 `git ls-remote origin <branch>`와 현재 HEAD를 비교해 원격 반영을 확인하고, PR 생성 후에는 `gh pr view`로 올바른 base/head와 PR URL·상태를 확인한다. merge 후에는 최신 `origin/defence`에 해당 커밋이 포함됐는지 확인하기 전까지 완료로 보고하지 않는다.

- 구현 지침
  - 구현 전 plan 파일을 plans/implementation에 기존 형식에 맞춰서 생성한다. 요구사항 및 범위를 구체화는 반드시 포함한다.
  - 구현 시 과구현을 피하고 간결한 구조를 우선한다. module, file, class 단위에 대해서 책임을 명확히 하고 SRP 원칙을 유지한다.
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
  문서 작업이 아닌 기능 개발(게임플레이, UI, 입력, 런타임 또는 빌드 결과 변경)은 plan 구현 완료 시 해당 plan의 필수 시나리오를 실제 runtime에서 확인한다.
  이 검증은 프로젝트 sub-agent인 `integration-tester`(`.codex/agents/integration-tester.toml`)를 사용한다. 오케스트레이터가 현재 plan worktree에서 runtime을 실행하고 정확한 URL·port·worktree를 전달하며, tester는 별도 서버를 시작하거나 다른 port를 찾지 않는다.
  plan에는 테스트 시나리오와 `required` 여부뿐 아니라 runtime fixture, 사전조건, 관측값, 통과 기준을 기록한다. 테스트를 시작하기 전에 변경사항에 맞는 fixture를 선택한다. 이동·경로·AI 자체가 판정 대상이고 사망이 판정 대상이 아니면 QA 전용으로 차량 체력/armor를 높이거나 무적 처리하고, wave를 고정하거나 game over를 비활성화해 관측 시간을 확보한다. contact·death·wave·reward·pause 회귀는 별도의 정상 전투 fixture에서 검증한다. fixture는 변경 기능을 가리면 안 되며, 사용한 완화 설정과 검증 범위를 결과에 기록한다.
  오케스트레이터는 tester 실행 전에 현재 plan worktree 절대 경로, 실제 URL, port, 고유 `runtimeId`, 변경사항 요약, required 시나리오와 timeout을 모두 전달한다. 값이 누락되면 tester를 실행하지 않고 `BLOCKED`로 보고한다. 정상 검증은 1분(60,000ms) 내 결론을 기대하며, QA 단일 실행의 절대 최대 시간은 4분(240,000ms)이다. 호출자가 더 긴 timeout을 전달해도 4분을 넘기지 않는다.
  결과 상태를 제품 동작과 테스트 환경 문제로 구분한다. `PASS`는 동작과 관측이 모두 정상, `FAIL`은 제품 동작의 실패, `BLOCKED`는 URL·observer·runtime 계약·브라우저 등 테스트 환경 문제, `SKIP-N/A`는 범위 밖, `SKIP-ENV`는 plan에 허용된 환경 제약으로만 사용한다. `BLOCKED`를 `PASS`나 `SKIP`으로 숨기지 않는다.
  사용자가 화면을 직접 확인했으며 문제가 없다고 확인하거나 QA 중단을 요청하면 자동 tester를 즉시 종료한다. 오케스트레이터는 사용자의 확인 내용, URL·시나리오, 확인 범위를 `MANUAL-PASS`로 기록할 수 있으며, 자동 `PASS`를 얻기 위해 반복 실행하지 않는다. `MANUAL-PASS`는 `SKIP-ENV`와 다르다.
  tester는 bounded 단일 실행으로 최종 결과만 반환한다. required 기능의 제품 현상(예: 멈춤, 관통, 겹침, 치명적 runtime 오류)이 확인되면 최소 증거를 남기고 즉시 전체 실행을 종료해 `FAIL`을 보고한다. 정상 검증은 충분한 증거가 확보되는 즉시, 기본적으로 1분 안에 종료하며 4분까지 채우기 위해 반복·soak하지 않는다. 동일 원인의 `BLOCKED`는 재시도하지 않으며, runtime 계약 수정이나 fixture/구현 변경이 있었을 때만 최대 1회 재실행한다. 4분(240,000ms) 상한 또는 전달된 더 짧은 timeout을 넘기거나 결과 증거가 더 이상 늘지 않으면 중단하고 상태·원인·영향 범위를 보고한다. PR 생성 전 동일 통합 테스트를 반복하지 않으며, PR에서는 plan 테스트 결과와 일반 CI 결과를 참조한다.
  필수 시나리오가 `PASS` 또는 사용자가 명시적으로 확인한 `MANUAL-PASS`이고 허용된 skip 사유가 기록된 경우 plan 완료·commit을 진행할 수 있다. 필수 시나리오가 제품 동작 `FAIL`이면 완료·commit을 보류하고 원인과 재현 조건을 남긴다. 환경성 `BLOCKED`는 사용자 확인이나 수정된 fixture 없이 완료 처리하지 않는다.
  일반 production runtime에는 테스트 observer를 노출하지 않는다. tester는 애플리케이션 소스·테스트·설정을 임의로 수정하지 않는다.
  문서만 변경한 작업은 이 runtime QA 대상이 아니며 `git diff --check`와 링크·명령어 확인을 수행한다.
