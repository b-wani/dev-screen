#!/bin/zsh
# PROTOTYPE — throwaway. Ticket #121: 품질↔용량 프로파일 매트릭스.
# 화면 녹화의 용량 지배 요인(안티앨리어싱된 코드 텍스트 + UI 패널)을 재현한
# "다크 에디터" 씬 PNG를 만든다. 실제 사용자 화면을 캡처하지 않아 프라이버시 안전 + 재현 가능.
set -e
OUT="${1:-scene.png}"
FONT="/System/Library/Fonts/Monaco.ttf"
W=2400; H=1500

# 코드 유사 텍스트 라인 (구문 색 흉내를 위해 색을 번갈아 씀)
CODE=(
  "import { GIFEncoder, quantize } from gifenc|0xcba6f7"
  "// per-frame local palette keeps screencast text crisp|0x6c7086"
  "export function renderRecipeToGif(video, recipe) {|0x89b4fa"
  "  const config = resolveGifConfig(preset, source)|0xcdd6f4"
  "  const encoder = GIFEncoder()|0xcdd6f4"
  "  const frameDelayMs = 1000 / config.fps  // 50fps -> 20ms|0xa6e3a1"
  "  for (let i = 0; i < totalFrames; i++) {|0x89b4fa"
  "    const { data } = ctx.getImageData(0, 0, w, h)|0xcdd6f4"
  "    const palette = quantize(data, config.maxColors)|0xfab387"
  "    const index = applyPalette(data, palette)|0xfab387"
  "    encoder.writeFrame(index, w, h, { palette, delay })|0xcdd6f4"
  "  }|0x89b4fa"
  "  return encoder.bytes()  // high-fps GIF export|0xf38ba8"
  "}|0x89b4fa"
)

FILTER="color=c=0x1e1e2e:s=${W}x${H}[bg];"
# 타이틀바 + 사이드바
FILTER+="[bg]drawbox=x=0:y=0:w=${W}:h=72:color=0x313244:t=fill,"
FILTER+="drawbox=x=0:y=72:w=380:h=${H}:color=0x181825:t=fill,"
# 사이드바 파일트리 흉내 (회색 막대들)
for i in $(seq 0 9); do
  y=$((120 + i*70))
  FILTER+="drawbox=x=60:y=${y}:w=$((180 + (i*37)%120)):h=22:color=0x45475a:t=fill,"
done
# 코드 라인들
i=0
for entry in "${CODE[@]}"; do
  txt="${entry%%|*}"
  col="${entry##*|}"
  y=$((130 + i*92))
  # ':' 와 특수문자 이스케이프
  esc="${txt//\\/\\\\}"; esc="${esc//:/\\:}"; esc="${esc//\'/\\\'}"
  FILTER+="drawtext=fontfile=${FONT}:text='${esc}':x=440:y=${y}:fontsize=44:fontcolor=${col},"
  i=$((i+1))
done
# 커서 캐럿
FILTER+="drawbox=x=1180:y=1330:w=6:h=52:color=0xf5e0dc:t=fill"

ffmpeg -y -f lavfi -i "${FILTER}" -frames:v 1 "${OUT}" 2>/tmp/scene-ffmpeg.log && echo "scene -> ${OUT}" || { tail -20 /tmp/scene-ffmpeg.log; exit 1; }
