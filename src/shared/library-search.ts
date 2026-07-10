/** 라이브러리 검색 — `RecordingSummary.title` 기준 순수 필터 로직(#79). */

import type { RecordingSummary } from './ipc'

/** 대소문자 구분 없이 title에 query가 포함된 항목만 남긴다. 빈 쿼리는 원본을 그대로 돌려준다. */
export function filterByTitle(
  list: readonly RecordingSummary[],
  query: string
): RecordingSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...list]
  return list.filter((r) => r.title.toLowerCase().includes(q))
}
