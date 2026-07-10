/**
 * Window 선택 오버레이(#73)의 순수 로직 — flipped 좌표 환산과 히트테스트.
 *
 * 사이드카 v4가 넘기는 `CaptureTarget.frame`은 AppKit 전역 좌표(좌하단 원점)다.
 * 오버레이는 Electron 화면 좌표(좌상단 원점, `screen.getCursorScreenPoint()`와 같은 계)로
 * 그려야 하므로, 여기서 렌더 레이어 진입 전에 한 번 환산한다(스펙 §3).
 *
 * Electron/main에 의존하지 않는 순수 함수만 담아 main·renderer가 함께 쓰고 vitest로
 * 검증한다.
 */

import type { CaptureTarget, Rect } from './event-track'

/** Electron 화면 좌표계(좌상단 원점) 위의 점. */
export interface ScreenPoint {
  x: number
  y: number
}

/**
 * AppKit 전역 rect(좌하단 원점)를 Electron 화면 좌표(좌상단 원점)로 환산한다.
 * `y' = screenHeightPt - (rect.y + rect.height)` — 주 디스플레이 높이 기준(#53 flip 규약).
 */
export function flipRect(rect: Rect, screenHeightPt: number): Rect {
  return {
    x: rect.x,
    y: screenHeightPt - (rect.y + rect.height),
    width: rect.width,
    height: rect.height
  }
}

/** 점이 rect 안(경계 포함)에 있는지. */
export function pointInRect(point: ScreenPoint, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * 커서(Electron 화면 좌표) 아래의 창을 찾는다. `frame`이 있는 `window` 대상만 후보이며,
 * 목록 순서상 먼저 매칭되는 것을 돌려준다(겹치는 창은 목록 순서로 우선순위를 정한다).
 * 없으면 null(빈 데스크톱).
 */
export function hitTestWindowAt(
  point: ScreenPoint,
  targets: CaptureTarget[],
  screenHeightPt: number
): CaptureTarget | null {
  for (const target of targets) {
    if (target.kind !== 'window' || !target.frame) continue
    if (pointInRect(point, flipRect(target.frame, screenHeightPt))) return target
  }
  return null
}
