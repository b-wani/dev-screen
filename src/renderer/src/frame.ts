import type { CameraTransform, FrameSize } from '../../shared/recipe'

/**
 * 프레임 렌더링 층 — 효과 계산을 하지 않는다. 샘플링된 카메라 변환(camera)이 지정한
 * 원본 영역을 캔버스에 그리기만 한다. 미리보기와 익스포트가 이 함수를 공유하므로
 * "보이는 것과 내보내는 것이 같다"(SPEC 후처리 렌더링 모델).
 */
export function drawSampledFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  camera: CameraTransform,
  source: FrameSize
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const viewW = source.width / camera.scale
  const viewH = source.height / camera.scale
  const sx = camera.x - viewW / 2
  const sy = camera.y - viewH / 2
  ctx.drawImage(video, sx, sy, viewW, viewH, 0, 0, canvas.width, canvas.height)
}
