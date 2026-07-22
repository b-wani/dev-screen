// PROTOTYPE — throwaway. Ticket #121: 품질↔용량 프로파일 매트릭스.
// scene.png(다크 에디터 씬)에 recap 시그니처인 줌 모션을 입혀 2초 소스를 만들고,
// (해상도 × fps) 조합마다 recap의 export.ts와 "동일한" gifenc 경로로 인코딩해
// 용량을 측정하고 샘플 GIF를 저장한다.
//
//   export.ts 경로: quantize(data, maxColors) → applyPalette → writeFrame({palette, delay})
//   프레임당 로컬 팔레트 256색, 디더링 없음(#120), delay=frameDelayMs (gifenc가 cs로 반올림).
//
// fps 축은 #119가 확정한 "정확히 재생되는" 센티초 약수 계열만 쓴다:
//   cs=2→50fps, 3→33.3, 4→25, 5→20, 7→14.3(현행 15 요청의 실효값).
import { GIFEncoder, quantize, applyPalette } from '/Users/nhn/Projects/recap/node_modules/gifenc/dist/gifenc.esm.js'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const SCENE = new URL('./scene.png', import.meta.url).pathname
const DUR = 2 // 초
const SRC_W = 2400, SRC_H = 1500
const ASPECT = SRC_W / SRC_H

// fps 축: [라벨, 센티초]
const FPS_AXIS = [
  ['50', 2],
  ['33.3', 3],
  ['25', 4],
  ['20', 5],
  ['14.3', 7]
]
// 해상도 축: 출력 세로(px). 현행 프리셋은 480.
const HEIGHTS = [480, 720, 1080]
const MAX_COLORS = 256 // 현행 GITHUB_PRESET.gifMaxColors

// ffmpeg로 scene.png에 줌(1.0→1.35, 약간의 우측 팬)을 입혀 W×H·fps raw RGBA 프레임을 스트림한다.
function ffmpegFrames(W, H, fps, nFrames) {
  const z = `min(1.0+0.35*on/${Math.max(1, nFrames - 1)},1.35)`
  const vf =
    `zoompan=z='${z}':` +
    `x='(iw-iw/zoom)*(0.25+0.30*on/${Math.max(1, nFrames - 1)})':` +
    `y='(ih-ih/zoom)*0.5':` +
    `d=${nFrames}:s=${W}x${H}:fps=${fps},format=rgba`
  return spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-i', SCENE,
    '-vf', vf,
    '-frames:v', String(nFrames),
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'
  ])
}

// ffmpeg raw RGBA 스트림을 프레임 단위로 잘라 gifenc에 밀어넣고 GIF 바이트를 만든다(스트리밍).
function encodeCombo(W, H, fps, cs, nFrames) {
  const frameBytes = W * H * 4
  const delayMs = cs * 10 // gifenc가 round(delay/10)=cs 로 기록하도록 정확한 cs*10 을 넘긴다
  const enc = GIFEncoder()
  return new Promise((resolve, reject) => {
    const proc = ffmpegFrames(W, H, fps, nFrames)
    let acc = Buffer.alloc(0)
    let written = 0
    proc.stdout.on('data', (chunk) => {
      acc = acc.length ? Buffer.concat([acc, chunk]) : chunk
      while (acc.length >= frameBytes && written < nFrames) {
        const frame = acc.subarray(0, frameBytes)
        acc = acc.subarray(frameBytes)
        const data = new Uint8Array(frame.buffer, frame.byteOffset, frameBytes)
        const palette = quantize(data, MAX_COLORS)
        const index = applyPalette(data, palette)
        enc.writeFrame(index, W, H, { palette, delay: delayMs })
        written++
      }
    })
    let errBuf = ''
    proc.stderr.on('data', (d) => (errBuf += d))
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${errBuf}`))
      if (written !== nFrames)
        return reject(new Error(`frame count mismatch: ${written}/${nFrames}`))
      enc.finish()
      resolve(enc.bytes())
    })
  })
}

const rows = []
for (const H of HEIGHTS) {
  const W = Math.round(H * ASPECT)
  for (const [label, cs] of FPS_AXIS) {
    const fps = 100 / cs
    const nFrames = Math.round(DUR * fps)
    const bytes = await encodeCombo(W, H, fps, cs, nFrames)
    const kb = bytes.length / 1024
    const path = new URL(`./matrix-${H}p-${label}fps.gif`, import.meta.url).pathname
    writeFileSync(path, bytes)
    rows.push({ H, W, label, cs, nFrames, kb })
    console.log(`${H}p (${W}x${H}) | ${label}fps (${cs}cs) | ${nFrames}프레임 | ${kb.toFixed(0)} KB`)
  }
}

// 마크다운 표
console.log('\n### 용량 매트릭스 (KB, 2초, 줌 모션, 256색 로컬 팔레트)\n')
console.log('| 해상도 \\\\ fps | ' + FPS_AXIS.map(([l]) => `${l}fps`).join(' | ') + ' |')
console.log('|' + '---|'.repeat(FPS_AXIS.length + 1))
for (const H of HEIGHTS) {
  const W = Math.round(H * ASPECT)
  const cells = FPS_AXIS.map(([label]) => {
    const r = rows.find((x) => x.H === H && x.label === label)
    return `${r.kb.toFixed(0)} KB`
  })
  console.log(`| **${H}p** (${W}×${H}) | ${cells.join(' | ')} |`)
}
