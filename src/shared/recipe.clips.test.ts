import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  deriveRecipe,
  sampleComposition,
  outputDurationMs,
  sourceAtOutput,
  sampleCompositionAtOutput,
  nextClipId
} from './recipe'
import type { Clip, RenderRecipe } from './recipe'
import { serializeRecipe, parseRecipe, RecipeParseError } from './recipe.persist'
import type { EventTrack } from './event-track'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function loadTrack(name: string): EventTrack {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as EventTrack
}

const source = { width: 1000, height: 800 }
const derived = deriveRecipe(loadTrack('event-track-clicks.json'), { source })

/** clips만 갈아 끼운 레시피를 만든다(다른 필드·trim은 유지). */
function withClips(clips: Clip[]): RenderRecipe {
  return { ...derived, clips }
}

describe('deriveRecipe: 클립 시퀀스 기본 부여', () => {
  it('신규 유도 레시피는 전체를 덮는 클립 1개를 가진다 ([0, durationMs], speed 1, id c1)', () => {
    expect(derived.clips).toEqual([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: derived.durationMs, speed: 1 }
    ])
  })
})

describe('nextClipId: 결정적 id 생성 (max 숫자접미사 + 1)', () => {
  it('빈 집합이면 c1', () => {
    expect(nextClipId([])).toBe('c1')
  })

  it('숫자 접미사 최댓값 + 1을 쓴다 (순서·간극 무관)', () => {
    const clips: Clip[] = [
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 100, speed: 1 },
      { id: 'c5', sourceStartMs: 100, sourceEndMs: 200, speed: 1 },
      { id: 'c3', sourceStartMs: 200, sourceEndMs: 300, speed: 1 }
    ]
    expect(nextClipId(clips)).toBe('c6')
  })

  it('같은 입력에 항상 같은 출력 (순수·무난수)', () => {
    const clips: Clip[] = [{ id: 'c2', sourceStartMs: 0, sourceEndMs: 100, speed: 1 }]
    expect(nextClipId(clips)).toBe(nextClipId(clips))
    expect(nextClipId(clips)).toBe('c3')
  })
})

describe('outputDurationMs: 출력 길이 = Σ (구간 길이 / 속도)', () => {
  it('단일 클립 speed 1이면 source 길이와 같다', () => {
    expect(outputDurationMs(derived)).toBe(derived.durationMs)
  })

  it('speed 2면 출력 길이가 절반이다', () => {
    const r = withClips([{ id: 'c1', sourceStartMs: 0, sourceEndMs: 4000, speed: 2 }])
    expect(outputDurationMs(r)).toBe(2000)
  })

  it('여러 클립은 각 출력 길이의 합이다 (컷 간극은 제외)', () => {
    const r = withClips([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 2000, speed: 1 }, // 2000
      { id: 'c2', sourceStartMs: 5000, sourceEndMs: 9000, speed: 2 } // 2000
    ])
    expect(outputDurationMs(r)).toBe(4000)
  })
})

describe('sourceAtOutput: 출력→source piecewise-linear 단조 매핑', () => {
  it('단일 클립 speed 1이면 항등(identity)이다', () => {
    const r = withClips([{ id: 'c1', sourceStartMs: 0, sourceEndMs: 4000, speed: 1 }])
    expect(sourceAtOutput(r, 0)).toBe(0)
    expect(sourceAtOutput(r, 1000)).toBe(1000)
    expect(sourceAtOutput(r, 4000)).toBe(4000)
  })

  it('앞트림 클립은 출력 0이 클립 시작 source에 대응한다', () => {
    const r = withClips([{ id: 'c1', sourceStartMs: 1000, sourceEndMs: 3000, speed: 1 }])
    expect(sourceAtOutput(r, 0)).toBe(1000)
    expect(sourceAtOutput(r, 500)).toBe(1500)
    expect(sourceAtOutput(r, 2000)).toBe(3000)
  })

  it('speed 2면 출력 시간이 source를 2배로 전진시킨다', () => {
    const r = withClips([{ id: 'c1', sourceStartMs: 0, sourceEndMs: 4000, speed: 2 }])
    expect(sourceAtOutput(r, 0)).toBe(0)
    expect(sourceAtOutput(r, 1000)).toBe(2000)
    expect(sourceAtOutput(r, 2000)).toBe(4000)
  })

  it('컷(클립 간극)은 매핑에서 건너뛴다 — 경계에서 source가 점프한다', () => {
    const r = withClips([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 2000, speed: 1 },
      { id: 'c2', sourceStartMs: 5000, sourceEndMs: 7000, speed: 1 }
    ])
    // 첫 클립 끝 = 출력 2000 → source 2000
    expect(sourceAtOutput(r, 2000)).toBe(2000)
    // 둘째 클립 시작 = 출력 2000 직후 → source 5000으로 점프
    expect(sourceAtOutput(r, 2001)).toBe(5001)
    expect(sourceAtOutput(r, 3000)).toBe(6000)
  })

  it('출력 시간에 대해 단조 증가한다', () => {
    const r = withClips([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 2000, speed: 1 },
      { id: 'c2', sourceStartMs: 5000, sourceEndMs: 9000, speed: 2 }
    ])
    let prev = -1
    const total = outputDurationMs(r)
    for (let t = 0; t <= total; t += 25) {
      const s = sourceAtOutput(r, t)
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })

  it('범위를 벗어난 출력 시간은 양끝으로 클램핑된다', () => {
    const r = withClips([{ id: 'c1', sourceStartMs: 1000, sourceEndMs: 3000, speed: 1 }])
    expect(sourceAtOutput(r, -100)).toBe(1000) // 하한 클램프
    expect(sourceAtOutput(r, 999999)).toBe(3000) // 상한 = 마지막 클립 끝
  })
})

describe('sampleCompositionAtOutput: 출력 시간 위에 core 샘플링을 얹는다', () => {
  it('sampleComposition(recipe, sourceAtOutput(recipe, t))와 동일하다', () => {
    const r = withClips([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 2000, speed: 1 },
      { id: 'c2', sourceStartMs: 5000, sourceEndMs: 9000, speed: 2 }
    ])
    const total = outputDurationMs(r)
    for (let t = 0; t <= total; t += 50) {
      expect(sampleCompositionAtOutput(r, t)).toEqual(
        sampleComposition(r, sourceAtOutput(r, t))
      )
    }
  })

  it('fps를 넘기면 core로 그대로 전달된다(모션 블러)', () => {
    const r = withClips([{ id: 'c1', sourceStartMs: 0, sourceEndMs: 4000, speed: 1 }])
    expect(sampleCompositionAtOutput(r, 1000, 30)).toEqual(
      sampleComposition(r, sourceAtOutput(r, 1000), 30)
    )
  })
})

describe('마이그레이션: 구버전 trim → 클립 1개 합성', () => {
  it('clips가 없는 구버전 레시피를 로드하면 trim에서 클립 1개를 합성한다', () => {
    const old = {
      formatVersion: 1,
      recipe: {
        source,
        zoomScale: 2,
        durationMs: 5000,
        zoomSegments: [],
        cursor: { keyframes: [], clicks: [] },
        trim: { startMs: 500, endMs: 4500 },
        background: { color: '#1c1c1e', padding: 0.06 },
        badge: { visible: true }
        // clips 없음 (구버전)
      }
    }
    const restored = parseRecipe(JSON.stringify(old))
    expect(restored.clips).toEqual([
      { id: 'c1', sourceStartMs: 500, sourceEndMs: 4500, speed: 1 }
    ])
  })

  it('저장된 클립 시퀀스가 왕복 후 그대로 복원된다', () => {
    const withSeq = withClips([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 2000, speed: 1 },
      { id: 'c2', sourceStartMs: 5000, sourceEndMs: 9000, speed: 2 }
    ])
    const restored = parseRecipe(serializeRecipe(withSeq))
    expect(restored.clips).toEqual(withSeq.clips)
    expect(restored).toEqual(withSeq)
  })

  it('신규 유도 레시피도 clips를 담아 왕복한다', () => {
    expect(parseRecipe(serializeRecipe(derived)).clips).toEqual(derived.clips)
  })
})

describe('마이그레이션: 클립 불변식 검증 (오름차순·비겹침)', () => {
  it('클립이 source 오름차순이 아니면 거부한다', () => {
    const broken = withClips([
      { id: 'c1', sourceStartMs: 5000, sourceEndMs: 9000, speed: 1 },
      { id: 'c2', sourceStartMs: 0, sourceEndMs: 2000, speed: 1 }
    ])
    expect(() => parseRecipe(serializeRecipe(broken))).toThrow(RecipeParseError)
  })

  it('클립 구간이 겹치면 거부한다', () => {
    const broken = withClips([
      { id: 'c1', sourceStartMs: 0, sourceEndMs: 3000, speed: 1 },
      { id: 'c2', sourceStartMs: 2000, sourceEndMs: 5000, speed: 1 }
    ])
    expect(() => parseRecipe(serializeRecipe(broken))).toThrow(RecipeParseError)
  })

  it('sourceStartMs >= sourceEndMs(빈/역방향 구간)이면 거부한다', () => {
    const broken = withClips([{ id: 'c1', sourceStartMs: 3000, sourceEndMs: 3000, speed: 1 }])
    expect(() => parseRecipe(serializeRecipe(broken))).toThrow(RecipeParseError)
  })

  it('speed가 0 이하이면 거부한다', () => {
    const broken = withClips([{ id: 'c1', sourceStartMs: 0, sourceEndMs: 3000, speed: 0 }])
    expect(() => parseRecipe(serializeRecipe(broken))).toThrow(RecipeParseError)
  })

  it('빈 클립 배열이면 거부한다 (출력이 없다)', () => {
    const broken = withClips([])
    expect(() => parseRecipe(serializeRecipe(broken))).toThrow(RecipeParseError)
  })
})
