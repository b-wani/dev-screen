/**
 * 렌더 레시피 직렬화 — 편집 상태를 로컬에 저장하고 다시 여는 왕복 계약.
 *
 * 레시피는 순수 데이터(숫자·배열)라 JSON으로 온전히 직렬화된다. 저장은 이 모듈을
 * 거치고, 로드 시에는 손상된 파일을 조용히 통과시키지 않도록 구조를 검증한다.
 * 왕복(직렬화 → 파싱) 후 sampleRecipe 출력이 동일해야 한다 (recipe.persist.test).
 */

import type { PanKeyframe, RenderRecipe, ZoomSegment } from './recipe'

/** 저장 포맷 버전. 호환 불가능한 레시피 스키마 변경 시 올린다. */
export const RECIPE_FORMAT_VERSION = 1

/** 손상되었거나 스키마를 벗어난 레시피 파일을 파싱할 때 던진다 — 조용히 삼키지 않는다. */
export class RecipeParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecipeParseError'
  }
}

/** 렌더 레시피를 저장용 문자열로 직렬화한다 (버전 태그 포함). */
export function serializeRecipe(recipe: RenderRecipe): string {
  return JSON.stringify({ formatVersion: RECIPE_FORMAT_VERSION, recipe }, null, 2)
}

/**
 * 저장된 문자열을 렌더 레시피로 파싱·검증한다.
 * 구조가 계약을 벗어나면 RecipeParseError를 던진다.
 */
export function parseRecipe(text: string): RenderRecipe {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new RecipeParseError('JSON이 아닌 레시피 파일')
  }
  const doc = asObject(raw, '레시피 파일')
  if (doc.formatVersion !== RECIPE_FORMAT_VERSION) {
    throw new RecipeParseError(
      `레시피 포맷 버전 불일치: 파일 ${String(doc.formatVersion)}, 앱 ${RECIPE_FORMAT_VERSION}`
    )
  }
  return validateRecipe(doc.recipe)
}

function validateRecipe(raw: unknown): RenderRecipe {
  const r = asObject(raw, 'recipe')
  const source = asObject(r.source, 'recipe.source')
  if (!isNum(source.width) || !isNum(source.height)) {
    throw new RecipeParseError('recipe.source: width/height 누락')
  }
  if (!isNum(r.zoomScale)) throw new RecipeParseError('recipe.zoomScale 누락')
  if (!isNum(r.durationMs)) throw new RecipeParseError('recipe.durationMs 누락')
  if (!Array.isArray(r.zoomSegments)) throw new RecipeParseError('recipe.zoomSegments 누락')

  return {
    source: { width: source.width, height: source.height },
    zoomScale: r.zoomScale,
    durationMs: r.durationMs,
    zoomSegments: r.zoomSegments.map(validateSegment)
  }
}

function validateSegment(raw: unknown): ZoomSegment {
  const s = asObject(raw, 'zoomSegment')
  if (!isNum(s.startMs) || !isNum(s.fullInAtMs) || !isNum(s.holdEndMs) || !isNum(s.endMs)) {
    throw new RecipeParseError('zoomSegment: 시간 지점 누락')
  }
  if (!Array.isArray(s.keyframes)) throw new RecipeParseError('zoomSegment.keyframes 누락')
  return {
    startMs: s.startMs,
    fullInAtMs: s.fullInAtMs,
    holdEndMs: s.holdEndMs,
    endMs: s.endMs,
    keyframes: s.keyframes.map(validateKeyframe)
  }
}

function validateKeyframe(raw: unknown): PanKeyframe {
  const k = asObject(raw, 'keyframe')
  if (!isNum(k.t) || !isNum(k.x) || !isNum(k.y)) {
    throw new RecipeParseError('keyframe: t/x/y 누락')
  }
  return { t: k.t, x: k.x, y: k.y }
}

function asObject(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    throw new RecipeParseError(`${what}: 객체가 아님`)
  }
  return v as Record<string, unknown>
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
