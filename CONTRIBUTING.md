# Contributing

## 開発環境

Bunを使用します。

```bash
bun install --frozen-lockfile
bun run check
```

変更した拡張は、手元のPiで実際に読み込んで確認してください（`pi -e ./extensions/<名前>/src/index.ts`）。Pi本体や上流に同等機能がある場合は、独自実装を増やさず上流機能の利用を優先します。

## 秘密情報

APIキー、OAuthトークン、Cookie、秘密鍵、ローカル専用認証情報、開発機の絶対パスをコミットしないでください。

Betterleaksを導入している場合、このリポジトリ同梱のpre-commit hookを有効化できます。

```bash
git config core.hooksPath .githooks
```

hookはstaged内容をBetterleaksで検査し、検出またはスキャン失敗時はコミットを停止します。

## Pull Request

- 変更理由とユーザーから見える挙動を明確にする
- 実行時挙動が変わる場合は対象拡張のSemVerを更新する
- `bun run check` を通す
- 新しい依存関係は、既存機能や標準機能では解決できない場合だけ追加する
