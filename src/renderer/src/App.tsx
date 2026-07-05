import { useEffect, useRef, useState } from 'react'
import type { RecordingState } from '../../shared/ipc'
import {
  deriveRecipe,
  sampleComposition,
  COMPOSITE_DEFAULTS,
  type FrameSize,
  type RenderRecipe
} from '../../shared/recipe'
import { drawComposition } from './compose'

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function App(): JSX.Element {
  const [state, setState] = useState<RecordingState>({ status: 'idle' })

  useEffect(() => window.devScreen.onStateChange(setState), [])

  return (
    <main className="app">
      <h1 className="title">dev-screen</h1>
      {state.status === 'idle' && <IdleView />}
      {state.status === 'recording' && <RecordingView state={state} />}
      {state.status === 'preview' && <PreviewView state={state} />}
      {state.status === 'error' && <ErrorView state={state} />}
    </main>
  )
}

function IdleView(): JSX.Element {
  return (
    <section className="panel">
      <p className="hint">전체 화면 녹화를 시작합니다.</p>
      <button className="btn btn-record" onClick={() => window.devScreen.start()}>
        ● 녹화 시작
      </button>
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
  state
}: {
  state: Extract<RecordingState, { status: 'preview' }>
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recipeRef = useRef<RenderRecipe | null>(null)
  const [zoomCount, setZoomCount] = useState(0)

  // 배경/패딩·배지 편집 상태 — 렌더 레시피의 해당 필드에 그대로 반영된다.
  const [bgColor, setBgColor] = useState<string>(COMPOSITE_DEFAULTS.backgroundColor)
  const [padding, setPadding] = useState<number>(COMPOSITE_DEFAULTS.padding)
  const [badgeVisible, setBadgeVisible] = useState<boolean>(COMPOSITE_DEFAULTS.badgeVisible)

  // 컨트롤이 바뀌면 살아 있는 레시피에 밀어 넣는다. 재생 루프가 매 프레임 레시피를
  // 다시 읽으므로 미리보기에 즉시 반영된다(AC: 즉시 반영).
  useEffect(() => {
    const recipe = recipeRef.current
    if (!recipe) return
    recipe.background = { color: bgColor, padding }
    recipe.badge = { visible: badgeVisible }
  }, [bgColor, padding, badgeVisible])

  // 영상 메타데이터가 오면(원본 크기 확정) 이벤트 트랙에서 렌더 레시피를 유도한다.
  const handleMetadata = (): void => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const source: FrameSize = { width: video.videoWidth, height: video.videoHeight }
    canvas.width = source.width
    canvas.height = source.height
    const recipe = deriveRecipe(state.eventTrack, { source })
    // 현재 편집 상태를 레시피에 반영해 둔다.
    recipe.background = { color: bgColor, padding }
    recipe.badge = { visible: badgeVisible }
    recipeRef.current = recipe
    setZoomCount(recipe.zoomSegments.length)
  }

  // 재생 루프: 매 프레임 합성 파라미터를 샘플링해 그대로 그린다.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      const canvas = canvasRef.current
      const recipe = recipeRef.current
      if (!video || !canvas || !recipe) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const comp = sampleComposition(recipe, video.currentTime * 1000)
      drawComposition(ctx, video, comp, recipe.source)
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
      <fieldset className="controls">
        <legend>배경 / 배지</legend>
        <label className="control">
          <span>배경색</span>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
          />
        </label>
        <label className="control">
          <span>패딩 {Math.round(padding * 100)}%</span>
          <input
            type="range"
            min={0}
            max={0.4}
            step={0.01}
            value={padding}
            onChange={(e) => setPadding(Number(e.target.value))}
          />
        </label>
        <label className="control control-check">
          <input
            type="checkbox"
            checked={badgeVisible}
            onChange={(e) => setBadgeVisible(e.target.checked)}
          />
          <span>뷰포트 크기 배지</span>
        </label>
      </fieldset>
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
      <button className="btn btn-record" onClick={() => window.devScreen.start()}>
        ● 다시 녹화
      </button>
    </section>
  )
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
