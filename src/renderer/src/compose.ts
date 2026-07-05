/**
 * 프레임 합성 그리기 층 — 효과 계산을 하지 않는다.
 * `sampleComposition`이 낸 합성 파라미터(카메라·배경/패딩·배지)를 2D 컨텍스트에
 * 그대로 그리기만 한다. 미리보기(온스크린 캔버스)와 익스포트(오프스크린 캔버스)가
 * 이 한 함수를 공유하므로 두 결과물이 동일하게 나온다.
 */

import type { FrameComposition, FrameSize } from '../../shared/recipe'

/** 온스크린·오프스크린 양쪽에서 통용되는 2D 컨텍스트. */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * 합성 파라미터 한 프레임을 그린다. 컨텍스트의 캔버스는 원본 크기(source)로 맞춰져 있다고 본다.
 * 순서: 배경 채우기 → 패딩 안쪽에 카메라 뷰 → (켜져 있으면) 뷰포트 크기 배지.
 */
export function drawComposition(
  ctx: Ctx,
  image: CanvasImageSource,
  comp: FrameComposition,
  source: FrameSize
): void {
  const { camera, background, badge } = comp
  const W = source.width
  const H = source.height

  // 배경.
  ctx.fillStyle = background.color
  ctx.fillRect(0, 0, W, H)

  // 패딩 인셋 — 짧은 변 대비 비율. 콘텐츠는 이 안쪽에 그린다.
  const pad = Math.min(W, H) * background.padding
  const dx = pad
  const dy = pad
  const dw = W - 2 * pad
  const dh = H - 2 * pad

  // 카메라가 지정한 원본 영역을 인셋 영역에 그린다.
  const viewW = W / camera.scale
  const viewH = H / camera.scale
  const sx = camera.x - viewW / 2
  const sy = camera.y - viewH / 2
  ctx.drawImage(image, sx, sy, viewW, viewH, dx, dy, dw, dh)

  // 뷰포트 크기 배지.
  if (badge.visible) drawBadge(ctx, badge.label, W, H)
}

/** 우하단에 뷰포트 크기 배지(둥근 알약)를 그린다. 크기는 프레임에 비례. */
function drawBadge(ctx: Ctx, label: string, W: number, H: number): void {
  const fontSize = Math.round(Math.min(W, H) * 0.028)
  const padX = fontSize * 0.7
  const padY = fontSize * 0.45
  const margin = fontSize

  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  const textW = ctx.measureText(label).width
  const boxW = textW + padX * 2
  const boxH = fontSize + padY * 2
  const boxX = W - margin - boxW
  const boxY = H - margin - boxH
  const radius = boxH / 2

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  roundRect(ctx, boxX, boxY, boxW, boxH, radius)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillText(label, boxX + padX, boxY + boxH / 2)
}

/** 둥근 사각형 경로. (구형 컨텍스트의 roundRect 미지원 대비) */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
