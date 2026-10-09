// LB本陣 fork addition — reads office.config.json (repo root) and decides which staff are shown.
// No staff entries → every helper is a pass-through, so upstream behaviour is unchanged.
// Under vitest the config is ignored so upstream's full-roster tests keep their meaning;
// createStaffConfig() is tested directly instead.
import cfg from '../../office.config.json'

export const STAFF_DESKS = ['pm', 'arch', 'dev', 'qa', 'ops', 'res', 'gate', 'designer']

// External updates folded onto one desk keep the most urgent status.
const STATUS_RANK = { blocked: 4, 'awaiting-approval': 3, working: 2, planning: 2, thinking: 2 }

export function createStaffConfig(config) {
  const staff = (Array.isArray(config?.staff) ? config.staff : [])
    .filter((s) => s && STAFF_DESKS.includes(s.desk))
  const has = staff.length > 0
  const byDesk = Object.fromEntries(staff.map((s) => [s.desk, s]))
  const mainDesk = (staff.find((s) => s.agent === 'main') || staff[0])?.desk || null

  return {
    STAFF: staff,
    HAS_STAFF: has,
    staffForDesk: (id) => byDesk[id] || null,
    isDeskShown: (id) => !has || Boolean(byDesk[id]),

    // Static roster: with staff configured, always the agentcortex roster filtered to staff desks.
    rosterFor(characters, mode) {
      if (!has) return characters[mode] || characters.agentcortex
      return characters.agentcortex.filter((c) => byDesk[c.id])
    },

    // Desk list for PixelOffice: drop unstaffed desks, take name/color/post from the config.
    staffDesks(desks) {
      if (!has) return desks
      return desks.filter((d) => byDesk[d.id]).map((d) => {
        const s = byDesk[d.id]
        return { ...d, label: s.name || d.label, color: s.color || d.color, post: s.post || null }
      })
    },

    // Updates aimed at an unstaffed base role (file-watcher / count fallback) are folded onto the
    // main-conversation desk, so no phantom overflow character appears.
    remapStaffUpdates(updates) {
      if (!has || !mainDesk || !Array.isArray(updates)) return updates
      const out = new Map()
      for (const u of updates) {
        if (!u || typeof u.agentId !== 'string') continue
        const id = STAFF_DESKS.includes(u.agentId) && !byDesk[u.agentId] ? mainDesk : u.agentId
        const prev = out.get(id)
        if (!prev || (STATUS_RANK[u.status] || 0) > (STATUS_RANK[prev.status] || 0)) {
          out.set(id, id === u.agentId ? u : { ...u, agentId: id })
        }
      }
      return [...out.values()]
    },
  }
}

const active = createStaffConfig(import.meta.env?.MODE === 'test' ? null : cfg)

export const STAFF = active.STAFF
export const HAS_STAFF = active.HAS_STAFF
export const { staffForDesk, isDeskShown, rosterFor, staffDesks, remapStaffUpdates } = active
