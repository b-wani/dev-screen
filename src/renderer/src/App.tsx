import { useEffect, useRef, useState } from 'react'
import type { RecordingState, RecordingSummary } from '../../shared/ipc'
import {
  deriveRecipe,
  sampleRecipe,
  type CameraTransform,
  type FrameSize,
  type RenderRecipe
} from '../../shared/recipe'

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function App(): JSX.Element {
  const [state, setState] = useState<RecordingState>({ status: 'idle' })

  useEffect(() => window.devScreen.onStateChange(setState), [])

  const goIdle = (): void => setState({ status: 'idle' })

  return (
    <main className="app">
      <h1 className="title">dev-screen</h1>
      {state.status === 'idle' && <IdleView />}
      {state.status === 'recording' && <RecordingView state={state} />}
      {state.status === 'preview' && <PreviewView state={state} onExit={goIdle} />}
      {state.status === 'error' && <ErrorView state={state} />}
    </main>
  )
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function IdleView(): JSX.Element {
  const [recent, setRecent] = useState<RecordingSummary[]>([])

  // 앱 시작 시 로컬에 저장된 최근 녹화를 불러온다 (재시작 후 다시 열기).
  useEffect(() => {
    window.devScreen.listRecordings().then(setRecent)
  }, [])

  return (
    <section className="panel">
      <p className="hint">전체 화면 녹화를 시작합니다.</p>
      <button className="btn btn-record" onClick={() => window.devScreen.start()}>
        ● 녹화 시작
      </button>
      {recent.length > 0 && (
        <div className="recent">
          <h2 className="recent-title">최근 녹화</h2>
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.folder}>
                <button className="recent-item" onClick={() => window.devScreen.openRecording(r.folder)}>
                  <span className="recent-name">{formatDate(r.startedAt)}</span>
                  <span className="recent-meta">
                    {formatElapsed(r.durationMs)} · 이벤트 {r.eventCount}개
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function RecordingView({
  state
}: {
  state: Extract<RecordingState, { status: 'recording' }>
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="panel">
      <div className="rec-indicator">
        <span className="rec-dot" aria-hidden />
        <span className="rec-label">녹화 중</span>
        <span className="rec-time">{formatElapsed(now - state.startedAt)}</span>
      </div>
      <p className="hint">마우스 이벤트 {state.eventCount}개 기록됨</p>
      <button className="btn btn-stop" onClick={() => window.devScreen.stop()}>
        ■ 정지
      </button>
    </section>
  )
}

function PreviewView({
  state,
  onExit
}: {
  state: Extract<RecordingState, { status: 'preview' }>
  onExit: () => void
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recipeRef = useRef<RenderRecipe | null>(null)
  const [zoomCount, setZoomCount] = useState(0)

  // 영상 메타데이터가 오면(원본 크기 확정) 렌더 레시피를 확정한다.
  // 다시 연 녹화면 저장된 레시피(편집 상태)를 그대로 복원하고, 갓 끝난 녹화면
  // 이벤트 트랙에서 유도한 뒤 폴더에 저장한다.
  const handleMetadata = (): void => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    let recipe: RenderRecipe
    if (state.recipe) {
      recipe = state.recipe
    } else {
      const source: FrameSize = { width: video.videoWidth, height: video.videoHeight }
      recipe = deriveRecipe(state.eventTrack, { source })
      void window.devScreen.saveRecipe(state.folder, recipe)
    }
    canvas.width = recipe.source.width
    canvas.height = recipe.source.height
    recipeRef.current = recipe
    setZoomCount(recipe.zoomSegments.length)
  }

  // 재생 루프: 매 프레임 현재 시각을 샘플링해 카메라 변환을 얻고, 그대로 그린다.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      const canvas = canvasRef.current
      const recipe = recipeRef.current
      if (!video || !canvas || !recipe) return
      const camera = sampleRecipe(recipe, video.currentTime * 1000)
      drawSampledFrame(canvas, video, camera, recipe.source)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section className="panel preview">
      <video
        ref={videoRef}
        src={state.videoUrl}
        onLoadedMetadata={handleMetadata}
        autoPlay
        muted
        loop
        playsInline
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} className="preview-canvas" />
      <dl className="meta">
        <div>
          <dt>길이</dt>
          <dd>{formatElapsed(state.durationMs)}</dd>
        </div>
        <div>
          <dt>자동 줌</dt>
          <dd>{zoomCount}개 구간 (클릭에서 자동 생성)</dd>
        </div>
        <div>
          <dt>이벤트 트랙</dt>
          <dd>{state.eventCount}개 이벤트 (events.json 분리 저장)</dd>
        </div>
        <div>
          <dt>폴더</dt>
          <dd className="path">{state.folder}</dd>
        </div>
      </dl>
      <div className="preview-actions">
        <button className="btn" onClick={onExit}>
          ← 목록
        </button>
        <button className="btn btn-record" onClick={() => window.devScreen.start()}>
          ● 다시 녹화
        </button>
      </div>
    </section>
  )
}

/**
 * 미리보기 렌더링 층 — 효과 계산을 하지 않는다. 샘플링된 카메라 변환(camera)이
 * 지정한 원본 영역을 캔버스에 그리기만 한다.
 */
function drawSampledFrame(
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

function ErrorView({
  state
}: {
  state: Extract<RecordingState, { status: 'error' }>
}): JSX.Element {
  const isPermission = state.code === 'permission-denied'
  return (
    <section className="panel error">
      <h2>{isPermission ? '화면 녹화 권한이 필요합니다' : '녹화에 실패했습니다'}</h2>
      <p className="err-message">{state.message}</p>
      {isPermission && (
        <ol className="steps">
          <li>시스템 설정 → 개인정보 보호 및 보안 → 화면 기록을 엽니다.</li>
          <li>목록에서 dev-screen을 켭니다.</li>
          <li>앱을 다시 실행한 뒤 아래 버튼으로 재시도합니다.</li>
        </ol>
      )}
      <button className="btn" onClick={() => window.devScreen.start()}>
        다시 시도
      </button>
    </section>
  )
}
