import AppKit
import Foundation

/// devscreen-capture — 전체 화면 원본을 기록하고 마우스 이벤트를 스트리밍하는 CLI 사이드카.
///
/// 사용법:  devscreen-capture record --out <녹화 폴더>
///   · stdout으로 프로토콜 메시지를 JSONL로 흘린다 (Protocol.swift, docs/sidecar-protocol.md).
///   · stdin에 "stop\n"이 오면 (또는 SIGTERM) 녹화를 마무리하고 종료한다.
///
/// 효과 로직은 여기 없다 — 원본 기록 + 이벤트 스트리밍만 (ADR 0001).

final class Session {
    let outputURL: URL
    let recorder: ScreenRecorder
    var tracker: MouseTracker?
    var eventCount = 0
    var stopping = false

    init(outDir: URL) {
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        self.outputURL = outDir.appendingPathComponent("raw.mp4")
        try? FileManager.default.removeItem(at: outputURL)
        self.recorder = ScreenRecorder(outputURL: outputURL)
    }

    func run() {
        recorder.start(onReady: { [weak self] in
            guard let self else { return }
            DispatchQueue.main.async { self.onReady() }
        }, onError: { code, message in
            Emitter.error(code: code, message: message)
            exit(1)
        })
    }

    private func onReady() {
        let startedAt = Date().timeIntervalSince1970
        let tracker = MouseTracker(startedAt: startedAt) { [weak self] kind, t, x, y, cursor in
            guard let self else { return }
            self.eventCount += 1
            Emitter.event(kind: kind, t: t, x: x, y: y, cursor: cursor)
        }
        tracker.start()
        self.tracker = tracker
        Emitter.ready(rawVideoPath: outputURL.path, startedAt: Int((startedAt * 1000).rounded()))
    }

    func stop() {
        guard !stopping else { return }
        stopping = true
        tracker?.stop()
        recorder.stop { [weak self] durationMs in
            guard let self else { exit(0) }
            Emitter.stopped(rawVideoPath: self.outputURL.path,
                            durationMs: durationMs,
                            eventCount: self.eventCount)
            exit(0)
        }
    }
}

// MARK: - 인자 파싱

func parseOutDir(_ args: [String]) -> URL? {
    guard args.count >= 2, args[1] == "record" else { return nil }
    var i = 2
    while i < args.count {
        if args[i] == "--out", i + 1 < args.count {
            return URL(fileURLWithPath: args[i + 1])
        }
        i += 1
    }
    return nil
}

guard let outDir = parseOutDir(CommandLine.arguments) else {
    FileHandle.standardError.write(Data("usage: devscreen-capture record --out <dir>\n".utf8))
    exit(64)
}

// 메뉴바 상주 도구의 자식이므로 Dock/활성화가 필요 없다.
NSApplication.shared.setActivationPolicy(.prohibited)

let session = Session(outDir: outDir)

// stdin에서 "stop" 명령을 기다린다.
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        if line == "stop" {
            DispatchQueue.main.async { session.stop() }
            break
        }
    }
    // stdin이 닫히면(부모 종료) 안전하게 마무리한다.
    DispatchQueue.main.async { session.stop() }
}

// SIGTERM에도 원본 파일을 마무리하고 종료한다.
signal(SIGTERM, SIG_IGN)
let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigterm.setEventHandler { session.stop() }
sigterm.resume()

session.run()
RunLoop.main.run()
