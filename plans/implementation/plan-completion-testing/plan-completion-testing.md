# Plan 완료 테스트 전환 구현 계획

## 요구사항 및 범위

- PR 직전 별도 통합 테스트 게이트를 제거하고 plan 구현 완료 시점의 단일 테스트로 전환한다.
- 테스트는 현재 plan worktree에서 실행 중인 runtime의 명시된 URL·port를 사용한다.
- tester가 runtime을 중복 실행하거나 임의의 port를 찾지 않도록 한다.
- 각 plan의 변경 범위에 맞는 시나리오만 실행하고, 불필요하거나 실행 불가능한 항목은 `SKIP-N/A` 또는 `SKIP-ENV`로 사유를 남긴다.
- camera follow 때문에 화면만으로 WASD 이동을 판정하지 않도록 dev-only observer에서 차량 월드 좌표와 핵심 wave/spawn 상태를 제공한다.
- 중간 polling과 반복 스크린샷을 줄이고 bounded final result만 반환한다.

## 구현 단계

1. `.codex/agents/integration-tester.toml`의 역할을 PR gate에서 plan 완료 테스트로 바꾸고, 제공 runtime 접속·시나리오 skip·단일 최종 보고 규칙을 명시한다.
2. `scripts/integration-runtime.mjs`에 지정 worktree/port, strict port, readiness, manifest, cleanup을 제공하는 최소 launcher를 추가한다.
3. `src/core/GameTestObserver.ts`를 추가하고 `?test=1` development runtime에서만 `data-testid="game-test-observer"` snapshot을 노출한다.
4. `Game`과 `WaveManager`에 observer가 읽을 수 있는 이동·wave·spawn 상태를 연결한다. 게임 동작과 production 경로는 변경하지 않는다.
5. observer와 runtime launcher의 경계·검증 테스트를 추가하고 plan 테스트 결과 기록 규칙을 문서화한다.
6. `npm test`, `npm run qa:release`, runtime launcher smoke test, 실제 plan runtime scenario를 실행하고 `plans/implementation/progress.md`에 결과를 기록한다.

## Plan 완료 테스트 시나리오

| id | 시나리오 | expected | required |
| --- | --- | --- | --- |
| runtime | 지정 worktree·port runtime 접속 | manifest와 URL이 일치하고 observer가 로드됨 | true |
| observer | start menu에서 gameplay 진입 | screen/gameState와 vehicle·wave/spawn snapshot 확인 | true |
| movement | canvas focus 후 WASD 입력 | world 좌표 또는 movementDistance 변화 확인 | true; key-hold 미지원 환경은 `SKIP-ENV` |
| production | production build 확인 | observer가 노출되지 않는 build 성공 | true |

브라우저 입력 API가 단발성 key press만 제공해 movement를 한 프레임 이상 유지할 수 없는 경우에는 `lastKeyCode` 수신 근거와 함께 movement 브라우저 시나리오만 `SKIP-ENV`로 기록하고, `Vehicle.test.ts`의 terrain test map 이동 회귀 테스트를 보완 근거로 사용한다.

## 완료 기준

- 지정 worktree와 port가 아닌 runtime으로는 tester가 시작되지 않는다.
- port 충돌 시 자동 port 변경 없이 명확히 실패하고 orphan server가 남지 않는다.
- 일반 production runtime에는 observer가 노출되지 않는다.
- observer로 차량 월드 좌표의 방향성 변화를 판정할 수 있다.
- plan 범위 외 시나리오는 실행하지 않고 skip 사유를 기록한다.
- runtime·observer·테스트 문서 변경에 대한 자동 테스트와 build가 통과한다.
- PR 전 중복 통합 테스트를 요구하지 않고 plan 완료 결과를 재사용한다.
