import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import imageWindow, { CUSTOM_TYPE, RETRY_MESSAGE } from "../src/index.ts";

type Handler = (event: any) => Promise<any> | any;

function load(settings?: unknown) {
	const handlers = new Map<string, Handler>();
	const api = {
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		...(settings === undefined ? {} : { getSettings: () => settings }),
	} as unknown as ExtensionAPI;
	imageWindow(api);
	return handlers;
}

const IMAGE = { type: "image", data: "Zml4ZWQ=", mimeType: "image/png" };

function readResult(toolCallId: string): Record<string, unknown> {
	return { role: "toolResult", toolCallId, toolName: "read", content: [IMAGE] };
}

function withNineImages(): Record<string, unknown>[] {
	const messages: Record<string, unknown>[] = [];
	for (let i = 0; i < 9; i++) messages.push(readResult(`c${i}`));
	return messages;
}

const IMAGE_LIMIT_ERROR = `400: {"message":"a request supports at most 50 images","type":"invalid_request_error"}`;

function settleEvent(overrides: Record<string, unknown> = {}) {
	return {
		type: "agent_before_settle",
		entries: [],
		continue: false,
		outcome: "completed",
		context: { canContinue: true, llmMessages: [] },
		...overrides,
	};
}

function errorMessages(errorMessage: string) {
	return [{ role: "assistant", content: [], stopReason: "error", errorMessage }];
}

describe("context ハンドラ", () => {
	test("画像が少ないときはそのまま、多いときは置き換える", () => {
		const handlers = load();
		const context = handlers.get("context")!;
		expect(context({ type: "context", messages: [readResult("c1")] })).toBeUndefined();
		const result = context({ type: "context", messages: withNineImages() });
		expect(result?.messages).toHaveLength(9);
		expect((result!.messages[0].content as unknown[])[0]).toEqual({
			type: "text",
			text: "[画像を省略：画像。必要なら読み直す]",
		});
		expect(result!.messages[8].content[0]).toEqual(IMAGE);
	});

	test("設定の imageWindow.keepImages が効く", () => {
		const handlers = load({ imageWindow: { keepImages: 1 } });
		const context = handlers.get("context")!;
		const result = context({ type: "context", messages: [readResult("c1"), readResult("c2")] });
		expect((result!.messages[0].content as unknown[])[0]).toEqual({
			type: "text",
			text: "[画像を省略：画像。必要なら読み直す]",
		});
		expect(result!.messages[1].content[0]).toEqual(IMAGE);
	});
});

describe("agent_before_settle ハンドラ", () => {
	test("画像の上限の誤りで1回だけ続ける", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const event = settleEvent({
			outcome: "error",
			context: { canContinue: true, llmMessages: errorMessages(IMAGE_LIMIT_ERROR) },
		});
		const result = await settle(event);
		expect(result!.continue).toBe(true);
		expect(result!.entries).toHaveLength(1);
		expect(result!.entries[0].type).toBe("custom_message");
		expect(result!.entries[0].customType).toBe(CUSTOM_TYPE);
		expect(result!.entries[0].content).toBe(RETRY_MESSAGE);
		expect(result!.entries[0].display).toBe(true);
		// 2回目は続けない（同じ誤りで回り続けない）
		expect(await settle(event)).toBeUndefined();
	});

	test("too many images の文面も受ける", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const result = await settle(
			settleEvent({
				outcome: "error",
				context: { canContinue: true, llmMessages: errorMessages('400: {"message":"too many images"}') },
			}),
		);
		expect(result!.continue).toBe(true);
	});

	test("完了・中断では続けない", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const base = { context: { canContinue: true, llmMessages: errorMessages(IMAGE_LIMIT_ERROR) } };
		expect(await settle(settleEvent({ ...base, outcome: "completed" }))).toBeUndefined();
		expect(await settle(settleEvent({ ...base, outcome: "aborted" }))).toBeUndefined();
	});

	test("画像の上限以外の誤りでは続けない", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const event = settleEvent({
			outcome: "error",
			context: { canContinue: true, llmMessages: errorMessages("500: server_busy") },
		});
		expect(await settle(event)).toBeUndefined();
	});

	test("最後の assistant が誤りでなければ続けない", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const event = settleEvent({
			outcome: "error",
			context: {
				canContinue: true,
				llmMessages: [{ role: "assistant", content: [], stopReason: "stop" }],
			},
		});
		expect(await settle(event)).toBeUndefined();
	});

	test("先に積まれたエントリーを残す", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const existing = [{ type: "custom_message", customType: "done-guard", content: "x", display: true }];
		const result = await settle(
			settleEvent({
				outcome: "error",
				entries: existing,
				context: { canContinue: true, llmMessages: errorMessages(IMAGE_LIMIT_ERROR) },
			}),
		);
		expect(result!.entries).toHaveLength(2);
		expect(result!.entries[0]).toBe(existing[0]);
	});

	test("session_start で1回の記録を数え直す", async () => {
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		const event = settleEvent({
			outcome: "error",
			context: { canContinue: true, llmMessages: errorMessages(IMAGE_LIMIT_ERROR) },
		});
		await settle(event);
		expect(await settle(event)).toBeUndefined();
		handlers.get("session_start")!({ type: "session_start" });
		expect((await settle(event)).continue).toBe(true);
	});
});
