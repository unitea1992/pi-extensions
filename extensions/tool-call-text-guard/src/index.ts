import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** 連続して差し戻す最大回数。 */
export const MAX_REMINDERS = 2;
export const CUSTOM_TYPE = "tool-call-text";
export const REMINDER_TEXT =
	"直前の応答は、ツールの呼び出しが文として出て実行されていない。同じ操作をツールの呼び出しとしてやり直すこと。";

/** GLM の書式のままツールの呼び出しが本文に出たときの目印。 */
export const BROKEN_CALL_PATTERN = /<tool_call>|<\/tool_call>|<\/arg_value>|<arg_key>/;

/** 直近の assistant メッセージ。無ければ undefined。 */
function lastAssistant(messages: readonly any[]): any {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.role === "assistant") return messages[i];
	}
	return undefined;
}

function parts(message: any): any[] {
	return Array.isArray(message?.content) ? message.content : [];
}

function hasToolCall(message: any): boolean {
	return parts(message).some((p) => p?.type === "toolCall");
}

function textOf(message: any): string {
	if (typeof message?.content === "string") return message.content;
	return parts(message)
		.map((p) => (p?.type === "text" && typeof p.text === "string" ? p.text : ""))
		.join("\n");
}

export default function toolCallTextGuard(pi: ExtensionAPI) {
	let reminders = 0;

	pi.on("session_start", () => {
		reminders = 0;
	});

	pi.on("agent_before_settle", (event) => {
		try {
			if (event.outcome !== "completed") return;
			const message = lastAssistant(event.context.llmMessages);
			if (!message) return;
			if (hasToolCall(message)) {
				reminders = 0;
				return;
			}
			if (!BROKEN_CALL_PATTERN.test(textOf(message))) return;
			if (reminders >= MAX_REMINDERS) return;
			reminders++;
			return {
				continue: true,
				// entries は置き換えで渡るため、先に積まれた分（done-guard など）を残す。
				entries: [
					...event.entries,
					{
						type: "custom_message" as const,
						customType: CUSTOM_TYPE,
						content: `[${CUSTOM_TYPE}] ${REMINDER_TEXT}`,
						display: true,
					},
				],
			};
		} catch {
			return; // fail open: 検査に失敗したら通す
		}
	});
}
