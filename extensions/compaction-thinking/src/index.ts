import type { ExtensionAPI, compact } from "@earendil-works/pi-coding-agent";
import { lowerThan, readSettings } from "./settings.ts";

function settingsOf(pi: ExtensionAPI): unknown {
	try {
		return pi.getSettings?.();
	} catch {
		return undefined;
	}
}

/** null は「このヘッダーを消す」の印なので、送る前に外す（Pi 本体の withoutDeletedHeaders と同じ）。 */
function sendableHeaders(headers: Record<string, string | null> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	return Object.fromEntries(Object.entries(headers).filter((e): e is [string, string] => e[1] !== null));
}

/**
 * Pi の既定の要約（同じ指示文、分割ターンの扱い、ファイルの一覧）を、思考の強さだけ下げて流す。
 * 失敗したら何も返さず、Pi の既定の要約に任せる。
 */
// Pi 本体の compact は要約のときに読み込む（型だけを読む他の拡張と同じく、読み込み時に本体の入口を引かない）。
const piCompact: typeof compact = async (...args) => (await import("@earendil-works/pi-coding-agent")).compact(...args);

export function createCompactionThinking(compactFn: typeof compact = piCompact) {
	return function compactionThinking(pi: ExtensionAPI) {
		pi.on("session_before_compact", async (event, ctx) => {
			const model = ctx.model;
			if (!model?.reasoning) return;
			const { level, providers } = readSettings(settingsOf(pi));
			if (providers.length > 0 && !providers.includes(model.provider)) return;
			if (!lowerThan(ctx.thinkingLevel, level)) return;

			const { preparation, customInstructions, signal } = event;
			try {
				const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
				if (!auth.ok) return;
				const result = await compactFn(
					preparation,
					auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model,
					auth.apiKey,
					sendableHeaders(auth.headers),
					customInstructions,
					signal,
					level,
					// 登録済みのプロバイダや仮想モデルも Pi 本体と同じ経路で送る。
					(m, context, options) => ctx.modelRegistry.streamSimple(m, context, options),
					auth.env,
				);
				if (!result.summary.trim()) return;
				return { compaction: result };
			} catch (error) {
				if (signal.aborted) throw error;
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`[compaction-thinking] ${message}。既定の要約に戻します`, "warning");
				return;
			}
		});
	};
}

export default createCompactionThinking();
