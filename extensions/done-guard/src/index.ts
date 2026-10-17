import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { endsWithDone, findOutputPath } from "./find-output.ts";

/** 1つの出力ファイルにつき差し戻す最大回数。 */
export const MAX_REMINDERS = 2;
export const CUSTOM_TYPE = "done-guard";

export function reminderText(path: string): string {
	return `${path} の最終行に DONE の1行を書いてから終えること（書けない事情があれば、その理由を書いたうえで DONE）。`;
}

export function expandHome(path: string): string {
	return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

/** ファイルの最終行が DONE なら true、ファイルが無ければ false。それ以外の読み取り失敗は例外。 */
async function isDone(path: string): Promise<boolean> {
	try {
		return endsWithDone(await readFile(expandHome(path), "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
		throw error;
	}
}

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : "")).join("\n");
}

export default function doneGuard(pi: ExtensionAPI) {
	const reminders = new Map<string, number>();

	pi.on("session_start", () => {
		reminders.clear();
	});

	pi.on("agent_before_settle", async (event) => {
		try {
			if (event.outcome !== "completed") return;
			const texts = event.context.llmMessages
				.filter((m) => m.role === "user")
				.map((m) => textOf(m.content))
				.filter((t) => !t.startsWith(`[${CUSTOM_TYPE}]`));
			const path = findOutputPath(texts);
			if (!path) return;
			if (await isDone(path)) return;
			const count = reminders.get(path) ?? 0;
			if (count >= MAX_REMINDERS) return;
			reminders.set(path, count + 1);
			return {
				continue: true,
				// entries は置き換えで渡るため、先に積まれた分（tool-call-text-guard など）を残す。
				entries: [
					...event.entries,
					{
						type: "custom_message" as const,
						customType: CUSTOM_TYPE,
						content: `[${CUSTOM_TYPE}] ${reminderText(path)}`,
						display: true,
					},
				],
			};
		} catch {
			return; // fail open: 検査に失敗したら通す
		}
	});
}
