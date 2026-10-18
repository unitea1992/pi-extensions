/**
 * 「画像の枚数の上限」の誤りを扱う純粋な処理。
 *
 * GLM TensorFold は上限を `400: {"message":"a request supports at most 50 images",...}` の
 * 形で返す。ほかのサーバーも "too many images" の類で返すため、両方を受ける。
 */

export const IMAGE_LIMIT_ERROR_PATTERN = /(?:at most \d+ images|too many images)/i;

type AssistantLike = {
	role?: unknown;
	errorMessage?: unknown;
};

/**
 * messages の末尾側から最後の assistant メッセージを探し、それが画像の枚数の上限の
 * 誤りならその文面を返す。誤りで終わっていなければ undefined。
 */
export function lastImageLimitError(messages: unknown): string | undefined {
	if (!Array.isArray(messages)) return undefined;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i] as AssistantLike | undefined;
		if (message?.role !== "assistant") continue;
		const errorMessage = message.errorMessage;
		if (typeof errorMessage !== "string" || errorMessage.length === 0) return undefined;
		return IMAGE_LIMIT_ERROR_PATTERN.test(errorMessage) ? errorMessage : undefined;
	}
	return undefined;
}
