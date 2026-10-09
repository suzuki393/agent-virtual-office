/**
 * LB本陣 fork — office.config.json staff mapping.
 * Front end: createStaffConfig (roster / desks / update folding).
 * Hook: applyStaffMapping + a real hook run against a temp HOME (never the real ~/.claude).
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import characters from '../src/config/characters.json'
import { createStaffConfig } from '../src/config/officeConfig.js'

const require = createRequire(import.meta.url)
const hook = require('../public/hooks/office-status-hook.js')
const hookPath = path.resolve('public/hooks/office-status-hook.js')
const realConfig = JSON.parse(fs.readFileSync(path.resolve('office.config.json'), 'utf-8'))

const CFG = {
  staff: [
    { desk: 'pm', name: 'あんな', agent: 'main', post: '納経所の受付', color: '#C8553D' },
    { desk: 'arch', name: '宗助', agent: 'reikai-gakari', post: 'お寺', color: '#8E6B3E' },
    { desk: 'qa', name: '弥助', agent: '', post: '道標', color: '#2E8B57' },
  ],
}

describe('office.config.json (repo file)', () => {
  it('defines the four 本陣 staff on distinct valid desks', () => {
    const c = createStaffConfig(realConfig)
    expect(c.STAFF.map((s) => s.name)).toEqual(['あんな', '宗助', '弥助', 'おたき'])
    expect(new Set(c.STAFF.map((s) => s.desk)).size).toBe(4)
    expect(c.STAFF.find((s) => s.agent === 'main').name).toBe('あんな')
  })
})

describe('createStaffConfig', () => {
  const c = createStaffConfig(CFG)

  it('roster keeps only staffed desks, even in lightweight mode', () => {
    expect(c.rosterFor(characters, 'agentcortex').map((x) => x.id)).toEqual(['pm', 'arch', 'qa'])
    expect(c.rosterFor(characters, 'lightweight').map((x) => x.id)).toEqual(['pm', 'arch', 'qa'])
  })

  it('desks are filtered and carry name / color / post', () => {
    const desks = c.staffDesks([
      { id: 'pm', label: 'PM', color: '#000' },
      { id: 'dev', label: 'Dev', color: '#111' },
      { id: 'qa', label: 'QA', color: '#222' },
    ])
    expect(desks).toEqual([
      { id: 'pm', label: 'あんな', color: '#C8553D', post: '納経所の受付' },
      { id: 'qa', label: '弥助', color: '#2E8B57', post: '道標' },
    ])
    expect(c.isDeskShown('gate')).toBe(false)
    expect(c.isDeskShown('arch')).toBe(true)
  })

  it('folds unstaffed roles onto the main desk, keeping the most urgent status', () => {
    const out = c.remapStaffUpdates([
      { agentId: 'dev', status: 'working' },
      { agentId: 'ops', status: 'blocked' },
      { agentId: 'arch', status: 'working' },
      { agentId: 'feat~dev', status: 'working' },
    ])
    expect(out).toEqual([
      { agentId: 'pm', status: 'blocked' },
      { agentId: 'arch', status: 'working' },
      { agentId: 'feat~dev', status: 'working' },
    ])
  })

  it('no config → pass-through', () => {
    const none = createStaffConfig(null)
    const u = [{ agentId: 'dev', status: 'working' }]
    expect(none.remapStaffUpdates(u)).toBe(u)
    expect(none.rosterFor(characters, 'agentcortex')).toBe(characters.agentcortex)
    expect(none.isDeskShown('dev')).toBe(true)
  })
})

describe('hook applyStaffMapping', () => {
  const staff = CFG.staff

  it('main conversation (any tool role) → main desk', () => {
    for (const role of ['dev', 'ops', 'res', 'gate', 'pm']) {
      expect(hook.applyStaffMapping(staff, role, null, '', null).role).toBe('pm')
    }
  })

  it('registered subagent → its own desk, without a helper sprite', () => {
    const helper = { op: 'add', role: 'dev', agentId: 'a1', agentType: 'reikai-gakari' }
    expect(hook.applyStaffMapping(staff, 'dev', helper, 'reikai-gakari', 'a1'))
      .toEqual({ role: 'arch', helperAction: null })
  })

  it('unregistered subagent (Explore, hisho, …) → helper at the main desk', () => {
    const helper = { op: 'add', role: 'res', agentId: 'a2', agentType: 'Explore' }
    expect(hook.applyStaffMapping(staff, 'res', helper, 'Explore', 'a2'))
      .toEqual({ role: 'pm', helperAction: { ...helper, role: 'pm' } })
  })

  it('no config → unchanged', () => {
    expect(hook.applyStaffMapping(null, 'dev', null, 'x', null)).toEqual({ role: 'dev', helperAction: null })
  })
})

describe('hook end-to-end with ~/.claude/office.config.json', () => {
  function run(home, event) {
    execFileSync(process.execPath, [hookPath], {
      input: JSON.stringify(event),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      cwd: home,
    })
  }
  function roles(home) {
    const dir = path.join(home, '.claude')
    const out = []
    for (const f of fs.readdirSync(dir)) {
      if (!/^office-status.*\.json$/.test(f)) continue
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))
      for (const a of data.agents || []) out.push(a.role)
    }
    return [...new Set(out)].sort()
  }

  it('Edit in the main conversation and a reikai-gakari subagent land on pm / arch only', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'avo-lb-home-'))
    fs.mkdirSync(path.join(home, '.claude'))
    fs.writeFileSync(path.join(home, '.claude', 'office.config.json'), JSON.stringify(CFG))
    const base = { session_id: 's1', cwd: home }
    run(home, { ...base, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(home, 'a.css') } })
    run(home, { ...base, hook_event_name: 'SubagentStart', agent_type: 'reikai-gakari', agent_id: 'r1' })
    expect(roles(home)).toEqual(['arch', 'pm'])
  })
})
