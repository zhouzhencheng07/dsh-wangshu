interface KitCtx {
    inject(deps: string[], cb: (svc: any) => void): void;
    effect(fn: () => void | (() => void), label?: string): void;
}
export declare const name = "dsh-wangshu/chat";
export declare function apply(ctx: KitCtx): Promise<void>;
export {};
