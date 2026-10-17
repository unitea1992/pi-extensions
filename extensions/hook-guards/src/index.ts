import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** フックの1回の実行を待つ既定の秒数（Claude Code と同じ）。 */
export const DEFAULT_TIMEOUT_SECONDS = 60;
const KILL_GRACE_MS = 5_000;
const MAX_STDOUT_BYTES = 1024 * 1024;

export interface HookCommand {
	command: string;
	timeoutMs: number;
}

/** 設定の場所。PI_HOOKS_CONFIG があればそれ、無ければ Pi の設定の場所（PI_CODING_AGENT_DIR か ~/.pi/agent）の hook.json（pi-hooks と同じ形）。
 * Pi 本体を値で読み込むと版の違いで落ちるので、場所の決め方は Pi の getAgentDir を写す。 */
export function configPath(): string {
	if (process.env.PI_HOOKS_CONFIG) return process.env.PI_HOOKS_CONFIG;
	const dir = process.env.PI_CODING_AGENT_DIR?.replace(/^~(?=\/|$)/, homedir()) || join(homedir(), ".pi", "agent");
	return join(dir, "hook.json");
}

/** Claude Code の matcher：空と "*" は全部、ほかはツール名全体に当てる正規表現。壊れた正規表現は何にも当てない。 */
export function matchTool(pattern: string, tool: string): boolean {
	if (pattern === "" || pattern === "*") return true;
	try {
		return new RegExp(`^(?:${pattern})$`).test(tool);
	} catch {
		return false;
	}
}

/** hook.json の PreToolUse から、そのツールに当たる命令を並べる。読めない・形が違うときは空。 */
export function preToolUseCommands(path: string, tool: string): HookCommand[] {
	if (!existsSync(path)) return [];
	let groups: unknown;
	try {
		groups = JSON.parse(readFileSync(path, "utf-8"))?.hooks?.PreToolUse;
	} catch {
		return [];
	}
	if (!Array.isArray(groups)) return [];
	const out: HookCommand[] = [];
	for (const g of groups) {
		if (typeof g?.matcher !== "string" || !Array.isArray(g.hooks) || !matchTool(g.matcher, tool)) continue;
		for (const h of g.hooks) {
			if (h?.type !== "command" || typeof h.command !== "string") continue;
			const sec = typeof h.timeout === "number" && h.timeout > 0 ? h.timeout : DEFAULT_TIMEOUT_SECONDS;
			out.push({ command: h.command, timeoutMs: sec * 1000 });
		}
	}
	return out;
}

/** フックの出力から拒否の理由を返す。通すなら null。JSON の無い exit 2 は壊れた命令とみなして通す（pi-hooks と同じ）。 */
export function denyReason(stdout: string, code: number | null): string | null {
	let out: any = null;
	try {
		out = stdout ? JSON.parse(stdout) : null;
	} catch {
		return null;
	}
	if (!out) return null;
	const hso = out.hookSpecificOutput;
	if (hso?.permissionDecision !== "deny" && code !== 2) return null;
	return hso?.permissionDecisionReason || out.reason || "blocked by hook";
}

/** 1つの命令を流して、拒否の理由か null を返す。失敗・時間切れ・中断は通す（fail open）。 */
export function runHook(hook: HookCommand, cwd: string, stdin: string, signal?: AbortSignal): Promise<string | null> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve(null);
		const proc = spawn(hook.command, [], { shell: true, cwd, detached: true, stdio: ["pipe", "pipe", "inherit"] });
		const chunks: Buffer[] = [];
		let bytes = 0;
		let done = false;
		const finish = (v: string | null) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", kill);
			resolve(v);
		};
		const killTree = (sig: NodeJS.Signals) => {
			try {
				if (proc.pid) process.kill(-proc.pid, sig);
			} catch {}
		};
		function kill() {
			killTree("SIGTERM");
			setTimeout(() => killTree("SIGKILL"), KILL_GRACE_MS).unref();
			finish(null);
		}
		const timer = setTimeout(kill, hook.timeoutMs);
		signal?.addEventListener("abort", kill, { once: true });
		proc.stdin?.on("error", () => {});
		proc.stdout?.on("error", () => {});
		proc.stdout?.on("data", (c: Buffer) => {
			bytes += c.length;
			if (bytes > MAX_STDOUT_BYTES) return kill();
			chunks.push(c);
		});
		proc.on("error", () => finish(null));
		proc.on("close", (code) => finish(denyReason(Buffer.concat(chunks).toString("utf8").trim(), code)));
		proc.stdin?.end(stdin);
	});
}

/**
 * Claude Code の PreToolUse のフック（~/.pi/agent/hook.json）を Pi のツールの前に流し、拒否なら止める。
 * pi-hooks と違い terminate を付けない。拒否の理由がツールの結果としてモデルへ返り、Pi はそのまま書き直して続ける。
 */
export default function hookGuards(pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx: ExtensionContext) => {
		try {
			const hooks = preToolUseCommands(configPath(), event.toolName);
			if (hooks.length === 0) return;
			const stdin = JSON.stringify({
				session_id: ctx.sessionManager.getSessionId(),
				transcript_path: ctx.sessionManager.getSessionFile() ?? "",
				cwd: ctx.cwd,
				permission_mode: "default",
				hook_event_name: "PreToolUse",
				tool_name: event.toolName,
				tool_input: event.input ?? {},
			});
			const reasons = await Promise.all(hooks.map((h) => runHook(h, ctx.cwd, stdin, ctx.signal)));
			const reason = reasons.find((r) => r !== null);
			if (reason) return { block: true, reason };
		} catch {
			return; // fail open: 検査に失敗したら通す
		}
	});
}
