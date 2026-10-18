import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lastImageLimitError } from "./image-limit.ts";
import { countImagesInPayload, keepImagesFromSettings, omitOldImages } from "./trim.ts";

export const CUSTOM_TYPE = "image-window";

/** 上限の誤りの後に1回だけ続けさせるときに、会話へ足す文。 */
export const RETRY_MESSAGE = `[${CUSTOM_TYPE}] 直前の要求は画像の枚数の上限で失敗しました。古い画像を省いた要求でやり直します。作業を続けてください。`;

function settingsOf(pi: ExtensionAPI): unknown {
	try {
		return pi.getSettings?.();
	} catch {
		return undefined;
	}
}

export default function imageWindow(pi: ExtensionAPI) {
	// 上限の誤りで続けさせた回数。セッションで1回限り（同じ誤りで回り続けないため）。
	let retriedImageLimit = false;

	pi.on("session_start", () => {
		retriedImageLimit = false;
	});

	// 毎回の要求で、直近の画像だけを残して古い画像を文字に置き換える。
	// 履歴の原本は Pi が守るので、ここで書き換えてもセッションには反映されない。
	pi.on("context", (event) => {
		const messages = omitOldImages(event.messages, keepImagesFromSettings(settingsOf(pi)));
		return messages ? { messages } : undefined;
	});

	// PI_IMAGE_WINDOW_DEBUG=1 のとき、サーバーに届く要求の画像の数を出す（点検用）。
	pi.on("before_provider_request", (event) => {
		if (!process.env.PI_IMAGE_WINDOW_DEBUG) return;
		console.error(`[image-window] provider request images: ${countImagesInPayload(event.payload)}`);
	});

	// 画像の上限の誤りで終わったら、古い画像を省いた要求で1回だけやり直す。
	// continue には続けられる文脈が要るため、done-guard と同じく custom_message を足す。
	pi.on("agent_before_settle", async (event) => {
		try {
			if (event.outcome !== "error") return;
			if (retriedImageLimit) return;
			if (!lastImageLimitError(event.context.llmMessages)) return;
			retriedImageLimit = true;
			return {
				continue: true,
				entries: [
					...event.entries,
					{
						type: "custom_message" as const,
						customType: CUSTOM_TYPE,
						content: RETRY_MESSAGE,
						display: true,
					},
				],
			};
		} catch {
			return; // fail open: 検査に失敗したら通す
		}
	});
}
