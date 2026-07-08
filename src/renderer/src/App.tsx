import { useEffect, useState } from 'react'
import type { RecordingState } from '../../shared/ipc'
import { IdleView } from './views/IdleView'
import { RecordingView } from './views/RecordingView'
import { PreviewView } from './views/PreviewView'
import { ErrorView } from './views/ErrorView'
import { OnboardingView } from './views/OnboardingView'

export default function App(): JSX.Element {
  // 온보딩 완료 여부. null은 조회 전(로딩) — 확정되기 전엔 아무 화면도 그리지 않는다.
  // 온보딩은 녹화 상태 머신(RecordingState)과 직교라 여기 최상단에서 감싼다.
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [state, setState] = useState<RecordingState>({ status: 'idle' })

  useEffect(() => window.recap.onStateChange(setState), [])
  useEffect(() => {
    void window.recap.onboardingStatus().then(setOnboarded)
  }, [])

  const goIdle = (): void => setState({ status: 'idle' })

  return (
    <main className="app">
      <h1 className="title">Recap</h1>
      {onboarded === false ? (
        // 완료 시 onboarded=true가 되고, state는 기본값 idle이라 그 자리에서 idle 화면으로 전환된다.
        <OnboardingView onComplete={() => setOnboarded(true)} />
      ) : onboarded === true ? (
        <>
          {state.status === 'idle' && <IdleView />}
          {state.status === 'recording' && <RecordingView state={state} />}
          {state.status === 'preview' && <PreviewView state={state} onExit={goIdle} />}
          {state.status === 'error' && <ErrorView state={state} onReset={goIdle} />}
        </>
      ) : null}
    </main>
  )
}
