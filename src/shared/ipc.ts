/** 본체 ↔ 렌더러 IPC 계약. 채널 이름과 상태 모양을 양쪽이 공유한다. */

import type { EventTrack } from './event-track'

export const IpcChannel = {
  Start: 'recording:start',
  Stop: 'recording:stop',
  State: 'recording:state',
  /** 익스포트 바이트를 녹화 폴더에 저장한다(포맷에 따라 export.mp4 / export.gif). */
  ExportSave: 'export:save',
  /** 저장된 파일을 Finder에서 연다. */
  ExportReveal: 'export:reveal',
  /** 저장된 파일 경로를 클립보드에 복사한다. */
  ExportCopyPath: 'export:copy-path'
} as const

/** 익스포트 저장 결과 — 렌더러가 완료 UI(경로·용량·경고)를 그리는 데 쓴다. */
export interface ExportSaveResult {
  /** 저장된 파일 절대 경로. */
  path: string
  /** 저장된 파일 크기(bytes). 용량 상한 초과 판정에 쓴다. */
  sizeBytes: number
}

/** 녹화 워크플로의 상태 머신. 렌더러는 이 상태만 보고 화면을 그린다. */
export type RecordingState =
  | { status: 'idle' }
  | { status: 'recording'; startedAt: number; eventCount: number }
  | {
      status: 'preview'
      /** 원본 미리보기 재생용 URL (devscreen-media 프로토콜). */
      videoUrl: string
      folder: string
      durationMs: number
      eventCount: number
      /** 자동 효과(줌 구간) 유도의 입력. 렌더러가 이걸로 렌더 레시피를 만든다. */
      eventTrack: EventTrack
    }
  | { status: 'error'; code: string; message: string }
