# 사이드카 프로토콜 (v1)

Swift 캡처 사이드카(`devscreen-capture`)와 Electron 본체 사이의 계약. [ADR 0001](./adr/0001-electron-with-swift-capture-sidecar.md)에 따라 사이드카는 "한 번 만들면 안 건드리는" 층이며, 이 계약은 그 경계를 명시적으로 고정한다. 효과 로직은 이 경계 어디에도 없다 — 사이드카는 **원본 영상 기록**과 **마우스 이벤트 스트리밍**만 한다.

계약의 코드 표현:

- 본체(소비자): [`src/main/sidecar/protocol.ts`](../src/main/sidecar/protocol.ts) — 타입·파서·접기 함수, 계약 테스트(`protocol.test.ts`)로 검증.
- 사이드카(생산자): [`src/sidecar/Sources/devscreen-capture/Protocol.swift`](../src/sidecar/Sources/devscreen-capture/Protocol.swift).

두 구현은 아래 스키마를 공유하며, `protocolVersion`이 어긋나면 본체가 세션을 거부한다.

## 실행 · 전송

```
devscreen-capture record --out <녹화 폴더>
```

- **본체 → 사이드카**: 명령을 사이드카 **stdin**에 한 줄씩 쓴다.
  - `stop` — 녹화 정지. 사이드카는 원본 파일을 마무리하고 `stopped`를 보낸 뒤 종료한다.
  - stdin이 닫히거나 `SIGTERM`을 받아도 정지로 간주한다 (조용히 죽지 않는다).
- **사이드카 → 본체**: **stdout**에 newline-delimited JSON(JSONL). 한 줄에 메시지 하나.
  - stdout은 이벤트 스트림 전용이다. 로그·경고는 stderr로만 나간다.

## 메시지 (사이드카 → 본체)

세션은 항상 `ready`로 시작해 `stopped`로 끝난다. 실패 시 `error` 하나만 나오고 종료한다.

### `ready`

준비 완료, 원본 기록 시작. 스트림의 첫 메시지.

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `"ready"` | |
| `protocolVersion` | number | 계약 버전 (현재 `1`) |
| `rawVideoPath` | string | 원본 영상이 기록될 절대 경로 |
| `startedAt` | number | 녹화 시작 시점 (Unix epoch ms). 이후 `event.t`의 기준점 |

### `event`

마우스 이벤트 하나 — 이벤트 트랙의 원소. 스크롤·호버는 기록하지 않는다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `"event"` | |
| `kind` | `"move" \| "down" \| "up"` | |
| `t` | number | `startedAt`으로부터 경과 시간 (ms) |
| `x`, `y` | number | 원본 좌표계 위치 (좌상단 원점, 포인트) |
| `cursor` | `"arrow" \| "pointer" \| "ibeam"` | 커서 모양 (스켈레톤은 `arrow` 고정) |

### `stopped`

정상 종료, 원본 파일 기록 완료. 스트림의 마지막 메시지.

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `"stopped"` | |
| `rawVideoPath` | string | 원본 영상 최종 경로 (`ready`와 동일) |
| `durationMs` | number | 녹화 길이 (ms) |
| `eventCount` | number | 스트리밍한 이벤트 총 개수 (본체 집계와 대조) |

### `error`

복구 불가능한 오류. 녹화는 조용히 실패하지 않는다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `"error"` | |
| `code` | `"permission-denied" \| "no-display" \| "capture-failed"` | |
| `message` | string | 사람이 읽을 설명 |

## 본체의 소비 방식

본체는 스트림 전체를 접어(`foldSidecarMessages`) 두 산출물로 **분리**한다:

- **녹화 참조** `{ rawVideoPath, startedAt, durationMs }` — 원본 영상 파일을 가리킨다.
- **이벤트 트랙** `{ protocolVersion, startedAt, durationMs, samples[] }` — `events.json`으로 원본과 분리 저장되며, 이후 슬라이스에서 자동 효과(줌 구간) 유도의 입력이 된다.

`error`가 있으면 접기는 실패 결과를 반환하고, 본체는 사용자에게 안내를 표시한다.
