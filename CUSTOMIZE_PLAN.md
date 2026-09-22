# Kế hoạch customize DeepSeek Harness — bản 0.1.5-rc.1

Tài liệu này là bản đồ quyết định: sửa ở đâu, có cần fork không, và cái gì sẽ chặn bạn.
Máy: Windows, `DSH_HOME = C:\Users\Minhn\.dsh`, bản đang chạy là `@deepseek-ai/dsh@0.1.5-rc.1` (npm global).

---

## 1. Trạng thái đã xác minh

| Hạng mục | Giá trị | Cách xác minh |
|---|---|---|
| Source checkout | `C:\Users\Minhn\DSH_Customize\deepseek-harness` | `git log -1` |
| Phiên bản | tag `dsh-v0.1.5-rc.1`, commit `183f08e` | khớp đúng bản npm đang chạy |
| `pnpm install` | 1266 gói, 290 workspace project | `pnpm install` exit 0 |
| `pnpm run typecheck` | exit 0 | điều kiện "setup complete" của `docs/development.md` |
| Node | `v24.19.0` (repo cần `^22.19.0 \|\| >=24.0.0`) | OK |
| Git | `2.55.0.windows.3`, phải dùng `http.sslBackend=openssl` | schannel lỗi `SEC_E_NO_CREDENTIALS` |
| pnpm | **không có trên PATH**, chỉ gọi được qua `corepack pnpm` | `corepack enable` cần quyền admin |
| Corepack | `0.35.0` | đủ để chạy `pnpm@11.7.0` đã pin |

**Hệ quả bắt buộc:** mọi lệnh pnpm phải viết `corepack pnpm ...`, không phải `pnpm ...`.

---

## 2. Ba tầng customize — chọn tầng thấp nhất đủ dùng

| Tầng | Nơi sửa | Fork? | Reload |
|---|---|---|---|
| **1. Patch layer** | `~\.dsh\profiles\web\cordis.patch.yml` và `~\.dsh\cordis.patch.yml` | Không | **Live** (`patchReload: live`) |
| **2. Plugin ngoài repo** | Package npm riêng, cài vào profile | Không | Live với tầng 1 |
| **3. Fork source** | `deepseek-harness\packages\**` | Có | Phải `pnpm run build` |

Thứ tự áp layer (theo `docs/architecture.md`): bundle của profile → `cordis.patch.yml` của profile → patch mức home → `--patch` overlay.
Patch nhắm một row **theo `id`** và thay toàn bộ config của row đó, hoặc `insert` row mới.

**Bằng chứng tầng 1–2 đã chạy trên máy bạn:** `~\.dsh\profiles\web\cordis.patch.yml` hiện đang tắt `directory-picker`, chèn `dsh-host-directory-picker-browse`, và nạp plugin ngoài repo `dsh-git-rollback` từ trong thư mục resources của một VS Code extension. Không có dòng code nào trong repo bị sửa.

---

## 3. Cách ly môi trường — làm trước khi nghịch

`apps/cli/src/args.ts` **không có cờ `--home`**. Home được giải qua `resolveDshHome()` với thứ tự ưu tiên (`packages/util/home-paths/src/index.ts`):
**path cấu hình tường minh > `$DSH_HOME` > `~/.dsh`**.

Nghĩa là cách ly bằng biến môi trường:

```powershell
$env:DSH_HOME = "C:\Users\Minhn\DSH_Customize\.dsh-dev"
```

**Vì sao nên làm:** `~\.dsh\profiles\web` là profile đang phục vụ GUI hiện tại, có sẵn tùy biến FPT Harness và plugin git-rollback. Nếu chạy bản fork với cùng `DSH_HOME`, mọi thay đổi patch/plugin của bạn sẽ tác động luôn vào bản đang dùng hằng ngày.

**Cái giá của home mới:** phải tạo lại profile và nạp lại thông tin xác thực. Các file cần copy từ `~\.dsh`:
- `.credentials.yaml` — khóa API
- `settings.yaml` — cấu hình người dùng
- `profiles\web\` — nếu muốn giữ nguyên cấu trúc bundle

---

## 4. Sửa `dsh plugin` trước khi cần đến nó

`apps/cli/src/plugin.ts:134` gọi `spawnSync('pnpm', ...)`; nếu không thấy pnpm trên PATH nó báo:

> `dsh: pnpm not found on PATH — install pnpm to manage profile plugins`

Vì `npm prefix = C:\Users\Minhn\AppData\Roaming\npm` (thuộc quyền người dùng), cài pnpm không cần admin:

```powershell
npm install -g pnpm@11.7.0
```

Đã kiểm chứng bằng `--dry-run`: hợp lệ, thêm đúng 1 package, không cần quyền nâng cao.
Đây là điều kiện để dùng `dsh plugin --profile <name> add <pkg|path>` — đường cài plugin ngoài repo.

---

## 5. Vòng build và chạy

```powershell
cd C:\Users\Minhn\DSH_Customize\deepseek-harness
git switch -c my-custom            # đang ở detached HEAD, tạo branch để giữ sửa đổi
$env:DSH_HOME = "C:\Users\Minhn\DSH_Customize\.dsh-dev"
corepack pnpm run build            # tsc host + tsdown host + tsc client + tsdown client + build:web
corepack pnpm dsh web --port 8090  # 3080 đang bị GUI hiện tại chiếm
```

- Cờ `--port` đặt **sau** `web`: launcher chỉ parse cờ của nó rồi chuyển phần còn lại cho app (`apps/cli/reference/README.md`).
- `pnpm dsh` chạy thẳng `node --import tsx/esm apps/cli/src/bin.ts` — sửa code TypeScript chạy lại ngay, không cần build lại toàn bộ cho mỗi lần thử.
- Sửa phía client (UI): cần `corepack pnpm run dev:web` để watcher rebuild bundle; chỉ riêng lúc đó client-plugin HMR mới tự nạp lại mà không cần refresh trình duyệt.
- `pnpm run build` nhúng version + commit + cờ dirty vào artifact; `pnpm run build:official` là biến thể sạch cho release.

---

## 6. Ràng buộc sẽ chặn bạn (từ `AGENTS.md` của repo)

Đây là các gate thật, không phải khuyến nghị:

1. **"Plugins, not loop changes."** Hành vi mới phải bám vào extension point đã tài liệu hóa. Sửa `agent-loop` thì phải cập nhật `docs/architecture.md` trong cùng thay đổi.
2. **Registrations are effects.** Mọi đăng ký đi qua `ctx.effect()` / `ctx.on()`; `register()` trả về disposer. Không có đăng ký kiểu global tồn tại vĩnh viễn.
3. **Waterfall phải gọi `next()`** để chuyển tiếp; return mà không gọi `next()` là chặn chuỗi. Áp dụng cho `agent/pre-step`, `agent/request`, `llm/stream`, `tools/pre-execute`, `tools/post-execute`, `tools/execute`.
4. **Model-visible ⟺ logged.** Bất cứ thứ gì tới được model request phải tái dựng được từ session log. Input mới model nhìn thấy ⇒ phải thêm session event vào `SessionEventMap`.
5. **Model-visible ⟺ logged** kéo theo: đổi cấu trúc session ⇒ bump `SESSION_FORMAT_VERSION` và viết migration theo cặp `vN -> vN+1`.
6. **Client UI copy thuộc về locale.** Gate `verify-client-ui-i18n` từ chối chuỗi hardcode; phải đi qua dictionary + `t` hoặc prop đã bản địa hóa.
7. **Tài liệu đi kèm code.** Thay đổi không tầm thường phải có Agent Note cùng PR, cập nhật README package, và cập nhật trang `docs/subsystems/*` nếu đổi type đã tài liệu hóa.
8. **Bilingual pairing.** `docs/*.md` có bản `.zh.md` đi kèm và file `.i18n.yaml`; có merge driver tự ghép cặp. Sửa bản tiếng Anh mà bỏ quên bản Trung là gate đỏ.
9. **Một dòng vật lý cho một đoạn văn** trong docs (`verify-md-wrap`).
10. **Không hardcode tunable.** Lựa chọn thay đổi theo triển khai phải là field `Config` đã validate, đổi được từ cordis.yml.
11. **Pre-stable API.** `AGENTS.md` ghi rõ: API public chưa ổn định, đổi thì phải cập nhật **mọi** consumer.
12. **`vendor/` là bản sao pin.** Sửa code trong `vendor/` phải cập nhật manifest và theo quy trình sync riêng.

---

## 7. Các hạng mục customize đã chọn

*(đang tổng hợp từ khảo sát song song — điền chi tiết theo từng file)*

### 7.1 Settings cho ngôn ngữ — ⚠️ ĐÃ CÓ SẴN, không cần xây

**Phát hiện quan trọng:** tính năng này đã ship trong 0.1.5-rc.1. Không phải việc phải làm.

- **Vị trí UI:** Settings → General → **Language** (row `id: 'language'`, `order: 0`).
- **Package sở hữu:** `packages/client/locale` (`@deepseek-ai/dsh-client-locale`, dual-face Host+Client).
- **Lưu ở đâu:** `$DSH_HOME\settings.yaml`
  ```yaml
  locale:
    preference: en      # bỏ khóa này thì fallback theo browser
  ```
- **Đổi lúc chạy, không cần build.** `LocaleRuntime.setLocale()` publish snapshot mới, emit `locale/change`, ghi `preference` qua settings scope. `<html lang>` cập nhật theo.
- **Fallback:** `navigator.languages` khớp full tag rồi primary subtag → `navigator.language` → cuối cùng là `en`.

**Vấn đề thật của bạn nhiều khả năng là: chưa có tiếng Việt.** Bản ship chỉ có `zh` và `en` (`LOCALE_IDS` trong `packages/client/locale/src/locale-settings.ts:15`).

#### Cách thêm tiếng Việt — ba lựa chọn, chi phí chênh lệch cực lớn

| Cách | Việc phải làm | Chi phí |
|---|---|---|
| **A. Language pack ngoài repo** ⭐ khuyên dùng | `ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` + `ctx.locale.register(ns, 'vi', {...})` cho từng namespace | Không sửa repo, không build lại web app |
| **B. Thêm vào built-in catalog** | Thêm `vi` vào `LOCALE_IDS`, `BUILT_IN_LOCALE_METADATA`, tạo `locales/vi.ts` | **Rất đắt** — xem cảnh báo dưới |
| **C. 3-arg form trong repo** | Giữ `LOCALE_IDS`, đăng ký `vi` bằng overload 3 tham số | Tương đương A nhưng phải fork |

**Vì sao B rất đắt:** overload có type là `register<N>(ns: N, dicts: Record<BuiltInLocaleId, LocaleDictOf<N>>)`, nên mọi call site truyền `{ zh, en }` sẽ **vỡ compile**. Có **36 call site `locale.register(` trên ~34 package** (`ui-chat`, `ui-sidebar`, `ui-theme`, `ui-conversation`, `ui-plan`, …). Mỗi cái phải thêm dictionary `vi` hoặc chuyển sang dạng 3 tham số. *(Đây là suy ra từ chữ ký overload — chưa compile thật vì phiên khảo sát là read-only.)*

#### File tham chiếu khi cần sửa

- Đổi copy/vị trí row: `packages/client/locale/src/locales/settings.ts` (khóa `language.title`, phải có cả `zh` và `en`) + `packages/client/locale/src/client/index.ts:574-581`.
- Validate tag lưu trữ: `packages/client/locale/src/locale-settings.ts` (`LOCALE_ID_PATTERN`, `LocaleSettingsSchema`).
- Cơ chế tra cứu: namespace đang hoạt động → `common` → chính chuỗi khóa.

#### Gate và rủi ro riêng của mảng này

- `verify-client-ui-i18n` **từ chối mọi chuỗi hardcode** trong source client: text JSX, thuộc tính mang copy (`label`, `title`, `placeholder`, `aria-label`), biến/kiểu tên gợi copy, formatter trả chuỗi. Chỉ `locale.ts`, `locales.ts`, và mọi thứ dưới `src/locales/` được miễn.
- **Dictionary parity:** `scripts/locale-dictionary-parity.spec.ts` buộc mọi dictionary `zh` phải có bản `en` **trùng khóa**. Thêm khóa một bên là đỏ ngay.
- **Copy đăng ký ngoài đường render bị đóng băng:** text truyền lúc registration (ví dụ mô tả trong command registry) giữ nguyên ngôn ngữ tại thời điểm đăng ký cho tới khi đăng ký lại. Nhãn nav của list-slot dùng thunk nên có theo dõi được.
- **Browser không phải loopback thì KHÔNG persist locale** (`persistence = ctx.remote.$host.isLoopback ? 'host' : 'memory'`, `packages/client/ui-settings/src/client/index.ts:58`). Truy cập qua LAN/điện thoại rồi thấy "ngôn ngữ không nhớ" là **đúng thiết kế**, không phải bug.
- **`settings.yaml` không có schema version và không có migration.** Thêm field optional kèm default là tương thích ngược. Nhưng **siết schema là trường hợp nguy hiểm**: `SettingsProvider.register` resolve section đã lưu ngay và **throw**, nên document cũ không còn hợp lệ sẽ làm **fail luôn lúc đăng ký** (tức lúc boot/load plugin), chứ không chỉ lỗi lúc đọc. Unregistered key còn lại trong document thì vô hại.
- Settings không nằm trong session log ⇒ **không đụng `SESSION_FORMAT_VERSION`**. Nhưng nếu toggle mới làm đổi thứ đi tới model request thì vẫn phải thêm session event (luật model-visible ⟺ logged).
### 7.2 Settings cho quyền đăng nhập / phân quyền — nửa có sẵn, nửa phải xây

#### (a) Phân quyền tool: ĐÃ CÓ UI

`packages/client/ui-permission-presets` đăng ký một **row trong Settings → General** (`id: 'permission'`, `order: -20`, `src/client/index.ts:137-143`). Row này chỉ ghi **preset mặc định cho session mới** qua `ctx.remote.settings.mutate('permission', [{op:'set',path:['defaultPreset'],...}], revision)`.

- Đổi preset **theo từng session** dùng lệnh `/permission <preset>` qua popup `conversation.composer`.
- State phía Host: `packages/interaction/permission-presets/src/index.ts` — service `ctx.permissionPresets`, settings namespace `'permission'` (hằng `PERMISSION_SETTINGS_NAMESPACE`, dòng 76), session projection key `'permissions'` (dòng 237).
- Bảng preset mặc định (dòng 170-179): `workspace-write` (workspace-write + ask) và `danger-full-access` (danger-full-access + never).

#### (b) Đăng nhập: có auth thật, nhưng KHÔNG có UI và KHÔNG có settings

Cơ chế hiện tại là **launch token mỗi tiến trình + cookie ký HMAC**:

- `packages/client/connection/src/browser-auth.ts`, class `BrowserAuth`: `authenticatedUrl()` gắn `?token=<43 ký tự base64url>` (32 byte ngẫu nhiên, mỗi tiến trình một token). `GET /?token=...` hợp lệ → `303` + `Set-Cookie: dsh-auth-<sha256(authority)>=v1.<body>.<hmac>; HttpOnly; SameSite=Strict; Max-Age=<cookieMaxAgeDays>`. Không xác thực → **401**.
- Khóa ký là credential record `client-connection/browser-session` trong `$DSH_HOME\.credentials.yaml`, tạo lần đầu kích hoạt.
- Hai lớp chặn độc lập tại `packages/client/connection/src/rpc-host.ts:97-100`: **403** nếu `!isTrustedApiRequest` (fence chống DNS-rebinding theo Host/Origin), ngược lại **401** nếu thiếu cookie.
- Cấu hình **chỉ từ composition config**: `ConnectionConfig { trustedHosts?, cookieMaxAgeDays? (mặc định 30), maxRequestBodyBytes? }` (`packages/client/connection/src/index.ts:71-95`), nối ở `packages/bundle/web-app/cordis.patch.yml:181-188`.
- **`cookieMaxAgeDays` hiện KHÔNG có cờ CLI và KHÔNG có settings namespace** → đây chính là chỗ trống để thêm settings.
- `--trusted-host <authority>` là cờ của `dsh --profile web`, lặp được; giá trị vào `webStartup.trustedHosts` rồi `resolveLanTrust()`. Nó **chỉ mở rộng allowlist Host fence, KHÔNG cấp quyền** — request từ trusted host vẫn cần cookie.
- **Không tồn tại UI login/401 nào** trong `packages/client/**`; body 401 là plain text: `dsh web authentication required; reopen the URL printed by dsh web.` (`browser-auth.ts:304-312`).

**Bằng chứng test có sẵn:** `apps/cli/tests/web-auth.e2e.ts` (210 dòng) — Host giả `localhost:port` → 401, exchange token → 303 + cookie, cookie sống qua restart tiến trình, `.credentials.yaml` mode `0600`. Unit: `packages/client/connection/tests/browser-auth.host.spec.ts`.

**Hệ quả cho kế hoạch:** "settings cho quyền đăng nhập" không phải làm lại auth, mà là **lộ `ConnectionConfig` ra một settings namespace + card**. Vì không có mô hình tài khoản, một trang auth trung thực chỉ có thể phơi 4 thứ: (i) ai tới được host này (`trustedHosts` fence + LAN), (ii) thời hạn cookie (`cookieMaxAgeDays`), (iii) "đăng xuất mọi trình duyệt" (xoay/xóa khóa ký), (iv) chẩn đoán chỉ đọc (host/port, có cookie hay không, cookie gắn với authority nào). Bất cứ thứ gì giống username/password là **subsystem mới**, không phải một settings card.

#### Nếu sửa trong repo — việc thật sự khó nằm ở đâu

1. `packages/client/connection/src/index.ts:71-95` — mở rộng `ConnectionConfig` + `Config`, thêm `ctx.inject(['settings'], ...)` và gọi `settings.installSection(...)` trong `apply()`, theo đúng khuôn `packages/interaction/permission-presets/src/index.ts:214-223`. Export hằng namespace mới (ví dụ `'web-auth'`).
2. **Đây là phần cấu trúc chính:** `trustedHosts` và secret của `BrowserAuth` bị **chốt tại thời điểm khởi tạo** (`HostConnectionService` ctor; `BrowserAuth.create`). `trustedHosts` là field `readonly`. Nên `onChange` của `installSection` **không đủ** — phải cho service đọc một snapshot mutable, hoặc tái tạo service qua `ctx.effect`. `cookieMaxAgeDays` cũng bị nướng vào `BrowserAuth` (`browser-auth.ts:195`) nên đổi nó đòi tạo `BrowserAuth` mới (secret vẫn đọc lại từ credential store nên không mất dữ liệu).
3. **Nút "đăng xuất mọi trình duyệt":** cách đúng và rẻ nhất là `ctx.credentials.deleteRecord(credentialKey('client-connection','browser-session'))` rồi dựng lại `BrowserAuth` — mọi cookie cũ mất hiệu lực. Đã có test chứng minh: `browser-auth.host.spec.ts:210-228`. Phải đặt sau một method `@Remote` mới, **không** phải xóa cookie phía client.
4. Package client mới `packages/client/ui-settings-auth/`: `inject = ['slots','locale','remote','remote.settings','settingsScope']`, rồi hoặc đăng ký `settings.section` (cả trang, `id: 'auth'`, `order: 30`) hoặc `settings.general.item` (một row). Ghi qua `ctx.settingsScope.bind({ namespace: 'web-auth' }).set(...)`.
   *Bề mặt wire đã xác minh:* `settings.describe` / `settings.mutate` là các method `@Remote` của `SettingsController` (`packages/api/settings-controller/src/index.ts:88`, namespace `'settings'` ở dòng 102, 7 method `@Remote` từ dòng 116–225). Cùng package đó, constructor của `SettingsController` gọi `ctx.plugin(CredentialsController)` (dòng 107) — nên **một row composition `settings-controller` là đủ cho cả hai**, không cần row riêng.
5. **4 bề mặt đăng ký** phải thêm cho package mới: `tsconfig.client.json` (references), `tsconfig.base.json` (paths), row `dsh.client` trong `packages/bundle/web-app/cordis.patch.yml` (roster L170-349), và dependency trong `packages/bundle/web-app/package.json`.

#### Ranh giới out-of-tree (quan trọng: đừng hứa quá)

**Làm được:** đăng ký settings namespace riêng + card trong **Plugins tab** keyed theo namespace đó; đọc/ghi credential qua `ctx.remote.credentials`; chặn tool bằng `ctx.on('tools/pre-execute', ...)` trả `allow`/`deny`/`ask`; trả lời approval bằng listener trên waterfall `approval/request`; đổi sandbox mode / approval policy cho session.

**KHÔNG làm được:**
- **Gỡ, làm yếu, hay lách auth của Host.** Nó nằm trong `HostConnectionService` trên route `/api` và trong `authorizeIndex` của `frontend-static`. `registerFallback` là **single-owner** (đăng ký thứ hai throw), nên plugin ngoài không thể chiếm ghế SPA để tự phục vụ trang login.
- Xác thực một loại principal mới. `BrowserAuth` được dựng một lần; **không có seam answerer cho HTTP auth** tương đương `approval/request`.
- Ép bundle Web ship sẵn nạp mình mà không có row cordis.yml.

#### Cảnh báo bảo mật — đọc trước khi thiết kế UI

1. **Thực thi chỉ ở Host; client thuần trình bày.** Quyết định 403/401 nằm ở `rpc-host.ts:97-100`. Đổi UI không cấp/thu quyền được. Rule của repo: *"Enforce a decision in the operation that makes it"* — ẩn nút không phải là đổi quyền.
2. **Asset tĩnh không phải index thì CÔNG KHAI.** Chỉ `/api/*` và index.html qua auth. Đừng đặt secret trong JS bundle hay tin vào shell để gác.
3. **Cookie không có cờ `Secure`** vì carrier không có TLS — `docs/subsystems/web-server.md:47` ghi rõ carrier không sở hữu TLS/auth/Origin. Bind LAN thì cookie đi qua mạng dạng cleartext. `HttpOnly` + `SameSite=Strict` + ràng buộc authority chống được CSRF/trộm cookie, **không** chống nghe lén. UI "truy cập từ xa" tuyệt đối không được trình bày đây là kênh an toàn.
4. **`--trusted-host` là mở rộng fence, KHÔNG phải cấp quyền.** Request từ trusted host vẫn 401 nếu thiếu cookie. Dán nhãn "cho phép truy cập cho..." lên nó là **sai**.
5. **Secret ký là một secret duy nhất cho mỗi home.** Ai đọc được `$DSH_HOME\.credentials.yaml` thì ký được cookie cho mọi authority họ tới được. Xoay nó = đăng xuất mọi trình duyệt trên mọi cổng/host của home đó — vừa là lever an toàn vừa là lever DoS.
6. **Trang không-loopback âm thầm mất persistence.** `ctx.remote.$host.isLoopback ? 'host' : 'memory'` (`ui-settings/src/client/index.ts:58`) làm mirror khởi động ở trạng thái `unavailable` và **write trở thành no-op**. Row permission tự ẩn trong trạng thái đó. ⇒ Một trang settings auth/permission làm ngây thơ sẽ **trông như đã lưu thành công nhưng thực tế không lưu gì**. Đây là cái bẫy lớn nhất của hạng mục này.
7. **`ask` fail closed.** `ask` mà không có answerer → `unavailable`, và mọi caller **deny** trên `unavailable`. Nên UI xóa/đổi thứ tự answerer có thể biến approval thành denial chứ không phải thành grant. Ngược lại `never` được enforce **trước** waterfall nên không thể bị listener `prepend` lách qua.
8. **Preset gộp hai knob độc lập** (sandbox + approval). Ghi preset mà không ghi knob, hoặc ghi `defaultPreset` khi người dùng muốn "session này", là **sửa sai tầng** — `defaultPreset` chỉ ảnh hưởng session tạo **sau** đó, và `custom` là giá trị dẫn xuất, không bao giờ là đích ghi hợp lệ.
9. **Tên preset lạ thì throw.** UI phải **suy danh sách lựa chọn từ schema của host** (union `const` được decode ở `ui-permission-presets/src/client/settings-store.ts:52-78`), không được hardcode `workspace-write`/`danger-full-access`.
10. **Một trang login KHÔNG thể là settings card** nếu nó phải chạy trước khi app nạp: dist index và toàn bộ `/api` đều bị 401-gate, nên trình duyệt chưa xác thực **không bao giờ nhận được SPA**. Trang HTML tiền-xác-thực phải do host phục vụ qua fallback owner hoặc một named route đăng ký trước nó.
11. **Đổi mode/auth cần remount Loader, không chỉ ghi settings.** Xem mục 2 ở trên.

#### Đính chính một giả định

`packages/fs/fs-observation-policy` **không phải** một trục phân quyền. Module doc của nó ghi rõ: *"Event-only filesystem observation policy; it registers no service."* Nó là guard CAS (đọc-trước-khi-ghi, chống ghi đè) qua 3 listener `fs/*` trên một WeakMap, throw `FS_NOT_OBSERVED`. Trục phân quyền cho việc đọc là **sandbox mode**, không phải package này.
### 7.3 Thêm tool và hook — out-of-tree được, KHÔNG cần fork

Một tool là một plugin file. Khuôn tối thiểu:

```ts
export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',        // model-visible
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                  // optional theo mặc định
    },
    output: {
      schema: { type: 'string' },                 // giá trị canonical
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

- `defineTool` ở `packages/core/tools/src/schema.ts:545`. Nó validate args của model **trước** khi gọi `execute` và throw `ToolArgsError`.
- `execute` trả **một giá trị canonical lossless-JSON** — **không** trả content block.
- **Chỉ `name` / `description` / `parameters` là model nhìn thấy.** `timeoutMs`, `isConcurrencySafe`, `presentCall/presentResult` không bao giờ lộ ra model.
- `ctx.tools.register()` trả **disposer chính xác**; effect-based nên hủy fiber là tự gỡ đăng ký.
- Chuỗi tới model: `ctx.tools.register` → provider của `ctx.systemPrompt.tools` → `assemble()` → `PromptAssembly.tools` → `agent-loop` `buildRequest`.
- `ctx.tools.restrict({ allow?, deny? })` chỉ có tác dụng trong scope. `ctx.tools.guard(fn)` là deny đơn điệu chạy **sau** toàn bộ waterfall pre-execute và **không bao giờ force-allow**.
- `run_code` là **tên reserved**.

Hook dùng đúng khuôn plugin đó, chỉ đăng ký listener thay vì tool:

```ts
export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) return { kind: 'deny', reason: 'Denied by policy.' }
    return next()
  })
}
```

**Quy tắc `next()`:** gọi `next()` là chuyển tiếp và giá trị truyền qua return của nó; return **không** gọi `next()` là **chặn và tự quyết định**. Repo bắt buộc listener waterfall phải gọi `next()` để delegate.

Các extension point chính (đọc từ source):

| Điểm | Kiểu | Dùng cho |
|---|---|---|
| `tools/pre-execute` | waterfall, agent-scoped | allow / deny / ask trước dispatch |
| `tools/execute` | waterfall | bao quanh dispatch: deadline, retry, metrics — **chỉ được thay `exec.signal`** |
| `tools/post-execute` | waterfall | accept / thay value hoặc content / block kèm feedback |
| `tools/result` | emit | quan sát kết quả cuối đã đóng băng |
| `agent/pre-step` | waterfall | từ chối hoặc thay batch message được nhận |
| `agent/request` | waterfall | thay provider/model/effort đã đóng băng — **không sửa được messages** |
| `agent/request-error` | waterfall | tự xử lý recovery: retry hoặc terminal |
| `agent/turn-stopping` | serial | steer để chạy thêm step |
| `llm/stream` | waterfall | bao quanh mọi call streaming (retry/replay/routing) |
| `system-prompt/assemble` | waterfall | biến đổi **toàn bộ** assembly — expert; kết quả trả về là authoritative |
| `fs/write-intent`, `fs/edit-intent` | waterfall | intent trước khi ghi/sửa |
| `session/event` | emit | quan sát log bền vững |

Kiểu quyết định: `PreToolDecision = {allow} | {deny, reason} | {ask, reason?}`; `PostToolDecision = {accept, value|content} | {block, feedback}`.

**Kết luận:** không có gì bắt buộc fork. Chỉ khi muốn nó thành **mặc định ship sẵn** mới phải sửa `packages/bundle/base/cordis.patch.yml`.

**Cạm bẫy chỉ gặp khi fork:** `scripts/gen-tool-catalog.ts` glob `packages/*/tool-*` và **fail** nếu thư mục chưa có trong manifest cứng của nó (import dòng 42-70) → đặt tên package **không** bắt đầu bằng `tool-` thì thoát guard này.

### 7.4 Đổi model / LLM adapter — out-of-tree được

Interface: `abstract class LlmAdapter` (`packages/llm/llm/src/index.ts:200-282`). **Chỉ một member bắt buộc:** `stream(options): AsyncIterable<StreamChunk>`. Các override tùy chọn đã có default: `providerInfo`, `providerRetryPolicy`, `imageRequestPricing`, `listModels`, `resolveModel`, `prepareCall`.

Đăng ký: `ctx.llm.registerAdapter(['my-provider'], new MyAdapter(...))` (`:387-416`) — effect-based; route trùng thì throw `DUPLICATE_ADAPTER` theo kiểu all-or-nothing; handle có `.replace(providers)` để đổi route nguyên tử. **Không có kiểm tra `instanceof`** — hợp đồng là structural.

```ts
export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config = z.object({
  apiKeyEnv: z.string().role('credential-ref').default('MY_API_KEY'),
  baseURL: z.string(),
})
export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(config))
}
```

- **API key không bao giờ là giá trị literal trong config.** Dùng `apiKeyEnv` với `z.string().role('credential-ref')`, resolve **mỗi request** qua `ctx.credentials.resolve(ref)`; thiếu thì `LlmError('MISSING_CREDENTIAL')`.
- Base URL: `Config.baseURL` → env `DEEPSEEK_BASE_URL` → mặc định public.
- **Reconfig live:** `settings.installSection(ctx, NS, Config, config, { setSource, onChange })`. Những gì bị chốt lúc đăng ký (retry policy, tập route) phải refresh bằng `registration.replace([...])` — nếu không, đổi settings mà hành vi không đổi.
- **Nghĩa vụ wire:** block-start / text-delta / block-end theo index; tool-call arguments giữ **raw JSON string**; emit `usage` **trước** `finish` và **không emit gì sau**; lỗi thì hoặc throw `LlmError` với code ổn định, hoặc `finish {kind:'error'|'aborted'}`; tôn trọng `options.signal`; field không hỗ trợ thì throw `UNSUPPORTED_OPTION` **chứ đừng bỏ im lặng**; mọi request HTTP phải merge `attributionHeaders()`.
- Model selection: `GenerateOptions.provider` chọn route; `ctx.llm.registerConfigurableProviders(entries)` công bố danh mục cho Models page đọc; `listModels`/`resolveModel` nuôi picker; mặc định cho agent mới là service `agentDefaultModel` (namespace `agent-default-model`).
### 7.5 Giao diện Web — plugin ngoài repo ĐÃ chạy live trên GUI của bạn

#### Sự thật quyết định chiến lược

GUI ở `http://127.0.0.1:3080` **không phục vụ từ checkout**. Tiến trình đang chạy là `node C:\Users\Minhn\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js web` (bản npm global, cùng version 0.1.5-rc.1), profile `C:\Users\Minhn\.dsh\profiles\web`.

⇒ Sửa trong `deepseek-harness\packages\**` **không tới được 3080** cho tới khi build đầy đủ rồi chạy `pnpm dsh web` từ checkout.
⇒ Nhưng **plugin ngoài repo thì tới ngay**, không cần build lại gì.

**Bằng chứng sống:** `C:\Users\Minhn\.dsh\profiles\web\node_modules\dsh-git-rollback` khai báo `"dsh": {"client": {"platform": "web"}}`, và `lib/client.js` của nó đăng ký vào `conversation.chat.turnTail` + `shell.overlay`. Nó đang chạy trong GUI hiện tại của bạn.

**Kết luận cho mục tiêu UI:** đi đường plugin ngoài repo, không phải fork. Chỉ fork khi cần đổi palette gốc hoặc chiếm trọn một cột layout.

#### Panel bên phải — out-of-tree được

1. `ctx.sidebarRightTabs.register(definition)` với `SidebarRightTabDefinition { id, kind, title, guide?, canOpen?, priority? }` (`packages/client/ui-sidebar-right/src/client/tab-registry.ts:87-120`).
2. Body: `ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id, ... }, Body))`. Slot này **keyed, session scope**; `useTabInfo()` cho `{ sidebar, panel, tab }`.
3. Mở panel: `ctx.sidebarRight.openTab(kind, options?)` hoặc `openResource(address, { params })`.
4. Muốn có nút mở: đăng ký vào `conversation.session.header.utilities|actions` (list, session) hoặc `.corner` (single) — ví dụ thật: `packages/client/ui-jobs/src/client/index.ts:32-38`.

**Chỉ fork khi** muốn thay cả cột: `rightbar.session` là slot `single` đã bị `RightbarRoot` chiếm (`packages/client/ui-sidebar-right/src/client/index.ts:149-168`). Đăng ký vào đó là thay thế toàn bộ sidebar phải.
*(Chưa xác minh: thứ tự ưu tiên khi hai entry `single` tĩnh tranh nhau.)*

#### Khối chat/tùy biến transcript — out-of-tree được, nhưng có ràng buộc cứng

**Node phải được fold từ Session event. Không có API nào publish node chỉ tồn tại ở client.**

1. Producer: khớp một họ event có sẵn (`match(event)`), hoặc ship host half khai báo `SessionEventMap`. Cái sau không tầm thường: event type lạ là **required-on-read** và sẽ từ chối session log trừ khi envelope mang `ignorable: true`.
2. `ConversationNodeDefinition<State>` (`packages/client/ui-conversation/src/client/contract/conversation.ts:185-245`) đăng ký bằng `ctx.uiConversation.events.register(def)`.
3. Kiểu payload: `declare module '@deepseek-ai/dsh-client-ui-chat/client' { interface ChatNodeDataMap { '<kind>': Data } }`.
4. Renderer: `ctx.slots.register({ name: 'conversation.chat.node', key: '<kind>', ... })`.
5. **Quên renderer thì node không biến mất** — nó rơi vào `JsonBlock` với nhãn `t('message.unknownSurface')` (`ChatNodeSeat.tsx:136-146`). Nhìn thấy dòng đó nghĩa là bạn quên bước 4.

Mẫu tham chiếu ngắn nhất trong repo: `packages/client/ui-workflow-run/src/client/`.

#### Theme — thêm được, nhưng không chọn được từ Settings

| Việc | Cơ chế | Out-of-tree? |
|---|---|---|
| Thêm theme mới | `ctx.theme.register({ id, colorScheme, tokens })` | ✅ (trùng `id` thì throw) |
| Đổi màu token | `ctx.theme.overrideTokens(source, { '--dsw-alias-…': { light, dark } })` | ✅ — **bắt buộc có cả `light` và `dark`**, thiếu là TypeError |
| Đổi palette/typography gốc | `packages/client/ui-theme/src/styles/*.css` | ❌ phải fork |

**Cạm bẫy:** row Appearance chỉ cho Light/Dark/System, nên theme của bạn **không xuất hiện trong Settings**. Phải tự gọi `ctx.theme.setTheme(id)` từ UI của mình — và custom id **chỉ sống trong tiến trình**, không persist (`isThemePreference`, `ui-theme/src/theme-settings.ts:51`).

#### Điểm mở rộng UI khác (đều đăng ký qua `ctx.slots`)

- **Settings:** `settings.section` (cả trang), `settings.general.item` (một row), `settings.plugin.item` (keyed theo settings namespace) — cookbook nói rõ **không cần sửa gì trong repo**.
- **Thẻ tool tự vẽ:** `tool.call.toolview` keyed theo tên tool trên wire + `tool.call.images`. Lưu ý: `presentCall/presentResult` phía Host **không tự tạo** thẻ trên Web; thẻ phải dựng từ event thô + `result.meta` đã persist.
- **Transcript:** `conversation.chat.turnTail`, `.assistant-actions`, `.commandview`, `conversation.message.images`.
- **Composer:** `conversation.input.dock|overlay|left|right|plan|model`, `conversation.composer.dock|bar`.
- **Khung/sidebar:** `sidebar.panellist|brand.mark|brand.name|footer.action|settings`, `shell.overlay` (list, phủ toàn khung).
- **Panel giữa + icon rail:** `main` (keyed) + `sidebar.panellist` cùng id + `ctx.layout.selectPanel(id)`.
- **Trang preview tài liệu:** `ctx.documentPreviews.register(def)` + `sidebar.right.tab.document`.
- **Lệnh người dùng:** `ctx.commands.register(def)` + row web `conversation.chat.commandview`.
- **UI do model tự viết (không cần package, không fork):** `dsh-tool-cordis` + `dsh-cordis-host-runner` + `dsh-cordis-client-runner` + `ui-cordis`. Model viết JS thuần (chỉ có React/console/styles/host, không import/JSX/fetch/timer), người dùng duyệt trong panel, `cordis_run` mount nó thành plugin sống. **Cần overlay** vì bundle web ship sẵn không mount `tool-cordis`. Vòng đời là session/process-local — refresh trang là mất.

#### Vòng build/verify

**Out-of-tree (đường tới được 3080):**
1. Tự build `lib/client.js` đúng định dạng lazy-CJS của loader: banner `window.__ModuleLoader__.load({ id: "<pkg>/client", factory: (require) => {` và footer `return module.exports; } });` (`packages/client/tsdown.client.ts:566-568`). **Không có preset tsdown nào publish cho tác giả ngoài repo** — phải tự tái tạo output.
   **Mẫu tham chiếu đang chạy trên máy bạn:** `C:\Users\Minhn\.dsh\profiles\web\node_modules\dsh-git-rollback` có script `"build": "tsc -p tsconfig.json && node tools/bundle-client.mjs"` — tức nó tự viết bundler. Đọc `tools/bundle-client.mjs` của nó là cách nhanh nhất để biết chính xác định dạng bundle cần sinh. Package này cũng khai báo `exports: { ".": "./lib/index.js", "./client": "./lib/client.js" }` + `dsh.client.platform: "web"` — khuôn package.json đầy đủ để copy.
2. External chỉ được là module nền tảng do shell cấp: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `dsh-client-store`, `dsh-client-ui-slots`, `dsh-client-ui-primitives`, `dsh-client-ui-dockkit`.
3. Cài vào profile: `dsh plugin --profile web add <path|pkg>` (cần pnpm — xem mục 4).
4. Thêm row vào `~\.dsh\profiles\web\cordis.patch.yml`: `- insert:` / `- id: my-ui` / `name: <pkg>`. Profile đang `patchReload: live` ⇒ **không cần restart server**.
5. Refresh trang một lần; sau đó sửa `lib/client.js` được HMR thay nóng tại chỗ (node half stat-poll 500 ms, SSE `/plugins/events`) — **không cần refresh, không cần build dsh**. State React trong plugin bị mất, state session/connection giữ nguyên.

**In-tree (fork):** `pnpm run build` → chạy `pnpm dsh web`. Vòng lặp trong ngày dùng `pnpm run dev:web` (**cần một lần `pnpm run build` đầy đủ trước**, và **không được chạy song song với `pnpm run build`**).

**Check phải chạy:** `pnpm run test:gui` → `pnpm run verify-client-ui-i18n` → `pnpm run gen-client-catalog` + `verify-client-catalog` (mỗi khi thêm/đổi slot) → `verify-client-packages` → `doc-sync` → `$env:DSH_SNAPSHOT='replay'; pnpm run test:web` → `test:coverage`.

#### Gate riêng của mảng UI

- **`verify-client-ui-i18n`** — chặn copy hardcode trong `packages/*/*/src/client/**/*.tsx`, `packages/client/ui-*/src/**`, `apps/web/src/**`. **Bundle ngoài repo không bị scan** (ví dụ `dsh-git-rollback` ship chữ Trung hardcode).
- **`verify-client-catalog`** — artifact `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` phải regenerate mỗi khi SlotMap hoặc call site `slots.register()` đổi.
- **Bundle purity** (lỗi lúc build): mọi value import `@deepseek-ai/*` không thuộc module nền tảng / `dsh.client.external` / wire layer INLINE_SAFE / contribution `/remote` sinh tự động đều fail. Hành vi liên plugin đi qua Cordis service; UI đi qua slot. Dùng `import type` cho `ui-chat/client`, `ui-conversation/client`.
- **Export discipline:** plugin client không được export value nào ngoài `apply`/`inject`/`Config` + artifact type-only.
- **Styling:** CSS Modules + clsx, không Tailwind; chỉ dùng token `--dsw-alias-*`, cấm màu literal, cấm theme selector trong CSS của feature. Spec của `ui-theme` còn scan **mọi** stylesheet trong package: bán kính bo tròn phải đi kèm `corner-shape: round`; surface nổi phải dùng `box-shadow: var(--dsw-elevation-*)` với `border: 0`; border trung tính phẳng phải là `0.5px`.
- **Khai báo slot chỉ thuộc về component sở hữu và render vị trí đó.** Đăng ký vào slot chưa ai khai báo, hoặc khai báo con của slot người khác đã khai báo → **throw lúc load**.
### 7.6 Sửa lõi: agent loop, session, sandbox — chỉ khi thật cần

Đây là tầng duy nhất mà **toàn bộ** ràng buộc ở mục 6 áp dụng đồng thời. Trước khi chọn nó, xác nhận không có extension point nào làm được việc tương đương — bảng ở 7.3 cộng bảng "Where new behavior goes" trong `docs/architecture.md` liệt kê gần như đủ.

| Sửa gì | Hệ quả bắt buộc |
|---|---|
| `agent-loop` | Phải cập nhật `docs/architecture.md` (rule repo: đổi loop là đổi map). Rủi ro regression cao nhất. |
| Cấu trúc session log | Bump `SESSION_FORMAT_VERSION` + migration theo cặp `vN -> vN+1`. Generation đã commit **không bao giờ** bị đổi tên, ghi đè, hay xóa. |
| Thêm input model nhìn thấy | **Bắt buộc** thêm session event vào `SessionEventMap`. Luật model-visible ⟺ logged có runtime invariant assert. |
| Đổi type đã tài liệu hóa | Cập nhật trang `docs/subsystems/*` trong cùng thay đổi; `verify-type-equiv` chặn drift. |
| Palette/typography gốc | `packages/client/ui-theme/src/styles/*.css` + rebuild `ui-theme` và `apps/web` dist. |
| Nới gate `isLoopback` | Quyết định bảo mật — xem 7.7 lựa chọn C. |
| `sandbox` | Chạm trục thực thi; chỉ chạy `check:windows-wine` khi chẩn đoán lỗi Windows đã biết. |

Nhắc lại điều dễ quên: **fork không tới được GUI 3080 đang chạy** — phải `pnpm run build` rồi `pnpm dsh web` ở cổng khác.

### 7.7 Publish ra domain ngoài + DNS + port — ⚠️ xung đột trực tiếp với settings

#### Cơ chế hiện có (đã xác minh từ source)

- `webserver` Config `host` **chỉ nhận `'127.0.0.1' | '0.0.0.0'`** (`docs/subsystems/web-server.md:35`) — **không bind được một IP cụ thể**.
- CLI `dsh web` **từ chối thẳng `--host 0.0.0.0`** (`packages/bundle/web-app/src/startup.ts:74-76`): *"intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead"*. ⇒ Mở all-interfaces **chỉ còn đường sửa config composition**, không qua CLI.
- Carrier **không sở hữu TLS, không auth, không Origin policy** (`web-server.md:47`).
- Mẫu chính thức để lộ ra ngoài (`docs/user/guide/github-review.md:11` và ví dụ Caddy ở dòng 44-54): **TLS reverse proxy hoặc tunnel forward vào loopback listener**.

#### Vì sao proxy BẮT BUỘC giữ nguyên Host header

Fence Origin (`api-request-trust.ts:111-117`) buộc `Origin` phải **bằng đúng** authority của `Host`. Trình duyệt gửi `Origin` trên mọi POST — tức mọi call `/api`.

- Nếu proxy rewrite Host thành `127.0.0.1:3080` (kiểu nginx mặc định `proxy_set_header Host $proxy_host`): Origin `https://dsh.example.com` ≠ Host `127.0.0.1:3080` → **403**.
- Caddy `reverse_proxy` **giữ Host gốc theo mặc định** → đúng. Dùng Caddy hoặc cấu hình tương đương.

Hệ quả: vì Host là domain công khai, **bắt buộc** thêm trusted host:
- `--trusted-host dsh.example.com` — entry **port-less khớp hostname trên mọi port**.
- `--trusted-host dsh.example.com:8443` — khớp **đúng** authority đó (chặt hơn, dùng khi port công khai không mặc định).
- Entry phải là authority chuẩn dạng bare `host` hoặc `host:port`. **Domain IDN phải viết punycode** (dạng wire mang). Sai chính tả → **throw lúc load plugin**, không im lặng bỏ qua.

#### Xung đột nghiêm trọng — đây là điều bạn cần biết trước khi làm

`isLoopback` phía client được tính từ **hostname của trang** (`packages/client/connection/src/client/index.ts:227`):

```
isLoopback: transport?.ownsHost === true || pageLocation === undefined || isLoopbackHostname(pageLocation.hostname)
```

Truy cập qua `dsh.example.com` ⇒ `isLoopback = false` ⇒ `packages/client/ui-settings/src/client/index.ts:58` đặt persistence = **`'memory'`** ⇒ **mọi thao tác ghi settings trở thành no-op**. Cùng cờ đó cũng chi phối `ui-settings-general/src/client/index.ts:76`, và row permission **tự ẩn** trong trạng thái memory.

⇒ **Nếu bạn publish bằng domain công khai, chính những settings bạn đang muốn làm sẽ không lưu được cho client từ xa.** Ngôn ngữ rơi về dò theo browser mỗi lần tải; không đổi được permission mặc định; trang auth settings bạn thêm sẽ **hiện ra nhưng bấm không lưu** — tệ hơn là báo lỗi.

`ownsHost` **chỉ** do transport của `packages/experimental/webworker-runtime` set (host chạy ngay trong browser), **không phải** đường tunnel.

#### Ba lựa chọn — chọn theo mục tiêu thật

| | Cách làm | Settings persist? | DNS/domain? | Chi phí |
|---|---|---|---|---|
| **A. Tunnel về loopback** ⭐ | `ssh -L 3080:127.0.0.1:3080 server` rồi mở `http://127.0.0.1:3080` | ✅ Có (browser thấy 127.0.0.1) | ❌ Không cần DNS | Rẻ nhất, không sửa gì |
| **B. Domain công khai + TLS proxy** | Caddy giữ Host, `--trusted-host domain`, DSH vẫn bind loopback | ❌ Không — memory mode | ✅ Có | Trung bình |
| **C. Sửa gate `isLoopback`** | Fork `client/connection` + `ui-settings` | ✅ Có | ✅ Có | Cao + **đổi quyết định bảo mật** |

**Về C:** gate này tồn tại để **trình duyệt từ xa không ghi được settings toàn cục của host**. Nới nó nghĩa là bất kỳ ai qua được auth đều sửa được settings của host. Nếu buộc phải làm, hãy ràng vào một điều kiện mạnh hơn (ví dụ: chỉ khi kết nối tới từ loopback *sau* proxy, hoặc một cờ "operator" tường minh) — **không** chỉ đổi giá trị `isLoopback`.

**A và B không loại trừ nhau:** dùng B cho truy cập rộng (điện thoại, xem từ xa), dùng A khi cần đổi settings. Đây là cách né xung đột mà không phải fork.

#### Đưa host/port/trustedHosts thành settings — chi phí thật

- `webserver.host`/`port` được đọc lúc **activation và listen ngay** (`web-server.md:51`, lỗi `EADDRINUSE` làm reject initialization) ⇒ đổi port **bắt buộc restart**. Settings descriptor **đã có sẵn `applies: 'restart'`** đúng cho trường hợp này. Khuyến nghị: làm namespace với `applies: 'restart'` cho host/port và một consumer đọc lúc boot — đơn giản và đúng, tránh phải re-instantiate.
- `trustedHosts` bị chốt ở constructor `HostConnectionService` ⇒ đổi live phải re-instantiate (mục 7.2). Nếu chấp nhận restart cho cả trustedHosts thì rẻ hơn nhiều và nhất quán.
- **Port "mới":** cổng công khai do proxy quyết định (443), origin có thể vẫn 3080. Nếu muốn DSH nghe cổng khác thì `--port <n>` (hoặc `port: 0` để OS tự chọn). Đây là cấu hình **một lần cho server**, không phải thứ đổi thường xuyên.

#### Bất biến bảo mật — không thương lượng

1. **Đừng bao giờ bind `0.0.0.0` mà không có TLS + auth phía trước.** CLI từ chối đúng vì lý do này: DSH chạy tool tùy ý ⇒ lộ UI ra internet **= lộ RCE**.
2. **Asset tĩnh ngoài index là công khai** (`frontend-static/src/index.ts:92-95`) — bundle JS tải được mà không cần auth. Đừng coi bundle là bí mật.
3. **Cookie không có cờ `Secure`** (carrier không có TLS). Qua domain công khai **buộc phải có TLS ở proxy**, nhưng bản thân cookie vẫn thiếu cờ đó — điểm yếu còn lại, không khắc phục được nếu không sửa `browser-auth.ts`.
4. **Cookie auth tương đương credential RCE.** Ai có cookie là điều khiển được agent: chạy lệnh trong workspace của bạn, đọc được `$DSH_HOME\.credentials.yaml` (tức khóa DeepSeek API) qua tool.
5. **Launch token nằm trong query string** (`?token=...`). Qua domain công khai nó vào log của proxy và history trình duyệt. Tunnel tránh được điều này.
6. Token sinh **mỗi tiến trình** ⇒ truy cập từ máy khác cần lấy token từ log khởi động của server.
7. Xoay secret ký = đăng xuất mọi browser (xem 7.2 mục 3), và ai đọc được `.credentials.yaml` thì ký được cookie cho mọi authority.



---

## 8. Thứ tự triển khai đề xuất

**Nguyên tắc chỉ đạo rút ra từ khảo sát:** ưu tiên tầng 1–2, vì nó **tới được GUI đang chạy ngay lập tức** (patch reload live + client bundle HMR), còn fork thì phải build đầy đủ, chạy server riêng, và không đụng được tới 3080. Fork là phương án cuối, không phải mặc định.

### Bước 0 — nền tảng (bắt buộc, làm một lần)

1. `npm install -g pnpm@11.7.0` — mở khoá `dsh plugin`, không cần admin (mục 4).
2. `git switch -c my-custom` trong checkout — đang ở detached HEAD.
3. **Quyết định môi trường:** dùng GUI 3080 hiện tại (đường out-of-tree, live, nhanh) hay dựng bản fork riêng với `$env:DSH_HOME` cách ly (mục 3). Có thể làm cả hai: out-of-tree cho UI/tính năng, fork cho phần phải sửa lõi.

### Bước 1 — Chốt mô hình truy cập TRƯỚC khi làm bất kỳ settings nào

Đây là **quyết định chặn**, vì lựa chọn A/B/C ở mục 7.7 quyết định settings có lưu được hay không đối với client từ xa. Làm settings trước rồi mới phát hiện chúng không persist qua domain là sai thứ tự.

- Chọn **A (tunnel)** hoặc **C (fork)** nếu bạn muốn settings hoạt động đầy đủ.
- Chọn **B (domain + TLS proxy)** nếu ưu tiên truy cập rộng; chấp nhận rằng client từ xa chỉ **đọc** settings, và dùng A khi cần chỉnh.
- **A + B kết hợp** là cách né xung đột mà không phải fork — khuyến nghị mặc định.

### Bước 2 — Tiếng Việt (đòn bẩy lớn nhất, chi phí thấp nhất)

Language pack ngoài repo: `addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` + `register(ns, 'vi', {...})`. Chạy live trên GUI hiện tại, không cần fork, không cần build lại web app. Hạng mục duy nhất dùng được ngay hôm nay.

### Bước 3 — Settings hạ tầng: publish + auth

Gộp hai việc vì cùng chạm một nhóm cấu hình boot-time:

- Namespace cho `host` / `port` / `trustedHosts` với **`applies: 'restart'`**, consumer đọc lúc boot (mục 7.7). Tránh phải re-instantiate `HostConnectionService`.
- Namespace lộ `cookieMaxAgeDays` + trạng thái cookie / nút "đăng xuất mọi trình duyệt" (mục 7.2). Việc này bổ sung đúng chỗ trống đã xác minh: `cookieMaxAgeDays` hiện không có cờ CLI và không có namespace.

### Bước 4 — UI: panel phải + khối chat

Panel phải qua `sidebarRightTabs.register` + slot `sidebar.right.pane.tab`. Khối chat qua `ConversationNodeDefinition` + renderer keyed. Cả hai out-of-tree; nhớ quy tắc "node phải fold từ session event".

### Bước 5 — Tool, hook và LLM adapter

Làm ở tầng plugin ngoài repo trước. Chỉ chuyển sang fork nếu bắt buộc phải chạm package có sẵn.

### Bước 6 — Phần lõi (chỉ khi thật cần)

`agent-loop`, `session`, `sandbox`, đổi palette gốc `ui-theme`, chiếm trọn cột `rightbar`, hoặc nới gate `isLoopback` (lựa chọn C). Đây là phần đắt nhất: phải `pnpm run build`, chạy server riêng, cộng yêu cầu Agent Note + cập nhật `docs/subsystems/*` + migration nếu đổi cấu trúc session.

### Bốn câu hỏi cần bạn quyết trước khi viết dòng code đầu tiên

1. **Mô hình truy cập:** A (tunnel), B (domain công khai + TLS proxy, chấp nhận settings chỉ đọc từ xa), C (fork để settings chạy qua domain), hay A+B kết hợp?
2. **Tiếng Việt ở mức nào?** Dịch toàn bộ hay chỉ các namespace hay dùng (`common`, `ui-chat`, `ui-conversation`, `ui-settings*`)? Dịch một phần hoàn toàn hợp lệ — namespace chưa dịch rơi về `en`.
3. **Bản fork có cần chạy song song GUI hiện tại không?** Nếu có, dùng `DSH_HOME` cách ly + cổng khác (mục 3).
4. **Thứ tự ưu tiên:** làm tuần tự theo các bước trên, hay dồn vào một hạng mục trước?

---

## 9. Phụ lục: đóng gói plugin ngoài repo (dùng chung cho mọi hạng mục)

Tài liệu chính thức: **`docs/user/develop/basic/publish.md`** (đọc toàn bộ file). Cho LLM adapter thêm `docs/user/develop/practice/llm-adapter.md`.

### Cấu trúc một bundle

```
package.json      # main: index.js, type: module, files: ["index.js","cordis.patch.yml"]
index.js          # code plugin
cordis.patch.yml  # mảng các patch op
```

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin     # TÊN PACKAGE ĐÃ CÀI, để Node resolve ra code
```

Entry point phụ dùng subpath exports: `name: 'dsh-hello-plugin/startup'`.

### Cài đặt

```powershell
dsh plugin --profile web add <spec>
```

`<spec>` nhận: đường dẫn checkout tương đối, tarball, tên trên registry, hoặc `github:you/repo#<sha>`. Lệnh này tự khởi tạo profile nếu chưa có, **re-anchor** các spec đường dẫn tương đối (`.` / `..` / `file:` / `link:`) về thư mục đang gọi, chạy pnpm với `cwd` = thư mục profile, rồi **reconcile** `dsh.profile.bundles`: mọi dependency có khai `dsh.bundle.patch` được thêm vào danh sách layer; dependency không có bundle thì chỉ cảnh báo một lần và ở lại dạng dependency thường.

### Thứ tự layer và luật ghi đè

bundle patch theo thứ tự list → `cordis.patch.yml` của profile → `cordis.patch.yml` mức `$DSH_HOME` → từng `--patch` theo thứ tự argv.

**Layer sau thắng theo từng row, và patch THAY TOÀN BỘ config của row đó — không deep merge.** Nghĩa là khi patch một row có sẵn, phải **khai lại mọi key**, không chỉ key muốn đổi.

Tên row dạng bare resolve qua parent-walk của Node từ thư mục profile, tới fallback `$DSH_HOME/profiles/node_modules`.

### Kiểm tra và gỡ

```powershell
dsh --profile web --dump-config      # in ra layer "# == dsh-hello-plugin"
dsh plugin --profile web remove dsh-hello-plugin
```

- **Đổi thành viên bundle cần restart.** Sửa patch thường thì hot-reload (profile đang `patchReload: live`).
- Có thể bỏ qua bundle cho máy đơn lẻ: dùng `--patch` overlay với row name là **đường dẫn tuyệt đối**.

### Cạm bẫy quan trọng nhất khi phát hành

**Git install tải SOURCE, không tải build.** Nên package phải có `prepare` tự build entry point, **và** người dùng phải allowlist nó dưới `allowBuilds` trong `pnpm-workspace.yaml` của profile — pnpm ≥10 **chặn `prepare` cho tới khi được cho phép**. Dùng `pnpm pack` (tarball) hoặc publish npm thì **tránh được hoàn toàn** rào này. ⇒ Khuyến nghị: phát hành tarball/npm, đừng dùng git URL.

### Khác biệt so với package trong repo

Package ngoài repo **tự khai runtime dependency của nó** (`@deepseek-ai/cordis`, `dsh-tools`, `dsh-llm`, `schemastery`…). Các invariant in-repo (`private: true`, `version` == root, danh sách `files`, mirror cordis ở cả peer lẫn dev) do `pnpm run constraints` kiểm tra và **chỉ ràng buộc package trong workspace** — package ngoài không bị.

Kiểu `ctx.tools` / `ctx.llm` lấy qua `import type {}` từ package sở hữu. `registerAdapter` không kiểm tra `instanceof` và `defineTool` chỉ dựng plain object, nên bản cài thứ hai của `dsh-llm`/`dsh-tools` vẫn thỏa hợp đồng runtime.

*(Chưa xác minh: liệu bản `@deepseek-ai/dsh-*` cài trong profile có được dedupe với bản của installation không; và một row `dsh.client` ngoài repo được phục vụ thế nào so với frontend dist đã build sẵn.)*

---

## 10. Nhật ký tiến độ

### 10.1 Nền tảng — XONG

| Việc | Kết quả |
|---|---|
| `npm install -g pnpm@11.7.0` | 11.7.0 trên PATH, mở khoá `dsh plugin` |
| Branch | `my-custom` từ tag `dsh-v0.1.5-rc.1` (cây sạch) |
| `DSH_HOME` cách ly | `C:\Users\Minhn\DSH_Customize\.dsh-dev`, đã copy `.credentials.yaml` + `settings.yaml` |
| `corepack pnpm run build` | 234 client artifact; record `.dsh-build/client-build-environment.json` |
| Fork chạy | `http://127.0.0.1:8090`, GUI 3080 không bị đụng |
| Auth kiểm chứng | `/` không token → **401**; `?token=` → **303** + cookie `HttpOnly; SameSite=Strict; Max-Age=2592000`; `/api` + cookie → **200** |

**Lưu ý vận hành:** `pnpm run build` trả `exit code 1` dù **thành công**. Bước `build:native-system` in cảnh báo platform ra stderr, và PowerShell 5.1 biến stderr thành `NativeCommandError`. Kiểm tra artifact (`apps/web/dist/index.html`, `.dsh-build/…`) thay vì tin mã thoát.

### 10.2 Language pack tiếng Việt — XONG

| Bước | Kết quả |
|---|---|
| Trích xuất dictionary | **39 namespace / 1185 key**, 0 vấn đề (`tools/extract-locales.mts`) |
| Dịch | 6 batch song song, mỗi file verify key set + placeholder + thứ tự |
| Sinh bundle | `locale-vi/lib/client.js`, 68.793 byte (`tools/build-locale-pack.mts`) |
| Test chức năng | PASS — mô phỏng loader trong Node (`tools/verify-locale-pack.mts`) |
| Nạp vào profile | `dsh plugin --profile web add …` → `dsh-locale-vi link:…` |
| Row manifest | `.dsh-dev/profiles/web/cordis.patch.yml` |
| Server phục vụ | `/plugins/??dsh-locale-vi/client.js` → **200**, `text/javascript` |
| Boot manifest | entry có mặt trong index HTML |

**Cấu trúc đã dựng:**

- `C:\Users\Minhn\DSH_Customize\locale-vi\` — package ngoài repo (không cần bundler vì pack không import module nào)
- `C:\Users\Minhn\DSH_Customize\locale-work\` — 39 cặp `*.source.json` / `*.vi.json` + `manifest.json`
- `C:\Users\Minhn\DSH_Customize\tools\` — 5 script: extract, split, build, verify, audit

**Quy trình cập nhật bản dịch:** sửa `locale-work/<ns>.vi.json` → `corepack pnpm exec tsx tools/build-locale-pack.mts` → refresh trang (profile đang `patchReload: live`, package cài dạng `link:` nên không cần cài lại).

**103 giá trị giống hệt tiếng Anh** đã audit thủ công: tất cả là placeholder thuần (`{value} ms`, `{y}-{m}-{d}`), tên ứng dụng thương hiệu (Cursor, VS Code, IntelliJ IDEA…), acronym/đơn vị (TTFT, JSON, PDF, HTML, px, tok/s), hoặc ký hiệu (`,`, ` · `, `OK`, `Tab`). Không có chuỗi nào bị sót dịch.

**Điểm cần tinh chỉnh sau (không chặn):**

- `chat:message.turnProcess.subagents.one/.other` đều là `{count} subagent` (chữ thường) trong khi namespace `subagent` dùng `Subagent` (hoa).
- Tên preset phân quyền được dịch thành nhãn UI ("Chỉ đọc", "Ghi trong không gian làm việc", "Toàn quyền truy cập"). Nếu chuỗi này **còn được dùng làm giá trị kỹ thuật** trong code thì phải để nguyên tiếng Anh — cần kiểm tra trước khi dùng ở tầng sâu hơn.
- Đơn vị thời gian tương đối được mở thành chữ đầy đủ (`{n} phút`, `{n} giờ`) thay vì dạng nén (`min`/`h`) — dài hơn, có thể phải thu gọn nếu cột hẹp.

### 10.3 Settings cho browser transport (auth + trustedHosts) — XONG phần thực thi

**Vấn đề gốc:** `trustedHosts` bị chốt ở constructor `HostConnectionService`, `cookieMaxAgeDays` bị nướng vào `BrowserAuth`, nên đổi settings không có tác dụng. Cách vá thông thường là tái tạo service — nhưng `HostConnectionService extends Service` với key `'connection'`, tạo cái thứ hai trên cùng ctx sẽ xung đột.

**Cách đã chọn:** biến các giá trị đó thành **getter đọc sống** thay vì tái tạo service. Ít rủi ro hơn nhiều và không đụng tới vòng đời service.

| File | Thay đổi |
|---|---|
| `packages/client/connection/src/browser-auth.ts` | `maxAgeDays` → thunk; `secret` thành mutable; thêm `rotateSecret()` |
| `packages/client/connection/src/rpc-host.ts` | `trustedHosts` → thunk |
| `packages/client/connection/src/index.ts` | namespace settings `'connection'` qua `installSection`; mọi policy field đọc qua thunk; `validate` từ chối authority sai và body limit quá nhỏ; `honorRevoke()` tự xoá cờ |
| `packages/client/connection/tsconfig.host.json` | thêm project reference `../../settings/settings` (bắt buộc cho import type mới) |
| 4 file test + 1 helper | call site đổi sang thunk hằng số |

**Kiểm chứng sống — 7/7, KHÔNG restart lần nào** (`tools/verify-connection-settings.ps1`):

| # | Thao tác | Kết quả |
|---|---|---|
| 1 | Cookie baseline | `Max-Age=2592000` (30 ngày) |
| 2 | `Host: example.test` khi chưa tin | **403** — fence từ chối |
| 3 | Không cookie | **401** |
| 4 | Ghi `cookieMaxAgeDays: 1` vào `settings.yaml` → mint lại cookie | `Max-Age=86400` — **sống** |
| 5 | Thêm `trustedHosts: [example.test]` → lặp lại request #2 | **401** — fence đã cho qua, chỉ thiếu auth |
| 6 | Cookie hợp lệ | **200** |
| 7 | `revokeBrowserSessions: true` → cookie cũ | **401** — secret đã xoay; cờ tự về `false` trong `settings.yaml` |

Thêm: `pnpm exec vitest run packages/client/connection` → **14 file / 162 test pass**.

**Bài học vận hành:** lần `tsc -b` fail đầu tiên (do thiếu project reference) đã **emit nhầm** `.js`/`.d.ts` vào thẳng `packages/settings/settings/src/` — vì `noEmitOnError` mặc định là false và TS6307/6059 làm tsc rơi về emit theo common root. Đã xoá. Khi thấy `tsc -b` báo lỗi rootDir, phải kiểm tra `git status` xem có rác không.

**Còn lại của hạng mục (2):**

- **Card UI:** đăng ký vào `settings.plugin.item` keyed theo namespace — làm được ở tầng plugin client ngoài repo (đã chứng minh cơ chế với language pack), nên không cần fork thêm.

### 10.4 Settings cho publish (host/port) — XONG phần thực thi

**Đính chính một điều mình đã nói sai:** Plugins tab **không** tự sinh form cho namespace được phục vụ. `tab-store.ts` chỉ render những **card đã đăng ký** mà `key` khớp namespace được phục vụ; namespace không có card thì **không hiện gì**. Nên namespace `'connection'` hiện không thấy được trong UI — card là bắt buộc, không phải tùy chọn.

**Kiến trúc đã dựng:** package ngoài repo `dsh-web-settings` (Host half) sở hữu namespace `web-publish` với `{ host, port }`, và reconcile giá trị vào **patch layer của profile** dưới một block có đánh dấu.

Lý do phải là patch layer: `host`/`port` là giá trị composition-time, `WebServer` bind ngay khi row activate, nên chỉ có override theo `id` trong patch mới tác động được. Block **khai lại toàn bộ** config của row `webserver` (patch thay cả config, không deep merge), và giữ dạng `!!js ctx.webStartup.port ?? <giá trị lưu>` để **cờ CLI luôn thắng**.

**Kiểm chứng (bind thật, không tin dòng URL):**

| Case | Kết quả |
|---|---|
| Có block + không cờ | bind **8095** (giá trị đã lưu) |
| Có block + `--port 8099` | bind **8099** — CLI thắng |
| Chưa có block + `--port 8097` (first use) | boot sạch trên 8097, sau đó plugin ghi block |
| Sau đó không cờ | bind **8095** |

**Ràng buộc bắt buộc — `patchReload: startup`:** profile phải đặt `dsh.profile.patchReload: "startup"`. Với `"live"`, chính cú ghi của plugin trong lúc boot làm loader reload cây giữa chừng, mount lại row `webserver` khi listener cũ còn mở → `EADDRINUSE 127.0.0.1:3080` và **boot fail**. Đã tái hiện và xác nhận `startup` sửa dứt điểm. Đây cũng đúng ngữ nghĩa: host/port là giá trị restart-scoped. **Hệ quả cho profile hằng ngày:** chuyển sang `startup` nghĩa là mọi sửa patch (kể cả thêm row plugin) cần restart; nếu vẫn muốn `live` thì không nên mount plugin này.

**Bug có sẵn của repo, phát hiện trong quá trình kiểm chứng:** dòng `dsh web: http://…` do row `web-runtime` in ra dùng **cổng của config đã compose**, không phải cổng đang listen. Khi CLI ghi đè một cổng đã patch, URL in ra **sai** (in 8095 trong khi thực tế bind 8099). Chỉ ảnh hưởng thông báo, không ảnh hưởng bind. Cách kiểm tra đúng là `Get-NetTCPConnection -LocalPort <p> -State Listen`.

**Bài học kiểm chứng:** nếu mình tin dòng URL thay vì kiểm tra socket, mình đã kết luận sai rằng CLI không thắng và đi sửa một thứ vốn đúng. Lỗi `EADDRINUSE 8099` ở lần chạy sau chính là bằng chứng cứu được kết luận đó.

### 10.5 Card UI cho settings — XONG

Package `dsh-web-settings` giờ có **hai nửa**: Host half (settings `web-publish` + reconcile patch) và **client half** `lib/client.js` (viết tay, không bundler vì chỉ cần hai module nền tảng `react` và `@deepseek-ai/dsh-client-store`).

Hai card đăng ký vào `settings.plugin.item` keyed theo namespace:

| Card | Namespace | Trường | Hành động riêng |
|---|---|---|---|
| Publish | `web-publish` | host, port | — |
| Browser transport | `connection` | cookieMaxAgeDays, maxRequestBodyBytes, trustedHosts | nút "Đăng xuất mọi trình duyệt" |

Card copy được đăng ký qua locale namespace `webSettings` cho **cả `en` và `vi`**, nên card tự đổi ngôn ngữ theo setting Language. Không hardcode chữ.

**Kiểm chứng bundle client** (`tools/verify-web-settings-client.mts`) — mô phỏng loader trong Node, gọi thẳng component (framework truyền mọi dữ liệu reactive qua prop nên render được không cần DOM):

```
module id     : dsh-web-settings/client
exports       : apply, inject
inject        : ["slots","locale","settingsScope"]
dictionaries  : webSettings/en:28 | webSettings/vi:28
cards         : key=web-publish, key=connection (cả hai locale=webSettings)
writes        : set web-publish.host="dsh.example.test"
                set web-publish.port=8095
                set connection.cookieMaxAgeDays=7
                unset connection.trustedHosts
RESULT: PASS
```

Các assertion bao gồm: đúng 2 card, đúng slot name + key + locale, face có đủ `edit/save/discard/clear` (+ `revoke` riêng cho connection), có compartment `hooks`, **render đúng số trường** (2 và 3), số không hợp lệ **bị từ chối và không ghi**, và xoá trường thì gọi `unset` chứ không ghi giá trị rỗng.

**Xác minh trên server thật:** entry `dsh-web-settings/client.js` có mặt trong boot manifest, và `/plugins/??dsh-web-settings/client.js&rev=…` trả **200 / 19.768 byte / text/javascript** với đầy đủ dấu hiệu (`dsh-web-settings/client`, `settings.plugin.item`, `web-publish`, `webSettings`, `revokeBrowserSessions`).

**Ba lỗi đã gặp và sửa trong quá trình viết card** (đáng ghi vì đều là bẫy thật):

1. `defineStore` trả về **handle**, không phải instance. Phải `handle.create()` mới có `actions`; và compartment `hooks` cần chính **instance** (nó là bare snapshot source), không phải handle.
2. Element array trong `React.createElement` cần `key` — thiếu thì React cảnh báo và hoà giải theo index.
3. Kiểm chứng ghi settings phải **đợi microtask** (`await setImmediate`) vì `commit()` xếp chuỗi write qua `Promise`.

**Trạng thái hạng mục (2): XONG.** Dùng được ngay tại Settings → Plugins trong fork. Lưu ý hai điều kiện đã biết: profile phải `patchReload: startup` (mục 10.4), và trang phải là loopback — nếu mở qua địa chỉ khác thì card hiện "không ghi được" vì settings chuyển sang memory mode (mục 7.7).

### 10.6 Mô hình truy cập A+B — XONG phần kiểm chứng và artifact

Không tạo domain, DNS record, chứng chỉ hay listener công khai nào. Mọi kiểm chứng chạy trên loopback; artifact là cấu hình để bạn tự triển khai khi muốn lên thật.

**Ma trận fence (kiểm chứng bằng `tools/verify-fence-semantics.ps1`):**

| Request | Kết quả | Ý nghĩa |
|---|---|---|
| `Host: 127.0.0.1:9999` | **401** | Cổng khác vẫn là loopback ⇒ mô hình A chạy bất kể cổng tunnel |
| `Host: dsh.example.test` chưa khai trusted | **403** | Fence chặn domain lạ |
| `Host: dsh.example.test` + `Origin` khớp, sau khi khai trusted | **401** | Qua fence; có cookie thì 200 |
| `Host: 127.0.0.1:8095` + `Origin: https://dsh.example.test` | **403** | Đúng kiểu hỏng của proxy rewrite Host |
| `sec-fetch-site: cross-site` | **403** | Chặn cross-site |
| Cookie mint cho `127.0.0.1:9999` vs `:8095` | tên khác nhau | Cookie gắn chặt với authority |

**Ma trận proxy (kiểm chứng bằng `tools/verify-proxy-model.ps1` qua một reverse proxy Node thật):**

| Mô hình | Exchange token | Call API |
|---|---|---|
| B — proxy **giữ** Host | **303** | **200** |
| B — proxy **rewrite** Host | **303** | **403** |
| A — authority loopback cổng khác | **303** | **200** |

**Phát hiện quan trọng nhất — cái bẫy của proxy rewrite Host:** nó **trông vẫn khoẻ**. Redirect 303 vẫn chạy, trang vẫn tải, rồi **mọi call API đều 403**. Ai kiểm tra kiểu "trang có mở không" sẽ tưởng cấu hình đúng. Mình đã dự đoán 401 cho exchange ở rewrite mode và **đoán sai** — thực tế là 303, và chính vì thế failure mode mới nguy hiểm. Đã sửa lại kỳ vọng trong script cho khớp thực tế và thêm assertion cho nó.

**Artifact đã tạo:**

| File | Vai trò |
|---|---|
| `deploy/Caddyfile` | Cấu hình mô hình B, có comment cảnh báo **không** thêm `header_up Host`, kèm `flush_interval -1` cho SSE |
| `deploy/README.md` | Hướng dẫn A và B: DNS, Caddy, khai trusted host (qua card hoặc file), lấy token, bảng kiểm chứng, 7 bất biến bảo mật, và ghi rõ tài liệu này không tạo gì ra internet |
| `tools/host-proxy.mjs` | Reverse proxy test với `--mode preserve\|rewrite`, pipe response để không đệm SSE |
| `tools/verify-fence-semantics.ps1` | Ma trận fence + ràng buộc authority của cookie |
| `tools/verify-proxy-model.ps1` | Ma trận proxy cho cả A và B |

**Bài học vận hành mới:** file `.ps1` chứa ký tự non-ASCII sẽ **vỡ cú pháp** khi chạy bằng Windows PowerShell 5.1, vì nó đọc `.ps1` không BOM theo ANSI (em-dash thành `â€”` và phá chuỗi). Giữ script `.ps1` thuần ASCII; văn bản có dấu để trong `.md`.

**Nhắc lại điểm bất đối xứng cốt lõi:** mô hình A cho settings ghi bền, mô hình B thì không (memory mode). Đây là lý do phải dùng **kết hợp** chứ không chọn một.

### 10.7 Panel bên phải (nửa đầu hạng mục 3) — XONG

**Contract thật của tab phải (2 tầng):** tab type vào `ctx.sidebarRightTabs.register({ id, kind, title, guide?, patterns?, priority? })`, body vào keyed `sidebar.right.pane.tab` **theo `definition.id`**. Điểm dễ sai: `useTabInfo` **không phải** do mình inject — nó là prop do **slot** cấp (slot khai `inject: SidebarRightTabInjected` với `hooks.tabInfo`). Tự inject lại sẽ hỏng.

**Panel "Publish status"** (kind `dshPublishStatus`, id `dsh-web-settings/publish-status`) — không phải demo rỗng, nó **chẩn đoán cấu hình truy cập**:

- Hiện: authority của trang, có phải loopback không, settings mode + ghi được không, thời hạn cookie, trusted hosts, host/cổng đã lưu, pane id, contentId của tab, số lần điều hướng.
- **Cảnh báo đúng cái bẫy ở mục 10.6:** trang không loopback **và** host không nằm trong `trustedHosts` ⇒ fence `/api` sẽ từ chối. Đây chính là cấu hình "trang vẫn mở nhưng mọi call API chết" — panel nói thẳng ra thay vì để người dùng tự đoán.
- Cảnh báo thêm: settings đang ở memory mode (không lưu được), chưa khai trusted host nào.
- Có guide entry (`order: 60`) nên xuất hiện trên trang guide của sidebar phải — đúng đường khám phá chuẩn của sản phẩm.

**Kiểm chứng:** harness PASS — 2 card + 1 panel, tab type đúng id/kind, có guide entry, và render **ba trạng thái**: lành mạnh → `okConfig`; không trusted → `warnNoTrusted`; host lạ → `warnHostNotTrusted`. Trên server: bundle **200 / 28.681 byte** với đủ dấu hiệu (`sidebar.right.pane.tab`, `dsh-web-settings/publish-status`, `dshPublishStatus`, `warnHostNotTrusted`), và có trong boot manifest. Chữ: 48 key/locale cho `en` + `vi`.

**Sự cố đáng ghi — lỗi nằm trong script kiểm chứng của chính mình:** hàm `Set-ConnectionSection` dùng regex `(?ms)^connection:\r?\n(?:[ \t].*\r?\n?)*`. Với cờ `(?s)`, `.*` tham lam khớp cả newline nên nó **nuốt mọi thứ sau `connection:` tới hết file** — xoá luôn section `web-publish`. Hậu quả xuất hiện ở tận **lần boot sau**: không còn cổng đã lưu, tiến trình rơi về mặc định 3080, đụng GUI hằng ngày ⇒ `EADDRINUSE` và boot fail. Đã sửa sang lọc theo dòng. Hai bài học: helper sinh ra để kiểm chứng cũng phải được kiểm chứng; và mất một section có thể biểu hiện rất xa nguyên nhân.

**Còn lại của hạng mục (3): chat node tùy biến** — node phải fold từ session event, đăng ký `ConversationNodeDefinition` + renderer keyed `conversation.chat.node`.

### 10.8 Chat node tuỳ biến (nửa sau hạng mục 3) — XONG

**Chọn đúng khoảng trống trước khi viết.** Mình grep `event.type === '` trong cả 20 file `conversation-nodes/` để biết family nào đã có definition. Ba family `permission/preset`, `sandbox/mode`, `approval/policy` **không definition nào nhận** ⇒ mọi thay đổi quyền hoàn toàn vô hình trong transcript. Đây là lựa chọn có chủ đích: nếu chọn một family đã được nhận (tool/call, assistant/message…) thì node của mình sẽ **tạo bản sao**, vì engine fold mỗi definition độc lập và definition nào match cũng sinh node.

**Node `session-mode`:** mỗi thay đổi sinh **một chip riêng tại đúng vị trí** (id theo `event.seq`), thay vì gộp về một node ở đầu session — nhờ vậy nhìn được *khi nào* quyền đổi. Chip hiện nhãn đã dịch ("Quyền" / "Sandbox" / "Phê duyệt") cạnh **giá trị để nguyên** (`workspace-write`, `read-only`, `ask`, `never`) vì đó là định danh người dùng thấy ở nơi khác.

**Ba chi tiết contract phải đúng, nếu đoán sẽ sai:**
1. `buildViewNode` không được tự nghĩ ra shape node. Node cần `{ key, kind, id, target: 'chat', anchorSeq, location, visibility, data }` — mình đọc `common.ts: chatNode()` để lấy chính xác thay vì suy diễn.
2. Renderer `conversation.chat.node` nhận **`props.node`** (owner props có `node: routedNode`), nên component đọc `props.node.data`.
3. **Không** khai `locale: 'chat'` cho renderer: namespace `chat` đã được ui-chat đăng ký cho cặp `(chat, vi)` bởi language pack, đăng ký lại sẽ throw *"already has locale"*. Copy đi qua inject face thay vì qua locale seat.

**Bằng chứng event thật sự tồn tại trong log** (để chắc node không phải code chết): grep `snapshots/` — **mọi** session fixture đều có ba event này ở **dòng 2-4** ngay khi tạo session, và `permission-policy-context` có **5 lần đổi** rải suốt session. Cũng thấy biến thể `sandbox/mode` với `source: "delegation"` (sub-session) **không** kèm `permission/preset` — match xử lý độc lập từng event nên vẫn đúng.

**Kiểm chứng:** harness PASS — 1 definition đúng kind/target; `match` nhận đúng 3 family và **trả `null` cho `user/message`**; hai thay đổi khác nhau cho **id khác nhau**; node materialize có `anchorSeq` và `data.value` đúng; renderer đăng ký dưới key `session-mode`; chip render ra cả nhãn đã dịch lẫn giá trị. Trên server: bundle **200 / 33.480 byte** với đủ dấu hiệu (`conversation.chat.node`, `session-mode`, `uiConversation`, cả ba tên event).

**Trạng thái hạng mục (3): XONG** (panel bên phải + chat node). Tổng bundle client giờ có **4 đăng ký**: 2 card settings, 1 panel, 1 chat node — và **51 key copy cho mỗi locale** `en`/`vi`.

### 10.9 Tool mới + hook chặn tool (nửa đầu hạng mục 4) — XONG

**Tool `web_publish_status`** (Host half): báo cáo cổng đang listen, host/cổng đã lưu, thời hạn cookie, allowlist trusted host, và `remoteAccessConfigured`. Mục đích thật: để agent tự trả lời được "vì sao điện thoại không mở được UI" hoặc "vì sao /api bị từ chối" thay vì người dùng phải tự đoán.

**Hook chặn tool** (`tools/pre-execute`, namespace `tool-guard`): từ chối các tool có tên trong danh sách, kèm lý do hướng tới model. Có card UI riêng. Điểm quan trọng về ngữ nghĩa waterfall: listener **chỉ sở hữu quyết định khi return mà không gọi `next()`**; mọi nhánh khác đều delegate để phần còn lại của chuỗi policy vẫn sống.

**Không thêm dependency nào:** `defineTool` chỉ dựng một plain object (`packages/core/tools/src/schema.ts:569-590`), nên mình viết tay `ToolDefinition` (`name`, `description`, `parameters`, `output.schema`, `output.render`, `execute`) và tránh phải cài `@deepseek-ai/dsh-tools` vào package ngoài repo.

**Kiểm chứng Host half** (`tools/verify-web-settings-host.mts`) — stub context, patch path trỏ vào file tạm để **không đụng profile thật**:

```
settings sections  : web-publish, tool-guard
tool               : web_publish_status
report             : port=8095 host=dsh.example.test cookie=7d trusted=[dsh.example.test]
guard              : bash -> deny, read_file -> next() (delegated 1)
patch file written : yes
RESULT: PASS
```

Assertion gồm cả: tool có schema tham số + schema output + renderer; `execute` trả đúng báo cáo; `render` trả text block có trusted host; guard **deny mà không delegate** cho tool bị chặn, và **delegate đúng một lần** cho tool không bị chặn.

**Phát hiện hữu ích — envelope RPC qua `/api`** (tài liệu không nêu rõ, gateway tự dạy qua thông báo lỗi chính xác):

```
POST /api/settings/describe
{"type":"client-request","rpcId":"...","method":"settings/describe","payload":{"args":{}}}
```

Ba bước sai và thông báo tương ứng: path sai → `not found`; method sai → `method "settings.describe" does not match endpoint "settings/describe"`; payload sai → `Remote payload must contain exactly one plain-object args field`. Đây là oracle rất tốt để khám phá API về sau.

**Xác minh end-to-end mạnh nhất:** gọi `settings/describe` qua API thật trả `"ok": true`, 27.986 byte, và **có đủ cả ba namespace** `web-publish`, `tool-guard`, `connection`. Vì tab Plugins chỉ render card khi Host phục vụ key tương ứng, điều này chứng minh **cả ba card sẽ hiện**, không chỉ tồn tại trong bundle.

**Khoảng trống kiểm chứng còn lại, nói thẳng:** mình chưa quan sát được tool trong **schema mà model nhận** — việc đó cần một lượt gọi model thật (tốn credit API). Đã kiểm chứng: đăng ký, thực thi, render, và boot sạch trong profile thật. Phần chưa quan sát là bước assembly request cuối cùng.

### 10.10 LLM adapter offline (nửa sau hạng mục 4) — XONG

Package `dsh-llm-echo`, provider `local-echo`, model `echo-1`: một route **không gọi mạng**, stream câu trả lời có tiền tố cấu hình được. Mục đích thật: **chạy thử GUI, agent loop, tool call, transcript và streaming mà không tốn credit API** — đúng việc bạn đang làm khi customize giao diện.

**Phát hiện quan trọng — "structural" không đủ.** Nghiên cứu trước đó nói adapter chỉ cần `stream()`. Điều đó đúng với **subclass** của `LlmAdapter` (thừa hưởng default), nhưng **sai với plain object**: boot fail với `adapter.providerRetryPolicy is not a function`. Runtime gọi **6 method** trên adapter:

| Method | Gọi ở đâu |
|---|---|
| `providerInfo(provider)` | lúc đăng ký route |
| `providerRetryPolicy(provider)` | lúc đăng ký route |
| `imageRequestPricing(provider, model)` | mỗi lần đo token |
| `listModels(provider)` | danh mục model |
| `resolveModel(provider, model, signal)` | tra metadata route |
| `prepareCall(provider, model, signal)` | **đường dispatch thật** — không phải `stream()` |

Bài học: các **default của abstract class là một phần hợp đồng runtime** khi bạn không kế thừa nó. Đã bổ sung đủ cả 6, và harness được sửa để chạy contract **qua `prepareCall`** thay vì chỉ `stream()` — tức kiểm chứng đúng đường mà runtime dùng.

**Kiểm chứng** (`tools/verify-llm-echo.mts`): chuỗi chunk `block-start → text-delta ×4 → block-end → usage → finish`; text của `block-end` **bằng đúng** phần nối các delta; `usage` nằm **trước** finish, là số nguyên dương, `totalTokens = input + output`; **finish là chunk cuối, không có gì sau nó**; reason `stop`; **huỷ giữa chừng được tôn trọng** (stream throw thay vì resolve); và đăng ký đúng 1 adapter + 1 configurable provider + 1 settings section.

**Xác minh end-to-end trên Host đang chạy:** `llm/listProviders` trả `[{local-echo, Local echo (offline)}, {deepseek-official}, {zai}]`, và `llm/listConfigurableProviders` có `local-echo` ở **đầu tiên** với `settingsNs: "local-echo"`. Nghĩa là Models page và bộ chọn model sẽ thấy provider này.

### 10.11 Tổng kết — cả 5 hạng mục đã xong

| # | Hạng mục | Bằng chứng cuối cùng |
|---|---|---|
| 1 | Language pack tiếng Việt | 39 namespace / 1185 key; harness PASS; bundle 200 + có trong boot manifest |
| 2 | Settings publish + auth + card | 7/7 kiểm chứng sống (fence, cookie, revoke); 3 card; `settings/describe` trả `ok:true` với đủ 3 namespace |
| 3 | Panel phải + chat node | harness PASS (panel 3 trạng thái, node match/fold/buildViewNode); bundle 200 với đủ 4 đăng ký |
| 4 | Tool + hook + LLM adapter | harness PASS cả hai; `listProviders` thật có `local-echo` |
| 5 | Mô hình A+B | ma trận fence 4/4 + ma trận proxy 3/3; artifact `deploy/` |

**Sweep hồi quy cuối:** 4 harness Node PASS + ma trận fence đúng 4/4.

**Cách ly được giữ đúng suốt quá trình:** GUI 3080 vẫn do PID 6296 gốc (bản npm toàn cục) giữ, chưa từng bị đụng. Fork chạy ở 8095 với `DSH_HOME` riêng, mount 3 package ngoài repo qua `link:`.

**Nơi phải fork (không thể tránh):** chỉ `packages/client/connection/*` — vì `trustedHosts`/`cookieMaxAgeDays` bị chốt ở constructor và chỉ plugin sở hữu mới đổi được. Mọi thứ còn lại đều ở tầng plugin ngoài repo.

**Hai ràng buộc triển khai đã biết, không phải lỗi:** profile cần `patchReload: startup` (mục 10.4); trang phải là loopback để settings ghi được (mục 7.7).

## 11. Bịt cửa sổ console bật lên khi chạy (Windows)

**Triệu chứng:** mỗi lần agent gọi tool, một cửa sổ command nhấp nháy rồi tắt. **Nguyên nhân:** Windows cấp một console mới cho tiến trình console khi tiến trình cha **không có** console — đúng trường hợp host là GUI/extension. `CREATE_SUSPENDED` không ngăn được việc đó; phải có `CREATE_NO_WINDOW` (`0x08000000`), còn `child_process.spawn` thì cần `windowsHide: true`.

Bản 0.1.5-rc.2 thiếu cờ ở **bốn** đường:

| # | Đường spawn | File nguồn | Trước | Sau |
|---|---|---|---|---|
| 1 | `spawnPipedProcess` → `CreateProcessAsUserW` | `win32-process/src/process.ts:236` | `0` | `CREATE_NO_WINDOW` |
| 2 | `spawnInheritedJobProcess` → `CreateProcessAsUserW` | `process.ts:509` | `CREATE_SUSPENDED` | `… \| CREATE_NO_WINDOW` |
| 3 | `spawnCurrentTokenJobProcess` → `CreateProcessW` | `process.ts:534` | `… \| CREATE_UNICODE_ENVIRONMENT` | `… \| CREATE_NO_WINDOW` |
| 4 | runner Windows | `subprocess-local/src/windows-job.ts:144` | (không có) | `windowsHide: true` |

Cố ý **không** đụng: `linux-scope.ts:477` cũng gọi `runnerStdio(spec, false)` nhưng đó là đường Linux (`windowsHide` vô nghĩa ở đó), và `nodePty.spawn` là terminal tương tác — terminal thì phải có console.

**Bẫy đã gặp và cách xử lý**

1. **Bản published mới hơn base của fork.** Bản cài toàn cục là rc.2, fork đang ở rc.1 → source fork chỉ có 2/3 đường của package win32. Chỉ lộ ra khi diff bản cài với tarball gốc trên npm (`npm pack @deepseek-ai/dsh-win32-process@0.1.5-rc.2`). Đã vá nốt đường 1 vào source (commit `11ba178`).
2. **Bundler gộp cờ OR thành số thập phân.** `grep 0x08000000` trong bundle **không** thấy gì; phải tìm `134217732` (= `4 | CREATE_NO_WINDOW`) và `134218756` (= `1028 | CREATE_NO_WINDOW`). Kết luận "thiếu cờ" nếu chỉ grep dạng hex là sai.
3. **Khớp nhầm định nghĩa hàm.** `findCalls("createRestrictedProcess")` bắt cả dòng `function createRestrictedProcess(api, …)`; không loại trừ thì script sẽ nối `| 0x08000000` vào **danh sách tham số**. Đã chặn bằng `/\bfunction\s*$/`.
4. **Hai chỗ `runnerStdio(`.** Chỗ xuất hiện đầu tiên trong file là `runnerStdio(spec, false)` (linux-scope), không phải chỗ Windows (`spec, true, ignoredStdinFd ?? "pipe"`). Regex khớp-chỗ-đầu-tiên đã suýt vá nhầm đường Linux → phải neo theo `spec, true`.
5. **`span()` trim làm mất dấu cách.** Kết quả `,0x08000000` thay vì `, 0x08000000` — vẫn chạy nhưng diff bẩn. Sửa bằng cách giữ khoảng trắng đầu/cuối khi splice.
6. **Copy mà GUI thực sự nạp.** `@deepseek-ai/dsh-win32-process` resolve về `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\…` (qua `~/.dsh/profiles/node_modules`), tức bản cài toàn cục — không phải fork. Phải vá đúng bản đó.
7. **Phải restart.** File được vá lúc 13:05:58 nhưng tiến trình GUI đang chạy khởi động từ ba ngày trước → code cũ vẫn nằm trong RAM. Node nạp module một lần lúc boot.

**Bằng chứng**

- Test package: `vitest run packages/subprocess/win32-process` → **55/55 PASS**; các spec assert đúng cờ truyền cho từng entry point (trước khi sửa thì đỏ).
- Diff bản cài với tarball published rc.2: **đúng 4 hunk**, không có sửa lỗi phụ nào.
- `tools/patch-dsh-nopopup.mjs` chạy trên tarball gốc tạo ra file **byte-identical** (SHA-256 trùng) với bản đã vá thủ công; chạy lần hai không đổi gì (idempotent).
- `--check` trên bản cài thật: cả hai file báo "already patched".

**Vì sao cần script:** `npm i -g @deepseek-ai/dsh` ghi đè bundle published → bản vá mất. Script vá lại đúng bốn tham số, không đoán bừa (dạng bundle lạ thì dừng và không ghi), kiểm cú pháp bằng `node --check`, hỏng thì tự hoàn tác, và có `--revert`.
