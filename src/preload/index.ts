import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type RecordingState, type ExportSaveResult } from '../shared/ipc'

/** 렌더러에 노출되는 안전한 API 표면. */
const api = {
  start: (): Promise<void> => ipcRenderer.invoke(IpcChannel.Start),
  stop: (): Promise<void> => ipcRenderer.invoke(IpcChannel.Stop),
  /** 녹화 상태 변화를 구독한다. 해제 함수를 반환한다. */
  onStateChange: (cb: (state: RecordingState) => void): (() => void) => {
    const listener = (_e: unknown, state: RecordingState): void => cb(state)
    ipcRenderer.on(IpcChannel.State, listener)
    return () => ipcRenderer.removeListener(IpcChannel.State, listener)
  },
  /** 익스포트된 MP4 바이트를 녹화 폴더에 저장하고 경로·용량을 돌려받는다. */
  saveExport: (bytes: ArrayBuffer, folder: string): Promise<ExportSaveResult> =>
    ipcRenderer.invoke(IpcChannel.ExportSave, bytes, folder),
  /** 저장된 파일을 Finder에서 연다. */
  revealExport: (path: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.ExportReveal, path),
  /** 저장된 파일 경로를 클립보드에 복사한다. */
  copyExportPath: (path: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.ExportCopyPath, path)
}

contextBridge.exposeInMainWorld('devScreen', api)

export type DevScreenApi = typeof api
