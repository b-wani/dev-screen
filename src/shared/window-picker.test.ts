import { describe, it, expect } from 'vitest'
import { flipRect, pointInRect, hitTestWindowAt } from './window-picker'
import type { CaptureTarget } from './event-track'

describe('flipRect: AppKit 전역(좌하단 원점) → Electron 화면 좌표(좌상단 원점)', () => {
  it('screenHeight - (y + height) 로 y를 뒤집고 x/width/height는 그대로 둔다', () => {
    // 1440x900 화면에서 y=80, height=800 인 AppKit rect → top=900-(80+800)=20
    const flipped = flipRect({ x: 100, y: 80, width: 1200, height: 800 }, 900)
    expect(flipped).toEqual({ x: 100, y: 20, width: 1200, height: 800 })
  })

  it('화면 맨 아래(y=0)에 붙은 창은 top=screenHeight-height 가 된다', () => {
    const flipped = flipRect({ x: 0, y: 0, width: 400, height: 300 }, 900)
    expect(flipped).toEqual({ x: 0, y: 600, width: 400, height: 300 })
  })
})

describe('pointInRect', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 }

  it('경계 포함 내부는 true', () => {
    expect(pointInRect({ x: 10, y: 20 }, rect)).toBe(true)
    expect(pointInRect({ x: 110, y: 70 }, rect)).toBe(true)
    expect(pointInRect({ x: 60, y: 45 }, rect)).toBe(true)
  })

  it('바깥은 false', () => {
    expect(pointInRect({ x: 9, y: 45 }, rect)).toBe(false)
    expect(pointInRect({ x: 111, y: 45 }, rect)).toBe(false)
    expect(pointInRect({ x: 60, y: 19 }, rect)).toBe(false)
    expect(pointInRect({ x: 60, y: 71 }, rect)).toBe(false)
  })
})

describe('hitTestWindowAt', () => {
  const screenHeight = 900
  const targets: CaptureTarget[] = [
    { kind: 'display', id: 'display:1', title: '내장 디스플레이', width: 1440, height: 900 },
    {
      kind: 'window',
      id: 'window:47',
      title: 'Safari — GitHub',
      width: 1200,
      height: 800,
      frame: { x: 100, y: 80, width: 1200, height: 800 } // flipped top=20..820
    },
    {
      kind: 'window',
      id: 'window:63',
      title: 'VS Code — protocol.ts',
      width: 1000,
      height: 720,
      frame: { x: 220, y: 40, width: 1000, height: 720 } // flipped top=140..860
    }
  ]

  it('커서 아래 창을 찾는다', () => {
    const hit = hitTestWindowAt({ x: 150, y: 50 }, targets, screenHeight)
    expect(hit?.id).toBe('window:47')
  })

  it('여러 창이 겹치면 목록 순서상 먼저 오는 쪽을 우선한다', () => {
    // (300, 200)은 두 창 flipped rect 모두에 겹친다 — 47이 목록에서 먼저다.
    const hit = hitTestWindowAt({ x: 300, y: 200 }, targets, screenHeight)
    expect(hit?.id).toBe('window:47')
  })

  it('frame 없는 display 대상은 후보에서 제외된다', () => {
    const hit = hitTestWindowAt({ x: 5, y: 5 }, targets, screenHeight)
    expect(hit).toBeNull()
  })

  it('빈 데스크톱(어느 창도 없음)은 null', () => {
    const hit = hitTestWindowAt({ x: 1300, y: 850 }, targets, screenHeight)
    expect(hit).toBeNull()
  })
})
