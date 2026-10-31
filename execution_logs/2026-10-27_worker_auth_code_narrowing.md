# Worker401の認証コード絞込み（同じ疎通テストは実施しない）

- 実施日時: 2026-10-27 01:40–01:43 UTC
- 目的: ユーザー指示に従い、実装と安全なローカル検証から原因候補を絞り、本番で観測不能な項目を明示する。
- 作成: 本ログ。変更: TODO_ROADMAP.mdへの記録追記のみ。コード/Secret/権限/本番/データの変更なし。
- 操作: AGENTS.md、ロードマップ、直近ログ、_worker.js、oracle_access_setup.py、mcp-server/index.mjsを読取。新規の本番HTTP疎通や管理API通信は行っていない。

## 送受信コードの具体的な対応
- Worker _worker.js行184–201: env.MEMO_API_TOKENがstringならtrimして期待値にする。未設定/非string/trim後16文字未満は認証false。
- Authorization値が正確な大文字小文字のBearer＋半角空白で始まればprefix7文字を除いてtrim。それ以外の場合だけX-Memo-Tokenをtrimして候補とする。
- token比較はUTF-8バイト列。型不正・空・バイト長不一致はfalse、それ以外は全バイトXORの差が0ならtrue。ハッシュやBase64への変換・引用符の除去・tokenの大小文字補正はしない。
- Python http_probe行177–184は保存済みmemo_api_tokenからBearer形式とX-Memo-Tokenの両方を作る。MCPも同じ形式。JSONキー名memo_api_tokenとWorker env名MEMO_API_TOKENの違いは既存対応関係でありバグではない。
- ヘッダー名はHTTPで大小文字非依存。Bearerのprefix文字列はケース依存だが、現クライアントは正しい形式で構築。
- Bearerに別値があるとX-Memo-Tokenが正しくてもfallbackしない仕様。ただし今回両方が同じ保存値で構築されることを確認し、この競合を今回の原因とは扱わない。

## 既存Oracle設定の値を出さない確認
- APIトークンは非空stringでWorker最小長条件を満たす。可視ASCIIのみ、余分なBearer prefix/外側引用符なし。
- 送信2項目の値は同じ保存トークンから構築されるとメモリ内で照合成功。Access ID/Secretとは異なる値であることも非表示比較。
- auth.json内容ハッシュ/mtimeを読取前後で比較し不変。値・実文字数・ハッシュ値・認証ヘッダーは出力しない。

## ネットワークなしの実装検証
- 実Python http_probeにダミー設定を渡し、openerをメモリ内の偽物へ置換して本物のurllib Request構築だけを捕捉。本番通信なし。
- Workerソースをメモリ内モジュールで読込み、捕捉したダミーRequestを渡すとverifyAutomationTokenはtrue。送受信の実装互換性を確認。
- ローカルRSA鍵でダミーJWTを生成し、JWKS取得は偽のローカル応答を注入。global fetchは失敗する関数に置換して意図しないネットワーク通信を禁止。
- 10ケース全て期待どおり:
  1. API一致/JWTなし: ALLOW。
  2. API一致/JWT不正: ALLOW。
  3. API未設定/JWTなし: 401。
  4. API期待値が短い/JWTなし: 401。
  5. API不一致/JWTなし: 401。
  6. API不一致/署名付き有効JWT: ALLOW。
  7. API未設定/有効JWT: ALLOW。
  8. API不一致/JWTのAUD不一致: 401。
  9. 代替ヘッダーのみでAPI一致: ALLOW。
  10. Bearerが不一致、代替が一致: 401（Bearer優先）。
- 最初の一時検証ハーネスはメモリ内export追記の改行エスケープに失敗し停止。ハーネスだけを直し上記10件成功。アプリコードは変更せず、秘密値も扱っていない。

## 401発生箇所と結論
- requireApiAuth行208–224: API比較trueなら即許可。falseならAccess JWTを検証し、これもfalseの場合に共通401を返す。
- JWT検証falseの具体例: TEAM_DOMAIN/AUD設定なし、JWTなし、形式不正、alg/kid/iss/aud/exp/nbf不一致、JWKS取得失敗・鍵なし・署名不正。失敗の詳細はcatchによりfalseへ潰れる。
- 確認済みコードでは、API期待値が正しく受信候補と一致するならJWTが壊れていても401にならない。したがってJWTだけを直すことが専用API認証経路の必要条件ではない。
- 前回本番401がこのコードから返ったという前提では、API認証も成立していない。API期待値未設定/型や長さ不正/値不一致、受信候補欠落/別値、または当該コードが稼働していない可能性に焦点を絞る。
- ただし読取可能なのはリポジトリのコードであり、本番稼働中のソースそのものを取得したわけではない。この前提は未照合。

## 管理APIなしで可能な確認と限界
- 可能: ローカルコードとOracle設定の形/構築互換性、ダミー認証分岐、既存GitHubチェックのビルド先、本番が返した既知の拒否形式（前回記録）。
- 不可: 現行ルートが指す本番Worker/バージョン、稼働envのMEMO_API_TOKEN存在/型/内容、受信ヘッダーが実際に保持されたか、JWTの注入有無と本番内部の具体的失敗分岐。
- GitHubビルド成功やユーザーの登録成功報告を、現リクエストを処理する本番バージョンのSecret反映確認と同一視しない。
- 登録済みSecretは管理APIがあっても値を読み戻せない。名前の存在と値の一致を区別する。今回トークン不一致と断定する根拠はない。

## 安全な診断方法の提案（未実装、別途コード変更承認が必要）
- 新しい公開診断エンドポイントや詳細な401本文は作らず、Access通過後の本人による一回の診断リクエストだけに、Worker内部の固定コードを記録する。
- 非秘密のデプロイ識別子と、API側の固定状態コード（ENV_MISSING / ENV_INVALID / CANDIDATE_MISSING / TOKEN_MISMATCH / MATCH）を取得できれば、未設定・受信なし・比較不一致を分離できる。値・値の一部・長さ・ハッシュ・ヘッダー内容は記録しない。
- JWT側はENV_MISSING / JWT_MISSING / CLAIMS_INVALID / JWKS_FAILED / SIGNATURE_INVALID / VALIDのような固定分類だけにする。JWT・Cookie・kid/iss/aud・認証値・個人情報は記録しない。
- 内部ログの閲覧は管理者に限定し、外部レスポンスは従来の401のまま。短期間/診断要求限定で、確認後に診断を停止する運用を検討する。
- その前に本人のCloudflare画面で対象ドメイン/稼働バージョン/ProductionのSecret名・型を照合すれば、コード変更なしで対象違いや反映先違いを排除できる。

## 今回の変更状態と次回
- 本番HTTP再試験なし。コード変更・Secret変更・POST・デプロイ・プッシュなし。調査記録のみ保存。
- 次回は管理画面上の非秘密メタデータ照合か、別途承認後の固定分類内部診断。再生成や同じGETの反復を先行しない。
