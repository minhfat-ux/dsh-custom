/**
 * Publish settings for the Web profile.
 *
 * The listen host and port are composition-time values: `WebServer` binds as
 * soon as its row activates, so a stored value can only take effect at the next
 * start. This plugin owns the `web-publish` settings namespace and reconciles it
 * into the profile's own patch layer, which is the supported way to override one
 * composed row by id.
 *
 * The block restates every key of the `webserver` row because a patch replaces a
 * row's whole config rather than merging into it. Every field keeps the bundle's
 * own `ctx.webStartup` expression with the stored value as its fallback, so an
 * explicit `--host` or `--port` always wins over a stored setting.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'

/** Stable Cordis plugin name. */
export const name = 'web-publish'

/** The settings service owns the namespace this plugin reconciles. */
export const inject = ['settings']

/** Settings namespace holding the stored publish values. */
export const WEB_PUBLISH_SETTINGS_NAMESPACE = 'web-publish'

/** Plugin configuration. */
export const Config = z.object({
  /** Patch file to reconcile; empty selects `$DSH_HOME/profiles/web/cordis.patch.yml`. */
  patchPath: z.string().default(''),
})

/**
 * Stored publish values. An empty host and a zero port both mean "follow the
 * launch", so clearing a field restores the bundle's own default for it.
 */
const Schema = z.object({
  host: z.string().default(''),
  port: z.natural().default(0),
})

/** Opening marker of the reconciled block. */
const BEGIN = '# >>> dsh-web-settings managed block: edit through Settings, not by hand >>>'

/** Closing marker of the reconciled block. */
const END = '# <<< dsh-web-settings managed block <<<'

/**
 * Harness home: `$DSH_HOME` when set to a non-blank value, else `~/.dsh`.
 * @returns the resolved harness home.
 */
function resolveHome() {
  const fromEnv = process.env.DSH_HOME
  return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv : join(homedir(), '.dsh')
}

/**
 * Escape a literal string for use inside a regular expression.
 * @param value - the literal text.
 * @returns the escaped text.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Matches the managed block including its trailing newline. */
const BLOCK_PATTERN = new RegExp(`${escapeRegExp(BEGIN)}[\\s\\S]*?${escapeRegExp(END)}\\n?`)

/**
 * Render the managed block for one stored pair.
 * @param host - stored host, or an empty string to follow the launch.
 * @param port - stored port, or zero to follow the launch.
 * @returns the block text, or undefined when nothing is stored.
 */
function renderBlock(host, port) {
  if (host === '' && port === 0) return undefined
  const hostLine = `!!js ctx.webStartup.host ?? ${host === '' ? "'127.0.0.1'" : JSON.stringify(host)}`
  const portLine = `!!js ctx.webStartup.port ?? ${port === 0 ? '3080' : String(port)}`
  return [
    BEGIN,
    '- id: webserver',
    '  config:',
    `    host: ${hostLine}`,
    `    port: ${portLine}`,
    '    compression: gzip',
    '    compressionLevel: 1',
    '    compressionThresholdBytes: 1024',
    END,
  ].join('\n')
}

/**
 * Reconcile the managed block inside the profile patch file.
 *
 * The file is a top-level YAML array, so it must keep at least one entry: when
 * the block is removed and nothing else remains, an empty `[]` array is restored
 * rather than leaving a comment-only document that would parse as null.
 * @param patchPath - patch file to rewrite.
 * @param host - stored host.
 * @param port - stored port.
 */
function reconcile(patchPath, host, port) {
  const original = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const stripped = original.replace(BLOCK_PATTERN, '')
  const lines = stripped.split('\n').filter(line => line.trim() !== '[]')
  let body = lines.join('\n').replace(/[\s]+$/, '')
  const hasEntries = body.split('\n').some(line => line.trim() !== '' && !line.trim().startsWith('#'))
  const block = renderBlock(host, port)
  if (block !== undefined) body = body === '' ? block : `${body}\n${block}`
  else if (!hasEntries) body = body === '' ? '[]' : `${body}\n[]`
  const next = `${body}\n`
  if (next === original) return
  const temporary = `${patchPath}.dsh-web-settings.tmp`
  writeFileSync(temporary, next, 'utf8')
  renameSync(temporary, patchPath)
}

/** Namespace of the tool guard's own settings section. */
export const TOOL_GUARD_SETTINGS_NAMESPACE = 'tool-guard'

/** Namespace the in-tree connection plugin owns; spelled here to avoid a package dependency. */
const CONNECTION_NAMESPACE = 'connection'

/** Model-facing tool that reports how this home publishes its Web UI. */
export const PUBLISH_STATUS_TOOL = 'web_publish_status'

/** Tool-guard settings: the tool names the guard refuses. */
const GuardSchema = z.object({
  deniedTools: z.array(String).default([]),
})

/**
 * Read the two served sections through the settings descriptor, which is the
 * only public read that does not require owning the namespace.
 * @param ctx - Host plugin context.
 * @returns the report the tool returns and renders.
 */
function collectPublishStatus(ctx) {
  const settings = ctx.get('settings')
  const webServer = ctx.get('webServer')
  const described = settings === undefined ? [] : settings.describe({ redactSecrets: true })
  const sectionOf = (namespace) => {
    for (const entry of described) {
      if (entry.ns === namespace && entry.value !== null && typeof entry.value === 'object') return entry.value
    }
    return {}
  }
  const connection = sectionOf(CONNECTION_NAMESPACE)
  const publish = sectionOf(WEB_PUBLISH_SETTINGS_NAMESPACE)
  const trustedHosts = Array.isArray(connection.trustedHosts) ? connection.trustedHosts : []
  const host = typeof publish.host === 'string' && publish.host !== '' ? publish.host : null
  const port = typeof publish.port === 'number' && publish.port !== 0 ? publish.port : null
  return {
    listeningPort: webServer === undefined ? null : webServer.port,
    storedHost: host,
    storedPort: port,
    cookieMaxAgeDays: typeof connection.cookieMaxAgeDays === 'number' ? connection.cookieMaxAgeDays : null,
    trustedHosts,
    remoteAccessConfigured: trustedHosts.length > 0,
    revokePending: connection.revokeBrowserSessions === true,
  }
}

/**
 * Render the status as the model-facing text block.
 * @param value - the collected report.
 * @returns one text block body.
 */
function renderPublishStatus(value) {
  const lines = [
    'Web UI publish status for this Harness home:',
    `- listening port: ${value.listeningPort === null ? 'not served by this process' : String(value.listeningPort)}`,
    `- stored listen host: ${value.storedHost === null ? 'not stored (follows --host or the default 127.0.0.1)' : value.storedHost}`,
    `- stored listen port: ${value.storedPort === null ? 'not stored (follows --port or the default 3080)' : String(value.storedPort)}`,
    `- browser cookie lifetime: ${value.cookieMaxAgeDays === null ? 'default' : `${String(value.cookieMaxAgeDays)} day(s)`}`,
    `- trusted hosts (/api Host fence allowlist): ${value.trustedHosts.length === 0 ? 'none — only loopback requests pass' : value.trustedHosts.join(', ')}`,
    `- remote access configured: ${value.remoteAccessConfigured ? 'yes' : 'no'}`,
    `- a browser-session revoke is pending: ${value.revokePending ? 'yes' : 'no'}`,
    '',
    'A stored value applies at the next start; an explicit --host or --port still wins. Trusted hosts only widen the fence and grant no access by themselves.',
  ]
  return lines.join('\n')
}

/**
 * Build the diagnostic tool. Written as a plain registry definition rather
 * than through `defineTool`, so this package needs no dependency on the tool
 * package: the registry consumes the same object either way.
 * @param ctx - Host plugin context.
 * @returns a registry-ready definition.
 */
function publishStatusTool(ctx) {
  return {
    name: PUBLISH_STATUS_TOOL,
    description:
      'Report how this Harness home publishes its Web UI: the listening port, the stored listen host and port, '
      + 'the browser-cookie lifetime, the trusted-host allowlist, and whether remote access is configured. '
      + 'Use it to explain why a browser cannot reach the UI or why /api calls are refused.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          listeningPort: { type: ['integer', 'null'] },
          storedHost: { type: ['string', 'null'] },
          storedPort: { type: ['integer', 'null'] },
          cookieMaxAgeDays: { type: ['integer', 'null'] },
          trustedHosts: { type: 'array', items: { type: 'string' } },
          remoteAccessConfigured: { type: 'boolean' },
          revokePending: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: renderPublishStatus(value) }],
    },
    execute: () => Promise.resolve(collectPublishStatus(ctx)),
  }
}

/**
 * Provide the publish settings surface, the diagnostic tool, and the tool guard.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config.
 */
export function apply(ctx, config = {}) {
  const configured = typeof config.patchPath === 'string' ? config.patchPath.trim() : ''
  const patchPath = configured === '' ? join(resolveHome(), 'profiles', 'web', 'cordis.patch.yml') : configured
  let current = () => ({ host: '', port: 0 })
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WEB_PUBLISH_SETTINGS_NAMESPACE, Schema, {}, {
      setSource: (source) => { current = source },
      onChange: () => {
        const values = current()
        reconcile(
          patchPath,
          typeof values.host === 'string' ? values.host.trim() : '',
          Number.isInteger(values.port) ? values.port : 0,
        )
      },
    })
  })

  // The tool registers whenever a registry exists; the plugin still activates
  // without one, so a non-web profile keeps reconciling its settings.
  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(
      () => toolsCtx.tools.register(publishStatusTool(ctx)),
      `web-settings: ${PUBLISH_STATUS_TOOL} tool`,
    )
  })

  // A waterfall listener owns the decision only by returning without `next()`;
  // every other call delegates so the rest of the policy chain stays live.
  let guard = () => ({ deniedTools: [] })
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    const denied = guard().deniedTools
    if (Array.isArray(denied) && denied.indexOf(exec.name) >= 0) {
      return { kind: 'deny', reason: `Tool "${exec.name}" is blocked by the tool-guard setting configured in the Web UI.` }
    }
    return next()
  }), 'web-settings: tool guard')
  ctx.inject(['settings'], (guardCtx) => {
    guardCtx.settings.installSection(ctx, TOOL_GUARD_SETTINGS_NAMESPACE, GuardSchema, {}, {
      setSource: (source) => { guard = source },
      onChange: () => {},
    })
  })
}
