# 현 UI 스타일 인벤토리 — C-dark 그린 vs DESIGN.md 갭 분석

> #99 (part of #97) 산출물. 기준 커밋: `fcfd97d` (Hoppy 브랜딩 리버트 이후 main).
> 결론 요약: **현 렌더러는 코드 전체가 Hoppy C-dark(`docs/design/hoppy-design-language.md`) 토큰 위에서 동작하고, 루트 `DESIGN.md`(Recap 모노크롬)와는 토큰 값·토큰 집합·형태 언어 세 층위에서 모두 어긋난다.** 레드 성역은 위반 없음. 복귀 시 대부분은 `:root` 값 교체로 기계적 치환이 가능하나, ① 그린 selection/active 신호의 화이트 전환, ② `--radius-pill` 형태 언어, ③ `--font-display`(SF Pro Rounded), ④ 마스코트 노출 4가지는 디자인 판단이 필요하다.

## 0. 조사 범위

- 규범: 루트 `DESIGN.md` (Recap 모노크롬, frontmatter 토큰 포함)
- 현황: `src/renderer/src/index.css`(단일 전역 스타일시트, 1989줄), `src/renderer/src/components/*.tsx` 4개, `src/renderer/src/views/*.tsx` 13개, `src/shared/recipe.ts`(배경 프리셋), `src/renderer/src/compose.ts`(영상 합성)
- 참고: `docs/design/hoppy-design-language.md` (C-dark 초안 — 현 코드가 이 초안을 그대로 구현한 상태)

스타일 소스는 사실상 `index.css` 하나다. TSX의 인라인 스타일은 전부 위치·크기·사용자 데이터(그라디언트 스와치) 등 동적 값이며, 색 크롬을 인라인으로 박은 곳은 마스코트 SVG(`fill="#4cc93f"`)뿐이다.

## 1. 현 토큰 목록과 사용처 맵

### 1-1. 색 토큰 (`index.css` `:root`, 1–29행)

| 토큰 | 현 값 (C-dark) | DESIGN.md 값 | 주요 사용처 (클래스) |
|---|---|---|---|
| `--bg` | `#0c140a` (초록빛) | `#0a0a0b` | `.app` `.welcome` `.library`, `.tl-film`/`.tl-trimmed`(color-mix), `.tl-trim-handle::before` |
| `--surface` | `#131d10` | `#141415` | `.recent-item` `.target-card` `.canvas-wrap` `.editor-sidebar` `.toolbar` `.rec-pill` `.welcome-rail` `.welcome-footer` `.library-card` `.control-text` |
| `--surface-2` | `#1a2716` | `#1a1a1c` | `.export-popover` `.settings-popover` `.side-section` `.recent-thumb` `.tl-lane` `.preset-item` `.onboarding-list li` `.permission-row` `.toolbar-modes` `.icon-btn` `.library-search` `.library-sort` 등 |
| `--surface-3` | `#22331d` | `#232326` | `.btn` `.btn-scale` `.progress-bar` `.welcome-chapter-num` `.welcome-dot` `.onboarding-kbd` `.library-card-menu` 및 각종 hover |
| `--border` | `rgba(180,230,160,0.10)` (초록 알파) | `rgba(255,255,255,0.08)` (흰 알파) | 거의 모든 카드·패널·입력 테두리 |
| `--border-strong` | `rgba(180,230,160,0.18)` | `rgba(255,255,255,0.14)` | `.export-popover` `kbd` `.toolbar` `.rec-pill` `.library-card-title-input` 등 |
| `--text-1` | `#f2f6ee` | `#f5f5f7` | 본문 전반 |
| `--text-2` | `#a7bd9c` (녹회색) | `#a1a1a6` | 보조 텍스트 전반 |
| `--text-3` | `#6f8465` (녹회색) | `#6e6e73` | 캡션·비활성 전반 |
| `--grass` | `#4cc93f` | **없음** (`--primary: #f5f5f7` 화이트) | §1-2 전수 목록 |
| `--grass-hover` | `#5cd94e` | 없음 (`--primary-hover: #e4e4e7`) | `.btn-export(-primary):hover` `.btn-scale.is-active:hover` |
| `--grass-ink` | `#0a1f0c` | 없음 (`--primary-ink: #0a0a0b`) | 그린 버튼 위 글자, `.area-handle` 테두리 |
| `--rec` | `#ff4b4b` | `#ff453a` | §3 참조 |
| `--rec-hover` | `#ff6161` | `#ff5a4f` | `.btn-record:hover` `.btn-stop:hover` |
| `--zoom` | `#44513d` (회록) | `#55555a` (뉴트럴 회색) | `.tl-seg` |
| `--zoom-hover` | `#54634b` | `#6a6a70` | `.tl-seg:hover` |
| `--warn` | `#ffc233` | `#ff9f0a` | `.export-warn` `.tl-trim-handle` `.error h2` |

### 1-2. 그린(`--grass`) 전수 사용처 — 18개 지점

`index.css` 내 `var(--grass*)` 참조 (행 번호는 현 파일 기준):

| 용도 분류 | 클래스 (행) |
|---|---|
| Primary 버튼 배경 | `.btn-export` (166), `.btn-export-primary` (179), `.btn-scale.is-active` (681), `.mode-seg.is-active` (1300) |
| 선택/활성 외곽선 | `.target-card.is-selected` outline (415), `.bg-swatch.is-active` border+shadow (641–642), `.tl-seg.is-selected` outline (930) |
| 진행/완료 신호 | `.progress-fill` (770), `.permission-status.is-granted` (1225) |
| 온보딩 내비 | `.welcome-chapter.is-done .welcome-chapter-num` 글자색 (1503), `.welcome-chapter.is-active .welcome-chapter-num` 배경 (1514), `.welcome-dot.is-active` (1556) |
| 캡처 오버레이 | `.window-picker-highlight` border+glow (1574, 1576–1577의 `rgba(76,201,63,…)` 하드코딩 포함), `.area-rect` border (1609), `.area-handle` (1649–1650) |

CSS 밖 하드코딩 `#4cc93f`:
- `src/renderer/src/components/HoppyMascot.tsx` 11·19·20행 — 마스코트 SVG fill
- `src/renderer/src/components/ExportPanel.tsx` 88·90·91행 — 익스포트 완료 마스코트 SVG fill (HoppyMascot 사본)

### 1-3. Radius·폰트·기타 토큰

| 토큰 | 현 값 | DESIGN.md | 비고 |
|---|---|---|---|
| `--radius-s/m/l` | 8 / 12 / 16px | 6 / 10 / 12px | 값만 다름, 사용처 구조 동일 |
| `--radius-pill` | 999px | **없음** | `.btn-export(-primary)` `.toolbar` `.toolbar-modes` `.mode-seg` `.icon-btn` `.rec-pill` `.progress-bar` `.welcome-chapter-num` `.welcome-dot` `.window-picker-label` `.display-overlay-res` `.library-card-menu-btn` `.library-card-duration` `.tl-seg-edge::before` `.tl-trim-handle::before` 등 15+ 지점 |
| `--font-ui` | 동일 | 동일 | — |
| `--font-mono` | 동일 | 동일 | — |
| `--font-display` | `'SF Pro Rounded', …` | **없음** | `.title` (81), `.error h2` (1079), `.welcome-hero h1` (1441), `.library-title` (1761), `.library-empty h2` (1972) — 5지점 |
| `--text-xs…xl` | 12–40px 6단계 | (규범에 스케일 없음) | 갭 아님 — DESIGN.md가 침묵하는 영역 |
| `--space-1…6` | 4–32px | 동일 | 갭 없음 |

### 1-4. 마스코트(Hoppy) 노출 지점 — DESIGN.md에는 개념 자체가 없음

- `src/renderer/src/components/HoppyMascot.tsx` (전용 컴포넌트)
- `.welcome-mascot` (WelcomeView 히어로, 104px), `.library-mascot` (라이브러리 빈 상태, 104px), `.export-mascot` (익스포트 완료, 22px — ExportPanel 내장 SVG)

## 2. DESIGN.md 규범 대비 갭 표

| # | 갭 항목 | 현 상태 | 규범 (Recap) | 복귀 난도 |
|---|---|---|---|---|
| G1 | 뉴트럴 팔레트가 초록 편향 (`bg`~`text-3`, `border*`) | C-dark 9개 값 | 모노크롬 9개 값 | **기계적** — `:root` 값 교체만으로 전 사용처 복귀 |
| G2 | Primary 색이 그린 (`--grass*` 3종) | 그린 배경+딥그린 잉크 | 화이트 배경+검정 잉크 (`--primary*`) | **혼합** — 토큰 rename+값 교체는 기계적이나, 사용처별 판단 필요 (§4) |
| G3 | 선택/활성 신호가 그린 (외곽선·글로우 7지점) | `--grass` outline/glow | "활성 선택 상태는 화이트 primary" | **판단 필요** — 화이트 outline은 `--border-strong`·플레이헤드와 시각 충돌 가능 |
| G4 | `--rec` `--zoom` `--warn` 값 차이 | `#ff4b4b` `#44513d` `#ffc233` | `#ff453a` `#55555a` `#ff9f0a` | **기계적** |
| G5 | radius 상향 (8/12/16) | C-dark 값 | 6/10/12 | **기계적** (값 교체) |
| G6 | `--radius-pill` 및 pill 형태 언어 | 툴바·rec-pill·모드 세그먼트·primary 버튼 등 15+ 지점 | 규범에 없음 (최대 12px) | **판단 필요** — pill은 #70·#74 플로팅 창 형태와 결합돼 있어 각지게 바꾸면 레이아웃 인상 자체가 바뀜 |
| G7 | `--font-display` (SF Pro Rounded) 5지점 | 헤딩·브랜드 카피 라운드 폰트 | `--font-ui`만 | **준기계적** — 토큰 제거+치환은 단순하나 브랜드 톤 결정에 종속 |
| G8 | 마스코트 노출 3표면 + 전용 컴포넌트 | Welcome·라이브러리 빈 상태·익스포트 완료 | 마스코트 개념 없음 | **판단 필요** — 제거는 곧 브랜드 결정(#97 상위 판단) |
| G9 | 마스코트 SVG fill `#4cc93f` 하드코딩 (2파일 6곳) | 하드코딩 | "하드코딩 색 금지 — 토큰 참조" | 양쪽 규범 공통 위반. G8 결정과 무관하게 정리 대상 |
| G10 | 딤/글로우 하드코딩이 초록 기반 — `rgba(12,20,10,…)` 5곳 (1569, 1613, 1703, 1711, 1829, 1915행), `rgba(76,201,63,…)` 2곳 (1576–1577행) | 초록빛 스크림·그린 글로우 | 뉴트럴 스크림 | **기계적** (값 교체) — 단, 하드코딩 자체가 규범 위반이므로 토큰화 권장 |
| G11 | `compose.ts` 클릭 리플 `rgba(56,189,248,…)` (136행) — 스카이 블루 | 영상 합성 레이어 | "파랑 액센트 부활 금지" | **판단 필요** — 영상 콘텐츠 렌더링이지 UI 크롬이 아님. 규범의 파랑 금지가 콘텐츠까지 미치는지 결정 필요 |

**갭 아님(확인 완료)**: 배경 그라디언트 프리셋(`src/shared/recipe.ts` `GRADIENT_PRESETS`)과 사이드바 스와치 인라인 그라디언트는 **영상 콘텐츠 데이터**로, 코드 주석에도 UI 크롬 규칙과 무관함이 명시돼 있다. 슬레이트·그래파이트·인디고·틸·플럼 모두 차분한 톤으로 규범 정신과도 충돌 없음. Timeline·AreaOverlay 등의 인라인 `style`은 전부 위치/크기 계산값.

## 3. 레드 성역 점검 — 위반 없음

`var(--rec)` 전수 사용처:

| 사용처 | 분류 | 판정 |
|---|---|---|
| `.btn-record` `.btn-stop` (148, 241) | 녹화 시작/정지 | 성역 내 |
| `.rec-dot` (241) `.rec-time` (260) | 녹화 중 상태 | 성역 내 |
| `.btn-danger` (213–214, 외곽선만) | 파괴적 액션 | 성역 내 — "면적은 작게" 준수(외곽선) |
| `.countdown-num` (1376) | 녹화 카운트다운 숫자 | 성역 내로 판단 (녹화 시작 상태의 일부) — 복귀 문서화 시 명시 권장 |
| `.library-card-menu-item.is-destructive` (1881) | 삭제 메뉴 항목 | 성역 내 (글자색만) |

부수 발견: DESIGN.md가 예시로 든 `.tl-seg-del` 클래스는 현 코드에 존재하지 않는다(삭제는 `.btn-danger`·`.is-destructive`로 구현). 복귀 시 DESIGN.md 예시 문구를 실제 클래스명으로 갱신할 것. 과거 파랑 `#0a84ff`는 렌더러 어디에도 없음(G11의 콘텐츠 레이어 블루만 존재).

## 4. 복귀 전략 — 기계적 치환 vs 판단 필요

### 4-1. 기계적 치환 가능 (`:root` 값 교체 + 단순 rename)

1. **뉴트럴 9종 + rec/zoom/warn 6종** — `index.css` 1–29행 값만 DESIGN.md frontmatter 값으로 교체. 사용처는 전부 `var()` 참조라 자동 복귀. (G1, G4)
2. **radius s/m/l** — 6/10/12로 값 교체. (G5)
3. **딤/글로우 하드코딩** — `rgba(12,20,10,…)` → 뉴트럴 기반으로 값 교체 7곳. 이참에 `--scrim` 류 토큰 신설 권장. (G10)
4. **`--grass*` → `--primary*` rename + 값 교체** — 버튼 배경 용도 4지점(`.btn-export(-primary)`, `.btn-scale.is-active`, `.mode-seg.is-active`)은 화이트 primary로 그대로 치환해도 위계가 성립. (G2 일부)

### 4-2. 판단 필요 (그린 전제의 설계가 얽힌 곳)

1. **선택/활성 외곽선 7지점 (G3)** — 그린 outline은 "뉴트럴 바다 위 유일한 유채색"이라 1px로도 선명했다. 화이트로 바꾸면 `--border-strong`(흰 알파)·`.tl-playhead`(흰 세로선)와 층위가 뭉개진다. 특히 `.tl-seg.is-selected`(줌 블록 위 2px outline)와 `.window-picker-highlight`/`.area-rect`(캡처 오버레이의 딤 위 경계)는 대비 재설계 필요. 두께 상향·이중 테두리·`--border-strong` 강화 등 대안 검토.
2. **`.progress-fill`·`.permission-status.is-granted` (G3)** — "진행·완료"의 go 의미를 화이트가 대신할 수 있는지. 화이트 진행 바는 성립하나(모노크롬 도구 관습), granted 상태는 텍스트 위계만으로 구분이 약해질 수 있음.
3. **pill 형태 (G6)** — `--radius-pill`을 폐기하면 캡처 툴바(#70)·REC 알약(#74)의 "떠 있는 알약" 컨셉 자체가 바뀐다. DESIGN.md는 pill을 금지한 적이 없고 단지 정의하지 않았을 뿐이므로, **pill 토큰을 Recap 규범에 편입**하는 쪽이 회귀 비용이 낮다 — 규범 문서 갱신 판단 필요.
4. **`--font-display` (G7) / 마스코트 (G8)** — 순수 스타일 문제가 아니라 브랜드(Recap vs Hoppy) 결정에 종속. #96에서 브랜딩이 리버트된 상태이므로, 이 둘의 거취는 #97 오케스트레이션 레벨에서 정해야 한다. 기술적 제거 자체는 소규모(5지점 + 컴포넌트 1개 + SVG 내장 1곳).
5. **클릭 리플 블루 (G11)** — 영상 콘텐츠는 규범 적용 외 영역이라는 해석이 자연스러우나, "Recap다운 영상"의 톤 관점에서 재검토 여지.

### 4-3. 복귀와 무관하게 정리할 것

- 마스코트 SVG fill 하드코딩 6곳(G9) → `currentColor` 또는 토큰 참조로.
- DESIGN.md의 `.tl-seg-del` 예시를 실제 클래스명(`.btn-danger` 등)으로 갱신.
- `docs/design/hoppy-design-language.md`는 status: draft — 복귀 확정 시 상태 표기(superseded 등) 갱신.
