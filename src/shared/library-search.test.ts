import { describe, it, expect } from 'vitest'
import { filterByTitle } from './library-search'
import type { RecordingSummary } from './ipc'

function summary(overrides: Partial<RecordingSummary>): RecordingSummary {
  return {
    folder: '/tmp/x',
    name: 'x',
    startedAt: 0,
    durationMs: 0,
    eventCount: 0,
    title: 'x',
    ...overrides
  }
}

describe('filterByTitle', () => {
  const list: RecordingSummary[] = [
    summary({ folder: 'a', title: '데모 녹화' }),
    summary({ folder: 'b', title: '버그 리포트' }),
    summary({ folder: 'c', title: '2024-07-09T14-32-10' })
  ]

  it('빈 쿼리는 전체를 그대로 돌려준다', () => {
    expect(filterByTitle(list, '').map((r) => r.folder)).toEqual(['a', 'b', 'c'])
  })

  it('title에 부분 문자열이 포함된 항목만 남긴다', () => {
    expect(filterByTitle(list, '데모').map((r) => r.folder)).toEqual(['a'])
  })

  it('대소문자를 구분하지 않는다', () => {
    const mixed = [summary({ folder: 'd', title: 'Bug Report' })]
    expect(filterByTitle(mixed, 'bug').map((r) => r.folder)).toEqual(['d'])
  })

  it('일치하는 항목이 없으면 빈 배열을 돌려준다', () => {
    expect(filterByTitle(list, '없음')).toEqual([])
  })

  it('원본 배열을 변형하지 않는다', () => {
    const before = [...list]
    filterByTitle(list, '')
    expect(list).toEqual(before)
  })
})
