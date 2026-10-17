import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import toolCallTextGuard, { CUSTOM_TYPE, MAX_REMINDERS, REMINDER_TEXT } from "../src/index.ts";

type Handler = (event: any) => any;

function load() {
	const handlers = new Map<string, Handler>();
	toolCallTextGuard({ on: (name: string, h: Handler) => handlers.set(name, h) } as unknown as ExtensionAPI);
	return handlers;
}

const BROKEN = "ls -la\n</arg_value>\n</tool_call>";

function assistant(content: unknown[]) {
	return { role: "assistant", content };
}

function settleEvent(messages: unknown[], overrides: Record<string, unknown> = {}) {
	return {
		type: "agent_before_settle",
		entries: [],
		continue: false,
		outcome: "completed",
		context: { canContinue: true, llmMessages: [{ role: "user", content: "やって" }, ...messages] },
		...overrides,
	};
}

const broken = () => settleEvent([assistant([{ type: "text", text: BROKEN }])]);

describe("tool-call-text-guard", () => {
	test("崩れた本文で toolCall が0件なら差し戻す", () => {
		const settle = load().get("agent_before_settle")!;
		const result = settle(broken());
		expect(result.continue).toBe(true);
		expect(result.entries[0].customType).toBe(CUSTOM_TYPE);
		expect(result.entries[0].content).toBe(`[tool-call-text] ${REMINDER_TEXT}`);
	});

	test("目印はどれでも拾う", () => {
		const settle = load().get("agent_before_settle")!;
		for (const text of ["<tool_call>bash", "x</tool_call>", "x</arg_value>", "<arg_key>command"]) {
			const handlers = load();
			expect(handlers.get("agent_before_settle")!(settleEvent([assistant([{ type: "text", text }])])).continue).toBe(
				true,
			);
		}
		expect(settle).toBeDefined();
	});

	test("toolCall があれば差し戻さない", () => {
		const settle = load().get("agent_before_settle")!;
		const content = [
			{ type: "text", text: BROKEN },
			{ type: "toolCall", id: "1", name: "bash", arguments: {} },
		];
		expect(settle(settleEvent([assistant(content)]))).toBeUndefined();
	});

	test("普通の本文は通す", () => {
		const settle = load().get("agent_before_settle")!;
		expect(settle(settleEvent([assistant([{ type: "text", text: "終わりました" }])]))).toBeUndefined();
	});

	test("3回目は通す", () => {
		const settle = load().get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) expect(settle(broken()).continue).toBe(true);
		expect(settle(broken())).toBeUndefined();
	});

	test("toolCall が出たら数え直す", () => {
		const settle = load().get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) settle(broken());
		settle(settleEvent([assistant([{ type: "toolCall", id: "1", name: "bash", arguments: {} }])]));
		expect(settle(broken()).continue).toBe(true);
	});

	test("普通の完了で数え直す", () => {
		const settle = load().get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) settle(broken());
		settle(settleEvent([assistant([{ type: "text", text: "終わりました" }])]));
		expect(settle(broken()).continue).toBe(true);
	});

	test("session_start で数え直す", () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) settle(broken());
		handlers.get("session_start")!({});
		expect(settle(broken()).continue).toBe(true);
	});

	test("中断・エラーのときは通す", () => {
		const settle = load().get("agent_before_settle")!;
		expect(settle({ ...broken(), outcome: "aborted" })).toBeUndefined();
		expect(settle({ ...broken(), outcome: "error" })).toBeUndefined();
	});

	test("先に積まれた entries を残す（done-guard と併用）", () => {
		const settle = load().get("agent_before_settle")!;
		const earlier = { type: "custom_message", customType: "done-guard", content: "[done-guard] x", display: true };
		const result = settle({ ...broken(), entries: [earlier] });
		expect(result.entries[0]).toBe(earlier);
		expect(result.entries[1].customType).toBe(CUSTOM_TYPE);
	});

	test("直近の assistant だけを見る", () => {
		const settle = load().get("agent_before_settle")!;
		const messages = [
			assistant([{ type: "text", text: BROKEN }]),
			{ role: "user", content: "x" },
			assistant([{ type: "text", text: "ok" }]),
		];
		expect(settle(settleEvent(messages))).toBeUndefined();
	});

	test("assistant が無い・形が想定外でも通す", () => {
		const settle = load().get("agent_before_settle")!;
		expect(settle(settleEvent([]))).toBeUndefined();
		expect(settle({ type: "agent_before_settle", outcome: "completed" })).toBeUndefined();
	});
});
