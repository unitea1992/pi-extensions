import { describe, expect, test } from "bun:test";
import { endsWithDone, findOutputPath } from "../src/find-output.ts";

describe("findOutputPath", () => {
	test("DONE_FILE: の明示を最優先する", () => {
		const text = "結果を /tmp/other.md に書き、最終行を DONE にする。\nDONE_FILE: /tmp/out/result.md";
		expect(findOutputPath([text])).toBe("/tmp/out/result.md");
	});

	test("DONE_FILE=パス の形も読む", () => {
		expect(findOutputPath(["DONE_FILE=~/work/report.txt"])).toBe("~/work/report.txt");
	});

	test("DONE を含む同じ行の絶対パスを推定する", () => {
		const text = "調べた結果を /work/notes/answer.md に書き、最終行を DONE の1行にする";
		expect(findOutputPath([text])).toBe("/work/notes/answer.md");
	});

	test("~/ 始まりのパスも推定する", () => {
		expect(findOutputPath(["結果は ~/out/r.md、最後の行は DONE"])).toBe("~/out/r.md");
	});

	test("同じ行に無ければ前後1行のパスを使う", () => {
		const text = "出力先: /work/out/result.txt\n最終行は DONE と書くこと";
		expect(findOutputPath([text])).toBe("/work/out/result.txt");
	});

	test("DONE の行にあるパスを、離れた行のパスより優先する", () => {
		const text = "入力: /work/in/spec.md\n\n\n結果を /work/out/result.md に書いて最終行を DONE にする";
		expect(findOutputPath([text])).toBe("/work/out/result.md");
	});

	test("DONE を含む文が無ければ見つけない", () => {
		expect(findOutputPath(["/work/in/spec.md を読んで要約してください"])).toBeUndefined();
	});

	test("パスが無ければ見つけない", () => {
		expect(findOutputPath(["最終行を DONE にしてください"])).toBeUndefined();
	});

	test("URL や .md 以外は対象にしない", () => {
		expect(findOutputPath(["https://example.com/a/b.md を読み、/work/out/x.json に書き、最後に DONE"])).toBeUndefined();
	});

	test("DONE を含む別の語は対象にしない", () => {
		expect(findOutputPath(["UNDONE と書く場合は /work/a.md"])).toBeUndefined();
	});
});

describe("endsWithDone", () => {
	test("空行を除いた最終行が DONE なら true", () => {
		expect(endsWithDone("結果\n\nDONE\n\n  \n")).toBe(true);
		expect(endsWithDone("結果\r\nDONE\r\n")).toBe(true);
	});

	test("最終行が DONE でなければ false", () => {
		expect(endsWithDone("DONE\n追記")).toBe(false);
		expect(endsWithDone("DONE します")).toBe(false);
		expect(endsWithDone("")).toBe(false);
	});
});
