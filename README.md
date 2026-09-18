# dsh-custom — customization toolkit for DeepSeek Harness

English | [Tiếng Việt](README.vi.md) | [中文](README.zh.md)

An **unofficial** customization set for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`)
0.1.5-rc.1. Not affiliated with or endorsed by DeepSeek.

Most of it runs as **out-of-tree plugins**: nothing here requires patching the harness checkout. The one
exception is the browser-transport settings, which live in a small patch because the values are captured inside
the connection plugin (see below).

## What is here

| Directory | What it is |
|---|---|
| `locale-vi/` | Vietnamese language pack: a client plugin registering the `vi` locale and 39 dictionaries |
| `locale-work/` | The translation source: 39 `*.source.json` (English, extracted from the harness) and their `*.vi.json` |
| `dsh-web-settings/` | Settings cards, a right-Sidebar status panel, a transcript node, a diagnostic tool, and a tool guard |
| `dsh-llm-echo/` | An offline LLM provider so the GUI can be exercised without an API key |
| `tools/` | The extraction, build, and verification scripts used to produce and check all of the above |
| `deploy/` | Remote-access notes and a Caddyfile for the two supported access models |

Coverage of the language pack: **39 namespaces, 1185 keys**, everything the Web GUI ships.

## Install

Each package is a plain `dsh` profile dependency. From a checkout or an installed `dsh`:

```sh
dsh plugin --profile web add /path/to/locale-vi
dsh plugin --profile web add /path/to/dsh-web-settings
dsh plugin --profile web add /path/to/dsh-llm-echo
```

Then mount each one in `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: locale-vi
      name: dsh-locale-vi
- insert:
    - id: web-publish
      name: dsh-web-settings
- insert:
    - id: llm-echo
      name: dsh-llm-echo
```

Restart `dsh web`. The language pack adds **Tiếng Việt** to Settings → General → Language; the other two add
cards under Settings → Plugins, a right-Sidebar panel, and a `local-echo` provider.

### The one in-tree patch

`dsh-web-settings` writes its stored listen host and port into the profile's patch layer, so it needs the profile
to set:

```json
"dsh": { "profile": { "patchReload": "startup" } }
```

With `"live"`, the plugin's own write during boot makes the loader re-apply the tree mid-mount and the webserver
row rebinds while its listener is open, which fails the boot. Host and port take effect at the next start either
way, so `startup` matches the feature.

`cookieMaxAgeDays`, `trustedHosts`, and the "sign out every browser" action do **not** need that patch — but they
do need the `connection` plugin to read its policy live, which is the small upstream patch described in
`CUSTOMIZE_PLAN.md` §10.3. Without it those settings persist but have no effect until a restart.

## Verify

Everything was checked by running it, not by inspection. Each script prints `RESULT: PASS` or the failing
assertions:

| Script | Proves |
|---|---|
| `tools/verify-locale-pack.mts` | The generated client bundle loads, registers `vi`, and carries all 39 namespaces and 1185 keys |
| `tools/verify-web-settings-client.mts` | The three cards, the panel, and the chat node register with the right keys and render; the chat Definition matches only its three event families |
| `tools/verify-web-settings-host.mts` | The settings sections install, the tool executes and renders, and the guard denies without delegating and delegates otherwise |
| `tools/verify-llm-echo.mts` | The adapter satisfies the raw stream contract: block start/deltas/end correlate, usage precedes the terminal finish, nothing follows it, cancellation stops the stream |
| `tools/verify-fence-semantics.ps1` | The `/api` Host/Origin fence decisions, and that a session cookie is bound to the authority it was minted for |
| `tools/verify-proxy-model.ps1` | A Host-preserving reverse proxy works end to end; a Host-rewriting one (nginx's default) breaks every API call |
| `tools/verify-port-precedence.ps1` | The stored listen port applies at the next start and an explicit `--port` still wins |
| `tools/verify-connection-settings.ps1` | A settings write reaches the live fence, the minted cookie lifetime, and the revocation |

The scripts that need a running profile take its launch token as an argument, for example:

```powershell
powershell -File tools/verify-fence-semantics.ps1 <TOKEN>
```

## Rebuilding the language pack

```sh
corepack pnpm exec tsx tools/extract-locales.mts   # read the harness dictionaries into locale-inventory.json
corepack pnpm exec tsx tools/split-locales.mts     # one file per namespace under locale-work/
# edit locale-work/<namespace>.vi.json
corepack pnpm exec tsx tools/build-locale-pack.mts # regenerate locale-vi/lib/client.js and validate
```

`build-locale-pack.mts` refuses to write when a translation is missing a key or drops a `{placeholder}`.

## Security

- **Never publish a Harness home.** `$DSH_HOME/.credentials.yaml` holds the provider API key, and
  `settings.yaml` may hold more. The `.gitignore` here excludes `.dsh-dev/` for exactly that reason.
- **The browser session cookie is equivalent to remote code execution.** Anyone holding it can run tools in your
  workspace and read your credentials through them.
- **The cookie is not `Secure`** because the carrier has no TLS. Exposing the UI on a public domain requires a
  TLS-terminating proxy in front of the loopback listener; see `deploy/README.md`.
- **Never bind `0.0.0.0` directly.** `dsh web` refuses the flag for this reason.
- `trustedHosts` only widens the Host/Origin fence. It grants no access by itself.

## License

MIT, matching the harness. The extracted English strings in `locale-work/*.source.json` and
`locale-inventory.json` are derived from DeepSeek Harness, which is MIT-licensed.
