# image-window

モデルへ送る要求の画像を直近の枚数に絞る拡張です。古い画像を `[画像を省略：<ファイル名>。必要なら読み直す]` の文字に置き換えます。

Pi は会話の履歴の画像を毎回の要求にすべて載せます。GLM TensorFold は1要求の画像を50枚まで（会話の全ターンの画像を数える）しか受けず、51枚目で `400` になって止まります。resume しても同じ履歴を送るので戻りません。また9枚を超えると1枚あたりの解像度が落ちます。image-window は要求ごとに直近の画像だけを残すので、画像をいくつ読んでもこの上限に当たらなくなります。

## 動作

毎回のモデルへの要求の直前（`context`）に、送る messages の中の画像を後ろから数え、直近8枚より古い画像のブロックを文字に置き換えます。

- ファイル名は `read` などのツール呼び出し（`toolCallId`）の `path` 引数の basename から取ります。取れないときは user の添付なら「添付画像」、それ以外は「画像」になります。
- 履歴の原本は変わりません。置き換えはその要求の写しだけで、セッションの記録や次回以降の読み直しに影響しません。
- 既に壊れた会話（画像が51枚を超えて 400 で止まった物）も、この拡張が有効な状態で resume して「続けて」と送れば、次の要求から画像が絞られた状態で続きます。

### 設定

既定は8枚です（GLM の1要求の画像のトークン上限 16,384 ÷ 1枚2,048 で、すべての画像が最高の解像度で読める枚数）。`settings.json` の `imageWindow.keepImages` で変えられます。

```json
{
	"imageWindow": {
		"keepImages": 8
	}
}
```

### 画像の上限の誤りからの回復

何らかの理由で画像の枚数の上限の `400`（`at most N images` / `too many images`）で実行が終わったときは、`agent_before_settle` で1回だけ `continue: true` を返し、古い画像を省いた要求でやり直します。同じ誤りで回り続けないよう、続けるのはセッションにつき1回だけです。誤りの後にこの処理が呼ばれることは、Pi 1.3.0 の実機で確認しています（`errorMessage` が `400: {"message":"a request supports at most 50 images",...}` の形のとき）。

### 点検用の出力

環境変数 `PI_IMAGE_WINDOW_DEBUG=1` を付けると、プロバイダへ送る要求ごとに画像の数を stderr に出します。

```
[image-window] provider request images: 8
```

## 導入

```bash
pi install git:github.com/unitea1992/pi-extensions
```

この拡張だけを有効にする設定は、[リポジトリのREADME](../../README.md) を見てください。1回だけ試すなら次のとおりです。

```bash
pi -e git:github.com/unitea1992/pi-extensions
```

## 動作確認

小さな画像を60枚作り、順に読ませて 400 が出ないことと、要求の画像が8枚以下であることを確かめられます。

```bash
mkdir -p /tmp/image-window-shots
python3 - <<'PY'
from PIL import Image, ImageDraw
import os
os.makedirs("/tmp/image-window-shots", exist_ok=True)
for i in range(1, 61):
	img = Image.new("RGB", (200, 100), (100, 150, 200))
	ImageDraw.Draw(img).text((20, 40), f"shot {i}", fill="black")
	img.save(f"/tmp/image-window-shots/shot-{i}.png")
PY
PI_IMAGE_WINDOW_DEBUG=1 pi -p --no-session -ne -e ./extensions/image-window/src/index.ts \
	"/tmp/image-window-shots の shot-1.png から shot-60.png を順に read で読み、各ファイル名を1行ずつ /tmp/image-window-result.md に追記して終えて。" \
	2>&1 | grep 'provider request images'
```

出力の画像の数がずっと8以下で、終わりまで `400` が出なければOKです。

## ライセンス

MIT
