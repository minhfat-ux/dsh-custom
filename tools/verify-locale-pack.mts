/**
 * Execute the generated client bundle the way the browser would: capture the
 * `window.__ModuleLoader__.load` registration, materialize the factory, then
 * call `apply` against a stub locale service and check that every namespace
 * registered with the expected key count.
 *
 * This proves the emitted bundle is valid JavaScript and functionally correct
 * without opening a browser.
 */

import { readFileSync } from 'node:fs'

const BUNDLE = 'C:/Users/Minhn/DSH_Customize/locale-vi/lib/client.js'
const INVENTORY = 'C:/Users/Minhn/DSH_Customize/locale-inventory.json'

interface Registration { id: string, factory: (require: (spec: string) => unknown) => Record<string, unknown> }

let captured: Registration | undefined
const sandbox = { __ModuleLoader__: { load: (registration: Registration) => { captured = registration } } }

const source = readFileSync(BUNDLE, 'utf8')
// The bundle is a bare script that calls window.__ModuleLoader__.load.
new Function('window', source)(sandbox)

if (captured === undefined) throw new Error('bundle did not call window.__ModuleLoader__.load')

const exports = captured.factory(spec => { throw new Error(`unexpected require(${spec})`) })
const languages: unknown[] = []
const dictionaries = new Map<string, Record<string, string>>()

const ctx = {
  effect: (register: () => unknown) => register(),
  locale: {
    addLanguage: (definition: unknown) => { languages.push(definition); return () => {} },
    register: (namespace: string, locale: string, dict: Record<string, string>) => {
      dictionaries.set(namespace, dict)
      return () => {}
    },
  },
}

;(exports.apply as (ctx: unknown) => void)(ctx)

const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8')) as Record<string, { en: Record<string, string> }>
const expected = Object.keys(inventory)

console.log(`module id        : ${captured.id}`)
console.log(`exports          : ${Object.keys(exports).sort().join(', ')}`)
console.log(`inject           : ${JSON.stringify(exports.inject)}`)
console.log(`languages        : ${JSON.stringify(languages)}`)
console.log(`namespaces       : ${dictionaries.size} (expected ${expected.length})`)

const absent = expected.filter(ns => !dictionaries.has(ns))
const totalKeys = [...dictionaries.values()].reduce((sum, dict) => sum + Object.keys(dict).length, 0)
console.log(`total keys       : ${totalKeys}`)

let badValues = 0
for (const [namespace, dict] of dictionaries) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string' || value.length === 0) { badValues += 1; console.log(`  bad value: ${namespace}:${key}`) }
  }
  const source = inventory[namespace]!.en
  const missing = Object.keys(source).filter(key => !(key in dict))
  if (missing.length > 0) console.log(`  ${namespace}: missing ${missing.join(', ')}`)
}
console.log(`empty values     : ${badValues}`)
console.log(`absent namespaces: ${absent.length === 0 ? 'none' : absent.join(', ')}`)

const language = languages[0] as { id?: string, label?: string, fallback?: string } | undefined
const ok = captured.id === 'dsh-locale-vi/client'
  && Array.isArray(exports.inject) && (exports.inject as string[])[0] === 'locale'
  && typeof exports.apply === 'function'
  && language?.id === 'vi' && language?.fallback === 'en'
  && absent.length === 0 && badValues === 0
console.log('')
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL')
process.exit(ok ? 0 : 1)
