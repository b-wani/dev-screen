/** 본체 ↔ 렌더러 IPC 계약. 채널 이름과 상태 모양을 양쪽이 공유한다. */

import type { CaptureTarget } from '../main/sidecar/protocol'

export type { CaptureTarget }

export const IpcChannel = {
  /** 선택 가능한 캡처 대상(전체 화면 + 열린 창) 목록을 조회한다. */
  ListTargets: 'recording:list-targets',
  Start: 'recording:start',
  Stop: 'recording:stop',
  State: 'recording:state'
} as const

/** 녹화 워크플로의 상태 머신. 렌더러는 이 상태만 보고 화면을 그린다. */
export type RecordingState =
  | { status: 'idle' }
  | { status: 'recording'; startedAt: number; eventCount: number; target: CaptureTarget }
  | {
      status: 'preview'
      /** 원본 미리보기 재생용 URL (devscreen-media 프로토콜). */
      videoUrl: string
      folder: string
      durationMs: number
      eventCount: number
      /** 녹화된 캡처 대상 (전체 화면 또는 특정 창). */
      target: CaptureTarget
    }
  | { status: 'error'; code: string; message: string }
