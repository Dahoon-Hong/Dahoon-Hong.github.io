# 13. Armory 연구 일시정지 조건 제거

## 요구사항 및 범위

- Armory 연구를 재생 중에도 선택할 수 있도록 한다.
- 연구 후 `mortar-60mm`(표시명 60mm Mortar)의 구매 가능 상태와 기존 비용·재고 흐름은 유지한다.
- Armory 연구 외의 일시정지, 구매, 설치, 전투 규칙은 변경하지 않는다.

## 구현 대상

- `src/ui/HUDManager.ts`
  - Armory 연구 노드 클릭 시 일시정지 여부를 검사하는 차단 조건 제거
- `plans/implementation/progress.md`
  - 구현 및 런타임 검증 결과 기록
- `plans/implementation/4-gameplay-expansion/4.3-armory-upgrade-web.md`,
  `docs/superpowers/specs/2026-09-06-plan-25-gameplay-expansion-design.md`
  - Armory 연구의 이전 일시정지 전제를 현재 동작에 맞게 정정

## 검증 기준

1. 재생 상태에서 Armory의 `research-mortar-60mm` 노드를 선택할 수 있다.
2. 연구 성공 후 60mm Mortar 구매 버튼이 활성화된다.
3. 연구 전에는 구매할 수 없고, matter 부족 시 연구·구매가 실패한다.
4. `npm test`, `npm run build`, `git diff --check`가 통과한다.

## 구현 및 검증 결과

- `HUDManager`에서 Armory 연구 노드의 `isPaused()` 차단 조건을 제거했다.
- 기존 `mortar-60mm` 연구 연결과 구매 비용·재고 처리는 변경하지 않았다.
- `armory-install` 런타임에서 `PLAYING` 상태 연구 성공(`Upgrade selected.`)과 Mortar 구매 성공(`Combat module purchased.`)을 확인했다.
- `npm test`: 18개 파일, 92개 테스트 통과
- `npm run build`: 통과
- `git diff --check`: 통과
