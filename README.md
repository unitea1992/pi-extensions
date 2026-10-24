# pi-extensions

Pi coding agent の任意拡張をまとめるリポジトリです。Pi本体で解決できる機能は重複実装せず、実運用で確認できた具体的な不足だけを小さな拡張として補います。

## 拡張

| 拡張 | 概要 |
| --- | --- |
| [`done-guard`](extensions/done-guard/README.md) | 指示書が指定した出力ファイルの最終行が `DONE` になるまで、Piが終わるのを2回まで差し戻す |
| [`tool-call-text-guard`](extensions/tool-call-text-guard/README.md) | ツールの呼び出しが実行されず本文に文字として出たまま終わろうとしたとき、2回まで差し戻す |
| [`hook-guards`](extensions/hook-guards/README.md) | Claude Code の PreToolUse のフックをツールの前に流し、拒否なら止める。pi-hooks と違い、拒否のあとも Pi は止まらずに続ける |
| [`image-window`](extensions/image-window/README.md) | モデルへ送る要求の画像を直近の枚数に絞り、古い画像を「画像を省略」の文字に置き換える。会話の画像が増えても GLM の1要求50枚の上限で止まらなくする |
| [`compaction-thinking`](extensions/compaction-thinking/README.md) | 会話の圧縮の要約を、セッションより低い思考の強さ（既定 `low`）で書かせる。思考を max にしていても、要約で長く考えて数分ふさがらないようにする |

## インストール

Piのパッケージとして、リポジトリごと入れます。

```bash
pi install git:github.com/unitea1992/pi-extensions
```

タグやコミットを固定する場合は `@<ref>` を付けます。

```bash
pi install git:github.com/unitea1992/pi-extensions@v0.1.0
```

拡張ごとに選ぶ場合は、`~/.pi/agent/settings.json` の `packages` をオブジェクト形式にして `extensions` で絞ります（Pi の packages 文書の「Select package resources」）。

```json
{
  "packages": [
    {
      "source": "git:github.com/unitea1992/pi-extensions",
      "extensions": ["extensions/done-guard/src/index.ts"]
    }
  ]
}
```

`pi config` でも有効・無効を切り替えられます。更新は `pi update --extensions`、削除は `pi remove git:github.com/unitea1992/pi-extensions` です。

試すだけなら、設定に書かず1回だけ読み込めます。

```bash
pi -e git:github.com/unitea1992/pi-extensions
```

## 開発

```bash
bun install --frozen-lockfile
bun run check
```

詳しくは [CONTRIBUTING.md](CONTRIBUTING.md)、脆弱性の報告は [SECURITY.md](SECURITY.md) を見てください。

## ライセンス

MIT
