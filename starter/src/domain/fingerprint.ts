/**
 * 稳定指纹工具（FNV-1a 32bit）。
 * 不依赖 crypto.subtle，保证单元测试（jsdom）与浏览器中结果一致、同步可用。
 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    // FNV prime，32 位无符号运算
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 单个校样版本的指纹：文件引用 + 校样说明（调色/裁切备注） */
export function proofFingerprint(photoId: string, version: number, note: string): string {
  return stableHash(`proof:${photoId}:v${version}:${note}`)
}

/**
 * 合集内容指纹：条目集合的校样指纹 + 策展说明 + 整体说明。
 * 任一照片撤换（proofFingerprint 变化）或说明更正（caption/description 变化）
 * 都会改变该指纹 —— 这是「已发布立即失效」与「复核指纹一致」判定的依据。
 */
export function collectionContentFingerprint(input: {
  description: string
  byline: string
  entries: Array<{ photoId: string; proofVersion: number; proofFingerprint: string; caption: string }>
}): string {
  const ordered = [...input.entries]
    .map((e) => `${e.photoId}@v${e.proofVersion}[${e.proofFingerprint}]:${e.caption}`)
    .sort()
    .join('|')
  return stableHash(`collection:desc=${input.description};by=${input.byline};${ordered}`)
}
