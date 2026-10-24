import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCompactionThinking } from "../src/index.ts";
import { lowerThan, readSettings } from "../src/settings.ts";

type Handler = (event: any, ctx: any) => Promise<any> | any;

const RESULT = {
	summary: "要約",
	firstKeptEntryId: "e1",
	tokensBefore: 1000,
	details: { readFiles: [], modifiedFiles: [] },
};

function load(settings?: unknown, compactFn: (...args: any[]) => Promise<any> = async () => RESULT) {
	const handlers = new Map<string, Handler>();
	const calls: any[][] = [];
	const api = {
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		...(settings === undefined ? {} : { getSettings: () => settings }),
	} as unknown as ExtensionAPI;
	createCompactionThinking(async (...args: any[]) => {
		calls.push(args);
		return compactFn(...args);
	})(api);
	return { handler: handlers.get("session_before_compact")!, calls };
}

function ctx(overrides: Record<string, unknown> = {}) {
	const notes: string[] = [];
	return {
		notes,
		model: { provider: "spark", id: "M", reasoning: true },
		thinkingLevel: "max",
		modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k", headers: { h: "1", gone: null } }) },
		ui: { notify: (m: string) => notes.push(m) },
		...overrides,
	};
}

const EVENT = {
	preparation: { firstKeptEntryId: "e1" },
	customInstructions: undefined,
	signal: new AbortController().signal,
};

describe("session_before_compact", () => {
	test("セッションの思考が強いとき、既定の要約を low で流してその結果を返す", async () => {
		const { handler, calls } = load();
		expect(await handler(EVENT, ctx())).toEqual({ compaction: RESULT });
		expect(calls[0]?.[6]).toBe("low");
		expect(calls[0]?.[2]).toBe("k");
		expect(calls[0]?.[3]).toEqual({ h: "1" });
		expect(typeof calls[0]?.[7]).toBe("function");
	});

	test("セッションの思考が既に低いとき、思考の無いモデルのときは何もしない", async () => {
		const { handler, calls } = load();
		expect(await handler(EVENT, ctx({ thinkingLevel: "low" }))).toBeUndefined();
		expect(await handler(EVENT, ctx({ model: { provider: "spark", reasoning: false } }))).toBeUndefined();
		expect(calls.length).toBe(0);
	});

	test("providers を指定すると、それ以外のプロバイダでは何もしない", async () => {
		const { handler, calls } = load({ compactionThinking: { providers: ["spark"] } });
		expect(await handler(EVENT, ctx({ model: { provider: "openai", reasoning: true } }))).toBeUndefined();
		expect(await handler(EVENT, ctx())).toEqual({ compaction: RESULT });
		expect(calls.length).toBe(1);
	});

	test("失敗や空の要約では既定の要約に任せる", async () => {
		const failing = load(undefined, async () => {
			throw new Error("boom");
		});
		const c = ctx();
		expect(await failing.handler(EVENT, c)).toBeUndefined();
		expect(c.notes[0]).toContain("boom");
		const empty = load(undefined, async () => ({ ...RESULT, summary: "  " }));
		expect(await empty.handler(EVENT, ctx())).toBeUndefined();
		const noAuth = load();
		expect(
			await noAuth.handler(
				EVENT,
				ctx({ modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: false, error: "x" }) } }),
			),
		).toBeUndefined();
		expect(noAuth.calls.length).toBe(0);
	});
});

describe("設定", () => {
	test("既定は low・全プロバイダで、不正な値は既定に戻す", () => {
		expect(readSettings(undefined)).toEqual({ level: "low", providers: [] });
		expect(readSettings({ compactionThinking: { level: "huge", providers: "spark" } })).toEqual({
			level: "low",
			providers: [],
		});
		expect(readSettings({ compactionThinking: { level: "off", providers: ["spark", 1] } })).toEqual({
			level: "off",
			providers: ["spark"],
		});
	});

	test("下げるのはセッションの方が強いときだけ", () => {
		expect(lowerThan("max", "low")).toBe(true);
		expect(lowerThan("low", "low")).toBe(false);
		expect(lowerThan(undefined, "low")).toBe(false);
	});
});
