import { describe, it, expect } from 'vitest'
import {
  GITHUB_PRESET,
  resolveEncodeConfig,
  exceedsSizeLimit,
  type ExportPreset
} from './export-preset'

describe('GitHub 익스포트 프리셋: 데이터로 정의된 v1 유일 프리셋', () => {
  it('MP4/H.264, 100MB 상한, 최대 1080p 60fps (SPEC 익스포트)', () => {
    expect(GITHUB_PRESET.container).toBe('mp4')
    expect(GITHUB_PRESET.codec).toBe('avc')
    expect(GITHUB_PRESET.maxSizeBytes).toBe(100 * 1024 * 1024)
    expect(GITHUB_PRESET.maxHeight).toBe(1080)
    expect(GITHUB_PRESET.fps).toBe(60)
  })
})

describe('resolveEncodeConfig: (프리셋, 원본 크기, 길이) → 인코딩 설정', () => {
  it('Retina 2x 원본을 maxHeight 이하로 비율 유지 축소하고 짝수로 맞춘다', () => {
    // 원본 2880×1800 → 1080 상한이면 scale 0.6 → 1728×1080.
    const cfg = resolveEncodeConfig(GITHUB_PRESET, { width: 2880, height: 1800 }, 60_000)
    expect(cfg.height).toBe(1080)
    expect(cfg.width).toBe(1728)
    expect(cfg.width % 2).toBe(0)
    expect(cfg.height % 2).toBe(0)
    expect(cfg.fps).toBe(60)
    expect(cfg.codec).toBe('avc')
  })

  it('원본이 상한보다 작으면 확대하지 않는다', () => {
    const cfg = resolveEncodeConfig(GITHUB_PRESET, { width: 1280, height: 720 }, 30_000)
    expect(cfg.width).toBe(1280)
    expect(cfg.height).toBe(720)
  })

  it('홀수로 떨어지는 크기를 가장 가까운 짝수로 보정한다', () => {
    // 1001×667 → 상한보다 작아 그대로, 667은 짝수(668)로 보정.
    const cfg = resolveEncodeConfig(GITHUB_PRESET, { width: 1001, height: 667 }, 10_000)
    expect(cfg.width % 2).toBe(0)
    expect(cfg.height % 2).toBe(0)
    expect(cfg.width).toBe(1002)
    expect(cfg.height).toBe(668)
  })

  it('짧은 영상은 비트레이트 상한으로 캡된다 (용량 예산을 다 안 씀)', () => {
    const cfg = resolveEncodeConfig(GITHUB_PRESET, { width: 1280, height: 720 }, 5_000)
    expect(cfg.bitrate).toBe(GITHUB_PRESET.maxBitrate)
  })

  it('긴 영상은 100MB 예산에 맞춰 비트레이트를 낮춘다', () => {
    const durationMs = 120_000 // 2분
    const cfg = resolveEncodeConfig(GITHUB_PRESET, { width: 1920, height: 1080 }, durationMs)
    expect(cfg.bitrate).toBeLessThan(GITHUB_PRESET.maxBitrate)
    // 산정한 비트레이트로 채워도 용량 상한 안에 들어와야 한다.
    const estimatedBytes = (cfg.bitrate * (durationMs / 1000)) / 8
    expect(estimatedBytes).toBeLessThanOrEqual(GITHUB_PRESET.maxSizeBytes)
  })

  it('길이 0이면 상한 비트레이트로 폴백한다 (0으로 나누지 않음)', () => {
    const cfg = resolveEncodeConfig(GITHUB_PRESET, { width: 1280, height: 720 }, 0)
    expect(cfg.bitrate).toBe(GITHUB_PRESET.maxBitrate)
  })
})

describe('exceedsSizeLimit: 결과 파일 용량 초과 판정 (AC4)', () => {
  const preset: ExportPreset = { ...GITHUB_PRESET, maxSizeBytes: 1000 }

  it('상한 이하면 false', () => {
    expect(exceedsSizeLimit(preset, 1000)).toBe(false)
    expect(exceedsSizeLimit(preset, 999)).toBe(false)
  })

  it('상한 초과면 true', () => {
    expect(exceedsSizeLimit(preset, 1001)).toBe(true)
  })
})
