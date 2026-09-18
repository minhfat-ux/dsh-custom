/**
 * Execute the browser half of `dsh-web-settings` the way the page would.
 *
 * Captures the lazy-CJS registration, materializes the factory against the two
 * shell-seeded modules, then drives `apply` with a stub client context that
 * records slot registrations and settings writes. The card components are
 * called directly: the framework hands them every reactive read as a prop, so a
 * card renders in plain Node without a DOM.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const REPO = 'C:/Users/Minhn/DSH_Customize/deepseek-harness'
const BUNDLE = 'C:/Users/Minhn/DSH_Customize/dsh-web-settings/lib/client.js'

const requireFromRepo = createRequire(`${REPO}/package.json`)
const react = requireFromRepo('react')
const clientStore = requireFromRepo('./packages/client/store/lib/index.js')

interface Registration {
  id: string
  factory: (require: (spec: string) => unknown) => Record<string, unknown>
}

let captured: Registration | undefined
const source = readFileSync(BUNDLE, 'utf8')
const sandbox = {
  __ModuleLoader__: { load: (r: Registration) => { captured = r } },
  // The status panel judges the page it renders in.
  location: { hostname: '127.0.0.1', host: '127.0.0.1:8095' },
}
new Function('window', source)(sandbox)
if (captured === undefined) throw new Error('bundle did not call window.__ModuleLoader__.load')

const exports = captured.factory((spec: string) => {
  if (spec === 'react') return react
  if (spec === '@deepseek-ai/dsh-client-store') return clientStore
  throw new Error(`unexpected require(${spec})`)
})

/** One recorded slot registration. */
interface SlotEntry {
  options: { name: string, key?: string, locale?: string, inject?: () => Record<string, unknown> }
  component: (props: Record<string, unknown>) => unknown
}

const slots: SlotEntry[] = []
const writes: string[] = []
const registered: string[] = []
const tabTypes: Array<{ id: string, kind: string, title: () => string, guide?: unknown[] }> = []
const definitions: Array<Record<string, (...args: never[]) => unknown>> = []

function makeScope(namespace: string, value: Record<string, unknown>, user: Record<string, unknown>) {
  const listeners: Array<() => void> = []
  const snapshot = { status: 'ready' as const, value, base: {}, user, revision: 1, writable: true, mode: 'host' as const }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.push(listener); return () => {} },
    set: (field: string, next: unknown) => { writes.push(`set ${namespace}.${field}=${JSON.stringify(next)}`); return Promise.resolve() },
    unset: (field: string) => { writes.push(`unset ${namespace}.${field}`); return Promise.resolve() },
    mutate: () => Promise.resolve(),
  }
}

const ctx = {
  effect: (register: () => unknown) => register(),
  slots: {
    inject: (_name: string, callback: () => unknown) => callback(),
    register: (options: SlotEntry['options'], component: SlotEntry['component']) => { slots.push({ options, component }); return () => {} },
  },
  locale: {
    register: (namespace: string, locale: string, dict: Record<string, string>) => { registered.push(`${namespace}/${locale}:${Object.keys(dict).length}`); return () => {} },
    bind: (_namespace: string) => (key: string) => key,
  },
  settingsScope: {
    bind: ({ namespace }: { namespace: string }) => namespace === 'web-publish'
      ? makeScope(namespace, { host: '', port: 0 }, {})
      : makeScope(namespace, { cookieMaxAgeDays: 30, maxRequestBodyBytes: 1, trustedHosts: ['a.test'] }, { trustedHosts: ['a.test'] }),
  },
  sidebarRightTabs: {
    register: (definition: { id: string, kind: string, title: () => string, guide?: unknown[] }) => {
      tabTypes.push(definition)
      return () => {}
    },
  },
  uiConversation: {
    events: {
      register: (definition: Record<string, (...args: never[]) => unknown>) => {
        definitions.push(definition)
        return () => {}
      },
    },
  },
}

;(exports.apply as (ctx: unknown) => void)(ctx)

const problems: string[] = []
const check = (condition: boolean, message: string) => { if (!condition) problems.push(message) }

const cards = slots.filter(entry => entry.options.name === 'settings.plugin.item')
const panel = slots.find(entry => entry.options.name === 'sidebar.right.pane.tab')
/** Fields each card draws, so a wrong registration shows up as a shape mismatch. */
const FIELD_COUNTS: Record<string, number> = { 'web-publish': 2, connection: 3, 'tool-guard': 1 }
check(cards.length === 3, `expected 3 cards, got ${cards.length}`)
check(panel !== undefined, 'the status panel body was not registered')
check(JSON.stringify(exports.inject) === JSON.stringify(['slots', 'locale', 'settingsScope', 'sidebarRightTabs', 'uiConversation']), 'unexpected inject')
check(registered.length === 2, `expected 2 locale dictionaries, got ${registered.length}`)
check(tabTypes.length === 1, `expected 1 tab type, got ${tabTypes.length}`)
check(tabTypes[0]?.id === 'dsh-web-settings/publish-status', `unexpected tab type id ${String(tabTypes[0]?.id)}`)
check(tabTypes[0]?.kind === 'dshPublishStatus', `unexpected tab kind ${String(tabTypes[0]?.kind)}`)
check(Array.isArray(tabTypes[0]?.guide) && tabTypes[0]!.guide!.length === 1, 'the tab type contributed no guide entry')

for (const entry of cards) {
  const face = entry.options.inject?.() ?? {}
  check(entry.options.name === 'settings.plugin.item', `wrong slot name ${entry.options.name}`)
  check(typeof entry.options.key === 'string', 'card registered without a settings key')
  check(entry.options.locale === 'webSettings', 'card registered without its locale namespace')
  check(typeof face.edit === 'function' && typeof face.save === 'function' && typeof face.discard === 'function' && typeof face.clear === 'function', `${entry.options.key}: incomplete action face`)
  check(typeof face.hooks === 'object' && face.hooks !== null && 'card' in (face.hooks as object), `${entry.options.key}: no hooks compartment`)
  check(entry.options.key !== 'connection' || typeof face.revoke === 'function', 'connection card is missing revoke')

  // Render the card. The framework passes the reactive read as a prop.
  const handle = (face.hooks as { card: { getSnapshot?: () => unknown } }).card
  const state = typeof handle.getSnapshot === 'function' ? handle.getSnapshot() : undefined
  check(state !== undefined, `${entry.options.key}: store exposes no snapshot`)
  const tree = entry.component({ useCard: (select: (value: unknown) => unknown) => select(state), t: (key: string) => key, ...face }) as {
    props?: { children?: unknown[] }
  }
  const inputs = countInputs(tree)
  const expectedInputs = FIELD_COUNTS[entry.options.key ?? ''] ?? 0
  check(inputs === expectedInputs, `${entry.options.key}: rendered ${inputs} fields, expected ${expectedInputs}`)

  // Drive one save and one clear through the injected callbacks.
  const edit = face.edit as (field: string, text: string) => void
  const save = face.save as () => void
  const clear = face.clear as (field: string) => void
  if (entry.options.key === 'web-publish') {
    edit('port', '8095')
    edit('host', 'dsh.example.test')
    save()
  } else if (entry.options.key === 'tool-guard') {
    edit('deniedTools', 'bash\nrm_rf')
    save()
  } else {
    edit('cookieMaxAgeDays', 'not-a-number')
    save()
    edit('cookieMaxAgeDays', '7')
    save()
    clear('trustedHosts')
  }
}

// Writes settle on microtasks; the write assertions below run after they drain.
await new Promise(resolve => setImmediate(resolve))

// The status panel: render it healthy, then under the two misconfigurations it exists to surface.
if (panel !== undefined) {
  const face = panel.options.inject?.() ?? {}
  const handle = (face.hooks as { panel?: { getSnapshot?: () => unknown } }).panel
  const state = handle?.getSnapshot?.()
  check(state !== undefined, 'panel store exposes no snapshot')
  const info = {
    panel: { id: 'pane-1' },
    tab: { contentId: 'sidebar://dshPublishStatus', navigation: { revision: 2 }, actions: { close: () => {} } },
  }
  const render = (override: Record<string, unknown>) => JSON.stringify(panel.component({
    useTabInfo: () => info,
    usePanel: () => ({ ...(state as object), ...override }),
    t: (key: string) => key,
  }))
  const healthy = render({ loaded: true, writable: true, hostname: '127.0.0.1', authority: '127.0.0.1:8095', trustedHosts: [] })
  check(healthy.includes('okConfig'), 'a loopback page was not reported as usable')
  check(healthy.includes('panelClose'), 'the panel drew no close control')
  const noTrust = render({ loaded: true, writable: false, hostname: 'dsh.example.test', authority: 'dsh.example.test', trustedHosts: [] })
  check(noTrust.includes('warnNoTrusted'), 'an untrusted non-loopback page was not warned about')
  const wrongTrust = render({ loaded: true, writable: false, hostname: 'dsh.example.test', authority: 'dsh.example.test', trustedHosts: ['other.test'] })
  check(wrongTrust.includes('warnHostNotTrusted'), 'a host missing from trustedHosts was not warned about')
}

/** Count element nodes carrying an `id` starting with `plugin-config-`. */
function countInputs(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0
  const element = node as { props?: Record<string, unknown> }
  let count = typeof element.props?.id === 'string' && String(element.props.id).startsWith('plugin-config-') ? 1 : 0
  const children = element.props?.children
  if (Array.isArray(children)) for (const child of children) count += countInputs(child)
  return count
}

console.log(`module id     : ${captured.id}`)
console.log(`exports       : ${Object.keys(exports).sort().join(', ')}`)
console.log(`inject        : ${JSON.stringify(exports.inject)}`)
console.log(`dictionaries  : ${registered.join(' | ')}`)
console.log('cards         :')
for (const entry of slots) console.log(`  key=${String(entry.options.key)} locale=${String(entry.options.locale)} component=${typeof entry.component}`)
console.log('recorded writes:')
for (const line of writes) console.log(`  ${line}`)

check(writes.includes('set web-publish.port=8095'), 'saving the publish card did not write the port')
check(writes.includes('set web-publish.host="dsh.example.test"'), 'saving the publish card did not write the host')
check(!writes.some(line => line.includes('not-a-number')), 'an invalid number was written')
check(writes.includes('set connection.cookieMaxAgeDays=7'), 'a valid number was not written')
check(writes.includes('unset connection.trustedHosts'), 'clearing a field did not unset it')
check(writes.includes('set tool-guard.deniedTools=["bash","rm_rf"]'), 'the tool-guard card did not write its list')

// The session-mode chat Definition: match three knob families, fold, and materialize a Chat node.
check(definitions.length === 1, `expected 1 conversation definition, got ${definitions.length}`)
const definition = definitions[0] as unknown as {
  kind: string
  target: string
  match: (event: unknown) => { id: string, role: string } | null
  start: (context: unknown, match: unknown, reader: unknown) => unknown
  buildViewNode: (context: unknown) => { target?: string, kind?: string, anchorSeq?: number, data?: { value?: string } } | null
}
check(definition?.kind === 'session-mode', `unexpected definition kind ${String(definition?.kind)}`)
check(definition?.target === 'chat', 'the definition does not target chat')
const probe = [
  { type: 'permission/preset', seq: 11, time: 1, data: { preset: 'workspace-write' } },
  { type: 'sandbox/mode', seq: 12, time: 2, data: { mode: 'read-only' } },
  { type: 'approval/policy', seq: 13, time: 3, data: { policy: 'ask' } },
  { type: 'user/message', seq: 14, time: 4, data: {} },
]
const matched = probe.map(event => definition!.match(event))
check(matched[0]?.role === 'start' && matched[1]?.role === 'start' && matched[2]?.role === 'start', 'a permission-knob event did not start a node')
check(matched[3] === null, 'an unrelated event matched the session-mode definition')
check(matched[0]!.id !== matched[1]!.id, 'two separate changes collapsed into one identity')
const firstMatch = { event: probe[0], id: matched[0]!.id, role: 'start' }
const state = definition!.start({}, firstMatch, {})
const viewNode = definition!.buildViewNode({ key: 'k', id: matched[0]!.id, state, start: { location: { kind: 'unresolved' } }, matches: [] })
check(viewNode?.target === 'chat' && viewNode?.kind === 'session-mode', 'the definition did not materialize a Chat node')
check(viewNode?.anchorSeq === 11 && viewNode?.data?.value === 'workspace-write', 'the materialized node payload is wrong')
const chipSlot = slots.find(entry => entry.options.name === 'conversation.chat.node')
check(chipSlot !== undefined && chipSlot.options.key === 'session-mode', 'the chip renderer was not registered under the node kind')
if (chipSlot !== undefined) {
  const labels = (chipSlot.options.inject?.() as { labels: Record<string, string> }).labels
  const chip = JSON.stringify(chipSlot.component({ node: viewNode, labels }))
  check(chip.includes('workspace-write'), 'the chip did not render the knob value')
  check(chip.includes(labels.modePermission), 'the chip did not render the translated label')
}

if (problems.length > 0) {
  console.log('')
  for (const problem of problems) console.log(`FAIL: ${problem}`)
  process.exit(1)
}
console.log('')
console.log('RESULT: PASS')
