# dsh-custom — bộ tùy biến cho DeepSeek Harness

[English](README.md) | Tiếng Việt | [中文](README.zh.md)

Bộ tùy biến **không chính thức** cho [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`)
0.1.5-rc.1. Không liên kết với DeepSeek, không được DeepSeek bảo trợ.

Phần lớn chạy dạng **plugin ngoài repo**: không có gì ở đây bắt buộc phải vá checkout của harness. Ngoại lệ duy
nhất là settings cho browser transport, nằm trong một bản vá nhỏ vì các giá trị đó bị chốt bên trong plugin
connection (xem bên dưới).

## Có gì trong này

| Thư mục | Nội dung |
|---|---|
| `locale-vi/` | Language pack tiếng Việt: plugin client đăng ký locale `vi` và 39 dictionary |
| `locale-work/` | Nguồn dịch: 39 file `*.source.json` (tiếng Anh, trích từ harness) và bản `*.vi.json` tương ứng |
| `dsh-web-settings/` | Card settings, panel sidebar phải, node trong transcript, tool chẩn đoán, và tool guard |
| `dsh-llm-echo/` | Provider LLM offline để chạy GUI mà không cần API key |
| `tools/` | Script trích xuất, build, và kiểm chứng đã dùng để tạo và kiểm tra mọi thứ ở trên |
| `deploy/` | Ghi chú truy cập từ xa và Caddyfile cho hai mô hình truy cập |

Độ phủ của language pack: **39 namespace, 1185 key**, tức toàn bộ những gì Web GUI ship.

## Cài đặt

Mỗi package là một dependency thường của profile `dsh`. Từ checkout hoặc từ `dsh` đã cài:

```sh
dsh plugin --profile web add /path/to/locale-vi
dsh plugin --profile web add /path/to/dsh-web-settings
dsh plugin --profile web add /path/to/dsh-llm-echo
```

Rồi mount từng cái trong `$DSH_HOME/profiles/web/cordis.patch.yml`:

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

Khởi động lại `dsh web`. Language pack thêm **Tiếng Việt** vào Settings → General → Language; hai package kia
thêm card dưới Settings → Plugins, một panel ở sidebar phải, và provider `local-echo`.

### Bản vá duy nhất phải sửa trong repo

`dsh-web-settings` ghi host và cổng đã lưu vào patch layer của profile, nên profile cần đặt:

```json
"dsh": { "profile": { "patchReload": "startup" } }
```

Với `"live"`, chính cú ghi của plugin trong lúc boot làm loader áp lại cây giữa chừng, và row webserver rebind
khi listener của nó còn mở — boot fail. Host và cổng dù sao cũng chỉ có hiệu lực ở lần khởi động sau, nên
`startup` đúng với tính năng này.

`cookieMaxAgeDays`, `trustedHosts`, và hành động "đăng xuất mọi trình duyệt" **không** cần bản vá đó — nhưng
chúng cần plugin `connection` đọc policy sống, tức bản vá nhỏ được mô tả ở `CUSTOMIZE_PLAN.md` §10.3. Không có
nó thì những settings đó vẫn được lưu nhưng **không có tác dụng** cho tới khi restart.

## Kiểm chứng

Mọi thứ đều được kiểm bằng cách chạy thật, không phải bằng cách đọc code. Mỗi script in `RESULT: PASS` hoặc
danh sách assertion thất bại:

| Script | Chứng minh điều gì |
|---|---|
| `tools/verify-locale-pack.mts` | Bundle client sinh ra nạp được, đăng ký `vi`, và mang đủ 39 namespace với 1185 key |
| `tools/verify-web-settings-client.mts` | Ba card, panel, và chat node đăng ký đúng key và render được; Definition của chat node chỉ khớp đúng ba họ event của nó |
| `tools/verify-web-settings-host.mts` | Các settings section được cài, tool thực thi và render, và guard từ chối mà không delegate còn trường hợp khác thì delegate |
| `tools/verify-llm-echo.mts` | Adapter thỏa hợp đồng stream thô: block start/delta/end khớp index, `usage` đứng trước `finish` cuối, không có gì sau đó, và huỷ giữa chừng dừng được stream |
| `tools/verify-fence-semantics.ps1` | Quyết định của fence Host/Origin trên `/api`, và việc cookie phiên bị ràng buộc với authority đã cấp nó |
| `tools/verify-proxy-model.ps1` | Reverse proxy **giữ** Host chạy được end-to-end; proxy **rewrite** Host (mặc định của nginx) làm chết mọi call API |
| `tools/verify-port-precedence.ps1` | Cổng đã lưu được áp dụng ở lần khởi động sau và cờ `--port` chỉ định rõ vẫn thắng |
| `tools/verify-connection-settings.ps1` | Một thay đổi settings tới được fence sống, thời hạn cookie được cấp, và việc thu hồi phiên |

Các script cần một profile đang chạy sẽ nhận token khởi động của nó làm tham số, ví dụ:

```powershell
powershell -File tools/verify-fence-semantics.ps1 <TOKEN>
```

## Build lại language pack

```sh
corepack pnpm exec tsx tools/extract-locales.mts   # đọc dictionary của harness vào locale-inventory.json
corepack pnpm exec tsx tools/split-locales.mts     # tách thành một file cho mỗi namespace trong locale-work/
# sửa locale-work/<namespace>.vi.json
corepack pnpm exec tsx tools/build-locale-pack.mts # sinh lại locale-vi/lib/client.js và kiểm tra
```

`build-locale-pack.mts` từ chối ghi nếu một bản dịch thiếu key hoặc làm mất một `{placeholder}`.

## Bảo mật

- **Không bao giờ public một Harness home.** `$DSH_HOME/.credentials.yaml` chứa khoá API của provider, và
  `settings.yaml` có thể chứa nhiều thứ khác. `.gitignore` ở đây loại `.dsh-dev/` chính vì lý do đó.
- **Cookie phiên của browser tương đương quyền thực thi mã từ xa.** Ai giữ nó đều chạy được tool trong
  workspace của bạn và đọc credentials qua đó.
- **Cookie không có cờ `Secure`** vì carrier không có TLS. Lộ UI ra domain công khai bắt buộc phải có một proxy
  kết thúc TLS đứng trước listener loopback; xem `deploy/README.md`.
- **Không bao giờ bind `0.0.0.0` trực tiếp.** `dsh web` từ chối cờ đó vì lý do này.
- `trustedHosts` chỉ mở rộng fence Host/Origin. Bản thân nó không cấp quyền truy cập.

## Giấy phép

MIT, khớp với harness. Các chuỗi tiếng Anh được trích trong `locale-work/*.source.json` và
`locale-inventory.json` là phái sinh từ DeepSeek Harness, vốn được cấp phép MIT.
