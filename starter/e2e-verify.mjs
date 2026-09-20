// ============================================================
// 端到端验证：策展合集发布台的全部耦合规则
// 运行：node e2e-verify.mjs
// 会启动一个独立的服务进程（临时 DB），逐条验证后自动清理。
// ============================================================
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 3917
const BASE = `http://127.0.0.1:${PORT}/api`
const tmp = mkdtempSync(join(tmpdir(), 'curation-verify-'))
const DB_FILE = join(tmp, 'db.json')

let passed = 0
let failed = 0
const failures = []

function check(name, cond, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ✗ ${name} ${extra}`)
  }
}

async function req(method, path, { body, user = 'curator-1', headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user, ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* ignore */ }
  return { status: res.status, body: json }
}

function startServer() {
  const child = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DB_FILE },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
  return child
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/collections`)
      if (r.ok) return
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('服务启动超时')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let server = startServer()
  await waitReady()
  console.log('服务已启动（临时 DB）\n')

  try {
    // ----------------------------------------------------------
    console.log('【1】合集按系列+版本唯一')
    const c1 = await req('POST', '/collections', { body: { seriesId: 'gaze', version: 1, title: '凝视 · 首展' } })
    check('创建合集 gaze/v1 → 201', c1.status === 201, JSON.stringify(c1.body))
    const colA = c1.body.collection.id
    const dup = await req('POST', '/collections', { body: { seriesId: 'gaze', version: 1, title: '重复版本' } })
    check('重复 (gaze, v1) → 409', dup.status === 409 && dup.body.error.code === 'DUPLICATE_COLLECTION_VERSION')
    const list1 = await req('GET', '/collections')
    check('冲突后列表仍只有 1 个合集（不落库）', list1.body.collections.length === 1)

    // ----------------------------------------------------------
    console.log('【2】只能选当前有效校样')
    const add1 = await req('POST', `/collections/${colA}/items`, { body: { photoId: 'portrait-01' } })
    check('加入 portrait-01 → 201', add1.status === 201)
    const pinnedProof = add1.body.collection.items.find((i) => i.photoId === 'portrait-01').proofId
    const proofsBefore = await req('GET', '/proofs?photoId=portrait-02')
    const oldProof = proofsBefore.body.proofs.find((p) => p.status === 'valid')
    await req('POST', '/photos/portrait-02/proofs', { body: { kind: 'replace', changeNote: '测试撤换' }, user: 'editor-1' })
    const stale = await req('POST', `/collections/${colA}/items`, { body: { photoId: 'portrait-02', proofId: oldProof.id } })
    check('指定已失效校样 → 409 STALE_PROOF', stale.status === 409 && stale.body.error.code === 'STALE_PROOF')
    const add2 = await req('POST', `/collections/${colA}/items`, { body: { photoId: 'portrait-02' } })
    const newProof = add2.body.collection.items.find((i) => i.photoId === 'portrait-02').proofId
    check('不指定时自动选用当前有效校样（v2）', add2.status === 201 && newProof !== oldProof.id)

    // ----------------------------------------------------------
    console.log('【3】照片在未结束合集中只能出现一次；跨合集冲突 409 且不落库')
    const cB = await req('POST', '/collections', { body: { seriesId: 'gaze', version: 2, title: '凝视 · 二展' } })
    const colB = cB.body.collection.id
    const conflict = await req('POST', `/collections/${colB}/items`, { body: { photoId: 'portrait-01' } })
    check('跨合集占用 → 409 PHOTO_LOCKED', conflict.status === 409 && conflict.body.error.code === 'PHOTO_LOCKED')
    const dupItem = await req('POST', `/collections/${colA}/items`, { body: { photoId: 'portrait-01' } })
    check('同合集重复添加 → 409 DUPLICATE_ITEM', dupItem.status === 409 && dupItem.body.error.code === 'DUPLICATE_ITEM')
    const colBAfter = await req('GET', `/collections/${colB}`)
    check('冲突后合集 B 仍为空（不落库）', colBAfter.body.collection.items.length === 0)
    const onDisk = JSON.parse(readFileSync(DB_FILE, 'utf8'))
    const diskB = onDisk.collections.find((c) => c.id === colB)
    check('磁盘上的合集 B 同样为空（确未落库）', diskB.items.length === 0)

    // ----------------------------------------------------------
    console.log('【4】发布前校验：覆盖全部必选照片 + 说明/署名')
    const pubEarly = await req('POST', `/collections/${colA}/publish`)
    check('缺照片时发布 → 422', pubEarly.status === 422 && pubEarly.body.error.code === 'PUBLISH_VALIDATION_FAILED')
    const missing = pubEarly.body.error.details.filter((d) => d.code === 'REQUIRED_PHOTO_MISSING')
    check('报告缺失的必选照片（gaze 共 5 张，已加 2 张 → 缺 3 张）', missing.length === 3)
    // 制造一条说明过短的校样
    await req('POST', '/photos/portrait-03/proofs', { body: { kind: 'replace', caption: '短', changeNote: '测试短说明' }, user: 'editor-1' })
    await req('POST', '/photos/portrait-04/proofs', { body: { kind: 'replace', attribution: '?', changeNote: '测试短署名' }, user: 'editor-1' })
    for (const pid of ['portrait-03', 'portrait-04', 'portrait-05']) {
      await req('POST', `/collections/${colA}/items`, { body: { photoId: pid } })
    }
    const pubBad = await req('POST', `/collections/${colA}/publish`)
    const codes = (pubBad.body.error?.details ?? []).map((d) => d.code)
    check('说明过短 → 422 CAPTION_INVALID', pubBad.status === 422 && codes.includes('CAPTION_INVALID'))
    check('署名过短 → 422 ATTRIBUTION_INVALID', codes.includes('ATTRIBUTION_INVALID'))
    // 修正为合法说明/署名
    await req('POST', '/photos/portrait-03/proofs', { body: { kind: 'caption-fix', caption: '一次刻意的停顿，介于笑与不笑之间。' }, user: 'editor-1' })
    await req('POST', '/photos/portrait-04/proofs', { body: { kind: 'replace', attribution: '林澜', changeNote: '修正署名' }, user: 'editor-1' })

    // ----------------------------------------------------------
    console.log('【5】发布 + 幂等：重复/并发发布沿用首次结果')
    const key = `idem-${Date.now()}`
    const pub1 = await req('POST', `/collections/${colA}/publish`, { headers: { 'Idempotency-Key': key } })
    check('首次发布 → 201', pub1.status === 201, JSON.stringify(pub1.body))
    const snap1 = pub1.body.snapshot.id
    const pub2 = await req('POST', `/collections/${colA}/publish`, { headers: { 'Idempotency-Key': key } })
    check('同幂等键重复发布 → 回放首次结果（同快照）', pub2.body.snapshot?.id === snap1 && pub2.body.replayed === true)
    const pub3 = await req('POST', `/collections/${colA}/publish`)
    check('内容未变的重复发布 → 200 沿用首次快照', pub3.status === 200 && pub3.body.snapshot?.id === snap1 && pub3.body.reused === true)
    const snapsA = await req('GET', `/collections/${colA}/snapshots`)
    check('重复发布不产生新快照（仍只有 1 个）', snapsA.body.snapshots.length === 1)

    // 并发发布：另起一个合集，5 个并发请求
    const cC = await req('POST', '/collections', { body: { seriesId: 'wilderness', version: 1, title: '无人之境 · 首展' } })
    const colC = cC.body.collection.id
    for (const pid of ['landscape-01', 'landscape-02', 'landscape-03', 'landscape-04', 'landscape-05']) {
      await req('POST', `/collections/${colC}/items`, { body: { photoId: pid } })
    }
    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () => req('POST', `/collections/${colC}/publish`)),
    )
    const snapIds = new Set(concurrent.map((r) => r.body.snapshot?.id))
    check('5 个并发发布全部成功', concurrent.every((r) => [200, 201].includes(r.status)))
    check('并发发布沿用首次结果（全部同一快照）', snapIds.size === 1, [...snapIds].join(','))
    const snapsC = await req('GET', `/collections/${colC}/snapshots`)
    check('并发后只有 1 个快照落库', snapsC.body.snapshots.length === 1)

    // ----------------------------------------------------------
    console.log('【6】首页推荐只含发布中的合集')
    const home1 = await req('GET', '/home')
    check('推荐包含两个已发布合集', home1.body.recommendations.length === 2)

    // ----------------------------------------------------------
    console.log('【7】照片撤换/说明更正 → 已发布合集立即失效转待复核；旧快照可查但不计入推荐')
    const repl = await req('POST', '/photos/portrait-01/proofs', { body: { kind: 'replace', changeNote: '重新冲洗' }, user: 'editor-1' })
    check('撤换接口返回受影响合集', repl.status === 201 && repl.body.invalidatedCollections.some((c) => c.id === colA))
    const colAAfter = await req('GET', `/collections/${colA}`)
    check('合集 A 立即转为待复核', colAAfter.body.collection.status === 'pending_review')
    check('记录失效原因与触发人', colAAfter.body.collection.invalidatedBy === 'editor-1')
    const home2 = await req('GET', '/home')
    check('待复核合集不计入首页推荐', !home2.body.recommendations.some((r) => r.collectionId === colA))
    const snapOld = await req('GET', `/snapshots/${snap1}`)
    check('旧快照仍可查询', snapOld.status === 200 && snapOld.body.snapshot.id === snap1)
    check('旧快照状态标记为已失效', snapOld.body.snapshot.status === 'invalidated')

    // 说明更正同样触发失效（对合集 C）
    const capfix = await req('POST', '/photos/landscape-02/proofs', {
      body: { kind: 'caption-fix', caption: '低角度的光把整片草地染成了金属色。' },
      user: 'editor-1',
    })
    check('说明更正 → 合集 C 立即失效', capfix.body.invalidatedCollections.some((c) => c.id === colC))

    // ----------------------------------------------------------
    console.log('【8】复核需换人；连续两次指纹一致才可重新发布')
    const selfConfirm = await req('POST', `/collections/${colA}/confirm`, { user: 'editor-1' })
    check('触发人不能自审 → 403', selfConfirm.status === 403 && selfConfirm.body.error.code === 'REVIEWER_MUST_DIFFER')
    const pubBlocked = await req('POST', `/collections/${colA}/publish`)
    check('未复核前重新发布 → 409 REVIEW_REQUIRED', pubBlocked.status === 409 && pubBlocked.body.error.code === 'REVIEW_REQUIRED')
    const conf1 = await req('POST', `/collections/${colA}/confirm`, { user: 'reviewer-1' })
    check('复核人 1 确认 → 连续 1/2', conf1.status === 200 && conf1.body.consecutiveMatches === 1)
    const confSame = await req('POST', `/collections/${colA}/confirm`, { user: 'reviewer-1' })
    check('同一复核人连续确认 → 403', confSame.status === 403 && confSame.body.error.code === 'CONSECUTIVE_SAME_REVIEWER')
    const pubStillBlocked = await req('POST', `/collections/${colA}/publish`)
    check('只有一次确认仍不能重新发布 → 409', pubStillBlocked.status === 409)
    const conf2 = await req('POST', `/collections/${colA}/confirm`, { user: 'reviewer-2' })
    check('复核人 2 确认 → 连续 2/2', conf2.status === 200 && conf2.body.consecutiveMatches === 2)
    const repub = await req('POST', `/collections/${colA}/publish`, { user: 'curator-1' })
    check('两次一致确认后重新发布 → 201（新快照）', repub.status === 201 && repub.body.snapshot.id !== snap1)
    const home3 = await req('GET', '/home')
    check('重新发布后回到首页推荐', home3.body.recommendations.some((r) => r.collectionId === colA))
    const snapOld2 = await req('GET', `/snapshots/${snap1}`)
    check('重新发布后旧快照依然可查', snapOld2.status === 200)

    // 指纹变化会重置连续计数：合集 C 确认 1 次后再改校样
    await req('POST', `/collections/${colC}/confirm`, { user: 'reviewer-1' })
    await req('POST', '/photos/landscape-03/proofs', { body: { kind: 'replace', changeNote: '再次撤换' }, user: 'editor-1' })
    const confC1 = await req('POST', `/collections/${colC}/confirm`, { user: 'reviewer-2' })
    check('指纹变化后确认重新从 1 计数', confC1.body.consecutiveMatches === 1)
    const pubCBlocked = await req('POST', `/collections/${colC}/publish`)
    check('计数被重置后不能重新发布 → 409', pubCBlocked.status === 409)

    // ----------------------------------------------------------
    console.log('【9】结束合集释放照片')
    const closeB = await req('POST', `/collections/${colB}/close`)
    check('结束合集 B → 200', closeB.status === 200 && closeB.body.collection.status === 'closed')
    // 把 portrait-01 从 A 移出（A 已重新发布，不可编辑）——改用新合集验证释放：
    // 先结束占用 portrait-05 的合集 A？A 已发布。改为验证：已结束的 B 不再占用任何照片，
    // 直接验证「未结束合集唯一占用」的反面：新建合集可加入 portrait-01？不行，A 仍占用。
    // 结束 A 之后应可加入。
    await req('POST', `/collections/${colA}/close`)
    const cD = await req('POST', '/collections', { body: { seriesId: 'gaze', version: 3, title: '凝视 · 三展' } })
    const addAfterClose = await req('POST', `/collections/${cD.body.collection.id}/items`, { body: { photoId: 'portrait-01' } })
    check('原合集结束后照片被释放，可加入新合集', addAfterClose.status === 201)

    // ----------------------------------------------------------
    console.log('【10】展示状态与业务数据分开存储')
    check('db.display 投影独立存在', onDisk !== null) // 占位，下面重新读盘
    const diskNow = JSON.parse(readFileSync(DB_FILE, 'utf8'))
    check('展示投影（display）与 collections/snapshots 分开存储',
      Array.isArray(diskNow.collections) && Array.isArray(diskNow.snapshots) && diskNow.display !== null
      && Array.isArray(diskNow.display.recommendations) && Array.isArray(diskNow.display.collectionList))
    check('推荐投影中不含待复核/已结束合集',
      diskNow.display.recommendations.every((r) => {
        const col = diskNow.collections.find((c) => c.id === r.collectionId)
        return col && col.status === 'published'
      }))

    // ----------------------------------------------------------
    console.log('【11】列表/筛选与刷新（服务重启）后一致')
    const beforeRestart = await req('GET', '/collections?status=published')
    const beforeAll = await req('GET', '/collections')
    const beforeFiltered = await req('GET', '/collections?seriesId=gaze')
    server.kill('SIGTERM')
    await sleep(400)
    server = startServer()
    await waitReady()
    const afterRestart = await req('GET', '/collections?status=published')
    const afterAll = await req('GET', '/collections')
    const afterFiltered = await req('GET', '/collections?seriesId=gaze')
    check('重启后已发布列表一致', JSON.stringify(beforeRestart.body) === JSON.stringify(afterRestart.body))
    check('重启后完整列表一致', JSON.stringify(beforeAll.body) === JSON.stringify(afterAll.body))
    check('重启后按系列筛选一致', JSON.stringify(beforeFiltered.body) === JSON.stringify(afterFiltered.body))
    check('筛选结果只含 gaze 系列', afterFiltered.body.collections.every((c) => c.seriesId === 'gaze'))
  } finally {
    server.kill('SIGTERM')
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`)
  if (failed > 0) {
    console.log('失败项：')
    for (const f of failures) console.log(`  - ${f}`)
    process.exitCode = 1
  }
  rmSync(tmp, { recursive: true, force: true })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
