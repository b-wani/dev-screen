import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type RecordingState, type RecordingSummary } from '../shared/ipc'
import type { RenderRecipe } from '../shared/recipe'

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
  /** 유도·편집한 렌더 레시피를 녹화 폴더에 저장한다. */
  saveRecipe: (folder: string, recipe: RenderRecipe): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.SaveRecipe, folder, recipe),
  /** 로컬에 저장된 최근 녹화 목록을 최신순으로 가져온다. */
  listRecordings: (): Promise<RecordingSummary[]> => ipcRenderer.invoke(IpcChannel.ListRecordings),
  /** 저장된 녹화를 다시 연다. 결과는 onStateChange로 미리보기 상태가 온다. */
  openRecording: (folder: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannel.OpenRecording, folder)
}

contextBridge.exposeInMainWorld('devScreen', api)

export type DevScreenApi = typeof api
