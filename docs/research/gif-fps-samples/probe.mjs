// PROTOTYPE — throwaway. Ticket #119: 고fps GIF 실효 재생 검증.
// recap의 export.ts와 동일한 gifenc 호출 경로로 30/50/60/15fps 샘플 GIF를 만들고,
// 파일에 기록된 GCE delay(센티초)를 역파싱해 실효 fps를 확정한다.
import { GIFEncoder, quantize, applyPalette } from '/Users/nhn/Projects/recap/node_modules/gifenc/dist/gifenc.esm.js'
import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] || '.'
const W = 240, H = 90

// export.ts와 동일: frameDelayMs = 1000 / fps, writeFrame({ delay: frameDelayMs })
function makeGif(fps, seconds = 2) {
  const frameDelayMs = 1000 / fps
  const totalFrames = Math.round(seconds * fps)
  const enc = GIFEncoder()
  for (let i = 0; i < totalFrames; i++) {
    const data = new Uint8Array(W * H * 4)
    // 배경 + 프레임마다 도는 색상 스트라이프(애니메이션 가시성)
    const hue = (i / totalFrames) * 255
    // 프레임 인덱스에 비례해 움직이는 세로 막대(속도 눈측정용)
    const barX = Math.floor((i / totalFrames) * W)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        let r = 20, g = 20, b = 30
        if (Math.abs(x - barX) < 4) { r = 255; g = 80; b = 40 }        // 움직이는 막대
        if (y < 8) { r = hue; g = 255 - hue; b = 128 }                  // 상단 진행 스트라이프
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
      }
    }
    const palette = quantize(data, 64)
    const index = applyPalette(data, palette)
    enc.writeFrame(index, W, H, { palette, delay: frameDelayMs })
  }
  enc.finish()
  return { bytes: enc.bytes(), totalFrames, frameDelayMs }
}

// GIF89a 그래픽 제어 확장(0x21 0xF9 0x04 ...)의 delay(2바이트 LE, 센티초)를 파싱
function parseDelays(bytes) {
  const delays = []
  for (let i = 0; i + 8 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      const cs = bytes[i + 4] | (bytes[i + 5] << 8) // little-endian
      delays.push(cs)
    }
  }
  return delays
}

console.log('fps | 요청delay(ms) | 기록delay(cs) | 기록delay(ms) | 실효fps | 프레임수 | 파일크기(KB)')
console.log('----|--------------|---------------|---------------|---------|----------|-------------')
for (const fps of [15, 30, 50, 60]) {
  const { bytes, totalFrames, frameDelayMs } = makeGif(fps)
  const path = `${OUT}/sample-${fps}fps.gif`
  writeFileSync(path, bytes)
  const delays = parseDelays(bytes)
  const cs = delays[0]
  const uniq = [...new Set(delays)]
  const effMs = cs * 10
  const effFps = effMs > 0 ? (1000 / effMs).toFixed(1) : '∞'
  const kb = (bytes.length / 1024).toFixed(1)
  const csStr = uniq.length === 1 ? String(cs) : `혼합 ${uniq.join('/')}`
  console.log(
    `${String(fps).padStart(3)} | ${frameDelayMs.toFixed(2).padStart(12)} | ${csStr.padStart(13)} | ${String(effMs).padStart(13)} | ${String(effFps).padStart(7)} | ${String(totalFrames).padStart(8)} | ${kb.padStart(11)}`
  )
}
console.log(`\n샘플 GIF 저장: ${OUT}/sample-{15,30,50,60}fps.gif`)
