# Triển khai truy cập từ xa cho fork DSH

Hai mô hình, dùng **kết hợp** như đã chốt:

- **A — SSH tunnel về loopback:** dùng khi cần **đổi settings**. Browser thấy `127.0.0.1` nên settings ghi được bình thường.
- **B — domain công khai + TLS reverse proxy:** dùng khi cần truy cập rộng (điện thoại, máy khác). Settings chỉ **đọc** được.

Lý do hai mô hình khác nhau về quyền ghi: `isLoopback` phía client tính từ hostname của trang. Trang loopback ⇒ settings ghi bền vào `settings.yaml`; trang domain ⇒ settings chuyển sang **memory mode** và mọi thao tác ghi trở thành no-op. Đây là thiết kế, không phải bug.

---

## Điều kiện chung

- Fork đang chạy và bind loopback, ví dụ `127.0.0.1:8095`.
- Profile có `dsh.profile.patchReload: "startup"` nếu dùng card Publish (xem `CUSTOMIZE_PLAN.md` mục 10.4).
- **Không bao giờ** bind `0.0.0.0` mà không có proxy TLS + auth phía trước. CLI đã chặn cờ đó đúng vì lý do này: DSH chạy tool tùy ý, lộ UI ra internet là lộ RCE.

---

## Mô hình A — SSH tunnel

Trên máy server, lấy token ở dòng khởi động:

```
dsh web: http://127.0.0.1:8095/?token=<TOKEN>
```

Từ máy client:

```bash
ssh -N -L 8095:127.0.0.1:8095 user@server
```

Rồi mở đúng URL đó ở browser: `http://127.0.0.1:8095/?token=<TOKEN>`.

Vì sao hoạt động: server thấy `Host: 127.0.0.1:8095` (hostname loopback), fence cho qua bất kể cổng nào — đã kiểm chứng: `Host: 127.0.0.1:9999` trả **401** (qua fence, chỉ thiếu cookie). Cookie được ký theo authority, nên cookie mint cho cổng này **không** dùng được cho cổng khác.

Muốn cổng local khác thì đổi số bên trái: `-L 9000:127.0.0.1:8095` và mở `http://127.0.0.1:9000`.

---

## Mô hình B — domain công khai + Caddy

### 1. DNS

Bản ghi `A` (hoặc `AAAA`) cho `dsh.example.test` trỏ về IP server. Caddy cần cổng **80 và 443** mở để lấy chứng chỉ TLS tự động.

### 2. Caddy

Dùng `deploy/Caddyfile` (đổi tên miền). Điểm mấu chốt: **giữ nguyên Host header**. Caddy làm đúng theo mặc định; kiểu nginx `proxy_set_header Host $proxy_host` thì **sai** và đã được kiểm chứng là chết ở tầng API.

### 3. Khai domain là trusted host

Fence chỉ cho qua hostname loopback hoặc authority có trong `trustedHosts`. Có hai cách:

- **Trong UI:** Settings → Plugins → card **"Browser transport"** → trường `trustedHosts`, mỗi dòng một authority. Lưu là áp dụng ngay, không cần restart.
- **Bằng file:** sửa `$DSH_HOME/settings.yaml`:

```yaml
connection:
  trustedHosts:
    - dsh.example.test
```

Authority phải ở dạng trần: `host` hoặc `host:port`. **Tên miền IDN phải viết punycode.** Sai chính tả thì plugin **throw lúc load** — fail loud, không im lặng.

### 4. Lấy token

Token sinh **mỗi tiến trình**, in ra stdout của server khi khởi động. Mở `https://dsh.example.test/?token=<TOKEN>` một lần; sau đó cookie phiên được set và các lần sau vào thẳng `/`.

---

## Kiểm chứng đã chạy

| Kịch bản | Kết quả |
|---|---|
| `Host: 127.0.0.1:9999` (giả lập tunnel cổng khác) | **401** — qua fence |
| `Host: dsh.example.test` khi chưa khai trusted | **403** — fence chặn |
| `Host: dsh.example.test` + `Origin` khớp, sau khi khai trusted | **401** → có cookie thì **200** |
| `Host: 127.0.0.1:8095` + `Origin: https://dsh.example.test` | **403** — đúng kiểu hỏng của proxy rewrite Host |
| `sec-fetch-site: cross-site` | **403** |
| Proxy **giữ** Host, exchange token rồi gọi API | **303** rồi **200** |
| Proxy **rewrite** Host | exchange vẫn **303**, nhưng mọi call API **403** |

Chạy lại:

```powershell
powershell -File tools\verify-fence-semantics.ps1 <TOKEN>
powershell -File tools\verify-proxy-model.ps1 <TOKEN>
```

**Cảnh báo quan trọng từ bảng trên:** proxy rewrite Host **trông vẫn khoẻ** — trang tải được, redirect chạy — rồi chết ở mọi call API. Nếu chỉ kiểm tra "trang có mở không" thì bạn sẽ tưởng cấu hình đúng.

---

## Bất biến bảo mật

1. **Cookie phiên tương đương credential RCE.** Ai có cookie là chạy được lệnh trong workspace và đọc được `$DSH_HOME/.credentials.yaml` (khoá DeepSeek API) qua tool.
2. **Cookie không có cờ `Secure`** vì carrier không có TLS. Qua domain công khai **buộc phải có TLS ở proxy**, nhưng bản thân cookie vẫn thiếu cờ đó — điểm yếu còn lại, không khắc phục được nếu không sửa `browser-auth.ts`.
3. **Asset tĩnh không phải index là công khai** — bundle JS tải được mà không cần auth. Đừng coi bundle là bí mật.
4. **`trustedHosts` chỉ mở rộng fence, không cấp quyền.** Request từ trusted host vẫn cần cookie.
5. **Token nằm trong query string.** Qua domain công khai nó vào log của proxy và history trình duyệt. Tunnel (mô hình A) tránh được điều này.
6. **Xoay khoá ký = đăng xuất mọi browser.** Dùng nút "Đăng xuất mọi trình duyệt" trong card Browser transport. Ai đọc được `.credentials.yaml` thì ký được cookie cho mọi authority.
7. **Đừng bao giờ bind `0.0.0.0`** trực tiếp.

---

## Điều tài liệu này KHÔNG làm

Không có domain, DNS record, chứng chỉ, hay listener công khai nào được tạo trong quá trình soạn. Mọi kiểm chứng đều chạy trên loopback. Các bước 1-4 ở trên là việc bạn thực hiện khi muốn lên thật.
