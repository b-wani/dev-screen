# #61 — Welcome(온보딩) 창 셸 재설계 (DRAFT SPEC)

> HITL 초안. 확정 아님. 최종 결정은 사람이 내린다. 아래 **OPEN** 항목은 사람 판단 필요.
> 범위: **셸만 재설계**. 단계 전이/완료 플래그 로직(`src/shared/onboarding.ts`)과 단계
> 콘텐츠(`OnboardingStepBody.tsx`, 권한 단계 UI)는 #49~#51에서 만든 것을 **그대로 재사용**한다.
> 코드에서 새로 짓는 건 셸(창·레이아웃·내비게이션)과 소환/메뉴 배선, 그리고 새 모델에 맞춘 카피뿐이다.

---

## 0. 현재 상태 (재설계 대상)

- 온보딩은 **독립 창이 아니다**. `App.tsx`가 완료 플래그(`onboardingStatus`)를 읽어
  `OnboardingView`를 메인 창 안의 한 뷰로 스왑한다. 즉 온보딩·idle·녹화·프리뷰가 같은 창을 공유.
- 셸 = 중앙 카드 1개. 상단 진행 텍스트(`n / 7`) + 제목 + 본문 + 점 인디케이터 + 이전/다음 버튼.
  키보드 좌우로 단계 이동. 마지막 단계에서 "시작하기" → `completeOnboarding()` → 플래그 저장.
- 7단계 순서(`ONBOARDING_STEPS`): `permissions → overview → feature-recording → feature-editing
  → feature-export → shortcuts → faq`.
- 스타일은 구 DESIGN.md 톤(모노크롬). Hoppy 토큰·마스코트 없음.
- 트레이 메뉴에는 "런처 열기"만 있고 **"Welcome 다시 보기" 재소환 항목이 없다**.
- 전역 단축키 `⌥⌘R`은 현재 **녹화 토글**(`toggleRecord`)에 직접 바인딩(`main/index.ts` `Alt+Command+R`).

---

## 1. 창 형태·크기 (SETTLED + 1 OPEN)

**SETTLED**
- Welcome은 **독립 BrowserWindow**로 분리한다(#54 토폴로지). 메인 창 뷰 스왑에서 떼어낸다.
  - `App.tsx`의 온보딩 분기를 제거하고, 완료 전이면 main 대신(또는 함께) Welcome 창을 띄우는
    책임을 main 프로세스로 옮긴다. `completeOnboarding()` IPC·`onboardingStatus()` 조회는 그대로.
- 메뉴바 전용·Dock 숨김 앱 정책 유지. Welcome 창도 닫기(X)는 종료가 아니라 창만 닫힘(플래그가
  있으니 재소환 전까지 다시 뜨지 않음). 앱 자체는 트레이에 상주.
- 창 크롬: 표준 타이틀바(신호등 버튼) 유지, `title = "Recap 시작하기"`. `titleBarStyle`은 기본.
- 콘텐츠는 Hoppy C-dark 캔버스(`--bg #0c140a`) 위에 뜬다. 마스코트 Hoppy가 히어로를 이끈다
  (prime mascot surface — 디자인 언어 §마스코트: Welcome 온보딩은 마스코트 등장 표면).

**OPEN — 창 크기·리사이즈 정책** → 결정 1 참조.

---

## 2. 챕터 내비게이션 패턴 (OPEN — 핵심 포크)

기존은 "중앙 카드 + 하단 점 + 이전/다음 + 키보드 좌우"의 **페이지드 스텝퍼**. 새 셸에서 7단계를
어떻게 오갈지가 이 티켓의 가장 큰 갈림길. → **결정 2** 참조. 어떤 패턴을 고르든:

- 단계 목록·순서·전진/후퇴 판정·완료 판정은 `shared/onboarding.ts`를 **그대로** 쓴다
  (`ONBOARDING_STEPS`, `advance`, `goBack`, `canGoBack`, `canAdvance`, `isLastStep`).
- 권한 단계 게이팅(`canAdvance`가 두 권한 granted 요구)은 유지 — 셸이 바뀌어도 Next 비활성 규칙 동일.
- 키보드 좌우 이동은 유지(접근성).

---

## 3. 기존 단계 콘텐츠 배치 (SETTLED 배치안 + OPEN 그룹핑)

콘텐츠는 **다시 쓰지 않는다**. `OnboardingStepBody`(overview/feature-*/shortcuts/faq)와
권한 단계 UI(`PermissionStep`/`PermissionRow`, 250ms 폴링·설정 열기·재시작 안내)를 새 셸에 **그대로 마운트**.

새 셸의 3영역 레이아웃(마스코트 히어로 + 챕터 내비 + 본문 패널):

| 영역 | 내용 | 출처(재사용) |
|---|---|---|
| 좌/상 히어로 | Hoppy 마스코트 + 브랜드 카피("Recap에 온 걸 환영해요") + 진행 표시 | 신규 셸(카피만) |
| 챕터 내비 | 7단계 라벨 목록(현재 단계 강조). 라벨 = `ONBOARDING_STEPS[].title` | 로직 재사용, 표현만 신규 |
| 본문 패널 | 현재 단계 콘텐츠. 권한 단계면 `PermissionStep`, 그 외 `OnboardingStepBody` | **콘텐츠 그대로** |
| 하단 바 | 이전/다음(또는 시작하기). `canAdvance`로 비활성 판정 | 로직 재사용 |

권한 단계는 마스코트를 본문에 넣지 않는다(디자인 언어: 마스코트는 기능 크롬에 안 들어감 — 단,
Welcome 히어로/브랜드 여백에는 등장). 권한 행·상태 배지·"허용" 버튼은 Hoppy 토큰으로만 리스킨.

**OPEN — 단계 그룹핑/카운트**: 지금 7단계 평면. 새 셸에서 3 기능 상세를 한 "기능 소개" 챕터로
묶어 챕터 수를 줄일지(예: 권한·기능 소개·단축키·FAQ 4챕터, 기능 소개 안에서 세부 스크롤) 여부는
콘텐츠 재편이라 셸 범위를 넘음 → **결정 4**에서 카피 재작성 범위와 함께 다룸.

---

## 4. 소환 · 완료 플래그 동작 (SETTLED)

- **첫 실행 자동 소환**: 완료 플래그(`isOnboardingComplete`)가 false면 앱 기동 시 Welcome 창을
  자동으로 띄운다. (현재 `App.tsx`가 하던 판정을 main으로 이관.)
- **수동 재소환**: 트레이 컨텍스트 메뉴에 **"Welcome 다시 보기"** 항목 신설(`onShowWelcome` 콜백).
  완료 플래그와 무관하게 언제든 다시 연다. → **완료 플래그를 존중**한다는 것은: *자동* 소환만
  플래그로 억제되고, *수동* 재소환은 항상 허용(플래그를 지우지 않음).
- **완료**: 마지막 단계 "시작하기" → `window.recap.completeOnboarding()` → 플래그 저장 → Welcome
  창 닫힘. 이 IPC·저장 경로는 기존 그대로. 재소환 후 다시 완료해도 idempotent.
- Welcome 창이 이미 떠 있는데 재소환하면 새 창 대신 기존 창을 포커스(중복 창 금지).

**SETTLED 아님 주의**: "메뉴바 메뉴"에 넣을 항목 위치(최상단 vs 구분선 아래)는 사소 — 셸 결정 아님.

---

## 5. 카피 갱신 — 새 상주 모델·단축키 (OPEN 범위, 후보 명시)

새 모델과 **충돌하는** 기존 카피만 최소 수정한다(콘텐츠 재작성 아님). 확인된 후보:

1. **`shortcuts` 단계** (`OnboardingStepBody.tsx`):
   - 현재: "전역 단축키 ⌥⌘R로 **창을 열지 않고 녹화를 시작하거나 멈출 수 있어요**."
   - 새 모델(#54): ⌥⌘R = **캡처 툴바 소환**(녹화 중이면 정지). 즉 즉시 녹화 시작이 아니라 툴바를 부름.
   - 제안: "전역 단축키 ⌥⌘R로 **캡처 툴바를 불러와요**. 녹화 중에 누르면 정지합니다. 어떤 앱을 쓰든 동작해요."
   - "런처" 표현(트레이 "런처 열기")과의 정합성도 점검 대상(새 토폴로지에서 '런처'가 '캡처 툴바'로 바뀌는지).
2. **`shortcuts` 단계 note**: "Recap은 메뉴바에 상주해요. 창을 닫아도 종료되지 않고, 메뉴바
   아이콘에서 다시 열 수 있습니다." → 새 모델과 **이미 정합**. 유지(미세 표현만).
3. **`overview`/`feature-*`/`faq`**: 상주 모델·단축키와 무관 → **손대지 않음**.
   (단, 그룹핑을 바꾸면 overview 리드 문구가 챕터 구조를 언급하는지 점검 — 현재는 안 함.)
4. `shared/onboarding.ts`의 단계 title `'전역 단축키 ⌥⌘R'` → 유지(단축키 자체는 그대로 ⌥⌘R).

→ 어디까지 다시 쓸지는 **결정 4**.

---

## 6. 재사용 경계 (명시)

**그대로 재사용 (코드 변경 없음이 목표)**
- `src/shared/onboarding.ts` — 단계 모델·전이·완료 판정 전부.
- `OnboardingStepBody.tsx` — 콘텐츠(카피 후보 §5 제외).
- 권한 단계 로직 — 250ms 폴링·`getPermissionStatus`·`openPermissionSettings`·`confirmRestart`.

**신규/변경 (셸 범위)**
- 새 Welcome BrowserWindow(main) + 자동/수동 소환 배선 + 트레이 "Welcome 다시 보기" 항목.
- 새 셸 컴포넌트(히어로+챕터 내비+본문 패널) — 기존 `OnboardingView`의 카드 셸을 대체.
  단계 상태(`index`)·`goNext`/`goPrev`·권한 폴링 useEffect는 그대로 옮겨온다(로직 이동, 재작성 아님).
- Hoppy C-dark 토큰 CSS + 마스코트 자산 배치(자산은 별도, #55 로고 확정 후).
- `App.tsx`에서 온보딩 분기 제거(창 분리에 따른 정리 — 우리 변경이 만든 orphan).

---

## 7. Settled vs Open 요약

**SETTLED**: 독립 창으로 분리 · 첫 실행 자동 + 트레이 수동 재소환 · 완료 플래그는 자동 소환만 억제 ·
콘텐츠/로직 재사용 · 마스코트가 Welcome 히어로 주도 · shortcuts 카피가 새 ⌥⌘R 의미와 충돌하므로 갱신 필요.

**OPEN** → 아래 결정 1~4.
