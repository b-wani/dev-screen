# #57 캡처 툴바·선택 오버레이 UX — 초안 (GROUNDWORK, 미확정)

> HITL 그라운드워크. 아래 "정착됨"은 상위 결정(#52/#54/#53)에서 이미 강제되는 사항이고,
> "열린 결정"은 사람이 골라야 하는 진짜 갈림길이다. 최종 확정·코멘트·클로즈는 하지 않는다.

전제 (결정된 것들, 그대로 적용):
- **#54**: 메뉴바 전용·Dock 숨김(accessory). 캡처 툴바 = 플로팅 창, ESC/녹화 시작 시 닫힘.
  선택 오버레이 = 툴바의 자식 창. ⌥⌘R 토글(idle→툴바 소환, recording→정지).
  전역 상태머신 `idle / arming / recording / error`.
- **#53**: 창 없는 캡처는 Electron으로 성립. 사이드카는 메타데이터 확장만 — **프로토콜 v4**에
  창 프레임(전역 좌표)과 crop rect(`sourceRect`) 추가. 단계 도입: (a)툴바+딤 → (b)Area → (c)Window.
- Hoppy 디자인 언어(#56 초안): 초록빛 다크 캔버스, grass=전진(primary·go), rec=녹화/파괴 성역,
  마스코트는 **기능 크롬에 넣지 않음**(툴바·오버레이는 조용히). 토큰만 사용.

---

## 1. 캡처 툴바 (arming 상태의 얼굴)

플로팅 pill 바. 메뉴바 좌클릭 또는 ⌥⌘R로 소환. 화면 하단 중앙 기본 배치(드래그 이동 가능,
위치 기억). `setAlwaysOnTop('screen-saver')` + `setContentProtection(true)`(녹화에 안 찍힘).

레이아웃 (좌→우, 한 줄):

```
[ ◱ Display | ▤ Window | ⬚ Area ]   ·   [ 대상 요약 / 배지 ]   ·   [ ⚙ ] [ ✕ ]
   └─ 3모드 세그먼트(pill, 활성=grass) ┘        컨텍스트 영역          설정  취소
```

- **모드 세그먼트**: pill 세그먼트 컨트롤. 활성 모드 = `--grass` 배경 + `--grass-ink` 글자,
  비활성 = `--text-2`. 모드 전환 시 오버레이(자식 창)가 즉시 그 모드로 다시 그려진다.
- **취소(✕)**: 툴바+오버레이 소멸, 상태 `idle`. ESC와 동일. (성역 아님 — 뉴트럴 아이콘.)
- **설정(⚙)**: 캡처 파라미터 진입 (→ **열린 결정 4**: 인라인 팝오버 vs 풀 설정창).
- **Start recording**: 각 모드의 확정 액션. 위치는 모드별로 다르다(아래). rec가 아니라
  **grass**로 둘지 rec로 둘지 = 미묘 — 초안은 "녹화라는 행위"이므로 **rec 성역 적용**(빨강 pill).
  이유: 디자인 언어가 `.btn-record`를 rec 성역으로 명시. 세그먼트 grass(선택)와 색으로 역할 분리.

정착됨: 3모드 세그먼트 + 취소 + 설정 진입, 툴바는 arming 동안만 존재.
열린: 설정의 형태(#4), Start 버튼 색(위 초안 = rec).

---

## 2. Display 선택 흐름

1. Display 모드 진입 → 전체 화면에 반투명 딤(`--bg` @ ~55% alpha) 오버레이.
2. 커서가 올라간 디스플레이가 "선택 후보" — 딤이 살짝 걷히고(hover) 그 화면 중앙에
   **해상도·FPS 배지** + **Start recording** 버튼을 띄운다.
   - 배지: `1920×1080 · 60fps` — SF Mono + tabular-nums, `--surface-2` pill.
     (해상도 = 논리 포인트, 캡처는 Retina 2x. FPS 노출/선택 여부 = **열린 결정 4**.)
3. 멀티 디스플레이: 각 화면마다 배지+버튼. 클릭/Start한 화면이 대상.
4. Start recording → 카운트다운(옵션, **열린 결정 4**) → 툴바·오버레이 소멸, `recording`.

좌표계: 기존 `display` 대상과 동일. `ResolvedTarget.origin = display.frame.origin`,
`width/height = display 논리 크기`. 이벤트 x/y는 화면 좌상단 원점 포인트. **v4 변화 없음.**

정착됨: 딤+배지+Start 구성. 열린: FPS/해상도 선택, 카운트다운.

---

## 3. Window 선택 흐름 (v4 (c) 단계 — 창 프레임 필요)

1. Window 모드 진입 → 전역 반투명 딤 + `setIgnoreMouseEvents(true, {forward:true})`로
   클릭스루 상태. 커서 아래 창을 히트테스트한다.
2. 사이드카가 v4로 넘긴 `SCWindow.frame`(전역 좌표) 목록으로, 커서 아래 창의 프레임에
   **하이라이트 테두리**(`--grass` 2px + 안쪽 그림자 대신 flat glow) + 창 제목 라벨 pill을 그린다.
   - **flipped 좌표계 주의**(#53): AppKit 전역 좌표(좌하단 원점)를 오버레이 DOM(좌상단 원점)으로
     변환할 때 `y' = screenHeight - (frame.y + frame.height)`. 이 환산은 오버레이 렌더 레이어에서만.
3. 클릭 = 확정 → 그 창이 대상. 툴바·오버레이 소멸, `recording`.
4. 후보 없음(빈 데스크톱 클릭)은 무시. ESC로 취소.

좌표계: 기존 `window` 대상과 동일. `origin = window.frame.origin`, 이벤트는 창 좌상단 원점.
v4는 **선택 UI를 위한 프레임 노출만** 추가 — 이벤트 좌표 계약은 그대로.

정착됨: 호버 하이라이트 + 클릭 확정. 열린: (없음, 큰 갈림은 아님).

---

## 4. Area 선택 흐름 (v4 (b) 단계 — crop `sourceRect` 필요)

1. Area 모드 진입 → 전역 반투명 딤. 드래그 대기.
2. **드래그**: 마우스 다운→무브→업으로 사각형을 그린다. 드래그 중 내부는 딤이 걷히고
   테두리는 `--grass`, 크기 배지(`820×540`, SF Mono)가 사각형 근처에 붙는다.
3. **핸들 조절**: 확정 전 8핸들(모서리4+변4)로 리사이즈, 내부 드래그로 이동. 최소 크기 가드.
4. **확정**: 사각형 안 **Start recording**(rec pill) 또는 Enter. 툴바·오버레이 소멸, `recording`.
   ESC/✕ 취소.

### 이벤트 트랙 좌표계 처리 (이 티켓의 핵심)

오버레이는 **디스플레이당 자식 창**으로 뜬다(#53 Kap 방식). 사용자가 그린 사각형은
그 오버레이 창 로컬(DIP, 좌상단) 좌표다. 매핑 파이프라인:

```
overlay-local rect (DIP, top-left)
  └─ + display.bounds.origin        → 전역 rect (DIP)  [main]
       └─ AppKit flip 환산(#53)      → sourceRect (사이드카가 기대하는 좌표계)
            └─ record --sourceRect … → 사이드카 v4
```

사이드카는 crop을 **기존 대상 모델에 그대로 접어 넣는다**:
`ResolvedTarget.origin = crop rect 전역 원점`, `width/height = crop 크기(포인트)`,
`widthPx/heightPx = 크기 × scaleFactor`. 그러면 이벤트 처리 경로가 **display/window와 완전히 동일** —
전역 마우스 좌표에서 `origin`을 빼 crop 좌상단 원점 포인트로 내보낸다.

핵심 결론: **이벤트 트랙 좌표 계약(좌상단 원점, 포인트, `[0,w]×[0,h]`)은 Area에서도 불변.**
crop rect가 곧 `CaptureTarget`(kind는 여전히 display 또는 신규 여부 = 아래 참조).
자동 줌·커서 스무딩·미리보기는 좌표 공간 크기만 crop 크기로 바뀔 뿐 로직 변경 없음.

미해결(코드가 정해야): Area 대상의 `CaptureTargetKind`. 현재 유니언은 `display|window`뿐.
Area를 (a) 새 kind `area`로 넣을지, (b) `display` + `sourceRect` 필드로 표현할지 →
**초안 권고: (b)** — kind 유니언 확장 없이 `CaptureTarget`에 선택적 `sourceRect?` 추가, 부모는
display id. 다운스트림(자동 효과)이 kind 분기를 안 늘려도 됨. (구현 티켓에서 확정.)

정착됨: 드래그+핸들+Start, crop→기존 대상 접기. 열린: 화면 경계 처리(#2), out-of-bounds 이벤트(#3).

---

## 5. 녹화 중 상태 표시 + 정지 동선

#54가 **녹화 시작 시 툴바를 닫는다**고 못박았으므로, `recording` 상태의 표시·정지는
툴바가 아닌 별도 표면이어야 한다. 후보 = 메뉴바 아이콘(이미 recording 아이콘 있음) /
작은 플로팅 REC pill / 둘 다 → **열린 결정 1**.

공통(정착됨):
- ⌥⌘R = 정지(전역 토글).
- 메뉴바 아이콘이 recording 아이콘으로 바뀜(현 idle/recording 두 아이콘 계승).
- 정지 시: 사이드카 `stop` → `stopped` → main이 에디터 창을 열고 전역 상태 `idle` 복귀(#54 결정4).
- REC 표시는 rec 성역: `--rec` 점 + `--rec` 타임코드(SF Mono, tabular-nums). 마스코트 없음.

정지 버튼(정착됨): `--rec` 배경 흰 글자(`.btn-stop`), "■ 정지" — 현 `RecordingView` 계승.

---

## 정착됨 vs 열림 요약

정착됨: 3모드 세그먼트/취소/설정 진입 존재 · Display 딤+배지+Start · Window 호버+클릭 ·
Area 드래그+핸들+Start · crop을 기존 CaptureTarget으로 접기(좌표 계약 불변) · rec 성역 표시/정지 ·
⌥⌘R 정지 · stopped→에디터+idle.

열림(사람 결정): 아래 4개.
