/**
 * LB本陣 fork — Japanese UI (ja locale + hook labels).
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import en from '../src/locales/en.json'
import ja from '../src/locales/ja.json'

const require = createRequire(import.meta.url)
const hook = require('../public/hooks/office-status-hook.js')
const hookPath = path.resolve('public/hooks/office-status-hook.js')

function leaves(o, p = '') {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return Object.entries(o).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k))
  }
  return [[p, o]]
}

describe('ja.json', () => {
  it('has every en key with the same shape and placeholders', () => {
    const jaMap = new Map(leaves(ja))
    for (const [k, v] of leaves(en)) {
      expect(jaMap.has(k), k).toBe(true)
      const j = jaMap.get(k)
      expect(Array.isArray(j), k).toBe(Array.isArray(v))
      if (Array.isArray(v)) expect(j.length, k).toBe(v.length)
      const ph = (x) => (JSON.stringify(x).match(/\{\w+\}/g) || []).sort()
      expect(ph(j), k).toEqual(ph(v))
    }
  })

  it('status labels are Japanese', () => {
    expect(ja.statusLabels).toMatchObject({ working: '作業中', idle: '待機', done: '完了', blocked: '停止中' })
  })
})

describe('hook Japanese labels', () => {
  it('every static zh-TW label in the hook has a ja entry', () => {
    const src = fs.readFileSync(hookPath, 'utf-8').split('// ─── Fork: Japanese labels')[0]
    const literals = [...src.matchAll(/'([^'\n]*[一-鿿][^'\n]*)'/g)].map((m) => m[1])
      .filter((s) => /^\p{Extended_Pictographic}/u.test(s))
    expect(literals.length).toBeGreaterThan(40)
    for (const s of literals) expect(hook.JA_EXACT[s], s).toBeTruthy()
  })

  it('a hook run with office-lang=ja writes Japanese labels', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avo-ja-home-'))
    fs.mkdirSync(path.join(home, '.claude'))
    fs.writeFileSync(path.join(home, '.claude', 'office-lang'), 'ja')
    const labels = []
    const run = (event) => {
      execFileSync(process.execPath, [hookPath], {
        input: JSON.stringify({ session_id: 's1', cwd: home, ...event }),
        env: { ...process.env, HOME: home, USERPROFILE: home },
        cwd: home,
      })
      for (const f of fs.readdirSync(path.join(home, '.claude'))) {
        if (!/^office-status.*\.json$/.test(f)) continue
        const data = JSON.parse(fs.readFileSync(path.join(home, '.claude', f), 'utf-8'))
        for (const a of data.agents || []) if (a.label) labels.push(a.label)
      }
    }
    run({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(home, 'App.jsx') } })
    run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } })
    run({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(home, 'x.md') } })
    expect(labels).toContain('✏️ 編集 App.jsx')
    expect(labels).toContain('⚡ テスト')
    expect(labels).toContain('📖 読む x.md')
    // no Traditional-Chinese-only glyphs leak through
    for (const l of labels) expect(l).not.toMatch(/[寫讀搜找搞這個檔測試建置套腳權認證]/)
  })
})
