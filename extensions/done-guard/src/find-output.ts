const EXPLICIT = /DONE_FILE\s*[:=]\s*[`"']?([^\s`"'<>]+)/;
const PATH_PATTERN = /(?<![\w./:~-])(?:~\/|\/)[^\s"'`<>()（）「」、。,;]*?\.(?:md|txt)(?![\w/-])/g;
const DONE_WORD = /(?<![A-Za-z0-9_])DONE(?![A-Za-z0-9_])/;

/** 指示書の本文から、DONE を書く出力ファイルのパスを探す。見つからなければ undefined。 */
export function findOutputPath(texts: readonly string[]): string | undefined {
	for (const text of texts) {
		const m = EXPLICIT.exec(text);
		if (m?.[1]) return m[1];
	}
	for (const text of texts) {
		const lines = text.split(/\r?\n/);
		// 同じ行を先に、次に前後1行を見る
		for (const span of [0, 1]) {
			for (let i = 0; i < lines.length; i++) {
				if (!DONE_WORD.test(lines[i] ?? "")) continue;
				for (let j = i - span; j <= i + span; j++) {
					if (span > 0 && j === i) continue;
					const found = (lines[j] ?? "").match(PATH_PATTERN);
					if (found?.[0]) return found[0];
				}
			}
		}
	}
	return undefined;
}

/** 空行を除いた最終行が DONE だけか。 */
export function endsWithDone(content: string): boolean {
	const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
	return lines.at(-1)?.trim() === "DONE";
}
