/**
 * Generate the Vietnamese language pack's browser bundle from the translated
 * dictionaries.
 *
 * The DeepSeek Harness client module system serves each `dsh.client` row's
 * built `./client` file as a lazy CommonJS factory wrapped in
 * `window.__ModuleLoader__.load({ id, factory })`. The pack needs no shared
 * module, so the wrapper is emitted directly instead of running a bundler.
 *
 * Validation is the point of this script: every translated file must have
 * exactly the source key set, and every `{placeholder}` must survive.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'C:/Users/Minhn/DSH_Customize'
const WORK = join(ROOT, 'locale-work')
const PACK = join(ROOT, 'locale-vi')
const PACKAGE_NAME = 'dsh-locale-vi'
const LANGUAGE = { id: 'vi', label: 'Tiếng Việt', fallback: 'en' }

interface Row { ns: string, keys: number, source: string, target: string }

const manifest = JSON.parse(readFileSync(join(WORK, 'manifest.json'), 'utf8')) as Row[]
const placeholdersOf = (value: string) => [...value.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(m => m[0]).sort()

const dictionaries: Record<string, Record<string, string>> = {}
const missing: string[] = []
const mismatched: Array<Record<string, unknown>> = []
const identical: string[] = []

for (const row of manifest) {
  if (!existsSync(row.target)) { missing.push(row.ns); continue }
  const source = JSON.parse(readFileSync(row.source, 'utf8')) as Record<string, string>
  const target = JSON.parse(readFileSync(row.target, 'utf8')) as Record<string, string>
  const sourceKeys = Object.keys(source)
  const targetKeys = Object.keys(target)

  const absent = sourceKeys.filter(key => !(key in target))
  const extra = targetKeys.filter(key => !(key in source))
  const drifted = sourceKeys.filter(key => key in target
    && JSON.stringify(placeholdersOf(source[key]!)) !== JSON.stringify(placeholdersOf(target[key]!)))

  if (absent.length > 0 || extra.length > 0 || drifted.length > 0) {
    mismatched.push({ ns: row.ns, absent, extra, placeholderDrift: drifted })
    continue
  }
  for (const key of sourceKeys) if (source[key] === target[key]) identical.push(`${row.ns}:${key}`)
  dictionaries[row.ns] = Object.fromEntries(sourceKeys.map(key => [key, target[key]!]))
}

if (missing.length > 0 || mismatched.length > 0) {
  console.log(`missing translations (${missing.length}): ${missing.join(', ')}`)
  for (const row of mismatched) console.log('  mismatch:', JSON.stringify(row))
  console.log('no bundle written')
  process.exit(1)
}

const namespaces = Object.keys(dictionaries)
const totalKeys = namespaces.reduce((sum, ns) => sum + Object.keys(dictionaries[ns]!).length, 0)

const bundle = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(`${PACKAGE_NAME}/client`)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.apply = apply;
    exports.inject = void 0;

    var inject = exports.inject = ["locale"];

    /** Namespace to Vietnamese dictionary, generated from locale-work/. */
    var DICTIONARIES = ${JSON.stringify(dictionaries, null, 2)};

    /**
     * Register the Vietnamese language and every translated namespace.
     * @param {object} ctx - client root context carrying the locale service.
     */
    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.addLanguage(${JSON.stringify(LANGUAGE)}),
        "locale-vi: language definition",
      );
      for (var namespace of Object.keys(DICTIONARIES)) {
        ctx.effect(
          () => ctx.locale.register(namespace, ${JSON.stringify(LANGUAGE.id)}, DICTIONARIES[namespace]),
          "locale-vi: " + namespace + " dictionary",
        );
      }
    }

    return module.exports;
  }
});
`

writeFileSync(join(PACK, 'lib/client.js'), bundle)

console.log(`bundle written: ${join(PACK, 'lib/client.js')}`)
console.log(`namespaces: ${namespaces.length}, keys: ${totalKeys}`)
console.log(`bundle bytes: ${Buffer.byteLength(bundle)}`)
if (identical.length > 0) {
  console.log('')
  console.log(`values identical to English (${identical.length}) — review that each is intentional:`)
  for (const entry of identical) console.log(`  ${entry}`)
}
