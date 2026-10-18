import { describe, expect, test } from "bun:test";
import {
	DEFAULT_KEEP_IMAGES,
	countImagesInPayload,
	keepImagesFromSettings,
	omitOldImages,
	omittedImageText,
} from "../src/trim.ts";

type Message = {
	role: string;
	content: unknown;
	toolCallId?: string;
	toolName?: string;
};

function image(data = "Zml4ZWQ="): unknown {
	return { type: "image", data, mimeType: "image/png" };
}

function user(content: unknown): Message {
	return { role: "user", content };
}

function assistant(content: unknown): Message {
	return { role: "assistant", content };
}

function readCall(id: string, path: string): unknown {
	return { type: "toolCall", id, name: "read", arguments: { path } };
}

function readResult(toolCallId: string, ...blocks: unknown[]): Message {
	return { role: "toolResult", toolCallId, toolName: "read", content: blocks };
}

function text(value: string): unknown {
	return { type: "text", text: value };
}

describe("omitOldImages", () => {
	test("画像が keep 枚以下なら何もしない", () => {
		const messages = [readResult("c1", text("Read image file"), image())];
		expect(omitOldImages(messages, 8)).toBeUndefined();
	});

	test("直近 keep 枚を残し、それより古い画像を文字に置き換える", () => {
		const messages: Message[] = [];
		for (let i = 1; i <= 10; i++) {
			messages.push(assistant([readCall(`c${i}`, `/tmp/pictures/shot-${i}.png`)]));
			messages.push(readResult(`c${i}`, text("Read image file [image/png]"), image()));
		}
		const result = omitOldImages(messages, 8);
		expect(result).toBeDefined();
		// 古い2枚（c1・c2）が置き換わる
		expect((result![1]!.content as unknown[])[1]).toEqual({ type: "text", text: omittedImageText("shot-1.png") });
		expect((result![3]!.content as unknown[])[1]).toEqual({ type: "text", text: omittedImageText("shot-2.png") });
		// 直近の8枚は画像のまま
		expect((result![5]!.content as unknown[])[1]).toEqual((messages[5]!.content as unknown[])[1]);
		expect((result![19]!.content as unknown[])[1]).toEqual((messages[19]!.content as unknown[])[1]);
		// 先頭の text ブロックは残る
		expect((result![1]!.content as unknown[])[0]).toEqual(text("Read image file [image/png]"));
	});

	test("セッションの原本の配列も要素も書き換えない", () => {
		const messages = [
			assistant([readCall("c1", "/tmp/a.png")]),
			readResult("c1", image()),
			assistant([readCall("c2", "/tmp/b.png")]),
			readResult("c2", image()),
		];
		const before = structuredClone(messages);
		omitOldImages(messages, 1);
		expect(messages).toEqual(before);
	});

	test("1つのメッセージに画像が2枚あっても位置を保って置き換える", () => {
		const messages = [
			assistant([readCall("c1", "/tmp/a.png")]),
			readResult("c1", image("YQ=="), image("Yg==")),
			assistant([readCall("c2", "/tmp/b.png")]),
			readResult("c2", image("Yw==")),
		];
		const result = omitOldImages(messages, 2)!;
		// 古い1枚（a.png）だけが置き換わり、b.png と c.png は残る
		expect((result[1]!.content as unknown[])[0]).toEqual({ type: "text", text: omittedImageText("a.png") });
		expect((result[1]!.content as unknown[])[1]).toEqual(image("Yg=="));
		expect((result[3]!.content as unknown[])[0]).toEqual(image("Yw=="));
	});

	test("toolCall が見つからない toolResult は「画像」、user の添付は「添付画像」", () => {
		const messages = [readResult("none", image()), user([text("見て"), image()]), readResult("c", image())];
		const result = omitOldImages(messages, 1)!;
		expect((result[0]!.content as unknown[])[0]).toEqual({ type: "text", text: omittedImageText("画像") });
		expect((result[1]!.content as unknown[])[1]).toEqual({ type: "text", text: omittedImageText("添付画像") });
	});

	test("文字列の content のメッセージはそのまま", () => {
		const messages = [user("こんにちは"), assistant([readCall("c1", "/tmp/a.png")]), readResult("c1", image())];
		const result = omitOldImages(messages, 0)!;
		expect(result[0]!).toEqual(messages[0]!);
		expect(result[0]!).toBe(messages[0]!);
	});

	test("keep=0 ですべての画像を置き換える", () => {
		const messages = [readResult("c1", image()), readResult("c2", image())];
		const result = omitOldImages(messages, 0)!;
		expect((result[0]!.content as unknown[])[0]).toEqual({ type: "text", text: omittedImageText("画像") });
		expect((result[1]!.content as unknown[])[0]).toEqual({ type: "text", text: omittedImageText("画像") });
	});

	test("keep が整数でない・負なら何もしない", () => {
		const messages = [readResult("c1", image())];
		expect(omitOldImages(messages, -1)).toBeUndefined();
		expect(omitOldImages(messages, 1.5)).toBeUndefined();
	});

	test("Windows 区切りのパスからもファイル名を取る", () => {
		const messages = [
			assistant([{ type: "toolCall", id: "c1", name: "read", arguments: { path: "C:\\tmp\\shot.png" } }]),
			readResult("c1", image()),
			readResult("c2", image()),
		];
		const result = omitOldImages(messages, 1)!;
		expect((result[1]!.content as unknown[])[0]).toEqual({ type: "text", text: omittedImageText("shot.png") });
	});
});

describe("countImagesInPayload", () => {
	test("openai-completions 形式の画像を数える", () => {
		const payload = {
			model: "GLM",
			messages: [
				{ role: "user", content: [{ type: "text", text: "hi" }] },
				{
					role: "user",
					content: [
						{ type: "text", text: "see" },
						{ type: "image_url", image_url: { url: "data:image/png;base64,YQ==" } },
						{ type: "image_url", image_url: { url: "data:image/png;base64,Yg==" } },
					],
				},
			],
		};
		expect(countImagesInPayload(payload)).toBe(2);
	});

	test("anthropic 形式の image も数える", () => {
		const payload = { messages: [{ role: "user", content: [{ type: "image", source: {} }] }] };
		expect(countImagesInPayload(payload)).toBe(1);
	});

	test("画像が無ければ 0", () => {
		expect(countImagesInPayload({ messages: [] })).toBe(0);
		expect(countImagesInPayload(undefined)).toBe(0);
	});
});

describe("keepImagesFromSettings", () => {
	test("既定は 8", () => {
		expect(keepImagesFromSettings(undefined)).toBe(DEFAULT_KEEP_IMAGES);
		expect(keepImagesFromSettings({})).toBe(DEFAULT_KEEP_IMAGES);
		expect(keepImagesFromSettings({ imageWindow: {} })).toBe(DEFAULT_KEEP_IMAGES);
	});

	test("imageWindow.keepImages を読む", () => {
		expect(keepImagesFromSettings({ imageWindow: { keepImages: 12 } })).toBe(12);
		expect(keepImagesFromSettings({ imageWindow: { keepImages: 0 } })).toBe(0);
	});

	test("無効な値は既定に戻す", () => {
		expect(keepImagesFromSettings({ imageWindow: { keepImages: -3 } })).toBe(DEFAULT_KEEP_IMAGES);
		expect(keepImagesFromSettings({ imageWindow: { keepImages: 2.5 } })).toBe(DEFAULT_KEEP_IMAGES);
		expect(keepImagesFromSettings({ imageWindow: { keepImages: "8" } })).toBe(DEFAULT_KEEP_IMAGES);
	});
});
