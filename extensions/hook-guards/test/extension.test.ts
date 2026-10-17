import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import hookGuards, { denyReason, matchTool, preToolUseCommands, runHook } from "../src/index.ts";

type Handler = (event: any, ctx: any) => Promise<any> | any;

const DENY = `printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"名前で止めないでください"}}'`;

function load() {
	const handlers = new Map<string, Handler>();
	hookGuards({ on: (name: string, h: Handler) => handlers.set(name, h) } as unknown as ExtensionAPI);
	return handlers.get("tool_call")!;
}

function ctx(cwd: string) {
	return { cwd, sessionManager: { getSessionId: () => "s1", getSessionFile: () => "/x/s1.jsonl" } };
}

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "hook-guards-"));
	process.env.PI_HOOKS_CONFIG = join(dir, "hook.json");
});
afterEach(async () => {
	Reflect.deleteProperty(process.env, "PI_HOOKS_CONFIG");
	await rm(dir, { recursive: true, force: true });
});

async function config(commands: string[], matcher = "^bash$") {
	const hooks = commands.map((command) => ({ type: "command", command, timeout: 5 }));
	await writeFile(join(dir, "hook.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher, hooks }] } }));
}

describe("hook-guards", () => {
	test("拒否なら止め、terminate は付けない（Pi が書き直して続けられる）", async () => {
		await config(["true", DENY]);
		const result = await load()({ toolName: "bash", input: { command: "pkill -f x" } }, ctx(dir));
		expect(result).toEqual({ block: true, reason: "名前で止めないでください" });
	});

	test("フックへ Claude Code の形で渡す", async () => {
		const seen = join(dir, "stdin.json");
		await config([`cat > ${seen}`]);
		expect(await load()({ toolName: "bash", input: { command: "ls" } }, ctx(dir))).toBeUndefined();
		const stdin = JSON.parse(await Bun.file(seen).text());
		expect(stdin).toMatchObject({
			hook_event_name: "PreToolUse",
			tool_name: "bash",
			tool_input: { command: "ls" },
			cwd: dir,
			transcript_path: "/x/s1.jsonl",
		});
	});

	test("matcher に当たらないツールと、設定が無い・壊れているときは通す", async () => {
		await config([DENY]);
		expect(await load()({ toolName: "write", input: {} }, ctx(dir))).toBeUndefined();
		await writeFile(join(dir, "hook.json"), "{");
		expect(await load()({ toolName: "bash", input: {} }, ctx(dir))).toBeUndefined();
		await rm(join(dir, "hook.json"));
		expect(await load()({ toolName: "bash", input: {} }, ctx(dir))).toBeUndefined();
	});

	test("壊れた命令・JSON の無い exit 2・時間切れは通す", async () => {
		const stdin = "{}";
		expect(await runHook({ command: "exit 2", timeoutMs: 5000 }, dir, stdin)).toBeNull();
		expect(await runHook({ command: "no-such-command-xyz", timeoutMs: 5000 }, dir, stdin)).toBeNull();
		const started = Date.now();
		expect(await runHook({ command: "sleep 10", timeoutMs: 200 }, dir, stdin)).toBeNull();
		expect(Date.now() - started).toBeLessThan(3000);
	});

	test("matcher と出力の読み方", () => {
		expect(matchTool("^bash$", "bash")).toBe(true);
		expect(matchTool("bash", "bash2")).toBe(false);
		expect(matchTool("*", "write")).toBe(true);
		expect(matchTool("(", "bash")).toBe(false);
		expect(denyReason('{"hookSpecificOutput":{"permissionDecision":"allow"}}', 0)).toBeNull();
		expect(denyReason('{"reason":"r"}', 2)).toBe("r");
		expect(denyReason("not json", 2)).toBeNull();
		expect(preToolUseCommands(join(dir, "none.json"), "bash")).toEqual([]);
	});
});
