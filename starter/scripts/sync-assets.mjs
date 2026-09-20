// 同步静态资源：mock-data 的照片与元数据、assets 的本地字体 → public/ 与 src/data/
// mock-data/ 与 assets/ 是权威数据源，本脚本只做拷贝，不修改内容。
import { cpSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = join(root, '..')

const jobs = [
  // [src, dest, isDir]
  [join(workspace, 'mock-data', 'photos'), join(root, 'public', 'photos'), true],
  [join(workspace, 'assets', 'fonts'), join(root, 'public', 'fonts'), true],
  [join(workspace, 'mock-data', 'photos.json'), join(root, 'src', 'data', 'photos.json'), false],
]

for (const [src, dest, isDir] of jobs) {
  if (!existsSync(src)) {
    console.error(`[sync-assets] 缺少数据源: ${src}`)
    process.exit(1)
  }
  mkdirSync(dirname(dest), { recursive: true })
  if (isDir) cpSync(src, dest, { recursive: true })
  else copyFileSync(src, dest)
  console.log(`[sync-assets] ${src} -> ${dest}`)
}
