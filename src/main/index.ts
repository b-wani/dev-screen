import { app, shell, clipboard, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { is } from '@electron-toolkit/utils'
import { Recorder } from './recorder'
import { IpcChannel, type RecordingState, type ExportSaveResult } from '../shared/ipc'

/** 원본 영상 파일을 렌더러 미리보기에 안전하게 공급하는 커스텀 스킴. */
const MEDIA_SCHEME = 'devscreen-media'

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }
])

let mainWindow: BrowserWindow | null = null

function sidecarPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'devscreen-capture')
    : join(app.getAppPath(), 'src/sidecar/.build/devscreen-capture')
}

/** 절대 경로를 미리보기용 devscreen-media URL로 만든다. */
function mediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://file/${encodeURIComponent(filePath)}`
}

const recorder = new Recorder(sidecarPath())

function sendState(state: RecordingState): void {
  mainWindow?.webContents.send(IpcChannel.State, state)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    show: false,
    title: 'dev-screen',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IpcChannel.Start, async () => {
    if (recorder.isRecording) return

    // 이벤트마다 상태를 밀면 마우스 이동에서 폭주하므로 카운트 갱신은 스로틀한다.
    let lastPush = 0
    let startedAt = 0

    await recorder.start({
      onReady: (info) => {
        startedAt = info.startedAt
        sendState({ status: 'recording', startedAt, eventCount: 0 })
      },
      onEvent: (count) => {
        const now = Date.now()
        if (now - lastPush < 400) return
        lastPush = now
        sendState({ status: 'recording', startedAt, eventCount: count })
      },
      onError: (code, message) => {
        sendState({ status: 'error', code, message })
      },
      onComplete: (result) => {
        sendState({
          status: 'preview',
          videoUrl: mediaUrl(result.videoPath),
          folder: result.folder,
          durationMs: result.durationMs,
          eventCount: result.eventCount,
          eventTrack: result.eventTrack
        })
      }
    })
  })

  ipcMain.handle(IpcChannel.Stop, () => {
    recorder.stop()
  })

  // 렌더러가 WebCodecs로 인코딩한 MP4 바이트를 녹화 폴더에 저장한다(export.mp4).
  ipcMain.handle(
    IpcChannel.ExportSave,
    async (_e, bytes: ArrayBuffer, folder: string): Promise<ExportSaveResult> => {
      const path = join(folder, 'export.mp4')
      const buffer = Buffer.from(bytes)
      await writeFile(path, buffer)
      return { path, sizeBytes: buffer.byteLength }
    }
  )

  ipcMain.handle(IpcChannel.ExportReveal, (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IpcChannel.ExportCopyPath, (_e, path: string) => {
    clipboard.writeText(path)
  })
}

app.whenReady().then(() => {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''))
    // 원본 요청(메서드·Range 헤더)을 그대로 파일 URL로 넘겨 시크(range)를 지원한다.
    const res = await net.fetch(pathToFileURL(filePath).toString(), {
      method: request.method,
      headers: request.headers
    })
    // 커스텀 스킴은 렌더러와 교차 출처라, 익스포트 시 캔버스가 오염되지 않도록 CORS를 연다.
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
