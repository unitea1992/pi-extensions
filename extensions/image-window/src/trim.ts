/**
 * モデルへ送る messages の中の古い画像を、文字のブロックに置き換える純粋な処理。
 *
 * GLM TensorFold は1要求の画像を50枚まで（会話の全ターンの画像を数える）しか受けず、
 * 9枚を超えると1枚あたりの解像度も落ちる。そこで直近の画像だけを残し、それより古い
 * 画像のブロックを `[画像を省略：<ファイル名>。必要なら読み直す]` の文字に置き換える。
 * messages は毎回の要求の写しなので、セッションの履歴の原本は変わらない。
 */

export const DEFAULT_KEEP_IMAGES = 8;

export type WindowedMessage = {
	role?: unknown;
	content?: unknown;
};

type ToolCallId = { toolCallId?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isImageBlock(block: unknown): boolean {
	return isRecord(block) && block.type === "image";
}

function basename(path: string): string {
	const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return cut >= 0 ? path.slice(cut + 1) : path;
}

/** toolCall の引数から画像の出どころを表す名前を探す。 */
function labelForToolCall(call: unknown): string | undefined {
	if (!isRecord(call)) return undefined;
	const args = call.arguments;
	if (!isRecord(args)) return undefined;
	for (const key of ["path", "file_path", "filePath", "filename", "file"]) {
		const value = args[key];
		if (typeof value === "string" && value.length > 0) return basename(value);
	}
	return undefined;
}

/** 省いた画像の代わりに入れる文面。 */
export function omittedImageText(label: string): string {
	return `[画像を省略：${label}。必要なら読み直す]`;
}

/**
 * 後ろから数えて keep 枚より古い画像のブロックを文字に置き換えた messages を返す。
 * 変更が要らなければ undefined。引数の配列と要素は書き換えない。
 */
export function omitOldImages<T extends WindowedMessage>(messages: readonly T[], keep: number): T[] | undefined {
	if (!Number.isInteger(keep) || keep < 0) return undefined;

	// toolCallId → 画像のファイル名。read の結果にはパスが無いので、呼び出し側から引く。
	const labels = new Map<string, string>();
	for (const message of messages) {
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const block of message.content) {
			if (!isRecord(block) || block.type !== "toolCall" || typeof block.id !== "string") continue;
			const label = labelForToolCall(block);
			if (label) labels.set(block.id, label);
		}
	}

	type ImageRef = { messageIndex: number; content: unknown[]; blockIndex: number; label: string };
	const refs: ImageRef[] = [];
	messages.forEach((message, messageIndex) => {
		if (!Array.isArray(message.content)) return;
		const content = message.content as unknown[];
		content.forEach((block, blockIndex) => {
			if (!isImageBlock(block)) return;
			const fromCall =
				typeof (message as ToolCallId).toolCallId === "string"
					? labels.get((message as ToolCallId).toolCallId as string)
					: undefined;
			const label = fromCall ?? (message.role === "user" ? "添付画像" : "画像");
			refs.push({ messageIndex, content, blockIndex, label });
		});
	});

	const keepFrom = refs.length - keep;
	if (keepFrom <= 0) return undefined;

	const replacements = new Map<number, unknown[]>();
	for (const ref of refs.slice(0, keepFrom)) {
		let content = replacements.get(ref.messageIndex);
		if (!content) {
			content = ref.content.slice();
			replacements.set(ref.messageIndex, content);
		}
		content[ref.blockIndex] = { type: "text", text: omittedImageText(ref.label) };
	}

	return messages.map((message, messageIndex) => {
		const content = replacements.get(messageIndex);
		return content ? { ...message, content } : message;
	});
}

/** プロバイダへの要求の payload の中の画像（image / image_url）を数える。 */
export function countImagesInPayload(payload: unknown): number {
	let count = 0;
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			value.forEach(visit);
			return;
		}
		if (!isRecord(value)) return;
		if (value.type === "image" || value.type === "image_url") {
			count++;
			return;
		}
		Object.values(value).forEach(visit);
	};
	visit(payload);
	return count;
}

/** settings の imageWindow.keepImages を読む。無効な値なら既定の8。 */
export function keepImagesFromSettings(settings: unknown): number {
	const section = isRecord(settings) ? settings.imageWindow : undefined;
	const value = isRecord(section) ? section.keepImages : undefined;
	if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
	return DEFAULT_KEEP_IMAGES;
}
