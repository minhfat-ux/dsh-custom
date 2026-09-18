/**
 * Verify the offline echo adapter against the raw streaming contract.
 *
 * The contract is documented on `StreamChunk`: index-correlated block
 * start/deltas/end, usage before the terminal finish, nothing after it, and a
 * caller signal that is honoured. This harness asserts each clause directly,
 * then drives `apply` with a stub context to check the registration surface.
 */

import { pathToFileURL } from 'node:url'

const MODULE = 'C:/Users/Minhn/DSH_Customize/dsh-llm-echo/lib/index.js'
const plugin = await import(pathToFileURL(MODULE).href) as {
  name: string
  inject: string[]
  PROVIDER: string
  MODEL: string
  createEchoAdapter: (read: () => { prefix?: string }) => {
    providerInfo: (provider: string) => { id: string, name: string }
    listModels: (provider: string) => Promise<Array<{ id: string }>>
    resolveModel: (provider: string, model: string) => Promise<{ context?: unknown }>
    stream: (options: unknown) => AsyncIterable<Record<string, unknown>>
  }
  apply: (ctx: unknown, config?: unknown) => void
}

const problems: string[] = []
const check = (condition: boolean, message: string) => { if (!condition) problems.push(message) }

const adapter = plugin.createEchoAdapter(() => ({ prefix: '[local-echo]' }))

// The runtime calls all six of these, so a plain-object adapter must state each
// one: the abstract class's defaults are part of the runtime contract.
for (const method of ['providerInfo', 'providerRetryPolicy', 'imageRequestPricing', 'listModels', 'resolveModel', 'prepareCall']) {
  check(typeof (adapter as unknown as Record<string, unknown>)[method] === 'function', `the adapter is missing ${method}()`)
}
check(adapter.providerInfo(plugin.PROVIDER).id === plugin.PROVIDER, 'providerInfo id must equal the registered route')
check(adapter.providerRetryPolicy(plugin.PROVIDER) === undefined, 'providerRetryPolicy must defer to the ordinary defaults')
check(adapter.imageRequestPricing(plugin.PROVIDER, plugin.MODEL) === undefined, 'imageRequestPricing must declare none')
const models = await adapter.listModels(plugin.PROVIDER)
check(Array.isArray(models) && models[0]?.id === plugin.MODEL, 'listModels did not advertise the echo model')
const resolved = await adapter.resolveModel(plugin.PROVIDER, plugin.MODEL)
check(resolved?.context !== undefined, 'resolveModel did not report a context budget')

// Drive the contract through prepareCall, which is the path the runtime dispatches.
const chunks: Array<Record<string, unknown>> = []
const controller = new AbortController()
const prepared = await adapter.prepareCall(plugin.PROVIDER, plugin.MODEL, controller.signal)
check(prepared?.model !== undefined && typeof prepared?.stream === 'function', 'prepareCall did not bind a model and a stream')
for await (const chunk of prepared.stream({
  provider: plugin.PROVIDER,
  model: plugin.MODEL,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'xin chao the gioi' }] }],
  tools: [{ name: 'demo_tool' }],
  signal: controller.signal,
})) chunks.push(chunk)

const kinds = chunks.map(chunk => String(chunk.type))
const first = chunks[0]
const finishIndex = kinds.indexOf('finish')
const usageIndex = kinds.indexOf('usage')

check(first?.type === 'block-start' && first.index === 0 && first.blockType === 'text', 'the stream did not open with a text block-start')
check(kinds.filter(kind => kind === 'finish').length === 1, 'the stream must finish exactly once')
check(finishIndex === chunks.length - 1, 'a chunk was emitted after the terminal finish')
check(usageIndex >= 0, 'the stream emitted no usage chunk')
check(usageIndex < finishIndex, 'usage must precede the terminal finish')

const deltas = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => String(chunk.text)).join('')
const blockEnd = chunks.find(chunk => chunk.type === 'block-end')?.block as { type?: string, text?: string } | undefined
check(deltas.length > 0, 'the stream emitted no text deltas')
check(blockEnd?.type === 'text' && blockEnd?.text === deltas, 'the block-end text does not equal the concatenated deltas')
check(deltas.includes('xin chao the gioi'), 'the answer did not echo the user text')
check(deltas.includes('tools offered: 1'), 'the answer did not report the offered tool count')

const usage = chunks[usageIndex]?.usage as { inputTokens?: number, outputTokens?: number, totalTokens?: number } | undefined
check(Number.isSafeInteger(usage?.inputTokens) && (usage?.inputTokens ?? 0) >= 1, 'usage.inputTokens is not a positive integer')
check(Number.isSafeInteger(usage?.outputTokens) && (usage?.outputTokens ?? 0) >= 1, 'usage.outputTokens is not a positive integer')
check(usage?.totalTokens === (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0), 'usage.totalTokens does not equal input plus output')

const finish = chunks[finishIndex]?.reason as { kind?: string } | undefined
check(finish?.kind === 'stop', `the finish reason is ${String(finish?.kind)} instead of stop`)

// A cancelled caller must stop the stream rather than resolve it.
const cancelled = new AbortController()
cancelled.abort()
let aborted = false
try {
  for await (const _chunk of adapter.stream({
    provider: plugin.PROVIDER,
    model: plugin.MODEL,
    messages: [{ role: 'user', content: 'hi' }],
    signal: cancelled.signal,
  })) { /* drain */ }
} catch { aborted = true }
check(aborted, 'an aborted request was not stopped')

// The registration surface.
const registered: Array<{ providers?: string[], adapter?: unknown }> = []
const configurable: unknown[] = []
const sections: string[] = []
const settingsService = {
  installSection: (_owner: unknown, namespace: string) => { sections.push(namespace) },
}
const stub = {
  effect: (fn: () => unknown) => fn(),
  inject: (_names: string[], callback: (scope: unknown) => unknown) => callback({ settings: settingsService }),
  llm: {
    registerAdapter: (providers: string[], instance: unknown) => { registered.push({ providers, adapter: instance }); return () => {} },
    registerConfigurableProviders: (entries: unknown[]) => { configurable.push(...entries) },
  },
}
plugin.apply(stub, {})
check(plugin.inject[0] === 'llm', `unexpected inject ${JSON.stringify(plugin.inject)}`)
check(registered.length === 1 && registered[0]?.providers?.[0] === plugin.PROVIDER, 'the adapter was not registered for its route')
check(registered[0]?.adapter === undefined ? false : typeof (registered[0]?.adapter as { stream?: unknown }).stream === 'function', 'the registered adapter exposes no stream')
check(configurable.length === 1 && (configurable[0] as { provider?: string }).provider === plugin.PROVIDER, 'the provider was not published as configurable')
check(sections.includes('local-echo'), 'the settings section was not installed')

console.log(`module            : ${plugin.name}`)
console.log(`chunks            : ${kinds.join(' -> ')}`)
console.log(`deltas            : ${String(chunks.filter(c => c.type === 'text-delta').length)} pieces, ${String(deltas.length)} chars`)
console.log(`usage             : in=${String(usage?.inputTokens)} out=${String(usage?.outputTokens)} total=${String(usage?.totalTokens)}`)
console.log(`finish            : ${String(finish?.kind)} (last chunk)`)
console.log(`abort honoured    : ${aborted ? 'yes' : 'no'}`)
console.log(`registered        : ${String(registered.length)} adapter, ${String(configurable.length)} configurable provider, sections=[${sections.join(',')}]`)
console.log('')

if (problems.length > 0) {
  for (const problem of problems) console.log(`FAIL: ${problem}`)
  process.exit(1)
}
console.log('RESULT: PASS')
