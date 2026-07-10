import { describe, it, expect } from 'vitest'
import { resolveTitle } from './library-title'

describe('resolveTitle', () => {
  it('title이 있으면 그대로 쓴다', () => {
    expect(resolveTitle('내 첫 녹화', '2024-07-09T14-32-10')).toBe('내 첫 녹화')
  })

  it('title이 없으면(마이그레이션 전 녹화) 폴더 이름으로 폴백한다', () => {
    expect(resolveTitle(undefined, '2024-07-09T14-32-10')).toBe('2024-07-09T14-32-10')
  })

  it('title이 공백뿐이면 폴더 이름으로 폴백한다', () => {
    expect(resolveTitle('   ', '2024-07-09T14-32-10')).toBe('2024-07-09T14-32-10')
  })

  it('title 앞뒤 공백은 다듬는다', () => {
    expect(resolveTitle('  제목  ', '2024-07-09T14-32-10')).toBe('제목')
  })
})
