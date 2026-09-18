/**
 * Split the locale inventory into one source file per namespace, so each
 * translation batch reads only its own keys and writes an isolated result.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'C:/Users/Minhn/DSH_Customize'
const WORK = join(ROOT, 'locale-work')

interface Entry { file: string, exportName: string, en: Record<string, string> }

const inventory = JSON.parse(readFileSync(join(ROOT, 'locale-inventory.json'), 'utf8')) as Record<string, Entry>

mkdirSync(WORK, { recursive: true })
const manifest: Array<{ ns: string, keys: number, source: string, target: string }> = []

for (const [ns, entry] of Object.entries(inventory)) {
  const safe = ns.replaceAll('.', '_')
  const source = join(WORK, `${safe}.source.json`)
  const target = join(WORK, `${safe}.vi.json`)
  writeFileSync(source, `${JSON.stringify(entry.en, null, 2)}\n`)
  manifest.push({ ns, keys: Object.keys(entry.en).length, source, target })
}

manifest.sort((a, b) => b.keys - a.keys)
writeFileSync(join(WORK, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const total = manifest.reduce((sum, row) => sum + row.keys, 0)
console.log(`namespaces: ${manifest.length}, keys: ${total}`)
console.log('')
for (const row of manifest) console.log(`  ${row.ns.padEnd(24)} ${String(row.keys).padStart(4)}`)
