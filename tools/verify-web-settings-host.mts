/**
 * Drive the Host half of `dsh-web-settings` outside the Loader.
 *
 * The plugin is a plain Cordis function plugin, so a stub context is enough to
 * exercise everything it contributes: the settings sections it installs, the
 * diagnostic tool it registers, the pre-execute guard it owns, and the patch
 * reconciliation it performs. The patch path is redirected to a temporary file
 * so the real profile is never touched.
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOST_MODULE = 'C:/Users/Minhn/DSH_Customize/dsh-web-settings/lib/index.js'
const plugin = await import(pathToFileURL(HOST_MODULE).href) as {
  name: string
  inject: string[]
  apply: (ctx: unknown, config?: unknown) => void
}

const problems: string[] = []
const check = (condition: boolean, message: string) => { if (!condition) problems.push(message) }

const patchPath = join(mkdtempSync(join(tmpdir(), 'dsh-web-settings-')), 'cordis.patch.yml')
const registeredTools: Array<Record<string, unknown>> = []
const listeners = new Map<string, (exec: unknown, next: () => unknown) => unknown>()
const installed: string[] = []

const CONNECTION_STATE = { cookieMaxAgeDays: 7, trustedHosts: ['dsh.example.test'], revokeBrowserSessions: false }
const GUARD_STATE = { deniedTools: ['bash'] }

const settingsService = {
  describe: () => [
    { ns: 'connection', value: CONNECTION_STATE },
    { ns: 'web-publish', value: { host: 'dsh.example.test', port: 8095 } },
  ],
  installSection: (_owner: unknown, namespace: string, _schema: unknown, _entry: unknown, hooks: {
    setSource: (source: () => unknown) => void
    onChange: () => void
  }) => {
    installed.push(namespace)
    const value = namespace === 'tool-guard' ? GUARD_STATE : { host: 'dsh.example.test', port: 8095 }
    hooks.setSource(() => value)
    hooks.onChange()
  },
}

const tools = { register: (definition: Record<string, unknown>) => { registeredTools.push(definition); return () => {} } }
const scoped = { settings: settingsService, tools, effect: (fn: () => unknown) => fn() }
const ctx = {
  effect: (fn: () => unknown) => fn(),
  on: (event: string, listener: (exec: unknown, next: () => unknown) => unknown) => {
    listeners.set(event, listener)
    return () => {}
  },
  inject: (_names: string[], callback: (scope: unknown) => unknown) => callback(scoped),
  get: (name: string) => name === 'settings' ? settingsService : name === 'webServer' ? { port: 8095 } : undefined,
}

plugin.apply(ctx, { patchPath })

// Sections and tool
check(installed.includes('web-publish'), 'the web-publish settings section was not installed')
check(installed.includes('tool-guard'), 'the tool-guard settings section was not installed')
check(registeredTools.length === 1, `expected 1 tool, got ${registeredTools.length}`)
const tool = registeredTools[0]
check(tool?.name === 'web_publish_status', `unexpected tool name ${String(tool?.name)}`)
check(typeof tool?.description === 'string' && (tool.description as string).includes('trusted-host'), 'the tool description is not model-facing enough')
check(typeof tool?.parameters === 'object' && tool?.parameters !== null, 'the tool declares no parameter schema')
const output = tool?.output as { schema?: unknown, render?: (args: unknown, value: unknown) => unknown } | undefined
check(typeof output?.schema === 'object' && output?.schema !== null, 'the tool declares no output schema')
check(typeof output?.render === 'function', 'the tool declares no renderer')

// Execution and rendering
const report = await (tool?.execute as (args: unknown, exec: unknown) => Promise<Record<string, unknown>>)({}, { signal: undefined })
check(report?.listeningPort === 8095, `the report lost the listening port: ${String(report?.listeningPort)}`)
check(report?.storedPort === 8095 && report?.storedHost === 'dsh.example.test', 'the report lost the stored publish values')
check(report?.cookieMaxAgeDays === 7, 'the report lost the cookie lifetime')
check(Array.isArray(report?.trustedHosts) && (report.trustedHosts as string[])[0] === 'dsh.example.test', 'the report lost the trusted hosts')
check(report?.remoteAccessConfigured === true, 'the report did not compute remote-access configuration')
const rendered = output?.render?.(null, report) as Array<{ type: string, text: string }> | undefined
check(Array.isArray(rendered) && rendered[0]?.type === 'text', 'the renderer did not return a text block')
check((rendered?.[0]?.text ?? '').includes('dsh.example.test'), 'the rendered text omits the trusted host')

// The guard
const guard = listeners.get('tools/pre-execute')
check(guard !== undefined, 'the tool guard did not register a pre-execute listener')
let delegated = 0
const denied = await guard?.({ name: 'bash' }, () => { delegated += 1; return { kind: 'allow' } })
check(denied !== null && typeof denied === 'object' && (denied as { kind?: string }).kind === 'deny', 'a blocked tool was not denied')
check(delegated === 0, 'the guard delegated a call it had already denied')
const allowed = await guard?.({ name: 'read_file' }, () => { delegated += 1; return { kind: 'allow' } })
check(delegated === 1 && (allowed as { kind?: string }).kind === 'allow', 'the guard did not delegate an unlisted tool')

// Patch reconciliation against the temporary file
const patch = readFileSync(patchPath, 'utf8')
check(patch.includes('dsh-web-settings managed block'), 'the managed block was not written')
check(patch.includes('?? 8095'), 'the stored port is missing from the managed block')

console.log(`plugin             : ${plugin.name}`)
console.log(`settings sections  : ${installed.join(', ')}`)
console.log(`tool               : ${String(tool?.name)}`)
console.log(`report             : port=${String(report?.listeningPort)} host=${String(report?.storedHost)} cookie=${String(report?.cookieMaxAgeDays)}d trusted=[${(report?.trustedHosts as string[] ?? []).join(',')}]`)
console.log(`guard              : bash -> deny, read_file -> next() (delegated ${String(delegated)})`)
console.log(`patch file written : yes (${String(patch.length)} bytes)`)
console.log('')

if (problems.length > 0) {
  for (const problem of problems) console.log(`FAIL: ${problem}`)
  process.exit(1)
}
console.log('RESULT: PASS')
