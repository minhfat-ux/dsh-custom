/**
 * Extract every client locale dictionary into one JSON inventory.
 *
 * Dictionaries live in `locales.ts` (plural, the common case) and `locale.ts`
 * (singular, ui-chat). The locale package keeps its `common` and
 * `settings.locale` pairs under `src/locales/{en,settings}.ts`, which the
 * filename filter cannot reach, so those two are listed explicitly.
 *
 * The namespace comes from, in order: an explicit override, the module's
 * `NS` export, a module-local `const NS`, the file's own
 * `LocaleNamespaceMap` declaration, or the package's single such declaration.
 * Declared keys may be quoted or bare identifiers, and carry JSDoc.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'C:/Users/Minhn/DSH_Customize/deepseek-harness'
const OUT = 'C:/Users/Minhn/DSH_Customize/locale-inventory.json'
const CLIENT = join(REPO, 'packages/client')

/** `<repo-relative file>#<export name>` → namespace, for pairs no rule can infer. */
const NS_OVERRIDES: Record<string, string> = {
  'packages/client/locale/src/locales/en.ts#en': 'common',
  'packages/client/locale/src/locales/settings.ts#en': 'settings.locale',
  // Registered from index.ts (ACCESS_NS) using this pair, while the same
  // module's `en` pair belongs to the settings row.
  'packages/client/ui-permission-presets/src/client/locales.ts#accessEn': 'permission.access',
  'packages/client/ui-permission-presets/src/client/locales.ts#en': 'settings.permission',
  // These two register a `const NS` declared in index.ts, not in the dictionary module.
  'packages/client/ui-settings-plugins/src/client/locales.ts#en': 'settings.plugins',
  'packages/client/ui-sidebar-documentpreview/src/client/locales.ts#en': 'sidebarDocumentPreview',
}

/** Dictionary modules that export no dictionary of their own. */
const SKIP = new Set(['packages/client/ui-tool/src/client/locale.ts'])

/** Modules outside the basename filter, named explicitly. */
const EXTRA = [
  join(CLIENT, 'locale/src/locales/en.ts'),
  join(CLIENT, 'locale/src/locales/settings.ts'),
]

/** Recursively collect files whose basename passes the filter. */
function walk(dir: string, match: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry === 'tests') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, match, found)
    else if (match(entry)) found.push(path)
  }
  return found
}

const rel = (file: string) => relative(REPO, file).replaceAll('\\', '/')
const packageDirOf = (file: string) => rel(file).split('/').slice(0, 3).join('/')

// Every `interface LocaleNamespaceMap { ... }` declaration, by file.
const declarations = new Map<string, string[]>()
for (const file of walk(CLIENT, name => name.endsWith('.ts'))) {
  const source = readFileSync(file, 'utf8')
  const names: string[] = []
  for (const block of source.matchAll(/interface LocaleNamespaceMap\s*\{([^}]*)\}/g)) {
    const body = block[1]!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const key of body.matchAll(/(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/g)) names.push(key[1] ?? key[2]!)
  }
  if (names.length > 0) declarations.set(rel(file), names)
}

const dictFiles = [...walk(CLIENT, name => name === 'locales.ts' || name === 'locale.ts'), ...EXTRA]
const inventory: Record<string, { file: string, exportName: string, en: Record<string, string> }> = {}
const problems: Array<Record<string, unknown>> = []

for (const file of dictFiles) {
  const key = rel(file)
  if (SKIP.has(key)) continue
  const dir = packageDirOf(file)
  const source = readFileSync(file, 'utf8')
  const sameFile = declarations.get(key) ?? []
  const samePackage = [...declarations.entries()]
    .filter(([other]) => other.startsWith(`${dir}/`) && other !== key)
    .flatMap(([, names]) => names)
  const localNS = /(?:export\s+)?const\s+NS\s*=\s*'([^']+)'/.exec(source)?.[1]

  try {
    const mod = await import(pathToFileURL(file).href) as Record<string, unknown>
    const candidates = Object.entries(mod).filter(
      ([name, value]) => name === 'en' || (name.endsWith('En') && typeof value === 'object' && value !== null),
    ) as Array<[string, Record<string, string>]>
    if (candidates.length === 0) {
      problems.push({ file: key, why: 'no English dictionary export' })
      continue
    }

    let declarationCursor = 0
    for (const [exportName, en] of candidates) {
      const ns = NS_OVERRIDES[`${key}#${exportName}`]
        ?? (typeof mod.NS === 'string' && exportName === 'en' ? mod.NS : undefined)
        ?? (localNS !== undefined && exportName === 'en' ? localNS : undefined)
        ?? sameFile[declarationCursor]
        ?? (samePackage.length === 1 ? samePackage[0] : undefined)
      if (ns === undefined) {
        problems.push({
          file: key, exportName, why: 'unresolved namespace',
          sameFileDeclarations: sameFile,
          samePackageDeclarations: samePackage,
          keys: Object.keys(en).length,
        })
        continue
      }
      if (inventory[ns] !== undefined) {
        problems.push({ file: key, exportName, why: `duplicate namespace ${ns}`, alsoIn: inventory[ns]!.file })
        continue
      }
      inventory[ns] = { file: key, exportName, en }
      declarationCursor += 1
    }
  } catch (error) {
    problems.push({ file: key, why: String((error as Error)?.message ?? error) })
  }
}

writeFileSync(OUT, `${JSON.stringify(inventory, null, 2)}\n`)

const totalKeys = Object.values(inventory).reduce((sum, entry) => sum + Object.keys(entry.en).length, 0)
console.log(`dictionary modules : ${dictFiles.length}`)
console.log(`namespaces         : ${Object.keys(inventory).length}`)
console.log(`total English keys : ${totalKeys}`)
console.log('')
for (const [ns, entry] of Object.entries(inventory).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${ns.padEnd(26)} ${String(Object.keys(entry.en).length).padStart(4)} keys  ${entry.exportName.padEnd(12)} ${entry.file}`)
}
if (problems.length > 0) {
  console.log('')
  console.log(`problems (${problems.length}):`)
  for (const problem of problems) console.log('  ', JSON.stringify(problem))
}
