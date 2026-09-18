/**
 * List every Vietnamese value identical to its English source, with the value
 * inline, so each can be confirmed as intentionally untranslated rather than a
 * missed string.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'C:/Users/Minhn/DSH_Customize'
const WORK = join(ROOT, 'locale-work')

interface Row { ns: string, source: string, target: string }

const manifest = JSON.parse(readFileSync(join(WORK, 'manifest.json'), 'utf8')) as Row[]

/** Values that are plausibly untranslated prose rather than symbols or brands. */
const suspicious: string[] = []
let total = 0

for (const row of manifest) {
  const source = JSON.parse(readFileSync(row.source, 'utf8')) as Record<string, string>
  const target = JSON.parse(readFileSync(row.target, 'utf8')) as Record<string, string>
  for (const key of Object.keys(source)) {
    if (source[key] !== target[key]) continue
    total += 1
    const value = source[key]!
    // A value worth a second look carries a lowercase word of 3+ letters that
    // is not a known identifier fragment.
    if (/[a-z]{3,}/.test(value) && !/^[A-Za-z]+$/.test(value.replace(/[^A-Za-z]/g, ''))) suspicious.push(`${row.ns}:${key} = ${JSON.stringify(value)}`)
    else if (/^[a-z]{3,}(\s+[a-z]{3,})+$/.test(value)) suspicious.push(`${row.ns}:${key} = ${JSON.stringify(value)}`)
  }
}

console.log(`identical values: ${total}`)
console.log(`worth reviewing (${suspicious.length}):`)
for (const line of suspicious) console.log(`  ${line}`)
