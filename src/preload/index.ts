import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type RecordingState } from '../shared/ipc'

/** 렌더러에 노출되는 안전한 API 표면. */
const api = {
  start: (): Promise<void> => ipcRenderer.invoke(IpcChannel.Start),
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
