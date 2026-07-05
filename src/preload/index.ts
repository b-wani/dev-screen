import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type CaptureTarget, type RecordingState } from '../shared/ipc'

/** 렌더러에 노출되는 안전한 API 표면. */
const api = {
  /** 선택 가능한 캡처 대상(전체 화면 + 열린 창) 목록을 조회한다. */
  listTargets: (): Promise<CaptureTarget[]> => ipcRenderer.invoke(IpcChannel.ListTargets),
  /** 지정한 대상의 녹화를 시작한다. targetId는 listTargets가 준 CaptureTarget.id. */
  start: (targetId: string): Promise<void> => ipcRenderer.invoke(IpcChannel.Start, targetId),
  stop: (): Promise<void> => ipcRenderer.invoke(IpcChannel.Stop),
  /** 녹화 상태 변화를 구독한다. 해제 함수를 반환한다. */
  onStateChange: (cb: (state: RecordingState) => void): (() => void) => {
    const listener = (_e: unknown, state: RecordingState): void => cb(state)
    ipcRenderer.on(IpcChannel.State, listener)
    return () => ipcRenderer.removeListener(IpcChannel.State, listener)
  }
}

contextBridge.exposeInMainWorld('devScreen', api)

export type DevScreenApi = typeof api
