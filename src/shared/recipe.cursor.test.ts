import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { deriveRecipe, sampleFrame, sampleRecipe, CURSOR_DEFAULTS } from './recipe'
import type { EventTrack } from './event-track'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function loadTrack(name: string): EventTrack {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as EventTrack
}

const source = { width: 1000, height: 800 }

describe('프레임 샘플링: 스무딩된 커서 (AC 1)', () => {
  // 지터 픽스처: 커서가 x축을 따라 직진하지만 y가 +20/-20으로 흔들린다(추세선 y=0).
  const recipe = deriveRecipe(loadTrack('event-track-jitter.json'), { source })

  it('대칭 지터는 추세선으로 정확히 상쇄된다 (스무딩 강도와 무관)', () => {
    // t=250은 모든 샘플의 시간 대칭 중심 → +지터와 -지터가 서로 상쇄되어 추세에 안착.
    const s = sampleFrame(recipe, 250)
    expect(s.cursor).not.toBeNull()
    expect(s.cursor!.x).toBeCloseTo(250, 6)
    expect(s.cursor!.y).toBeCloseTo(0, 6)
  })

  it('원본 이벤트의 흔들림이 감쇠된다 — 각 지터 시각에서 추세 이탈이 줄어든다', () => {
    // 원본 y는 각 시각에서 추세(0)로부터 20px 벗어나 있다.
    for (const [t, rawY] of [
      [100, 20],
      [200, -20],
      [300, 20],
      [400, -20]
    ] as const) {
      const s = sampleFrame(recipe, t)
      expect(s.cursor).not.toBeNull()
      // 스무딩된 위치는 원본보다 추세(0)에 더 가깝다.
      expect(Math.abs(s.cursor!.y)).toBeLessThan(Math.abs(rawY))
    }
  })

  it('커서 모양은 스무딩하지 않고 가장 최근 이벤트의 모양을 쓴다', () => {
    // 클릭 픽스처: t=1000 이후 커서 pointer, t=6000 이후 arrow.
    const clicks = deriveRecipe(loadTrack('event-track-clicks.json'), { source })
    expect(sampleFrame(clicks, 1200).cursor!.cursor).toBe('pointer')
    expect(sampleFrame(clicks, 7000).cursor!.cursor).toBe('arrow')
  })

  it('커서 이벤트가 없으면 cursor는 null', () => {
    const empty: EventTrack = { protocolVersion: 1, startedAt: 0, durationMs: 1000, samples: [] }
    expect(sampleFrame(deriveRecipe(empty, { source }), 500).cursor).toBeNull()
  })
})

describe('커서 크기·스무딩 설정 (#35)', () => {
  const recipe = deriveRecipe(loadTrack('event-track-jitter.json'), { source })

  it('유도한 레시피의 커서 트랙은 기본 크기·스무딩을 담는다', () => {
    expect(recipe.cursor.size).toBe(CURSOR_DEFAULTS.size)
    expect(recipe.cursor.smoothingMs).toBe(CURSOR_DEFAULTS.smoothingMs)
  })

  it('샘플링된 커서는 레시피의 크기 배율을 그대로 옮긴다', () => {
    const big = { ...recipe, cursor: { ...recipe.cursor, size: 2 } }
    expect(sampleFrame(big, 250).cursor!.size).toBe(2)
  })

  it('스무딩을 끄면(sigma 0) 흔들림이 감쇠되지 않고 원본 위치를 쓴다', () => {
    const off = { ...recipe, cursor: { ...recipe.cursor, smoothingMs: 0 } }
    // t=100의 원본 지터 y=20 — 스무딩 끔이면 감쇠 없이 원본에 안착한다.
    expect(sampleFrame(off, 100).cursor!.y).toBeCloseTo(20, 6)
  })

  it('스무딩이 강할수록 같은 시각의 추세 이탈이 더 줄어든다', () => {
    const weak = sampleFrame({ ...recipe, cursor: { ...recipe.cursor, smoothingMs: 120 } }, 100)
    const strong = sampleFrame({ ...recipe, cursor: { ...recipe.cursor, smoothingMs: 280 } }, 100)
    expect(Math.abs(strong.cursor!.y)).toBeLessThan(Math.abs(weak.cursor!.y))
  })
})

describe('프레임 샘플링: 클릭 하이라이트 (AC 2)', () => {
  // 클릭(down) 시각: 1000(400,300), 2500(420,310), 8000(800,600).
  const recipe = deriveRecipe(loadTrack('event-track-clicks.json'), { source })
  const dur = CURSOR_DEFAULTS.clickHighlightMs

  it('클릭 순간에 하이라이트가 켜지고 진행도 0에서 시작한다', () => {
    const s = sampleFrame(recipe, 1000)
    expect(s.click).toEqual({ x: 400, y: 300, progress: 0 })
  })

  it('하이라이트 진행도가 지속시간에 걸쳐 0→1로 진행한다', () => {
    const s = sampleFrame(recipe, 1000 + dur / 2)
    expect(s.click).not.toBeNull()
    expect(s.click!.progress).toBeCloseTo(0.5, 10)
    expect(s.click!.x).toBe(400)
    expect(s.click!.y).toBe(300)
  })

  it('지속시간이 끝나면 하이라이트가 꺼진다 (창은 열림-닫힘 반개구간)', () => {
    expect(sampleFrame(recipe, 1000 + dur).click).toBeNull()
  })

  it('클릭에서 먼 시각에는 하이라이트가 없다', () => {
    expect(sampleFrame(recipe, 6000).click).toBeNull()
  })

  it('여러 클릭 각각에서 하이라이트가 켜진다', () => {
    expect(sampleFrame(recipe, 2500).click).toEqual({ x: 420, y: 310, progress: 0 })
    expect(sampleFrame(recipe, 8000).click).toEqual({ x: 800, y: 600, progress: 0 })
  })
})

function inlineTrack(durationMs: number, samples: EventTrack['samples']): EventTrack {
  return { protocolVersion: 1, startedAt: 0, durationMs, samples }
}

describe('커서 완전 숨김 (hidden, #153)', () => {
  const recipe = deriveRecipe(loadTrack('event-track-jitter.json'), { source })

  it('유도한 레시피는 기본으로 숨김 OFF다', () => {
    expect(recipe.cursor.hidden).toBe(false)
    expect(sampleFrame(recipe, 250).cursor).not.toBeNull()
  })

  it('hidden이면 커서 샘플이 null이다 (그리기 층이 건너뛴다)', () => {
    const hidden = { ...recipe, cursor: { ...recipe.cursor, hidden: true } }
    expect(sampleFrame(hidden, 250).cursor).toBeNull()
  })
})

describe('유휴 자동 숨김 (hideWhenIdle, #150)', () => {
  // 커서가 t=100에 (50,0)으로 이동한 뒤 계속 정지. loopReturn은 끈 채 유휴 로직만 본다.
  const base = deriveRecipe(
    inlineTrack(10000, [
      { t: 0, kind: 'move', x: 0, y: 0, cursor: 'arrow' },
      { t: 100, kind: 'move', x: 50, y: 0, cursor: 'arrow' },
      { t: 200, kind: 'move', x: 50, y: 0, cursor: 'arrow' }
    ]),
    { source }
  )
  const idle = { ...base, cursor: { ...base.cursor, hideWhenIdle: true, loopReturn: false } }

  it('기본값은 OFF이고, OFF면 정지해도 완전 불투명하다', () => {
    expect(base.cursor.hideWhenIdle).toBe(false)
    const off = { ...base, cursor: { ...base.cursor, loopReturn: false } }
    expect(sampleFrame(off, 5000).cursor!.opacity).toBe(1)
  })

  it('임계(1500ms) 전에는 완전 불투명하다', () => {
    // 마지막 이동 t=100, 유휴 100ms < 1500ms.
    expect(sampleFrame(idle, 200).cursor!.opacity).toBe(1)
  })

  it('임계+페이드아웃(400ms)이 지나면 완전히 사라진다 (opacity 0)', () => {
    // 마지막 이동 t=100 → 1500+400 후 = t=2000.
    expect(sampleFrame(idle, 2000).cursor!.opacity).toBe(0)
  })

  it('페이드아웃 중에는 1→0으로 단조 감소한다', () => {
    const a = sampleFrame(idle, 1700).cursor!.opacity
    const b = sampleFrame(idle, 1900).cursor!.opacity
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(1)
    expect(b).toBeLessThan(a)
  })

  it('다시 움직이면 페이드인(150ms)으로 되살아난다', () => {
    const remove = deriveRecipe(
      inlineTrack(10000, [
        { t: 0, kind: 'move', x: 0, y: 0, cursor: 'arrow' },
        { t: 100, kind: 'move', x: 50, y: 0, cursor: 'arrow' },
        { t: 5000, kind: 'move', x: 300, y: 0, cursor: 'arrow' }
      ]),
      { source }
    )
    const r = { ...remove, cursor: { ...remove.cursor, hideWhenIdle: true, loopReturn: false } }
    expect(sampleFrame(r, 5000).cursor!.opacity).toBeCloseTo(0, 6) // 이동 직전엔 숨어 있었다
    const mid = sampleFrame(r, 5075).cursor!.opacity // 페이드인 절반
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(sampleFrame(r, 5150).cursor!.opacity).toBe(1) // 페이드인 완료
  })
})

describe('루프 초기위치 복귀 (loopReturn, #150)', () => {
  // 스무딩 끔으로 좌표를 정확히 고정. 출력 [0,5000], 복귀 창 [4200,5000].
  const recipe = deriveRecipe(
    inlineTrack(5000, [
      { t: 0, kind: 'move', x: 100, y: 100, cursor: 'arrow' },
      { t: 2000, kind: 'move', x: 800, y: 600, cursor: 'arrow' },
      { t: 4200, kind: 'move', x: 800, y: 600, cursor: 'arrow' }
    ]),
    { source }
  )
  const loop = { ...recipe, cursor: { ...recipe.cursor, smoothingMs: 0 } }

  it('기본값은 ON이다', () => {
    expect(recipe.cursor.loopReturn).toBe(true)
  })

  it('복귀 창 시작에서는 그 시점 위치, 끝에서는 시작(t=0) 좌표에 정확히 닿는다', () => {
    const atStart = sampleFrame(loop, 4200).cursor!
    expect(atStart.x).toBeCloseTo(800, 6)
    expect(atStart.y).toBeCloseTo(600, 6)
    const atEnd = sampleFrame(loop, 5000).cursor!
    expect(atEnd.x).toBeCloseTo(100, 6)
    expect(atEnd.y).toBeCloseTo(100, 6)
  })

  it('복귀 창 전에는 보간하지 않는다 (원래 위치 유지)', () => {
    expect(sampleFrame(loop, 4000).cursor!.x).toBeCloseTo(800, 6)
  })

  it('OFF면 끝에서도 시작 좌표로 복귀하지 않는다', () => {
    const off = { ...loop, cursor: { ...loop.cursor, loopReturn: false } }
    expect(sampleFrame(off, 5000).cursor!.x).toBeCloseTo(800, 6)
  })

  it('출력 길이가 복귀 창(800ms)보다 짧으면 복귀하지 않는다', () => {
    const shortR = deriveRecipe(
      inlineTrack(500, [
        { t: 0, kind: 'move', x: 100, y: 100, cursor: 'arrow' },
        { t: 400, kind: 'move', x: 300, y: 300, cursor: 'arrow' }
      ]),
      { source }
    )
    const s = { ...shortR, cursor: { ...shortR.cursor, smoothingMs: 0 } }
    expect(s.cursor.loopReturn).toBe(true)
    expect(sampleFrame(s, 500).cursor!.x).toBeCloseTo(300, 6)
  })

  it('유휴 숨김으로 끝에서 숨은 상태면 복귀 시작과 함께 페이드인한다', () => {
    const hiddenEnd = deriveRecipe(
      inlineTrack(5000, [
        { t: 0, kind: 'move', x: 100, y: 100, cursor: 'arrow' },
        { t: 100, kind: 'move', x: 800, y: 600, cursor: 'arrow' }
      ]),
      { source }
    )
    const h = { ...hiddenEnd, cursor: { ...hiddenEnd.cursor, smoothingMs: 0, hideWhenIdle: true } }
    // 복귀 창 시작(4200)엔 오래 정지해 숨어 있다 → opacity 0.
    expect(sampleFrame(h, 4200).cursor!.opacity).toBeCloseTo(0, 6)
    // 페이드인(150ms) 뒤 완전 불투명, 그리고 끝에서 시작 좌표로 복귀.
    expect(sampleFrame(h, 4350).cursor!.opacity).toBe(1)
    expect(sampleFrame(h, 5000).cursor!.x).toBeCloseTo(100, 6)
  })
})

describe('프레임 샘플링: 카메라 변환은 sampleRecipe와 동일', () => {
  const recipe = deriveRecipe(loadTrack('event-track-clicks.json'), { source })
  it('camera 필드는 기존 카메라 샘플링 결과를 그대로 담는다', () => {
    for (const t of [0, 750, 1750, 4750, 8000]) {
      expect(sampleFrame(recipe, t).camera).toEqual(sampleRecipe(recipe, t))
    }
  })
})
