# 포커스된 입력 요소의 화면 사각형을 AXUIElement로 얻을 수 있는가 (#132)

**1차 소스**: Apple Developer — AXUIElement.h / ApplicationServices(HIServices) 레퍼런스(`AXUIElementCreateSystemWide`, `AXUIElementCopyAttributeValue`, `AXUIElementCopyParameterizedAttributeValue`, `AXUIElementSetMessagingTimeout`, `AXIsProcessTrusted(WithOptions)`, `kAX*` 상수), Chromium Accessibility Overview(`docs/accessibility/overview.md`), WebKit/Electron 접근성 문서 및 이슈, macdevelopers.wordpress.com의 selected-text-bounds 예제. (URL은 각 절 인라인 인용.)

## 요약 (결론 먼저)

- **네이티브 앱(AppKit/Cocoa 텍스트 필드): 가능 (조건부).** 시스템 와이드 AX 객체 →`kAXFocusedUIElementAttribute`로 포커스 요소를 얻고, 그 요소의 `kAXPositionAttribute`+`kAXSizeAttribute`(또는 캐럿 단위로는 `kAXSelectedTextRangeAttribute`+`kAXBoundsForRangeParameterizedAttribute`)로 화면 사각형을 얻을 수 있다. **손쉬운 사용(Accessibility) TCC 권한이 필수**다.
- **웹 입력(`<input>` in Chrome/Safari/Electron): 신뢰 불가 (사실상 실패 경로).** 브라우저는 성능 때문에 웹 접근성 트리를 **지연 생성**하며, 스크린리더 같은 실제 AT가 붙기 전에는 웹 콘텐츠 노드가 노출되지 않거나 부분적이다. recap의 주 사용자가 웹 프론트엔드 개발자라는 점에서 이 경로는 기대할 수 없다.
- **권한 상황이 핵심 반전**: recap은 사이드카(`recap-capture`)에서 `NSEvent.addGlobalMonitorForEvents([.keyDown])`로 전역 키를 관찰하는데, **이 API 자체가 이미 손쉬운 사용 권한을 요구**한다. 즉 키 트래킹이 동작 중인 사용자라면 AX rect에 필요한 권한은 **이미 보유** — 추가 프롬프트가 없다. 다만 키 트래킹은 recap에서 선택적/조용한 실패라서 "권한이 항상 있다"고 가정할 수는 없다.
- **권장**: MVP는 **마우스(커서) 위치 폴백을 기본**으로 삼고, AX rect는 "네이티브 앱 + 권한 이미 보유"일 때만 켜지는 **점진적 향상(progressive enhancement)** 으로 추가한다. 웹 입력을 겨냥한 AX rect는 지금 구현하지 말 것. 두 번째 권한 프롬프트를 새로 유발하면서까지 AX rect를 강제할 가치는 낮다(키 트래킹 권한에 편승하는 경우에만 사실상 공짜).

| 질문 | 판정 | 근거 |
|---|---|---|
| 네이티브 텍스트 필드 rect | 가능 | `kAXFocusedUIElement`+position/size or bounds-for-range |
| 웹 `<input>` rect | 신뢰 불가 | 브라우저 a11y 트리 지연 생성, AT 미부착 시 미노출 |
| 별도 권한 필요? | 그렇다 (손쉬운 사용) | ScreenRecording과 **다른** TCC 프롬프트 |
| 권한이 이미 있나? | 키 트래킹 켜져 있으면 예 | `addGlobalMonitorForEvents`가 손쉬운 사용 요구 |
| 마우스 폴백 대비 우위 | 제한적 | 네이티브 앱에서만, 그것도 캐럿까지 볼 때 |

---

## 1. How — 포커스 요소와 그 frame을 얻는 방법 + 권한

### 1-1. API 호출 순서 (네이티브 앱)

`AXUIElementCreateSystemWide()`로 시스템 와이드 접근성 객체를 얻고, 거기에 `kAXFocusedUIElementAttribute`를 질의하면 "현재 어떤 앱이 활성이든" 포커스된 UI 요소를 얻는다. 이 흐름은 Apple의 AXUIElement.h 레퍼런스에 명시돼 있다 — 시스템 와이드 객체는 "finding the focused accessibility object regardless of which application is currently active"에 유용하다고 기술한다(leopard-adc 미러: <https://leopard-adc.pepas.com/documentation/Accessibility/Reference/AccessibilityLowlevel/AXUIElement_h/CompositePage.html>, 현행 Apple 문서: <https://developer.apple.com/documentation/applicationservices/axuielement>).

```objc
AXUIElementRef sys = AXUIElementCreateSystemWide();
AXUIElementRef focused = NULL;
AXUIElementCopyAttributeValue(sys, kAXFocusedUIElementAttribute,
                              (CFTypeRef *)&focused);
```

요소 전체의 사각형(예: 텍스트 필드 박스):

```objc
AXValueRef posVal = NULL, sizeVal = NULL;
CGPoint pos; CGSize size;
AXUIElementCopyAttributeValue(focused, kAXPositionAttribute, (CFTypeRef*)&posVal);
AXUIElementCopyAttributeValue(focused, kAXSizeAttribute,     (CFTypeRef*)&sizeVal);
AXValueGetValue(posVal,  kAXValueCGPointType, &pos);
AXValueGetValue(sizeVal, kAXValueCGSizeType,  &size);
// rect = {pos, size}  (top-left 스크린 좌표)
```

`kAXPositionAttribute`는 CGPoint(`kAXValueCGPointType`), `kAXSizeAttribute`는 CGSize(`kAXValueCGSizeType`)를 AXValue로 감싸 반환한다(Apple: <https://developer.apple.com/documentation/applicationservices/kaxpositionattribute>, <https://developer.apple.com/documentation/applicationservices/kaxsizeattribute>).

### 1-2. 캐럿/선택 범위 단위의 정밀 rect

텍스트 필드 "박스"가 아니라 **커서가 있는 지점**을 얻으려면 파라미터라이즈드 속성을 쓴다:

1. `kAXSelectedTextRangeAttribute` → `AXValue`(`kAXValueCFRangeType`)로 현재 선택/캐럿의 CFRange를 얻고,
2. 그 range를 파라미터로 `kAXBoundsForRangeParameterizedAttribute`를 `AXUIElementCopyParameterizedAttributeValue`로 질의 → `AXValue`(`kAXValueCGRectType`)로 해당 글자 범위의 화면 사각형을 얻는다.

이 정확한 레시피는 macdevelopers 예제에 코드로 나온다(<https://macdevelopers.wordpress.com/2014/02/05/how-to-get-selected-text-and-its-coordinates-from-any-system-wide-application-using-accessibility-api/>). `kAXInsertionPointLineNumberAttribute`는 캐럿이 몇 번째 줄인지 얻을 때 보조로 쓸 수 있다. "타이핑 줌"은 캐럿 위치가 이상적이므로 bounds-for-range 경로가 요소 전체 rect보다 낫지만, 지원 여부는 대상 위젯 구현에 따라 다르다(표준 NSTextField/NSTextView는 지원, 커스텀 위젯은 미지원 가능).

### 1-3. 권한 — 손쉬운 사용(Accessibility) TCC, ScreenRecording과 별개

- AX 클라이언트로 다른 앱의 UI를 읽으려면 **손쉬운 사용(System Settings → 개인정보 보호 및 보안 → 손쉬운 사용)** TCC 권한이 필요하다. 현재 프로세스가 신뢰됐는지는 `AXIsProcessTrusted()`로 확인하고, 프롬프트를 띄우려면 `AXIsProcessTrustedWithOptions`에 `kAXTrustedCheckOptionPrompt: true`를 넘긴다(Apple AXUIElement.h 레퍼런스).
- 이것은 recap이 이미 쓰는 **화면 기록(Screen Recording, ScreenCaptureKit)** 권한과 **완전히 다른 별개의 TCC 항목·별개의 프롬프트**다. 사용자 입장에서 "허용" 버튼을 한 번 더 눌러야 하는 UX 비용이 있다. 추가로 손쉬운 사용 권한은 부여 후 앱을 재실행해야 반영되는 경우가 흔하다(pqrs-org osx-event-observer-examples, jano.dev: <https://jano.dev/apple/macos/swift/2025/01/08/Accessibility-Permission.html>).

### 1-4. 좌표계 변환 주의

AX API는 **top-left 원점(위→아래로 y 증가)** 의 스크린 좌표를 반환한다(예: `AXUIElementCopyElementAtPosition`은 "top-left relative screen coordinates"로 기술 — <https://developer.apple.com/documentation/applicationservices/1462077-axuielementcopyelementatposition>). 반면 AppKit/Cocoa는 기본이 **bottom-left 원점**이다(Apple Coordinate Systems: <https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/CocoaDrawingGuide/Transforms/Transforms.html>). ScreenCaptureKit/CoreGraphics 캡처 좌표(top-left)와 맞추려면 AX rect는 대체로 그대로 쓸 수 있으나, NSScreen 기반 계산과 섞으면 `y' = screenHeight - y - height` 뒤집기가 필요하다. 멀티 디스플레이에서는 전역 좌표 원점을 기준으로 뒤집어야 한다.

---

## 2. 브라우저 / 웹 입력 (CRITICAL)

**판정: 웹 `<input>`의 rect를 안정적으로 얻는 것은 현실적으로 어렵다.**

### 2-1. Chrome/Chromium — 지연 활성화가 근본 장벽

Chromium 접근성은 "off by default and enabled automatically on-demand"이며 성능 때문에 **AT(보조기술)가 붙는 것을 감지하기 전까지 웹 콘텐츠 트리를 만들지 않는다**(Chromium Accessibility Overview: <https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md>). macOS에서 Chromium은 **VoiceOver 같은 클라이언트가 메인 윈도우에 `AXEnhancedUserInterface`를 set 하는 것을 보고** 접근성을 켠다(chromium.org design docs: <https://www.chromium.org/developers/design-documents/accessibility/>; codereview: <https://codereview.chromium.org/6909013>).

즉 recap 사이드카가 단순히 AX 클라이언트로 붙어 `kAXFocusedUIElement`를 웹 콘텐츠 깊숙이 질의한다고 해서 웹 노드가 채워진다는 보장이 없다. 명시적으로 켜는 수단은:

- 실행 플래그 `--force-renderer-accessibility[=basic|form-controls|complete]` — 사용자가 브라우저를 이렇게 띄워야 하므로 일반 사용자에겐 비현실적(Chromium overview, groups.google chromium-accessibility 논의).
- 윈도우에 `AXEnhancedUserInterface=1`을 set — VoiceOver가 하는 방식이지만, 이 부작용으로 창 위치/윈도우 매니저가 깨지는 알려진 문제가 있다(Mozilla bug 1664992, Electron이 부작용 없는 `AXManualAccessibility`를 별도 도입한 배경 — Electron PR #10305). **Chrome 자체는 `AXManualAccessibility`를 지원하지 않는다**(Electron 이슈 #37465). 남의 앱(Chrome) 창 속성을 recap이 강제로 켜는 것은 침습적이고 신뢰성이 낮다.

결과적으로 웹 입력 rect는 "사용자가 스크린리더를 켜두었거나 브라우저를 특수 플래그로 실행"한 예외 상황에서만 동작하는, 프로덕션에서 기댈 수 없는 경로다.

### 2-2. Electron 대상

Electron 앱은 Chromium 기반이며 동일한 지연 활성화 문제를 갖는다. 다만 Electron은 `AXManualAccessibility` 속성을 지원해 외부/자체 코드가 부작용 없이 접근성을 켤 수 있다(Electron 접근성 문서, PR #10305). recap이 대상 Electron 앱에 이 속성을 set 할 수 있으나 대상별로 다르고 침습적이라 일반 해법은 아니다.

### 2-3. Safari / WebKit

WebKit은 웹 AX 노드를 접근성 트리로 노출하며, Safari 18.x에서 `<input type=date/time>` 등의 VoiceOver 지원·텍스트 필드 읽기·커서 위치 버그가 다수 수정됐다(WebKit blog Safari 17/18: <https://webkit.org/blog/15865/webkit-features-in-safari-18-0/>). 즉 원리적으로는 WebKit이 Chromium보다 노출이 나을 수 있으나, 여기서도 트리 구축/캐럿 rect의 안정성은 페이지·위젯·AT 부착 상태에 좌우된다. recap 사용자가 주로 쓰는 Chrome/Electron 개발 환경에서는 위 2-1 결론이 지배적이다.

### 2-4. 웹 프론트엔드 개발자에게의 현실적 신뢰도

**낮음.** recap의 주 타깃이 웹 프론트엔드 개발자이고, 이들이 데모/녹화하는 화면 대부분이 브라우저·Electron·VS Code(=Electron) 안의 웹 입력이라는 점이 결정적이다. 정작 가장 자주 만나는 입력에서 AX rect가 안 나온다. 이 사실 하나만으로 AX rect를 "타이핑 줌"의 주 신호로 쓰는 설계는 무너진다.

---

## 3. 폴백 비교 — 마지막 마우스(커서) 위치

| 상황 | AX rect | 마우스 위치 폴백 |
|---|---|---|
| 네이티브 앱 텍스트 필드 | 정확(캐럿까지) | 부정확할 수 있음(클릭 후 손을 뗌) |
| 웹 입력(Chrome/Electron) | 대체로 실패 | 클릭 지점이면 근사치로 유효 |
| 손쉬운 사용 권한 없음 | 불가 | 여전히 동작 |
| 코드 편집기(VS Code=Electron) | 실패 | 캐럿≈마지막 클릭, 근사 |

- **AX가 이기는 경우**: 사용자가 네이티브 macOS 앱(예: Notes, Mail, 네이티브 IDE 필드)의 텍스트 필드에 타이핑하고, 클릭 위치와 실제 캐럿이 어긋날 때(자동 포커스, 탭 이동 등). 캐럿을 정확히 중심에 두는 정밀도가 필요할 때.
- **폴백이 충분한 경우**: 사용자가 입력을 시작하기 직전 그 입력을 **클릭**하는 흐름이 압도적이다. 마지막 클릭/마우스 좌표는 포커스된 입력 근처에 있을 확률이 높아, 화면을 "그 부근"으로 줌하는 목적에는 대개 충분하다. 웹 입력에서는 폴백이 사실상 유일한 신호다.
- recap은 이미 마우스 좌표를 캡처하는 파이프라인이 있으므로(녹화가 원본 영상·마우스를 다룸) **폴백 구현 비용은 0에 가깝다**. KeyTracker는 현재 좌표를 전혀 캡처하지 않지만(ADR 0001), 줌 중심은 키가 아니라 커서에서 오면 된다.

---

## 4. 성능 · 안정성 · 프라이버시 리스크

- **동기 IPC — 블로킹/행 위험**: AX 질의는 대상 앱 프로세스로의 동기 메시징이다. 대상 앱이 응답 없음/입력 대기 상태면 함수들이 `kAXErrorCannotComplete`를 반환하며, 실제로 오래 블로킹된 사례가 보고된다(Apple AXUIElement.h; alt-tab-macos 등은 타임아웃/큐 워크어라운드 사용). 완화책: `AXUIElementSetMessagingTimeout(element, seconds)` — 시스템 와이드 객체에 걸면 프로세스 전역, 개별 요소에 걸면 그 객체에만 적용되고, `0`은 기본값으로 리셋된다(Apple: <https://developer.apple.com/documentation/applicationservices/1459345-axuielementsetmessagingtimeout>). 타이핑마다 질의하면 UI/캡처 스레드를 막을 수 있으므로 **별도 백그라운드 큐 + 짧은 타임아웃(예: 100–200ms) + 디바운스**가 필수다.
- **스레딩**: Apple 문서에 명시적 메인스레드 요구는 없으나 메시징이 동기이므로 캡처/렌더 경로와 분리해야 한다. 키 이벤트마다가 아니라 포커스 변경 시(또는 디바운스된 간격)에만 질의하도록 설계.
- **샌드박스 / 하드닝드 런타임 / 노터라이즈**: **App Sandbox는 AX API 사용을 막는다** — 샌드박스 앱에서는 손쉬운 사용 프롬프트가 뜨지 않고 `AXIsProcessTrusted()`가 항상 false가 되는 문제가 보고된다(Apple Developer Forums, jano.dev). recap은 ScreenCaptureKit·전역 모니터를 쓰는 특성상 이미 MAS 밖·비샌드박스 배포일 가능성이 크며, 이 경우 AX 클라이언트는 정상 동작한다. **AX 클라이언트가 되기 위한 별도 entitlement는 없다**(Apple Events와 달리) — 하드닝드 런타임 + 노터라이즈 상태에서 사용자 TCC 승인만 있으면 된다. 배포 전 실제 비샌드박스 여부만 확인하면 된다.
- **프라이버시**: 손쉬운 사용 권한은 강력하다 — 임의 앱의 UI 내용(텍스트 값 포함)을 읽을 수 있다. recap의 ADR 0001 프라이버시 경계(평문 타이핑 미기록)와 충돌하지 않도록, AX는 **rect(위치/크기)만** 읽고 `kAXValueAttribute`(텍스트 내용)는 읽지 말 것. 권한 자체가 넓다는 점은 사용자에게 정직하게 고지해야 한다.

### 4-1. 권한 편승 뉘앙스 (map에 중요)

`NSEvent.addGlobalMonitorForEvents(matching:[.keyDown])`로 전역 keyDown을 받으려면 손쉬운 사용 권한이 필요하다(권한 없으면 monitor는 등록되나 콜백이 절대 안 불림 — pqrs-org 예제, 및 KeyTracker.swift 주석과 일치). 따라서:

- recap에서 **키 트래킹이 실제로 동작 중인 사용자 = 이미 손쉬운 사용 권한 보유** → 그 사용자에게 AX rect는 **추가 프롬프트 없이 사실상 공짜**.
- 단, recap의 키 트래킹은 선택적·조용한 실패(권한 없으면 키만 안 흐르고 나머지 녹화는 정상)라, 권한 미보유 사용자도 존재한다. 이들에게 AX rect를 위해 **새 프롬프트를 띄우는 것은 별도 UX 결정**이며, 타이핑 줌 하나 때문에 권장하기 어렵다.
- (참고) 전역 키 관찰을 손쉬운 사용 없이 하려면 `CGEventTap`(입력 모니터링 권한) 또는 Carbon `RegisterEventHotKey`로 바꾸는 길이 있으나(electrobun #334), 이는 별개 이슈다.

---

## 권장 (map용 결론)

1. **타이핑 줌의 줌 중심은 "마지막 커서(마우스) 위치"를 기본 신호로 한다.** 권한 0, 구현 비용 최소, 웹/네이티브/Electron 어디서나 동작. recap 주 사용자(웹 프론트엔드)의 브라우저·VS Code 시나리오를 커버하는 유일한 신뢰 경로.
2. **AX rect는 progressive enhancement로만 추가한다.** 조건: (a) 손쉬운 사용 권한을 **이미 보유**(키 트래킹 편승) **그리고** (b) 포커스 요소가 **네이티브 앱**일 때만. 이 경우 `kAXBoundsForRangeParameterizedAttribute`로 캐럿을 정밀 조준. 실패 시 즉시 마우스 폴백.
3. **웹 입력용 AX rect는 지금 구현하지 않는다.** 브라우저 a11y 지연 생성 때문에 신뢰 불가. 침습적 활성화(`AXEnhancedUserInterface`/`--force-renderer-accessibility`)는 채택하지 않는다.
4. **AX rect만을 위해 새 손쉬운 사용 프롬프트를 강제 도입하지 않는다.** 편승 가능한 사용자에게만 켜지는 옵트인/자동감지로 충분. 두 번째 TCC 프롬프트의 UX·신뢰 비용이 이득보다 크다.
5. 구현 시: 백그라운드 큐 + `AXUIElementSetMessagingTimeout` 짧게 + 포커스 변경 디바운스, rect만 읽고 텍스트 값은 읽지 않음(ADR 0001 프라이버시 경계 유지), 배포 빌드의 비샌드박스 여부 확인.
