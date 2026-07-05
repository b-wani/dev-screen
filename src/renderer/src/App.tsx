import { useEffect, useRef, useState } from 'react'
import type { CaptureTarget, RecordingState } from '../../shared/ipc'

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
      {state.status === 'error' && (
        <ErrorView state={state} onReset={() => setState({ status: 'idle' })} />
      )}
    </main>
  )
}

function IdleView(): JSX.Element {
  const [targets, setTargets] = useState<CaptureTarget[] | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadTargets = (): void => {
    setLoadError(null)
    setTargets(null)
    window.devScreen
      .listTargets()
      .then((list) => {
        setTargets(list)
        setSelectedId((prev) => (list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? '')))
      })
      .catch((err: Error) => setLoadError(err.message))
  }

  useEffect(loadTargets, [])

  if (loadError) {
    return (
      <section className="panel">
        <p className="hint">캡처 대상을 불러오지 못했습니다.</p>
        <p className="err-message">{loadError}</p>
        <button className="btn" onClick={loadTargets}>
          다시 불러오기
        </button>
      </section>
    )
  }

  if (targets === null) {
    return (
      <section className="panel">
        <p className="hint">캡처 대상을 불러오는 중…</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <p className="hint">녹화할 대상을 고르세요 (전체 화면 또는 특정 창).</p>
      <select
        className="target-select"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.kind === 'display' ? '🖥 ' : '🪟 '}
            {t.title} ({Math.round(t.width)}×{Math.round(t.height)})
          </option>
        ))}
      </select>
      <button
        className="btn btn-record"
        disabled={selectedId === ''}
        onClick={() => window.devScreen.start(selectedId)}
      >
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
      <p className="hint">
        {state.target.kind === 'display' ? '전체 화면' : '창'}: {state.target.title}
      </p>
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

  return (
    <section className="panel preview">
      <video
        ref={videoRef}
        className="video"
        src={state.videoUrl}
        controls
        autoPlay
        muted
      />
      <dl className="meta">
        <div>
          <dt>대상</dt>
          <dd>
            {state.target.kind === 'display' ? '전체 화면' : '창'} — {state.target.title} (
            {Math.round(state.target.width)}×{Math.round(state.target.height)})
          </dd>
        </div>
        <div>
          <dt>길이</dt>
          <dd>{formatElapsed(state.durationMs)}</dd>
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
      <button className="btn btn-record" onClick={() => window.devScreen.start(state.target.id)}>
        ● 같은 대상 다시 녹화
      </button>
    </section>
  )
}

function ErrorView({
  state,
  onReset
}: {
  state: Extract<RecordingState, { status: 'error' }>
  onReset: () => void
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
      <button className="btn" onClick={onReset}>
        대상 다시 고르기
      </button>
    </section>
  )
}
