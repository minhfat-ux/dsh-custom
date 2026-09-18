/**
 * Offline echo LLM adapter.
 *
 * The harness declares no `instanceof` requirement on an adapter — the contract
 * is structural — so this is a plain object with a `stream` method and needs no
 * dependency on the LLM package.
 *
 * It performs no network call, so there is no provider request to attach
 * `attributionHeaders()` to. Everything else the wire contract requires is
 * honoured: index-correlated block start/deltas/end, usage before the terminal
 * finish, nothing after it, and `options.signal` observed between chunks.
 *
 * Its purpose is to exercise the product without a key: the GUI, the agent
 * loop, tool calls, transcripts, and streaming all run against a deterministic
 * provider.
 */

import z from '@deepseek-ai/schemastery'

/** Stable Cordis plugin name. */
export const name = 'llm-local-echo'

/** The LLM capability must exist before a route can be registered. */
export const inject = ['llm']

/** Provider route this adapter owns. */
export const PROVIDER = 'local-echo'

/** The one advertised model id. */
export const MODEL = 'echo-1'

/** Settings namespace carrying the reply prefix. */
export const SETTINGS_NAMESPACE = 'local-echo'

/** Configurable reply prefix. */
export const Config = z.object({
  /** Text the offline reply starts with, so a transcript shows it is not a real model. */
  prefix: z.string().default('[local-echo]'),
})

/** Rough token estimate for a text: four characters per token, never zero. */
function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4))
}

/** Text of one message, for both the plain-string and content-block shapes. */
function messageText(message) {
  if (message === null || typeof message !== 'object') return ''
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('')
}

/** Text of the last user message, or an empty string. */
function lastUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message !== null && typeof message === 'object' && message.role === 'user') {
      const text = messageText(message)
      if (text !== '') return text
    }
  }
  return ''
}

/** Split text into fixed-size pieces so the stream has more than one delta. */
function pieces(text, size) {
  const out = []
  for (let index = 0; index < text.length; index += size) out.push(text.slice(index, index + size))
  return out.length === 0 ? [''] : out
}

/** Yield to the event loop so a consumer can cancel between chunks. */
function tick() {
  return new Promise(resolve => { setImmediate(resolve) })
}

/**
 * Build the adapter over a live configuration reader.
 * @param read - thunk returning the current config.
 * @returns a registry-ready adapter object.
 */
export function createEchoAdapter(read) {
  const adapter = {
    /** @returns display metadata whose id equals the registered route. */
    providerInfo: provider => ({ id: provider, name: 'Local echo (offline)' }),

    /**
     * The abstract class supplies this default through inheritance; a plain
     * object must state it, because the registry calls it unconditionally while
     * preparing routes.
     * @returns undefined, so the ordinary retry defaults apply.
     */
    providerRetryPolicy: () => undefined,

    /** @returns undefined, so consumers keep their own neutral image estimate. */
    imageRequestPricing: () => undefined,

    /** @returns the models this offline route advertises. */
    listModels: () => Promise.resolve([{ id: MODEL, name: 'Echo 1 (offline)' }]),

    /** @returns exact-route metadata with a generous context budget. */
    resolveModel: (provider, model) => Promise.resolve({
      provider,
      id: model,
      name: model === MODEL ? 'Echo 1 (offline)' : model,
      context: { window: 128000 },
      defaultMaxTokens: 1024,
    }),

    /**
     * Bind this generation's metadata and its stream entry point. This is the
     * path the runtime actually dispatches through, so it is not optional for a
     * plain-object adapter even though the abstract class defines a default.
     * @param provider - registered route.
     * @param model - exact model id.
     * @param signal - cancellation for the metadata lookup.
     * @returns the prepared call.
     */
    prepareCall: async (provider, model, signal) => ({
      model: await adapter.resolveModel(provider, model, signal),
      stream: options => adapter.stream(options),
    }),

    /**
     * Stream one offline answer.
     * @param options - the assembled request.
     * @returns the chunk stream.
     */
    async *stream(options) {
      const prefix = typeof read().prefix === 'string' && read().prefix !== '' ? read().prefix : '[local-echo]'
      const asked = lastUserText(options.messages)
      const body = asked === ''
        ? 'No user text was found in this request.'
        : `You said: ${asked.slice(0, 400)}`
      const text = `${prefix} No provider was called. ${body} (model: ${String(options.model)}, messages: ${String(Array.isArray(options.messages) ? options.messages.length : 0)}, tools offered: ${String(Array.isArray(options.tools) ? options.tools.length : 0)})`
      yield { type: 'block-start', index: 0, blockType: 'text' }
      for (const piece of pieces(text, 32)) {
        if (options.signal !== undefined && options.signal.aborted) {
          throw new Error('local-echo: request aborted by the caller')
        }
        await tick()
        yield { type: 'text-delta', index: 0, text: piece }
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      const inputTokens = estimateTokens(asked)
      const outputTokens = estimateTokens(text)
      yield { type: 'usage', usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  return adapter
}

/**
 * Register the offline route and its settings section.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config.
 */
export function apply(ctx, config = {}) {
  let current = () => (config === null || typeof config !== 'object' ? {} : config)
  ctx.effect(
    () => ctx.llm.registerAdapter([PROVIDER], createEchoAdapter(() => current())),
    'llm-local-echo: route',
  )
  ctx.llm.registerConfigurableProviders([{
    provider: PROVIDER,
    displayName: 'Local echo (offline)',
    settingsNs: SETTINGS_NAMESPACE,
    settingsPath: [],
  }])
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => { current = source },
      onChange: () => {},
    })
  })
}
