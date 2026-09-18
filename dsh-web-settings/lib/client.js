/**
 * Browser half of `dsh-web-settings`: one settings card per served namespace.
 *
 * The client module system serves this file as a lazy CommonJS factory, so it
 * is hand-written rather than bundled. It needs only the shell-seeded modules:
 * `react` for elements and `@deepseek-ai/dsh-client-store` for the render
 * mirror. No JSX transform runs here, so elements are built with
 * `React.createElement`.
 *
 * Each card registers into `settings.plugin.item` keyed by the settings
 * namespace it edits, reads that namespace through `ctx.settingsScope`, and
 * publishes its render state through the reserved `hooks` compartment. The
 * apply world owns every draft and every write; the component only reads the
 * published snapshot and calls the injected callbacks.
 */

window.__ModuleLoader__.load({
  id: "dsh-web-settings/client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });

    var React = require("react");
    var storeModule = require("@deepseek-ai/dsh-client-store");
    var h = React.createElement;

    /** Locale namespace holding this plugin's card copy. */
    var NS = "webSettings";

    /** Card copy in both shipped built-in locales. */
    var COPY = {
      en: {
        publishTitle: "Publish: listen host and port",
        publishHint: "Stored as user settings. This plugin reconciles them into the profile patch layer.",
        publishNote: "Takes effect at the next start. An explicit --host or --port still wins.",
        connectionTitle: "Browser transport: authentication and trust",
        connectionHint: "Applies immediately, without a restart.",
        connectionNote: "Trusted hosts only widen the Host/Origin fence; they grant no access on their own.",
        hostLabel: "Listen host",
        hostHint: "Empty follows the launch and the composed default (127.0.0.1).",
        portLabel: "Listen port",
        portHint: "Empty follows the launch and the composed default (3080).",
        cookieLabel: "Cookie lifetime (days)",
        cookieHint: "Applies to newly issued cookies; lowering it also rejects longer-lived ones.",
        bodyLabel: "Max request body (bytes)",
        bodyHint: "Must stay above the configured aggregate image limit.",
        trustedLabel: "Trusted hosts",
        trustedHint: "One bare authority per line: host, or host:port. IDN hosts use punycode.",
        revokeLabel: "Sign out every browser",
        revokeHint: "Replaces the signing secret, so every existing cookie stops authenticating.",
        revokeAction: "Sign out all",
        save: "Save",
        discard: "Discard",
        clear: "Reset",
        overridden: "overridden",
        unavailable: "This namespace is not writable from this page. Open the UI on the Host machine, or use an authenticated loopback session.",
        readOnly: "The Host does not accept writes for this namespace from this page.",
        invalid: "Check the values: numbers must be whole and non-negative.",
        busy: "Saving…",
        applied: "Saved.",
        panelTitle: "Publish status",
        panelGuide: "Check whether this deployment can serve the API from where you opened it.",
        panelHost: "This page's authority",
        panelLoopback: "Loopback page",
        panelSettings: "Settings persistence",
        panelCookie: "Cookie lifetime",
        panelTrusted: "Trusted hosts",
        panelStored: "Stored host and port",
        panelPane: "Pane",
        panelTab: "Tab content",
        panelRevision: "Navigations",
        panelClose: "Close",
        panelNone: "(none)",
        panelDays: "days",
        panelYes: "yes",
        panelNo: "no",
        warnNotLoopback: "This page is not on loopback, so the Host keeps preferences process-local: the settings cards cannot save here.",
        warnNoTrusted: "No trusted host is declared, so only loopback requests pass the /api fence.",
        warnHostNotTrusted: "This page's host is not listed in trustedHosts, so the /api fence refuses it.",
        okConfig: "This page can read and save settings.",
        modePermission: "Permission",
        modeSandbox: "Sandbox",
        modeApproval: "Approval",
        guardTitle: "Tool guard",
        guardHint: "Refuse these tools before they run.",
        guardNote: "The refusal is enforced in the pre-execute policy, so it also stops a tool reached through run_code.",
        guardFieldLabel: "Blocked tool names",
        guardFieldHint: "Exact names, one per line. Empty blocks nothing.",
      },
      vi: {
        publishTitle: "Publish: host và cổng lắng nghe",
        publishHint: "Được lưu vào settings. Plugin này đồng bộ chúng vào patch layer của profile.",
        publishNote: "Có hiệu lực ở lần khởi động sau. Cờ --host hoặc --port vẫn được ưu tiên.",
        connectionTitle: "Browser transport: xác thực và tin cậy",
        connectionHint: "Áp dụng ngay, không cần khởi động lại.",
        connectionNote: "Trusted hosts chỉ mở rộng fence Host/Origin; bản thân nó không cấp quyền truy cập.",
        hostLabel: "Host lắng nghe",
        hostHint: "Để trống thì theo cờ khởi động và mặc định đã compose (127.0.0.1).",
        portLabel: "Cổng lắng nghe",
        portHint: "Để trống thì theo cờ khởi động và mặc định đã compose (3080).",
        cookieLabel: "Thời hạn cookie (ngày)",
        cookieHint: "Áp dụng cho cookie cấp mới; giảm xuống cũng loại bỏ cookie có thời hạn dài hơn.",
        bodyLabel: "Giới hạn body request (byte)",
        bodyHint: "Phải lớn hơn giới hạn ảnh gộp đã cấu hình.",
        trustedLabel: "Trusted hosts",
        trustedHint: "Mỗi dòng một authority trần: host, hoặc host:port. Tên miền IDN dùng punycode.",
        revokeLabel: "Đăng xuất mọi trình duyệt",
        revokeHint: "Thay khoá ký, nên mọi cookie hiện có mất hiệu lực.",
        revokeAction: "Đăng xuất tất cả",
        save: "Lưu",
        discard: "Bỏ thay đổi",
        clear: "Đặt lại",
        overridden: "đã ghi đè",
        unavailable: "Namespace này không ghi được từ trang hiện tại. Hãy mở UI trên máy Host, hoặc dùng phiên loopback đã xác thực.",
        readOnly: "Host không nhận ghi cho namespace này từ trang hiện tại.",
        invalid: "Kiểm tra lại: số phải là số nguyên không âm.",
        busy: "Đang lưu…",
        applied: "Đã lưu.",
        panelTitle: "Trạng thái publish",
        panelGuide: "Kiểm tra xem deployment này có phục vụ được API từ nơi bạn đang mở hay không.",
        panelHost: "Authority của trang này",
        panelLoopback: "Trang loopback",
        panelSettings: "Ghi settings",
        panelCookie: "Thời hạn cookie",
        panelTrusted: "Trusted hosts",
        panelStored: "Host và cổng đã lưu",
        panelPane: "Ngăn",
        panelTab: "Nội dung tab",
        panelRevision: "Số lần điều hướng",
        panelClose: "Đóng",
        panelNone: "(không có)",
        panelDays: "ngày",
        panelYes: "có",
        panelNo: "không",
        warnNotLoopback: "Trang này không ở loopback, nên Host giữ tuỳ chọn trong tiến trình: card settings không lưu được ở đây.",
        warnNoTrusted: "Chưa khai trusted host nào, nên chỉ request từ loopback qua được fence /api.",
        warnHostNotTrusted: "Host của trang này không có trong trustedHosts, nên fence /api sẽ từ chối.",
        okConfig: "Trang này đọc và lưu được settings.",
        modePermission: "Quyền",
        modeSandbox: "Sandbox",
        modeApproval: "Phê duyệt",
        guardTitle: "Chặn công cụ",
        guardHint: "Từ chối các công cụ này trước khi chúng chạy.",
        guardNote: "Việc từ chối được thực thi ở tầng policy pre-execute, nên cũng chặn cả công cụ gọi qua run_code.",
        guardFieldLabel: "Tên công cụ bị chặn",
        guardFieldHint: "Tên chính xác, mỗi dòng một tên. Để trống nghĩa là không chặn gì.",
      },
    };

    var STYLES = {
      card: { border: "0.5px solid var(--dsw-alias-border-l2, #d0d5dd)", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
      title: { fontWeight: 600, marginBottom: 4 },
      hint: { opacity: 0.75, marginBottom: 4, fontSize: "0.92em" },
      note: { opacity: 0.75, marginBottom: 10, fontSize: "0.92em" },
      field: { marginTop: 10 },
      label: { display: "block", marginBottom: 4, fontSize: "0.95em" },
      input: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: "0.5px solid var(--dsw-alias-border-l2, #d0d5dd)", background: "transparent", color: "inherit", font: "inherit" },
      textarea: { width: "100%", boxSizing: "border-box", minHeight: 68, padding: "6px 8px", borderRadius: 6, border: "0.5px solid var(--dsw-alias-border-l2, #d0d5dd)", background: "transparent", color: "inherit", font: "inherit" },
      fieldHint: { opacity: 0.7, fontSize: "0.88em", marginTop: 3 },
      row: { display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" },
      button: { padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--dsw-alias-border-l2, #d0d5dd)", background: "transparent", color: "inherit", cursor: "pointer", font: "inherit" },
      danger: { padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--dsw-alias-border-l2, #d0d5dd)", background: "transparent", color: "inherit", cursor: "pointer", font: "inherit" },
      badge: { opacity: 0.7, fontSize: "0.82em", marginLeft: 6 },
      error: { marginTop: 8, color: "var(--dsw-alias-text-danger, #b42318)" },
      message: { marginTop: 8, opacity: 0.8 },
      chip: { display: "inline-flex", gap: 6, alignItems: "baseline", margin: "4px 0", padding: "3px 8px", borderRadius: 999, border: "0.5px solid var(--dsw-alias-border-l2, #d0d5dd)", fontSize: "0.88em" },
      chipLabel: { opacity: 0.7 },
      chipValue: { fontWeight: 600 },
    };

    /** Copy a shallow map. */
    function copy(source) {
      var out = {};
      for (var key in source) if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
      return out;
    }

    /** Whole-number text, or undefined when the text is blank or not a whole number. */
    function parseWhole(text) {
      var trimmed = String(text === undefined ? "" : text).trim();
      if (trimmed === "") return undefined;
      if (!/^\d+$/.test(trimmed)) return undefined;
      return Number(trimmed);
    }

    /** One authority per line or comma, trimmed and de-blanked. */
    function parseList(text) {
      var parts = String(text === undefined ? "" : text).split(/[\n,]/);
      var out = [];
      for (var index = 0; index < parts.length; index++) {
        var value = parts[index].trim();
        if (value !== "") out.push(value);
      }
      return out;
    }

    /** The card table: one entry per settings namespace this plugin renders. */
    var CARDS = {
      "web-publish": {
        titleKey: "publishTitle",
        hintKey: "publishHint",
        noteKey: "publishNote",
        fields: [
          { name: "host", kind: "text", labelKey: "hostLabel", hintKey: "hostHint", parse: function (text) { return String(text).trim(); }, blank: function (value) { return value === ""; }, show: function (value) { return typeof value === "string" ? value : ""; } },
          { name: "port", kind: "number", labelKey: "portLabel", hintKey: "portHint", parse: parseWhole, blank: function (value) { return value === undefined || value === 0; }, show: function (value) { return typeof value === "number" && value !== 0 ? String(value) : ""; } },
        ],
      },
      connection: {
        titleKey: "connectionTitle",
        hintKey: "connectionHint",
        noteKey: "connectionNote",
        fields: [
          { name: "cookieMaxAgeDays", kind: "number", labelKey: "cookieLabel", hintKey: "cookieHint", parse: parseWhole, blank: function (value) { return value === undefined; }, show: function (value) { return typeof value === "number" ? String(value) : ""; } },
          { name: "maxRequestBodyBytes", kind: "number", labelKey: "bodyLabel", hintKey: "bodyHint", parse: parseWhole, blank: function (value) { return value === undefined; }, show: function (value) { return typeof value === "number" ? String(value) : ""; } },
          { name: "trustedHosts", kind: "list", labelKey: "trustedLabel", hintKey: "trustedHint", parse: parseList, blank: function (value) { return !Array.isArray(value) || value.length === 0; }, show: function (value) { return Array.isArray(value) ? value.join("\n") : ""; } },
        ],
      },
      "tool-guard": {
        titleKey: "guardTitle",
        hintKey: "guardHint",
        noteKey: "guardNote",
        fields: [
          { name: "deniedTools", kind: "list", labelKey: "guardFieldLabel", hintKey: "guardFieldHint", parse: parseList, blank: function (value) { return !Array.isArray(value) || value.length === 0; }, show: function (value) { return Array.isArray(value) ? value.join("\n") : ""; } },
        ],
      },
    };

    /** Render mirror: the apply world is its only writer. */
    function createCardStore() {
      return storeModule.defineStore({
        init: function () {
          return { status: "loading", writable: false, mode: "memory", busy: false, error: "", message: "", drafts: {}, overridden: {} };
        },
        actions: {
          publish: function (draft, next) {
            draft.status = next.status;
            draft.writable = next.writable;
            draft.mode = next.mode;
            draft.busy = next.busy;
            draft.error = next.error;
            draft.message = next.message;
            draft.drafts = next.drafts;
            draft.overridden = next.overridden;
          },
        },
      });
    }

    /** Build the card component for one table entry. */
    function createCardComponent(spec) {
      return function Card(props) {
        var state = props.useCard(function (snapshot) { return snapshot; });
        var t = typeof props.t === "function" ? props.t : function (key) { return key; };
        var disabled = !state.writable || state.busy;
        var children = [
          h("div", { key: "title", style: STYLES.title }, t(spec.titleKey)),
          h("div", { key: "hint", style: STYLES.hint }, t(spec.hintKey)),
          h("div", { key: "note", style: STYLES.note }, t(spec.noteKey)),
        ];
        if (state.status === "unavailable" || !state.writable) {
          children.push(h("div", { key: "unavailable", style: STYLES.fieldHint }, t("unavailable")));
        }
        for (var index = 0; index < spec.fields.length; index++) {
          var field = spec.fields[index];
          var value = state.drafts[field.name] === undefined ? "" : state.drafts[field.name];
          var input = field.kind === "list"
            ? h("textarea", {
              key: "input",
              id: "plugin-config-" + field.name,
              style: STYLES.textarea,
              value: value,
              disabled: disabled,
              onChange: function (event) { props.edit(field.name, event.target.value); },
            })
            : h("input", {
              key: "input",
              id: "plugin-config-" + field.name,
              style: STYLES.input,
              type: "text",
              inputMode: field.kind === "number" ? "numeric" : undefined,
              value: value,
              disabled: disabled,
              onChange: function (event) { props.edit(field.name, event.target.value); },
            });
          children.push(h("div", { key: "field-" + field.name, style: STYLES.field }, [
            h("label", { key: "label", style: STYLES.label, htmlFor: "plugin-config-" + field.name }, [
              t(field.labelKey),
              state.overridden[field.name] ? h("span", { key: "badge", style: STYLES.badge }, t("overridden")) : null,
            ]),
            input,
            h("div", { key: "hint", style: STYLES.fieldHint }, t(field.hintKey)),
            h("div", { key: "clear", style: STYLES.row }, h("button", {
              type: "button",
              style: STYLES.button,
              disabled: disabled,
              onClick: function () { props.clear(field.name); },
            }, t("clear"))),
          ]));
        }
        var actions = [
          h("button", { key: "save", type: "button", style: STYLES.button, disabled: disabled, onClick: function () { props.save(); } }, t("save")),
          h("button", { key: "discard", type: "button", style: STYLES.button, disabled: state.busy, onClick: function () { props.discard(); } }, t("discard")),
        ];
        if (typeof props.revoke === "function") {
          actions.push(h("button", { key: "revoke", type: "button", style: STYLES.danger, disabled: disabled, onClick: function () { props.revoke(); } }, t("revokeAction")));
        }
        children.push(h("div", { key: "actions", style: STYLES.row }, actions));
        if (typeof props.revoke === "function") {
          children.push(h("div", { key: "revokeHint", style: STYLES.fieldHint }, t("revokeHint")));
        }
        if (state.busy) children.push(h("div", { key: "busy", style: STYLES.message }, t("busy")));
        if (state.message !== "") children.push(h("div", { key: "message", style: STYLES.message }, state.message));
        if (state.error !== "") children.push(h("div", { key: "error", style: STYLES.error }, state.error));
        return h("div", { style: STYLES.card }, children);
      };
    }

    /** Mount one card: its scope mirror, its write actions, and its slot entry. */
    function registerCard(ctx, namespace, t) {
      var spec = CARDS[namespace];
      var handle = createCardStore();
      // `defineStore` returns a handle; `create()` yields the live instance the
      // `hooks` compartment observes and the apply world writes through.
      var instance = handle.create();
      var scope = ctx.settingsScope.bind({ namespace: namespace });
      var drafts = {};
      var committed = {};
      var overridden = {};
      var status = "loading";
      var writable = false;
      var mode = "memory";
      var busy = false;
      var error = "";
      var message = "";

      function publish() {
        instance.actions.publish({
          status: status,
          writable: writable,
          mode: mode,
          busy: busy,
          error: error,
          message: message,
          drafts: copy(drafts),
          overridden: copy(overridden),
        });
      }

      function readTexts(value) {
        var out = {};
        for (var index = 0; index < spec.fields.length; index++) {
          var field = spec.fields[index];
          out[field.name] = field.show(value === undefined ? undefined : value[field.name]);
        }
        return out;
      }

      function readOverrides(user) {
        var out = {};
        var source = user !== null && typeof user === "object" ? user : {};
        for (var index = 0; index < spec.fields.length; index++) {
          var field = spec.fields[index];
          out[field.name] = Object.prototype.hasOwnProperty.call(source, field.name);
        }
        return out;
      }

      function sync() {
        var snapshot = scope.getSnapshot();
        status = snapshot.status;
        writable = snapshot.writable;
        mode = snapshot.mode;
        committed = readTexts(snapshot.value);
        overridden = readOverrides(snapshot.user);
        drafts = copy(committed);
        publish();
      }

      function fail(cause) {
        busy = false;
        message = "";
        error = cause !== null && typeof cause === "object" && typeof cause.message === "string" ? cause.message : String(cause);
        publish();
      }

      function write(op) {
        if (op.value === undefined) return scope.unset(op.field);
        return scope.set(op.field, op.value);
      }

      function commit() {
        if (!writable) { error = t("readOnly"); publish(); return; }
        var pending = [];
        for (var index = 0; index < spec.fields.length; index++) {
          var field = spec.fields[index];
          var text = drafts[field.name] === undefined ? "" : drafts[field.name];
          if (text === committed[field.name]) continue;
          if (String(text).trim() === "") { pending.push({ field: field.name, value: undefined }); continue; }
          var parsed = field.parse(text);
          if (parsed === undefined) { error = t("invalid"); publish(); return; }
          pending.push({ field: field.name, value: parsed });
        }
        error = "";
        message = "";
        busy = true;
        publish();
        var chain = Promise.resolve();
        for (var step = 0; step < pending.length; step++) {
          chain = chain.then(function (op) { return function () { return write(op); }; }(pending[step]));
        }
        chain.then(function () { busy = false; message = t("applied"); sync(); }, fail);
      }

      function clearField(field) {
        if (!writable) { error = t("readOnly"); publish(); return; }
        busy = true;
        error = "";
        publish();
        scope.unset(field).then(function () { busy = false; sync(); }, fail);
      }

      function revoke() {
        if (!writable) { error = t("readOnly"); publish(); return; }
        busy = true;
        error = "";
        publish();
        scope.set("revokeBrowserSessions", true).then(function () { busy = false; sync(); }, fail);
      }

      ctx.effect(function () {
        sync();
        return scope.subscribe(sync);
      }, "web-settings: " + namespace + " mirror");

      var face = {
        hooks: { card: instance },
        edit: function (field, text) {
          drafts = copy(drafts);
          drafts[field] = text;
          error = "";
          message = "";
          publish();
        },
        discard: function () {
          drafts = copy(committed);
          error = "";
          message = "";
          publish();
        },
        save: commit,
        clear: clearField,
      };
      if (namespace === "connection") face.revoke = revoke;

      ctx.slots.inject("settings.plugin.item", function () {
        return ctx.slots.register({
          name: "settings.plugin.item",
          key: namespace,
          locale: NS,
          inject: function () { return face; },
        }, createCardComponent(spec));
      });
    }

    /** Right-Sidebar page type this package contributes. */
    var PANEL = {
      id: "dsh-web-settings/publish-status",
      kind: "dshPublishStatus",
    };

    /** Render mirror for the status panel. */
    function createPanelStore() {
      return storeModule.defineStore({
        init: function () {
          return {
            loaded: false,
            mode: "memory",
            writable: false,
            cookieMaxAgeDays: 0,
            trustedHosts: [],
            storedHost: "",
            storedPort: 0,
            hostname: "",
            authority: "",
          };
        },
        actions: {
          publish: function (draft, next) {
            draft.loaded = next.loaded;
            draft.mode = next.mode;
            draft.writable = next.writable;
            draft.cookieMaxAgeDays = next.cookieMaxAgeDays;
            draft.trustedHosts = next.trustedHosts;
            draft.storedHost = next.storedHost;
            draft.storedPort = next.storedPort;
            draft.hostname = next.hostname;
            draft.authority = next.authority;
          },
        },
      });
    }

    /** One label-over-value row. */
    function row(key, label, value) {
      return h("div", { key: key, style: STYLES.field }, [
        h("div", { key: "label", style: STYLES.fieldHint }, label),
        h("div", { key: "value" }, value),
      ]);
    }

    /**
     * The status panel body. It reads the two served namespaces and judges the
     * page it is rendered in, so a wrong deployment is visible instead of silent:
     * a non-loopback page whose host is missing from `trustedHosts` is exactly
     * the configuration whose API calls the fence refuses.
     */
    function createPanelComponent() {
      return function PublishStatus(props) {
        var info = props.useTabInfo();
        var state = props.usePanel(function (snapshot) { return snapshot; });
        var t = typeof props.t === "function" ? props.t : function (key) { return key; };
        var trusted = state.trustedHosts;
        var loopback = /^(127\.|localhost$|\[::1\]$|::1$)/.test(state.hostname);
        var trustedHere = trusted.indexOf(state.authority) >= 0 || trusted.indexOf(state.hostname) >= 0;
        var warnings = [];
        if (state.loaded && !loopback && !trustedHere) {
          warnings.push(trusted.length === 0 ? t("warnNoTrusted") : t("warnHostNotTrusted"));
        }
        if (state.loaded && !state.writable) warnings.push(t("warnNotLoopback"));
        var children = [
          h("div", { key: "title", style: STYLES.title }, t("panelTitle")),
          h("div", { key: "guide", style: STYLES.hint }, t("panelGuide")),
          row("host", t("panelHost"), state.authority),
          row("loopback", t("panelLoopback"), loopback ? t("panelYes") : t("panelNo")),
          row("mode", t("panelSettings"), state.writable ? state.mode : state.mode + " / " + t("panelNo")),
          row("cookie", t("panelCookie"), state.cookieMaxAgeDays === 0 ? t("panelNone") : state.cookieMaxAgeDays + " " + t("panelDays")),
          row("trusted", t("panelTrusted"), trusted.length === 0 ? t("panelNone") : trusted.join(", ")),
          row("stored", t("panelStored"), (state.storedHost === "" ? t("panelNone") : state.storedHost) + " : " + (state.storedPort === 0 ? t("panelNone") : String(state.storedPort))),
          row("pane", t("panelPane"), String(info.panel.id)),
          row("tab", t("panelTab"), info.tab.contentId),
          row("revision", t("panelRevision"), String(info.tab.navigation.revision)),
        ];
        for (var index = 0; index < warnings.length; index++) {
          children.push(h("div", { key: "warn-" + index, style: STYLES.error }, warnings[index]));
        }
        if (warnings.length === 0 && state.loaded) {
          children.push(h("div", { key: "ok", style: STYLES.message }, t("okConfig")));
        }
        children.push(h("div", { key: "actions", style: STYLES.row }, h("button", {
          type: "button",
          style: STYLES.button,
          onClick: function () { info.tab.actions.close(); },
        }, t("panelClose"))));
        return h("div", { style: STYLES.card }, children);
      };
    }

    /** Register the page type, its guide entry, and its body. */
    function registerPanel(ctx, t) {
      var handle = createPanelStore();
      var instance = handle.create();
      var connectionScope = ctx.settingsScope.bind({ namespace: "connection" });
      var publishScope = ctx.settingsScope.bind({ namespace: "web-publish" });

      function publish() {
        var connection = connectionScope.getSnapshot();
        var publishState = publishScope.getSnapshot();
        var connectionValue = connection.value === undefined ? {} : connection.value;
        var publishValue = publishState.value === undefined ? {} : publishState.value;
        instance.actions.publish({
          loaded: connection.status === "ready" || publishState.status === "ready",
          mode: connection.mode,
          writable: connection.writable,
          cookieMaxAgeDays: typeof connectionValue.cookieMaxAgeDays === "number" ? connectionValue.cookieMaxAgeDays : 0,
          trustedHosts: Array.isArray(connectionValue.trustedHosts) ? connectionValue.trustedHosts : [],
          storedHost: typeof publishValue.host === "string" ? publishValue.host : "",
          storedPort: typeof publishValue.port === "number" ? publishValue.port : 0,
          hostname: window.location.hostname,
          authority: window.location.host,
        });
      }

      ctx.effect(function () {
        publish();
        var offConnection = connectionScope.subscribe(publish);
        var offPublish = publishScope.subscribe(publish);
        return function () { offConnection(); offPublish(); };
      }, "web-settings: status mirror");

      ctx.effect(function () {
        return ctx.sidebarRightTabs.register({
          id: PANEL.id,
          kind: PANEL.kind,
          title: function () { return t("panelTitle"); },
          guide: [{
            order: 60,
            title: function () { return t("panelTitle"); },
            description: function () { return t("panelGuide"); },
          }],
        });
      }, "web-settings: publish status tab type");

      ctx.effect(function () {
        return ctx.slots.inject("sidebar.right.pane.tab", function () {
          return ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: PANEL.id,
            locale: NS,
            inject: function () { return { hooks: { panel: instance } }; },
          }, createPanelComponent());
        });
      }, "web-settings: publish status body");
    }

    /** Chat node kind contributed by this package. */
    var MODE_NODE_KIND = "session-mode";

    /**
     * Read one session-mode change out of a durable event.
     *
     * These three family events are the session's permission knobs. No shipped
     * Definition matches them, so today a change is invisible in the transcript.
     * @param event - one history event.
     * @returns the label key and verbatim value, or null when unrelated.
     */
    function modeChange(event) {
      if (event === null || typeof event !== "object") return null;
      var data = event.data === null || event.data === undefined ? {} : event.data;
      if (event.type === "permission/preset") return { labelKey: "modePermission", value: String(data.preset) };
      if (event.type === "sandbox/mode") return { labelKey: "modeSandbox", value: String(data.mode) };
      if (event.type === "approval/policy") return { labelKey: "modeApproval", value: String(data.policy) };
      return null;
    }

    /**
     * One chip per change. Each event starts its own Context, keyed by the event
     * sequence, so a change renders where it happened instead of collapsing into
     * a single node at the session head.
     * @returns the Chat business Definition.
     */
    function sessionModeDefinition() {
      return {
        kind: MODE_NODE_KIND,
        target: "chat",
        match: function (event) {
          if (modeChange(event) === null) return null;
          return { id: MODE_NODE_KIND + ":" + String(event.seq), role: "start" };
        },
        start: function (_context, match) {
          var change = modeChange(match.event);
          if (change === null) throw new Error("session-mode start requires a permission-knob event");
          return { seq: match.event.seq, time: match.event.time, labelKey: change.labelKey, value: change.value };
        },
        update: function (context) { return context.state; },
        buildViewNode: function (context) {
          var state = context.state;
          if (state === undefined) return null;
          var location = context.start !== undefined && context.start.location !== undefined
            ? context.start.location
            : (context.matches.length > 0 && context.matches[0].location !== undefined ? context.matches[0].location : { kind: "unresolved" });
          return {
            key: context.key,
            kind: MODE_NODE_KIND,
            id: context.id,
            target: "chat",
            anchorSeq: state.seq,
            location: location,
            visibility: "visible",
            data: state,
          };
        },
      };
    }

    /** The chip renderer: a knob label and its verbatim value. */
    function createModeChipComponent() {
      return function SessionModeChip(props) {
        var node = props.node === undefined || props.node === null ? {} : props.node;
        var data = node.data === undefined || node.data === null ? {} : node.data;
        var labels = props.labels === undefined || props.labels === null ? {} : props.labels;
        var label = labels[data.labelKey] === undefined ? String(data.labelKey) : labels[data.labelKey];
        return h("div", { style: STYLES.chip }, [
          h("span", { key: "label", style: STYLES.chipLabel }, label),
          h("span", { key: "value", style: STYLES.chipValue }, data.value === undefined ? "" : String(data.value)),
        ]);
      };
    }

    /** Register the session-mode Definition and its keyed renderer. */
    function registerSessionModeNode(ctx, t) {
      var labels = {
        modePermission: t("modePermission"),
        modeSandbox: t("modeSandbox"),
        modeApproval: t("modeApproval"),
      };
      ctx.effect(function () {
        return ctx.uiConversation.events.register(sessionModeDefinition());
      }, "web-settings: session mode definition");
      ctx.effect(function () {
        return ctx.slots.inject("conversation.chat.node", function () {
          return ctx.slots.register({
            name: "conversation.chat.node",
            key: MODE_NODE_KIND,
            inject: function () { return { labels: labels }; },
          }, createModeChipComponent());
        });
      }, "web-settings: session mode renderer");
    }

    /** Services this browser half needs. */
    var inject = exports.inject = ["slots", "locale", "settingsScope", "sidebarRightTabs", "uiConversation"];

    /**
     * Register the card copy and one card per namespace.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(function () {
        var disposers = [
          ctx.locale.register(NS, "en", COPY.en),
          ctx.locale.register(NS, "vi", COPY.vi),
        ];
        return function () { for (var index = 0; index < disposers.length; index++) disposers[index](); };
      }, "web-settings: card copy");
      var t = ctx.locale.bind(NS);
      registerCard(ctx, "web-publish", t);
      registerCard(ctx, "connection", t);
      registerCard(ctx, "tool-guard", t);
      registerPanel(ctx, t);
      registerSessionModeNode(ctx, t);
    }

    exports.apply = apply;
    return module.exports;
  }
});
