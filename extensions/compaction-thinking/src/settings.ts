export const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Level = (typeof LEVELS)[number];

export interface CompactionThinkingSettings {
	/** 要約に使う思考の強さ。セッションの強さがこれ以下なら何もしない。 */
	level: Level;
	/** 対象のプロバイダ。空なら全部。 */
	providers: string[];
}

export const DEFAULTS: CompactionThinkingSettings = { level: "low", providers: [] };

function isLevel(value: unknown): value is Level {
	return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

/** settings.json の `compactionThinking` を読む。不正な値は既定に戻す。 */
export function readSettings(settings: unknown): CompactionThinkingSettings {
	const raw = (settings as { compactionThinking?: unknown } | undefined)?.compactionThinking;
	if (!raw || typeof raw !== "object") return DEFAULTS;
	const { level, providers } = raw as { level?: unknown; providers?: unknown };
	return {
		level: isLevel(level) ? level : DEFAULTS.level,
		providers: Array.isArray(providers)
			? providers.filter((p): p is string => typeof p === "string")
			: DEFAULTS.providers,
	};
}

/** セッションの強さが要約の強さより上のときだけ下げる。 */
export function lowerThan(session: unknown, target: Level): boolean {
	return isLevel(session) && LEVELS.indexOf(session) > LEVELS.indexOf(target);
}
