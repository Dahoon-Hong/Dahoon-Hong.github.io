# 개발·기여 가이드

이 문서는 이 저장소에서 작업 브랜치를 만들고, 변경사항을 commit·push하고, Pull Request(PR)를 생성하는 공통 절차를 정의한다.

## 핵심 규칙

- 기본 브랜치는 `defence`다.
- `defence`는 보호되어 있으므로 직접 commit하거나 push하지 않는다.
- 모든 변경은 `defence`에서 최신 상태를 받은 작업 브랜치에서 진행한다.
- 작업이 끝나면 작업 브랜치에서 `defence`를 대상으로 PR을 생성한다.
- PR에는 변경 요약, 테스트 결과, reference를 개조식으로 기록한다.

## 작업 브랜치

작업 목적에 맞는 prefix를 사용하고, 뒤에는 짧은 kebab-case 설명을 붙인다.

| Prefix | 사용 목적 | 예시 |
| --- | --- | --- |
| `feature/` | 새로운 기능이나 콘텐츠 | `feature/arc-weapon` |
| `fix/` | 버그 수정 | `fix/tank-wall-slide` |
| `chore/` | 의존성·도구·저위험 정리 | `chore/update-build-script` |
| `docs/` | 문서와 가이드 변경 | `docs/contribution-guide` |
| `refactor/` | 동작을 바꾸지 않는 구조 개선 | `refactor/map-loader` |
| `test/` | 테스트 추가·수정 | `test/terrain-collision` |

브랜치 이름에는 공백을 사용하지 않는다. 하나의 브랜치는 하나의 목적만 다룬다.

## 작업 시작

`defence`의 최신 상태에서 작업 브랜치를 만든다.

```bash
git switch defence
git pull --ff-only origin defence
git switch -c feature/short-description
```

이미 다른 작업을 진행 중인 경우에는 해당 작업 브랜치에서 계속 작업하고, unrelated 변경사항을 섞지 않는다.

## Commit

- 하나의 commit은 하나의 논리적 변경을 담는다.
- commit 전에 변경 범위를 확인하고 `git diff --check`를 실행한다.
- plan 구현 commit은 반드시 commit message에 plan 번호를 포함한다.
- plan 구현이 아닌 commit은 짧고 변경 목적이 드러나게 작성한다.
- 비밀키, 개인 환경 파일, 빌드 산출물, 임시 디버그 파일을 commit하지 않는다.

권장 commit message 형식은 다음과 같다.

```text
<type>(<scope>): <짧은 설명>
```

예시:

```text
feature(weapon): add arc module
fix(plan 27.3): prevent tank wall penetration
docs(contribution): add GitHub flow guide
```

## Push

작업 브랜치를 원격에 처음 올릴 때 upstream을 설정한다.

```bash
git push -u origin feature/short-description
```

이후에는 같은 작업 브랜치에 push한다.

```bash
git push
```

`git push origin defence`처럼 보호된 기본 브랜치에 직접 push하지 않는다. 원격 작업 브랜치에는 본인의 작업에 필요한 commit만 올린다.

## 테스트와 검증

변경 범위에 맞는 검증 명령과 결과를 PR에 기록한다.

```bash
npm test
npm run build
npm run qa:release
```

- 단위·로직 변경은 관련 테스트를 실행한다.
- TypeScript나 번들에 영향을 주는 변경은 `npm run build`를 실행한다.
- 아트·오디오·릴리스 계약에 영향을 주는 변경은 관련 QA 명령을 추가로 실행한다.
- 게임 플레이나 UI 런타임을 변경했다면 `npm run dev`로 개발 서버와 브라우저 동작도 확인한다.
- 문서만 변경한 경우에도 `git diff --check`와 링크·명령어의 오탈자를 확인한다.

## Pull Request

작업 브랜치에서 GitHub PR을 만들고 base branch를 반드시 `defence`로 지정한다. PR 템플릿은 `.github/pull_request_template.md`를 사용한다.

PR 제목은 다음 형식을 사용한다.

```text
<type>(<scope>): <요약>
```

예시:

```text
feature(weapon): add arc module
fix(terrain): smooth tank corner movement
docs(contribution): add contribution guide
```

`type`은 작업 브랜치 prefix와 같은 목적을 나타내고, `scope`에는 영향을 받은 모듈·영역을 쓴다. 제목은 짧은 현재형 요약으로 작성한다.

PR 본문에는 다음 항목을 개조식으로 작성한다.

- 내용 요약: 무엇을 왜 바꿨는지
- 테스트 결과: 실행한 명령과 통과·실패 결과
- Reference: 관련 issue, plan, 문서, 디자인 자료 링크

PR 생성 후 CI와 리뷰를 확인하고, 요청된 수정은 같은 작업 브랜치에 추가 commit으로 반영한다. 보호 규칙과 리뷰가 모두 충족된 PR만 `defence`에 merge한다.

## Merge 후 정리

merge가 완료되면 로컬 기본 브랜치를 최신화한다.

```bash
git switch defence
git pull --ff-only origin defence
```

더 이상 사용하지 않는 작업 브랜치는 merge 확인 후 원격과 로컬에서 정리할 수 있다.
