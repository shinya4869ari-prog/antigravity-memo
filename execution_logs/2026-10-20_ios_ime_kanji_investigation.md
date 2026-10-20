# 2026-10-20 iOS Safari 本文入力時の漢字変換候補非表示バグ調査

## 1. 実施日時
- 2026/10/20 13:42 (JST)

## 2. 課題概要
- **現象**: iPhone等のiOS端末でメモ本文を編集・訂正しようとすると、ひらがな（未確定状態）のまま青いアンダーラインが引かれ、キーボード上部に漢字の予測変換候補バーが表示されず、代わりにSafariのフォームナビゲーションバー（`∧` `∨` `✓`）が表示されて漢字変換ができない。

## 3. 原因の特定
1. **等幅フォント（`monospace`）指定によるiOS WebKitのIME候補抑制**:
   - `style.css` の `.editor-textarea-full`（本文テキストエリア）において、`font-family: var(--font-mono);`（`'JetBrains Mono', 'Fira Code', monospace`）が単独で適用されている。
   - iOS Safariは、テキスト入力欄に等幅フォント（monospace）のみが指定されている場合、ソースコードや英数字専用入力と判定し、日本語IMEの予測変換バー（Candidate Bar）を抑制、またはフォームアクセサリバー（`∧ ∨ ✓`）を優先表示してしまう既知の仕様・挙動が存在する。
   - 対してタイトル入力欄（`.editor-title-input`）にはフォント指定がなく標準の日本語フォント（`-apple-system, BlinkMacSystemFont` 等）が適用されるため問題が発生していない。
2. **言語属性・IME支援属性の欠落**:
   - `index.html` の `#input-memo-desc` タグに `lang="ja"`, `autocorrect="on"`, `autocapitalize="off"`, `spellcheck="true"` 等の日本語入力明示属性が付与されていない。
3. **フォントサイズ（16px未満）による自動ズームと描画干渉**:
   - スマホ時CSSで `font-size: 0.95rem`（約15.2px）となっており、iOS Safariがフォーカス時に微小ズームを起こし、キーボード上部のバー描画と競合する原因となっている。

## 4. 対策方針
1. **フォントスタックの是正**:
   - 本文テキストエリアの `font-family` を、日本語入力に最適なシステムフォント優先（`-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`）に設定し、英数コード部も綺麗に表示できるハイブリッド構成にする。
2. **HTML属性の明示的付与**:
   - `input-memo-desc` に `lang="ja" autocorrect="on" autocapitalize="off" spellcheck="true"` を付与。
3. **スマホ時フォントサイズの最適化**:
   - スマホ時のフォントサイズを `1rem`（16px）にし、iOS Safariの勝手なズームとIME候補バーの非表示・ズレを防止。
4. **Service Worker キャッシュバージョンの更新**:
   - `sw.js` のキャッシュバージョンを更新し、スマホ実機で即時反映できるようにする。


## 5. 実装完了内容（2026/10/20 13:45）
- `style.css`:
  - `.editor-textarea-full` の `font-family` を `-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Segoe UI", Roboto, var(--font-mono), sans-serif` に修正。等幅フォント単独指定によるiOSのコード入力誤判定・IME候補バー抑制を解消。
  - スマホ時の `.editor-textarea-full` を `font-size: 1rem !important;`（16px）および `-webkit-text-size-adjust: 100%;` に設定。
- `index.html`:
  - `<textarea id="input-memo-desc">` に `lang="ja" autocorrect="on" autocapitalize="off" spellcheck="true"` を追加。
  - バージョンバッジを `v24`、キャッシュクエリを `?v=20261020_v24` に更新。
- `sw.js`:
  - `CACHE_NAME = 'antigravity-hub-v24'` に更新し、クライアント側でのキャッシュクリア・即時更新を有効化。
