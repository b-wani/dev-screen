/** 라이브러리 표시 제목 결정 — manifest `title` 필드 신설(#79)에 따른 순수 폴백 로직.
 * 기존 녹화(마이그레이션 전)는 title이 없어 폴더 이름(timestamp)이 라벨이 된다. */

/** manifest의 `title`이 있으면 그걸, 없거나 공백뿐이면 폴더 이름을 표시 제목으로 쓴다. */
export function resolveTitle(title: string | undefined, folderName: string): string {
  const trimmed = title?.trim()
  return trimmed ? trimmed : folderName
}
