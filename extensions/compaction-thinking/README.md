# compaction-thinking

会話の圧縮（compaction）の要約を、セッションより低い思考の強さで書かせる拡張です。

Pi の要約は、セッションの思考の強さ（`--thinking` や `/thinking` で選んだもの）をそのまま使います。強さを high や max にして使うと、要約の要求でも長く考えます。手元のローカル LLM（DeepSeek-V4.1-Flash、思考 max）では、10/19〜10/24 の69回の圧縮で、出力が中央値1.6万トークン、要約の本文は中央値2万字でした。出力の半分ほどが思考で、圧縮1回に数分かかっていました。サーバーの同時処理の枠もその間ふさがります。

この拡張は、圧縮の直前（`session_before_compact`）に Pi 本体の要約（`compact`）を同じ指示文・分割ターンの扱い・ファイルの一覧のまま、思考の強さだけを下げて流します。

## 動作

- セッションの思考の強さが設定の強さ（既定 `low`）より強いときだけ下げます。同じか弱いときと、思考の無いモデルでは何もせず、Pi の既定の要約になります。
- 認証の取得や要約に失敗したとき、要約が空のときは、何も返さず Pi の既定の要約に任せます（失敗は通知に出ます）。
- 中断（Esc など）はそのまま中断として扱います。

### 設定

`settings.json` の `compactionThinking` で変えられます。

```json
{
	"compactionThinking": {
		"level": "low",
		"providers": ["spark"]
	}
}
```

- `level`: 要約に使う思考の強さ（`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`）。既定は `low`。
- `providers`: 下げる対象のプロバイダ。空（既定）なら全部。クラウドのモデルでは既定の要約のままにしたいときに絞ります。

## 導入

```bash
pi install git:github.com/unitea1992/pi-extensions
```

この拡張だけを有効にする設定は、[リポジトリのREADME](../../README.md) を見てください。

## 動作確認

圧縮の発動点を小さくした設定で短い会話を続け、圧縮の記録（セッションの `compaction` の行の `usage.output`）とサーバーの思考の強さを、拡張あり・なしで比べます。

```bash
pi -e ./extensions/compaction-thinking/src/index.ts --thinking max
```

## ライセンス

MIT
