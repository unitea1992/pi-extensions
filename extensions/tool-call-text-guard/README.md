# tool-call-text-guard

ツールの呼び出しが、実行されず本文に文字として出たまま終わろうとしたとき、Pi を差し戻す拡張です。

GLM-5.3-Flash-EXL3 では、ツールの呼び出しが GLM の書式のまま本文（text）に出ることがあります。関数名と `<arg_key>command</arg_key><arg_value>` が抜け、素の命令文から `</arg_value>…</tool_call>` で終わる形が多く、本物の toolCall が無いと何も実行されないまま作業者が止まり、報告が届きません。2026-10-17 の調べでは、Pi の会話の記録 39,145 件の assistant 応答のうち 36 件がこの形で、21 件はそのまま止まっていました。

## 動作

Pi が終わろうとする直前（`agent_before_settle`）に、次をすべて満たすと差し戻します。

1. 終わり方が `completed` である
2. 直近の assistant メッセージに toolCall が 0 件である
3. その本文に `<tool_call>`、`</tool_call>`、`</arg_value>`、`<arg_key>` のどれかがある

差し戻しでは、次の指示を足して作業を続けさせます。

> [tool-call-text] 直前の応答は、ツールの呼び出しが文として出て実行されていない。同じ操作をツールの呼び出しとしてやり直すこと。

### 止めない場合

- 連続 2 回まで差し戻し、3 回目は通します。通したあとは、見張り側（統括）が止まりに気づきます。
- toolCall が出たら回数を数え直します。`session_start` でも数え直します。
- 中断やエラーで終わるときは通します。
- 検査で例外が出たときは通します（fail open）。

## done-guard と同時に使う

`agent_before_settle` の `entries` は、返した値で置き換わります。この拡張は先に積まれた `entries` を残して自分の分を足します。done-guard も同じ作りにしてあるので、どちらの順でも互いの差し戻しは消えません。どちらかが `continue: true` を返せば、次の応答が 1 回走ります。

## 導入

```bash
pi install git:github.com/unitea1992/pi-extensions
```

この拡張だけを有効にする設定は、[リポジトリのREADME](../../README.md) を見てください。1回だけ試すなら次のとおりです。

```bash
pi -e ./extensions/tool-call-text-guard/src/index.ts
```

## ライセンス

MIT
