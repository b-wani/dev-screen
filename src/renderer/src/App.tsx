import { useEffect, useRef, useState } from 'react'
import type { CaptureTarget, RecordingState, RecordingSummary } from '../../shared/ipc'
import {
  deriveRecipe,
  sampleComposition,
  ZOOM_DEFAULTS,
  type FrameSize,
  type RenderRecipe
} from '../../shared/recipe'
import {
  deleteZoomSegment,
  moveZoomSegment,
  resizeZoomSegment,
  setZoomSegmentScale,
  trimRecipe,
  trimmedDurationMs,
  type ZoomEdge
} from '../../shared/recipe.edit'
import { drawComposition } from './compose'
import { GITHUB_PRESET, exceedsSizeLimit, type ExportFormat } from '../../shared/export-preset'
import { renderRecipeToMp4, renderRecipeToGif } from './export'

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/** 익스포트 진행 상태. 미리보기 패널의 하단 액션을 이 상태만 보고 그린다. */
type ExportStatus =
  | { phase: 'idle' }
  | { phase: 'encoding'; format: ExportFormat; renderedFrames: number; totalFrames: number }
  | { phase: 'done'; format: ExportFormat; path: string; sizeBytes: number; exceedsLimit: boolean }
  | { phase: 'error'; message: string }

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
      {state.status === 'error' && <ErrorView state={state} onReset={goIdle} />}
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
  const [targets, setTargets] = useState<CaptureTarget[] | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecordingSummary[]>([])

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

  // 앱 시작 시 로컬에 저장된 최근 녹화를 불러온다 (재시작 후 다시 열기).
  useEffect(() => {
    window.devScreen.listRecordings().then(setRecent)
  }, [])

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

  const displays = targets.filter((t) => t.kind === 'display')
  const windows = targets.filter((t) => t.kind === 'window')

  return (
    <section className="panel">
      <p className="hint">녹화할 대상을 고르세요 (전체 화면 또는 특정 창).</p>
      <div className="picker">
        <TargetGroup
          title="화면"
          targets={displays}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <TargetGroup
          title="창"
          targets={windows}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <button
        className="btn btn-record"
        disabled={selectedId === ''}
        onClick={() => window.devScreen.start(selectedId)}
      >
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

/** 캡처 대상 그룹(화면/창) — 클릭 선택 카드 리스트. 대상이 없으면 그리지 않는다. */
function TargetGroup({
  title,
  targets,
  selectedId,
  onSelect
}: {
  title: string
  targets: CaptureTarget[]
  selectedId: string
  onSelect: (id: string) => void
}): JSX.Element | null {
  if (targets.length === 0) return null
  return (
    <div className="picker-group">
      <h2 className="picker-group-title">{title}</h2>
      <ul className="picker-list">
        {targets.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`target-card${t.id === selectedId ? ' is-selected' : ''}`}
              aria-pressed={t.id === selectedId}
              onClick={() => onSelect(t.id)}
            >
              <span className="target-card-icon" aria-hidden>
                {t.kind === 'display' ? '🖥' : '🪟'}
              </span>
              <span className="target-card-body">
                <span className="target-card-title">{t.title}</span>
                <span className="target-card-dim">
                  {Math.round(t.width)}×{Math.round(t.height)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
    <section className="panel recording">
      <div className="rec-indicator">
        <span className="rec-dot" aria-hidden />
        <span className="rec-label">녹화 중</span>
      </div>
      <span className="rec-time">{formatElapsed(now - state.startedAt)}</span>
      <p className="hint">
        {state.target.kind === 'display' ? '전체 화면' : '창'}: {state.target.title} · 마우스 이벤트{' '}
        {state.eventCount}개 기록됨
      </p>
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
  const [recipe, setRecipe] = useState<RenderRecipe | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus>({ phase: 'idle' })
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // RAF 루프·익스포트는 최신 레시피를 ref로 읽는다 — 편집(타임라인·배경/배지)이 다음 프레임에 즉시 반영된다.
  // 편집 상태는 그대로 녹화 폴더에 저장해 다시 열었을 때 복원되게 한다(이슈 #9 영속화).
  useEffect(() => {
    recipeRef.current = recipe
    if (recipe) void window.devScreen.saveRecipe(state.folder, recipe)
  }, [recipe, state.folder])

  // 영상 메타데이터가 오면(원본 크기 확정) 렌더 레시피를 확정한다.
  // 다시 연 녹화면 저장된 레시피(편집 상태)를 그대로 복원하고, 갓 끝난 녹화면
  // 이벤트 트랙에서 유도한다(저장은 위 useEffect가 담당한다).
  const handleMetadata = (): void => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    let next: RenderRecipe
    if (state.recipe) {
      next = state.recipe
    } else {
      const source: FrameSize = { width: video.videoWidth, height: video.videoHeight }
      // 배경/패딩·배지 기본값은 deriveRecipe가 레시피에 담아 준다(이슈 #8: 레시피에 저장).
      next = deriveRecipe(state.eventTrack, { source })
    }
    canvas.width = next.source.width
    canvas.height = next.source.height
    setRecipe(next)
  }

  // 재생 루프: 트림 창 안에서만 반복 재생하고, 매 프레임 합성 파라미터를 샘플링해 그대로 그린다.
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      const canvas = canvasRef.current
      const recipe = recipeRef.current
      if (!video || !canvas || !recipe) return
      const tMs = video.currentTime * 1000
      // 트림 앞뒤 밖으로 나가면 트림 시작으로 되감아 창 안만 재생한다.
      if (tMs < recipe.trim.startMs || tMs >= recipe.trim.endMs) {
        video.currentTime = recipe.trim.startMs / 1000
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // 카메라·커서·클릭·배경/패딩·배지를 한 번에 샘플링해 공용 그리기 함수로 그린다.
      const comp = sampleComposition(recipe, video.currentTime * 1000)
      drawComposition(ctx, video, comp, recipe.source)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // 익스포트: 미리보기와 동일한 레시피로 원본을 인코딩해 폴더에 저장한다(MP4/GIF 선택).
  const handleExport = async (format: ExportFormat): Promise<void> => {
    const video = videoRef.current
    const recipe = recipeRef.current
    if (!video || !recipe) return
    setExportStatus({ phase: 'encoding', format, renderedFrames: 0, totalFrames: 0 })
    try {
      const render = format === 'gif' ? renderRecipeToGif : renderRecipeToMp4
      const bytes = await render(video, recipe, GITHUB_PRESET, (p) =>
        setExportStatus({ phase: 'encoding', format, ...p })
      )
      const { path, sizeBytes } = await window.devScreen.saveExport(bytes, state.folder, format)
      setExportStatus({
        phase: 'done',
        format,
        path,
        sizeBytes,
        exceedsLimit: exceedsSizeLimit(GITHUB_PRESET, sizeBytes, format)
      })
    } catch (err) {
      setExportStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // 트림 반영 길이 (메타 바·사이드바에서 공유).
  const lengthMs = recipe ? trimmedDurationMs(recipe) : state.durationMs

  return (
    <section className="editor">
      <video
        ref={videoRef}
        src={state.videoUrl}
        onLoadedMetadata={handleMetadata}
        crossOrigin="anonymous"
        autoPlay
        muted
        playsInline
        style={{ display: 'none' }}
      />

      {/* 캔버스 위 얇은 메타 바 — 대상·길이 + 목록/재녹화 액션 */}
      <header className="editor-bar">
        <button className="btn btn-ghost btn-sm" onClick={onExit}>
          ← 목록
        </button>
        <div className="editor-bar-meta">
          <span>
            {state.target.kind === 'display' ? '전체 화면' : '창'} — {state.target.title} (
            {Math.round(state.target.width)}×{Math.round(state.target.height)})
          </span>
          <span className="dot-sep" aria-hidden>
            ·
          </span>
          <span className="len">{formatElapsed(lengthMs)}</span>
          {recipe && lengthMs !== state.durationMs && (
            <span className="meta-sub">(원본 {formatElapsed(state.durationMs)})</span>
          )}
        </div>
        <button className="btn btn-record btn-sm" onClick={() => window.devScreen.start(state.target.id)}>
          ● 같은 대상 다시 녹화
        </button>
      </header>

      <div className="editor-body">
        <div className="editor-main">
          <div className="canvas-wrap">
            <canvas ref={canvasRef} className="preview-canvas" />
          </div>
          {recipe && (
            <Timeline
              recipe={recipe}
              selected={selected}
              onSelect={setSelected}
              onChange={setRecipe}
            />
          )}
        </div>

        {sidebarOpen && recipe && (
          <aside className="editor-sidebar">
            {/* ① 줌 구간 — 선택된 구간이 있을 때만 배율 버튼 */}
            <fieldset className="side-section">
              <legend className="side-section-title">줌 구간</legend>
              {selected !== null && recipe.zoomSegments[selected] ? (
                <>
                  <p className="side-hint">구간 #{selected + 1} 배율</p>
                  <div className="scale-buttons">
                    {ZOOM_DEFAULTS.scales.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`btn btn-scale${recipe.zoomSegments[selected].scale === s ? ' is-active' : ''}`}
                        onClick={() => setRecipe((r) => (r ? setZoomSegmentScale(r, selected, s) : r))}
                      >
                        {s.toFixed(1)}x
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="side-hint">타임라인에서 줌 구간을 선택하면 배율을 조절할 수 있습니다.</p>
              )}
            </fieldset>

            {/* ② 배경 / 패딩 */}
            <fieldset className="side-section">
              <legend className="side-section-title">배경 / 패딩</legend>
              <label className="control control-row">
                <span>배경색</span>
                <input
                  type="color"
                  value={recipe.background.color}
                  onChange={(e) =>
                    setRecipe((r) =>
                      r ? { ...r, background: { ...r.background, color: e.target.value } } : r
                    )
                  }
                />
              </label>
              <label className="control">
                <span className="control-row">
                  <span>패딩</span>
                  <span className="control-value">{Math.round(recipe.background.padding * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={0.4}
                  step={0.01}
                  value={recipe.background.padding}
                  onChange={(e) =>
                    setRecipe((r) =>
                      r
                        ? { ...r, background: { ...r.background, padding: Number(e.target.value) } }
                        : r
                    )
                  }
                />
              </label>
            </fieldset>

            {/* ③ 배지 · 키 입력 오버레이 */}
            <fieldset className="side-section">
              <legend className="side-section-title">배지 · 키 입력</legend>
              <label className="control control-check">
                <input
                  type="checkbox"
                  checked={recipe.badge.visible}
                  onChange={(e) =>
                    setRecipe((r) =>
                      r ? { ...r, badge: { ...r.badge, visible: e.target.checked } } : r
                    )
                  }
                />
                <span>뷰포트 크기 배지</span>
              </label>
              <label className="control">
                <span>맥락 (브랜치/커밋)</span>
                <input
                  type="text"
                  className="control-text"
                  placeholder="예: feat/v2-overlay @ 61e6fd6"
                  value={recipe.badge.contextLabel}
                  onChange={(e) =>
                    setRecipe((r) =>
                      r ? { ...r, badge: { ...r.badge, contextLabel: e.target.value } } : r
                    )
                  }
                />
              </label>
              <label className="control control-check">
                <input
                  type="checkbox"
                  checked={recipe.keystrokes.overlayVisible}
                  onChange={(e) =>
                    setRecipe((r) =>
                      r
                        ? { ...r, keystrokes: { ...r.keystrokes, overlayVisible: e.target.checked } }
                        : r
                    )
                  }
                />
                <span>키 입력 오버레이</span>
              </label>
            </fieldset>

            {/* ④ 익스포트 */}
            <fieldset className="side-section">
              <legend className="side-section-title">익스포트</legend>
              <ExportPanel status={exportStatus} onExport={handleExport} />
            </fieldset>

            {/* 메타 정보 (사이드바 하단) */}
            <dl className="meta">
              <div>
                <dt>자동 줌</dt>
                <dd>{recipe.zoomSegments.length}개 구간 (클릭에서 자동 생성)</dd>
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
          </aside>
        )}

        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
          aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
        >
          {sidebarOpen ? '›' : '‹'}
        </button>
      </div>
    </section>
  )
}

/** 포맷별 용량 제한 안내 문구 (경고에 쓴다). */
function limitLabel(format: ExportFormat): string {
  return format === 'gif' ? 'GitHub 10MB(이미지) 제한' : 'GitHub 100MB 제한'
}

/** 익스포트 액션(MP4/GIF 선택) + 완료 후 Finder 열기·경로 복사·용량 경고 (AC1·2·3·4). */
function ExportPanel({
  status,
  onExport
}: {
  status: ExportStatus
  onExport: (format: ExportFormat) => void
}): JSX.Element {
  if (status.phase === 'encoding') {
    const pct =
      status.totalFrames > 0 ? Math.round((status.renderedFrames / status.totalFrames) * 100) : 0
    return (
      <div className="export-progress">
        <div className="export-progress-head">
          <span>{status.format.toUpperCase()} 익스포트 중…</span>
          <span>{pct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  if (status.phase === 'done') {
    return (
      <div className="export-done">
        <div className="export-done-head">
          <span>{status.format.toUpperCase()} 저장 완료</span>
          <span className="export-done-size">{formatMB(status.sizeBytes)}</span>
        </div>
        {status.exceedsLimit && (
          <p className="export-warn">⚠ {limitLabel(status.format)}을 초과했습니다</p>
        )}
        <div className="export-actions">
          <button className="btn btn-sm" onClick={() => window.devScreen.revealExport(status.path)}>
            Finder에서 열기
          </button>
          <button className="btn btn-sm" onClick={() => window.devScreen.copyExportPath(status.path)}>
            경로 복사
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="export-done">
      {status.phase === 'error' && <p className="export-warn">익스포트 실패: {status.message}</p>}
      <div className="export-buttons">
        <button className="btn btn-export" onClick={() => onExport('mp4')}>
          MP4
        </button>
        <button className="btn btn-export" onClick={() => onExport('gif')}>
          GIF
        </button>
      </div>
    </div>
  )
}

/**
 * 편집 타임라인 — 경량 편집의 전부를 담는 얇은 UI 층.
 *
 * 사용자 조작(줌 구간 삭제/이동/길이 조절, 앞뒤 트리밍)을 recipe.edit의 변환 함수
 * 호출로 옮기고, 그 결과 레시피를 onChange로 올린다. 편집 규칙과 경계 처리는 전부
 * 변환 함수 안에 있으므로 여기서는 픽셀↔ms 환산과 드래그 배선만 한다.
 *
 * 컷 편집(중간 잘라내기)·속도 조절·자막은 여기에 컨트롤이 없다(SPEC 범위 제외).
 */
function Timeline({
  recipe,
  selected,
  onSelect,
  onChange
}: {
  recipe: RenderRecipe
  selected: number | null
  onSelect: (index: number | null) => void
  onChange: (recipe: RenderRecipe) => void
}): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const { durationMs, trim, zoomSegments } = recipe
  const pct = (ms: number): string => `${(ms / durationMs) * 100}%`

  // 드래그 시작 시점의 레시피를 스냅샷으로 잡고, 이동량(ms)을 변환 함수에 넘긴다.
  const onTrimDrag = (edge: 'startMs' | 'endMs') => (e: React.PointerEvent): void => {
    const snap = recipe
    const baseMs = edge === 'startMs' ? snap.trim.startMs : snap.trim.endMs
    beginDrag(e, trackRef.current, durationMs, (deltaMs) => {
      onChange(trimRecipe(snap, { [edge]: baseMs + deltaMs }))
    })
  }

  const onSegmentMove = (index: number) => (e: React.PointerEvent): void => {
    onSelect(index)
    const snap = recipe
    beginDrag(e, trackRef.current, durationMs, (deltaMs) => {
      onChange(moveZoomSegment(snap, index, deltaMs))
    })
  }

  const onSegmentResize =
    (index: number, edge: ZoomEdge) =>
    (e: React.PointerEvent): void => {
      onSelect(index)
      const snap = recipe
      beginDrag(e, trackRef.current, durationMs, (deltaMs) => {
        onChange(resizeZoomSegment(snap, index, edge, deltaMs))
      })
    }

  const onDelete = (index: number) => (): void => {
    onChange(deleteZoomSegment(recipe, index))
    onSelect(null)
  }

  return (
    <div className="timeline">
      <div
        ref={trackRef}
        className="tl-track"
        onPointerDown={() => onSelect(null)}
      >
        {/* 트림 창 밖(앞/뒤)은 어둡게 — 최종 영상에서 제외되는 구간. */}
        <div className="tl-trimmed" style={{ left: 0, width: pct(trim.startMs) }} />
        <div
          className="tl-trimmed"
          style={{ left: pct(trim.endMs), width: pct(durationMs - trim.endMs) }}
        />

        {zoomSegments.map((seg, i) => (
          <div
            key={i}
            className={`tl-seg${selected === i ? ' is-selected' : ''}`}
            style={{ left: pct(seg.startMs), width: pct(seg.endMs - seg.startMs) }}
            onPointerDown={onSegmentMove(i)}
            title="드래그로 이동 · 가장자리로 길이 조절"
          >
            <span
              className="tl-seg-edge tl-seg-edge-start"
              onPointerDown={onSegmentResize(i, 'start')}
            />
            <span className="tl-seg-label">🔍 {(seg.endMs - seg.startMs) / 1000}s</span>
            <span
              className="tl-seg-edge tl-seg-edge-end"
              onPointerDown={onSegmentResize(i, 'end')}
            />
            {selected === i && (
              <button
                className="tl-seg-del"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onDelete(i)}
                title="줌 구간 삭제"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {/* 트림 핸들 — 앞뒤로 끌어 최종 영상 범위를 정한다. */}
        <span
          className="tl-trim-handle tl-trim-start"
          style={{ left: pct(trim.startMs) }}
          onPointerDown={onTrimDrag('startMs')}
          title="앞 트리밍"
        />
        <span
          className="tl-trim-handle tl-trim-end"
          style={{ left: pct(trim.endMs) }}
          onPointerDown={onTrimDrag('endMs')}
          title="뒤 트리밍"
        />
      </div>
      <p className="tl-help">
        줌 구간을 끌어 이동 · 가장자리로 길이 조절 · 선택 후 ×로 삭제 · 양끝 핸들로 앞뒤
        트리밍
      </p>
    </div>
  )
}

/**
 * 포인터 드래그 배선 — 드래그 시작점 대비 이동 픽셀을 트랙 폭 기준 ms로 환산해
 * onDelta에 흘린다. 이벤트 전파를 막아 상위(트랙 클릭=선택 해제)와 겹치지 않게 한다.
 */
function beginDrag(
  e: React.PointerEvent,
  trackEl: HTMLElement | null,
  durationMs: number,
  onDelta: (deltaMs: number) => void
): void {
  if (!trackEl) return
  e.preventDefault()
  e.stopPropagation()
  const startX = e.clientX
  const msPerPx = durationMs / trackEl.getBoundingClientRect().width
  const move = (ev: PointerEvent): void => onDelta((ev.clientX - startX) * msPerPx)
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
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
