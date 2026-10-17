import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import doneGuard, { MAX_REMINDERS, reminderText } from "../src/index.ts";

type Handler = (event: any) => Promise<any> | any;

function load() {
	const handlers = new Map<string, Handler>();
	doneGuard({ on: (name: string, h: Handler) => handlers.set(name, h) } as unknown as ExtensionAPI);
	return handlers;
}

function settleEvent(prompt: string, overrides: Record<string, unknown> = {}) {
	return {
		type: "agent_before_settle",
		entries: [],
		continue: false,
		outcome: "completed",
		context: { canContinue: true, llmMessages: [{ role: "user", content: prompt }] },
		...overrides,
	};
}

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "done-guard-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("done-guard", () => {
	test("最終行が DONE でなければ差し戻す", async () => {
		const out = join(dir, "result.md");
		await writeFile(out, "途中\n");
		const settle = load().get("agent_before_settle")!;
		const result = await settle(settleEvent(`DONE_FILE: ${out}`));
		expect(result.continue).toBe(true);
		expect(result.entries[0].type).toBe("custom_message");
		expect(result.entries[0].content).toContain(reminderText(out));
	});

	test("ファイルが無い場合も差し戻す", async () => {
		const settle = load().get("agent_before_settle")!;
		const result = await settle(settleEvent(`DONE_FILE: ${join(dir, "none.md")}`));
		expect(result.continue).toBe(true);
	});

	test("最終行が DONE なら通す", async () => {
		const out = join(dir, "result.md");
		await writeFile(out, "結果\nDONE\n");
		const settle = load().get("agent_before_settle")!;
		expect(await settle(settleEvent(`DONE_FILE: ${out}`))).toBeUndefined();
	});

	test("文中の絶対パスからも推定して差し戻す", async () => {
		const out = join(dir, "result.md");
		await writeFile(out, "途中");
		const settle = load().get("agent_before_settle")!;
		const result = await settle(settleEvent(`結果を ${out} に書き、最終行を DONE の1行にする`));
		expect(result.continue).toBe(true);
	});

	test("出力ファイルが分からなければ通す", async () => {
		const settle = load().get("agent_before_settle")!;
		expect(await settle(settleEvent("こんにちは"))).toBeUndefined();
	});

	test("差し戻しは1つのファイルにつき2回まで", async () => {
		const out = join(dir, "result.md");
		await writeFile(out, "途中");
		const settle = load().get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) {
			expect((await settle(settleEvent(`DONE_FILE: ${out}`))).continue).toBe(true);
		}
		expect(await settle(settleEvent(`DONE_FILE: ${out}`))).toBeUndefined();
	});

	test("別のファイルは別に数える", async () => {
		const a = join(dir, "a.md");
		const b = join(dir, "b.md");
		const settle = load().get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) await settle(settleEvent(`DONE_FILE: ${a}`));
		expect(await settle(settleEvent(`DONE_FILE: ${a}`))).toBeUndefined();
		expect((await settle(settleEvent(`DONE_FILE: ${b}`))).continue).toBe(true);
	});

	test("session_start で回数を数え直す", async () => {
		const out = join(dir, "r.md");
		const handlers = load();
		const settle = handlers.get("agent_before_settle")!;
		for (let i = 0; i < MAX_REMINDERS; i++) await settle(settleEvent(`DONE_FILE: ${out}`));
		handlers.get("session_start")!({});
		expect((await settle(settleEvent(`DONE_FILE: ${out}`))).continue).toBe(true);
	});

	test("差し戻しの文面自体はパスの推定に使わない", async () => {
		const settle = load().get("agent_before_settle")!;
		const reminder = { role: "user", content: `[done-guard] ${reminderText("/x/y.md")}` };
		const event = settleEvent("やって", { context: { canContinue: true, llmMessages: [reminder] } });
		expect(await settle(event)).toBeUndefined();
	});

	test("中断・エラーのときは通す", async () => {
		const settle = load().get("agent_before_settle")!;
		const prompt = `DONE_FILE: ${join(dir, "r.md")}`;
		expect(await settle(settleEvent(prompt, { outcome: "aborted" }))).toBeUndefined();
		expect(await settle(settleEvent(prompt, { outcome: "error" }))).toBeUndefined();
	});

	test("読み取りに失敗しても通す（ディレクトリを指す場合）", async () => {
		const settle = load().get("agent_before_settle")!;
		expect(await settle(settleEvent(`DONE_FILE: ${dir}`))).toBeUndefined();
	});

	test("本文が配列形式でも読める", async () => {
		const out = join(dir, "result.md");
		const content = [{ type: "text", text: `DONE_FILE: ${out}` }];
		const ctx = { canContinue: true, llmMessages: [{ role: "user", content }] };
		const settle = load().get("agent_before_settle")!;
		expect((await settle(settleEvent("", { context: ctx }))).continue).toBe(true);
	});
});

describe("done-guard と他の拡張の併用", () => {
	test("先に積まれた entries を残す", async () => {
		const settle = load().get("agent_before_settle")!;
		const earlier = { type: "custom_message", customType: "tool-call-text", content: "x", display: true };
		const result = await settle(settleEvent(`DONE_FILE: ${join(dir, "none.md")}`, { entries: [earlier] }));
		expect(result.entries[0]).toBe(earlier);
		expect(result.entries).toHaveLength(2);
	});
});
