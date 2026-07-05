import AppKit

/// 전역 마우스 이벤트(이동·클릭)를 관찰해 이벤트 트랙 메시지로 흘린다.
/// 좌표는 좌상단 원점(원본 영상과 같은 방향)으로 변환한다.
/// 키보드가 아닌 마우스 관찰이므로 손쉬운 사용(Accessibility) 권한이 필요 없다.
final class MouseTracker {
    private var monitor: Any?
    private let startedAt: TimeInterval
    private let onEvent: (_ kind: String, _ t: Int, _ x: Double, _ y: Double, _ cursor: String) -> Void

    /// 좌상단 원점 변환에 쓰는 전체 데스크톱 높이(포인트).
    private let flipHeight: CGFloat

    init(startedAt: TimeInterval,
         onEvent: @escaping (_ kind: String, _ t: Int, _ x: Double, _ y: Double, _ cursor: String) -> Void) {
        self.startedAt = startedAt
        self.onEvent = onEvent
        self.flipHeight = NSScreen.screens.map { $0.frame.maxY }.max() ?? 0
    }

    func start() {
        let mask: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDown, .leftMouseUp,
                                           .leftMouseDragged, .rightMouseDown, .rightMouseUp]
        monitor = NSEvent.addGlobalMonitorForEvents(matching: mask) { [weak self] event in
            self?.handle(event)
        }
    }

    func stop() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    private func handle(_ event: NSEvent) {
        let kind: String
        switch event.type {
        case .leftMouseDown, .rightMouseDown: kind = "down"
        case .leftMouseUp, .rightMouseUp: kind = "up"
        default: kind = "move"
        }
        // NSEvent.mouseLocation은 좌하단 원점. 원본 영상 좌표계(좌상단)로 뒤집는다.
        let loc = NSEvent.mouseLocation
        let x = loc.x
        let y = flipHeight - loc.y
        let t = Int((Date().timeIntervalSince1970 - startedAt) * 1000)
        // 커서 모양 재현은 효과 층의 관심사이며 전역 시스템 커서 종류를 신뢰성 있게
        // 읽는 API가 없다. 스켈레톤은 arrow로 고정하고, 트랙 스키마는 3종을 담을 수 있게 둔다.
        onEvent(kind, max(0, t), Double(x), Double(y), "arrow")
    }
}
