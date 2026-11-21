// dsh-wangshu/chat 组件（宿主半边入口）——右栏「会话」签
//
// 能力本体在 client/bundle.js 的 chatModule（签类型与 pane body、形态条那一枚、
// 快捷键）。本模块只做一件事：暴露行可达性探针。
//   GET /dsh-wangshu-chat/config —— 200 = 行启用（client 门控与可达性探针：404 = 行关闭）
// 行开关（插件页组件行 switch）= 总开关：行禁用 → 本模块不物化 → 端点 404 → client
// 半边整体不注册（签类型、形态钮、快捷键都不出现）。
//
// 签里渲染的是宿主官方对话本体（当前这条会话），本组件不碰会话、工作区与历史。
import http from 'node:http';
import { sameOrigin } from "../core/index.js";
export const name = 'dsh-wangshu/chat';
export async function apply(ctx) {
    ctx.inject(['webServer'], (webCtx) => {
        // 路由必须随 fiber 注销（宿主 register 对重复 path 直接抛错）：行关闭再开会
        // 因残留路由重复注册失败，行关闭期间探针也仍 200、client 门控失效
        webCtx.effect(() => webCtx.webServer.register({
            kind: 'exact',
            path: '/dsh-wangshu-chat/config',
            handler: (req, res) => {
                const json = (code, obj) => {
                    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify(obj));
                };
                if (req.method !== 'GET') {
                    json(405, { error: 'method not allowed' });
                    return;
                }
                if (!sameOrigin(req)) {
                    json(403, { error: 'cross-origin denied' });
                    return;
                }
                json(200, {});
            },
        }), 'dsh-wangshu/chat: config endpoint');
    });
}
