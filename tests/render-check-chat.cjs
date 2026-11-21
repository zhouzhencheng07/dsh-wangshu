// dsh-wangshu/chat 浏览器半边渲染级检查：加载真实 root client bundle（kitBase 随 factory
// 执行）后直测组件导出面、配置页渲染、apply 装配、浮层各分支渲染与目标解析纯函数。
// 组件 = 单包内模块（root client 的 exports.chat），无独立 bundle。
// 用法（dsh-wangshu 根）：node tests\render-check-chat.cjs
const fs = require("node:fs");

let failed = 0;
const check = (label, ok) => { console.log((ok ? "PASS  " : "FAIL  ") + label); if (!ok) failed++; };

// 浏览器全局最小桩
if (!global.localStorage) {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(String(k), String(v)), removeItem: (k) => store.delete(k) };
}
if (!global.document) {
  global.document = {
    visibilityState: "visible",
    documentElement: { lang: "zh" },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ className: "", textContent: "", dataset: {}, setAttribute: () => {}, removeAttribute: () => {}, remove: () => {}, style: {}, firstElementChild: null, replaceWith: () => {} }),
    head: { appendChild: () => {} },
    body: { classList: { add() {}, remove() {} }, appendChild: () => {}, hasAttribute: () => false },
  };
}
if (!global.window) global.window = { innerWidth: 1600, innerHeight: 900, requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: () => {}, isSecureContext: false, addEventListener: () => {}, removeEventListener: () => {} };
if (!global.location) global.location = { protocol: "http:", host: "127.0.0.1:3081" };
if (!global.MutationObserver) global.MutationObserver = class { observe() {} };
if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} disconnect() {} };

const loadBundle = (path, requireMap) => {
  const src = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("factory: (require) => {");
  if (start < 0) throw new Error("no factory: " + path);
  const tail = src.lastIndexOf("  },\n});");
  const body = src.slice(start + "factory: (require) => {".length, tail);
  return new Function("require", body)(requireMap);
};

let callLog = [];
const swapCalls = [];
const stateStore = new Map();
let stateSeq = 0;
const reactStub = {
  useState: (init) => {
    const id = stateSeq++;
    if (!stateStore.has(id)) stateStore.set(id, typeof init === "function" ? init() : init);
    const set = (v) => stateStore.set(id, typeof v === "function" ? v(stateStore.get(id)) : v);
    return [stateStore.get(id), set];
  },
  useEffect: () => undefined,
  useLayoutEffect: () => undefined,
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
  useMemo: (fn) => fn(),
  useSyncExternalStore: (subscribe, getSnapshot) => { subscribe(() => {}); return getSnapshot(); },
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  // memo 只影响重渲染取舍，桩直接透传组件本体
  memo: (component) => component,
  Fragment: function Fragment() {},
};
const jsxRuntimeStub = {
  Fragment: function Fragment() {},
  jsx: (type, props) => { callLog.push(["jsx", type, props]); return { type, props, $$dshk: "jsx" }; },
  jsxs: (type, props) => { callLog.push(["jsxs", type, props]); return { type, props, $$dshk: "jsxs" }; },
};
const jsxPrim = (tag) => (props) => jsxRuntimeStub.jsxs(tag, props);
const primStub = {
  SettingsForm: jsxPrim("dsw-settings-form"),
  SettingsValueField: jsxPrim("dsw-settings-field"),
  Switch: jsxPrim("dsw-switch"),
  SegmentedTabs: jsxPrim("dsw-segmented-tabs"),
  Tag: jsxPrim("dsw-tag"),
  Tooltip: jsxPrim("dsw-tooltip"),
};
const requireMap = (name) => {
  if (name === "react") return reactStub;
  if (name === "react/jsx-runtime") return jsxRuntimeStub;
  if (name === "react-dom") return { createPortal: (children, container) => ({ type: "portal", props: { children, container }, $$dshk: "portal" }) };
  if (name === "@deepseek-ai/dsh-client-ui-primitives") return primStub;
  throw new Error("unexpected dock require: " + name);
};

const dockExports = loadBundle(__dirname + "/../client/bundle.js", requireMap);
const comps = dockExports.chat;

// ─── 1) 导出面 ──────────────────────────────────────────────────────────────
check("chat 导出 apply（client 插件形状）与 inject 声明 slots", typeof comps.apply === "function" && Array.isArray(comps.inject) && comps.inject[0] === "slots");
check(
  "导出面：签正文 + 输入框那一枚 + 快捷键 / 开关 / 探针",
  typeof comps.ChatPaneBody === "function" && typeof comps.ChatComposerButton === "function" &&
    typeof comps.registerShortcuts === "function" && typeof comps.toggleChat === "function" &&
    typeof comps.loadCfg === "function" && typeof comps.getCSnap === "function",
);
check(
  "小窗那一套整体退场（浮窗 / 把手 / 面板 / 配置页 / 目标解析都不再导出）",
  ["ChatBall", "ChatPanel", "ChatSurface", "ChatSessionBody", "ChatConfigPage", "CHAT_CFG_FIELDS", "CHAT_CFG_DEFAULTS", "rectOf", "setChat", "getChatSnap", "resolveSessionId"]
    .every((k) => comps[k] === undefined),
);

// ─── 2) 签正文：官方 conversation.content 的 embedded 变体 ──────────────────
{
  const noFactory = comps.ChatPaneBody({ useSession: (sel) => sel(null) });
  check("没有 renderFactorySlot（宿主太旧）：出提示条而不是抛", !!noFactory && noFactory.props.className === "dshk-chat-note");

  const render = (session) => {
    callLog = [];
    const out = comps.ChatPaneBody({
      useSession: (sel) => sel(session),
      renderFactorySlot: (name, params, opts) => { callLog.push(["factory", name, params, opts]); return { $$dshk: "factory" }; },
    });
    return { out, call: callLog.find((c) => c[0] === "factory") };
  };
  const active = render({ id: "s1", blank: false, running: true });
  check("签正文渲染官方对话本体（conversation.content / embedded）", !!active.call && active.call[1] === "conversation.content" && active.call[2].variant === "embedded");
  check("非空会话走 active 相位", active.call[2].phase === "active" && active.call[2].hero === false);
  const hero = render({ id: "s2", blank: true, running: false });
  check("空会话走 hero 相位（与主面新会话页同形）", hero.call[2].phase === "hero" && hero.call[2].hero === true);
  const running = render({ id: "s3", blank: true, running: true });
  check("空白但已在跑：不按 hero 处理", running.call[2].hero === false);
  check("只给 chat 一个 view（与主面同一套视图槽）+ 兜底提示", typeof active.call[3].slots.views === "function" && !!active.call[3].fallback);
}

// ─── 3) 输入框左边那一枚「会话」 ────────────────────────────────────────────
check("开关不在左栏形态条上（形态钮导出与登记都退场）", comps.ChatEntry === undefined);
{
  stateSeq = 0; stateStore.clear(); callLog = [];
  const out = comps.ChatComposerButton();
  const btn = callLog.find((c) => c[1] === "button");
  check("输入框那一枚渲染出按钮（会话图标 + 无障碍名 + 未按下态）", !!out && !!btn && btn[2]["aria-label"] === "会话" && btn[2]["aria-pressed"] === "false");
  check("点它不抢焦点 + 点击 = 开关（由 toggleChat 承担）", typeof btn[2].onMouseDown === "function" && typeof btn[2].onClick === "function" && typeof comps.toggleChat === "function");
  const src = fs.readFileSync(__dirname + "/../client/bundle.js", "utf8");
  check("样式类自带 + 不再往签条注入（没有 data-dockkit-strip-chrome）", src.includes("dshk-chat-inputbtn") && !src.includes("data-dockkit-strip-chrome"));
}

// ─── 4) 快捷键 + apply 装配 ────────────────────────────────────────────────
async function checkApply() {
  const setProbe = (ok) => {
    global.fetch = async () => (ok
      ? { ok: true, status: 200, json: async () => ({}) }
      : { ok: false, status: 404, json: async () => ({ error: "HTTP 404" }) });
  };

  // 4a) 快捷键：一条命令，默认键 primary+alt+分号
  const shortcutCmds = [];
  const effects = [];
  comps.registerShortcuts({
    shortcuts: { catalog: { subscribe: () => () => {} }, register: (cmd) => { shortcutCmds.push(cmd); return () => {}; } },
    effect: (fn) => { effects.push(fn); return () => {}; },
  });
  effects.forEach((fn) => fn());
  const cmd = shortcutCmds.find((c) => c.id === "dsh-wangshu.chat.toggle");
  const keys = cmd ? Object.values(cmd.defaults).map((d) => d.code + "+" + d.modifiers.join("+")).join(" ") : "";
  check(
    "快捷键：开合会话签一条（默认 primary+alt+分号，避开系统保留键）",
    !!cmd && typeof cmd.label === "function" && keys.split(" ").every((k) => k === "Semicolon+primary+alt") && !("web:linux" in cmd.defaults),
  );
  check("快捷键在输入框与终端里也生效", cmd.regions.includes("page") && cmd.regions.includes("editable") && cmd.regions.includes("terminal"));
  setProbe(false);
  await comps.loadCfg();
  check("快捷键：行关闭（探针 404）时 blocked", cmd.resolve().status === "blocked" && typeof cmd.resolve().reason === "string");
  setProbe(true);
  await comps.loadCfg();
  check("快捷键：行可用时 handled", cmd.resolve().status === "handled");

  // 4b) apply 装配：签类型 + pane body + 形态钮 + tabKinds；行关闭时一个都不注册
  const run = async (available) => {
    setProbe(available);
    delete dockExports.tabKinds.chat;
    const before = dockExports.sideForms.length;
    const regs = [];
    const calls = [];
    const ctx = {
      inject(deps, cb) {
        calls.push(["inject", deps.join(",")]);
        if (deps.includes("sidebarRightTabs")) {
          cb({
            sidebarRightTabs: { register: (o) => { regs.push(["tab", o]); return () => {}; } },
            slots: { inject: (n, f) => f(), register: (o) => { regs.push(["body", o]); return () => {}; } },
            effect: (f) => { f(); },
          });
        }
        if (deps.includes("shortcuts")) cb({ shortcuts: { catalog: { subscribe: () => () => {} }, register: () => () => {} }, effect: (f) => { f(); } });
      },
      effect(fn) { fn(); },
      slots: {
        inject: (n, f) => { calls.push(["slots.inject", n]); f(); },
        register: (o) => { regs.push(["slot", o]); return () => {}; },
      },
    };
    await comps.apply(ctx);
    return { regs, calls, forms: dockExports.sideForms.slice(before) };
  };

  const off = await run(false);
  check("行关闭（探针 404）：签类型、形态钮、tabKinds 一个都不注册", off.regs.length === 0 && off.forms.length === 0 && dockExports.tabKinds.chat === undefined);

  const on = await run(true);
  const tab = on.regs.find((r) => r[0] === "tab");
  check("签类型注册成 dshk-chat（标题「会话」）", !!tab && tab[1].kind === "dshk-chat" && tab[1].title() === "会话");
  const body = on.regs.find((r) => r[0] === "body");
  check("pane body 落在官方 sidebar.right.pane.tab 槽上（key 与签 id 同源）", !!body && body[1].name === "sidebar.right.pane.tab" && body[1].key === "dsh-wangshu-chat");
  check("tabKinds 补登（openRightbarTab 按 feature 查 kind）", dockExports.tabKinds.chat?.kind === "dshk-chat");
  check("不往左栏形态条登记任何东西（开关在输入框那一行）", on.forms.length === 0);
  const slot = on.regs.find((r) => r[0] === "slot");
  check("开关挂在官方 conversation.input.left（每处输入框都带）", !!slot && slot[1].name === "conversation.input.left" && slot[1].id === "dsh-wangshu-chat-toggle");
  check("apply 期 inject 官方 shortcuts", on.calls.some((c) => c[0] === "inject" && c[1] === "shortcuts"));

  // ─── 5) 源哨兵：小窗退场、签形态就位 ────────────────────────────────────
  const read = (rel) => fs.readFileSync(__dirname + "/../" + rel, "utf8");
  const bundleSrc = read("client/bundle.js");
  const compSrc = read("src/chat/index.ts");
  const patchSrc = read("cordis.patch.yml");
  const pkg = JSON.parse(read("package.json"));
  check("组件行声明 + exports 子路径 + locale 齐备", patchSrc.includes("name: dsh-wangshu/chat") && !!pkg.exports["./chat"] && !!pkg.exports["./chat/locale/*.json"]);
  check("组件行卡片文案改成「会话」", read("locale/chat/zh.json").includes("会话") && !read("locale/chat/zh.json").includes("小窗"));
  check("chatModule 装进 bundle 且进组件激活循环", bundleSrc.includes("const chatModule = (kit, require) => {") && bundleSrc.includes("exports.chat = chatModule(exports, require);"));
  check(
    "小窗的浮窗外壳 / 把手 / 矩形记忆 / 配置项全退场",
    !/dshk-chat-ball|dshk-chat-panel|dshk-chat-grip|rememberWindow|rememberTarget|MEM_KEY/.test(bundleSrc),
  );
  check(
    "引用落点不再分面（没有 chatSurface / composerFocus / lastComposerFace）",
    !/chatSurface|composerFocus|lastComposerFace/.test(bundleSrc),
  );
  check(
    "宿主半边只剩可达性探针（没有 Config 字段表）",
    compSrc.includes("/dsh-wangshu-chat/config") && !compSrc.includes("rememberWindow") && !/z\.object/.test(compSrc),
  );
  check("签里渲染官方对话本体（bundle 里有 conversation.content + embedded）", bundleSrc.includes('renderFactorySlot(\n        "conversation.content"') || bundleSrc.includes('"conversation.content"'));
  check(
    "主面与签两处输入框同时挂着时，同一芯片只显示一份（重复的装饰器节点隐藏）",
    bundleSrc.includes("[data-composer-chip] > * ~ *,[data-composer-quote] > * ~ *{display:none!important}"),
  );
  check(
    "签卸载把编辑根交还主面输入框（handoffComposerRoot + 签侧标记）",
    bundleSrc.includes("function handoffComposerRoot(") &&
      bundleSrc.includes("handoffComposerRoot(paneSessionId)") &&
      bundleSrc.includes('"data-dshk-chat-pane"'),
  );
}
checkApply().then(() => {
  console.log(failed === 0 ? "\nALL PASS" : "\nFAILED " + failed);
  process.exit(failed === 0 ? 0 : 1);
});
