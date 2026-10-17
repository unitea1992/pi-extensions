# hook-guards

Claude Code の PreToolUse のフックを、Pi のツールの前に同じ形で流す拡張です。フックが拒否したら、その呼び出しを止めます。

`@fyeeme/pi-hooks` の代わりです。pi-hooks は拒否のたびに `terminate: true` を返します。拒否された呼び出しが1つだけだと、続きのモデルの呼び出しが飛ばされ、Pi はそこでターンを終えて止まります。この拡張は `terminate` を付けません。拒否の理由はツールの結果としてモデルへ返り、Pi はそのまま書き直して続けます。

## 動作

ツールの呼び出しの前（`tool_call`）に、次を行います。

1. `hook.json` の `PreToolUse` から、ツール名に `matcher` が当たる命令を集める（`matcher` は名前全体に当てる正規表現。空と `*` は全部に当たる）
2. 各命令を作業フォルダで流し、Claude Code の形の JSON（`tool_name`、`tool_input`、`cwd`、`transcript_path` など）を標準入力に渡す
3. `permissionDecision: "deny"`（か、JSON 付きの exit 2）があれば、その理由で呼び出しを止める

設定は `PI_HOOKS_CONFIG`、無ければ Pi の設定の場所（`PI_CODING_AGENT_DIR`、既定 `~/.pi/agent`）の `hook.json` です。形は pi-hooks と同じなので、そのまま使えます。

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "^bash$", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/rules-guard.py", "timeout": 10 }] }
    ]
  }
}
```

### 止めない場合

- 命令が失敗した、時間切れになった（既定60秒、`timeout` の秒数）、中断された、出力が JSON でない、JSON の無い exit 2 で終わった、のいずれかなら通します（fail open）。
- `PreToolUse` 以外（`SessionStart`・`Stop`）と `additionalContext` は扱いません。

## 導入

```bash
pi install git:github.com/unitea1992/pi-extensions
pi remove npm:@fyeeme/pi-hooks   # 両方あると、pi-hooks の terminate で止まる
```

## 動作確認

```bash
pi -p --no-session -ne -e ./extensions/hook-guards/src/index.ts \
  'bash で `pkill -f zzz-no-such-proc` を実行し、止められたら `echo continued > /tmp/hook-guards.txt` を実行して終えて' </dev/null
cat /tmp/hook-guards.txt   # continued（pi-hooks では、拒否のあとに止まって書かれない）
```

## ライセンス

MIT
