// 服务入口：装配存储层 / 规则层 / 展示层，提供 API 与生产静态资源。
import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './store.js'
import { rebuildDisplay } from './readModel.js'
import { createApiRouter } from './app.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const PORT = Number(process.env.PORT || 3001)
const DB_FILE = process.env.DB_FILE || join(here, 'data', 'db.json')
const PHOTOS_JSON =
  process.env.PHOTOS_JSON || join(root, '..', 'mock-data', 'photos.json')

if (!existsSync(PHOTOS_JSON)) {
  console.error(`[server] 找不到权威内容数据: ${PHOTOS_JSON}`)
  process.exit(1)
}

const photosData = JSON.parse(readFileSync(PHOTOS_JSON, 'utf8'))
const store = new Store(DB_FILE, photosData)
store.load()
rebuildDisplay(store) // 启动时重建展示投影，保证重启后列表/推荐一致
store.persist()

const app = express()
app.use(express.json())
app.use('/api', createApiRouter(store))
app.get('/api/health', (req, res) => res.json({ ok: true }))

// 生产模式：托管前端构建产物（SPA 回退到 index.html）
const dist = join(root, 'dist')
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (req, res) => res.sendFile(join(dist, 'index.html')))
}

// 便于测试直接复用：导出 app 与 store
export { app, store }

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  app.listen(PORT, () => {
    console.log(`[server] API 就绪: http://localhost:${PORT}/api (db: ${DB_FILE})`)
  })
}
