# 本人のSecret登録・デプロイ後の識別UA付きGET再検証

- 実施日時: 2026-10-27 01:38 UTC
- 目的: 本人からMEMO_API_TOKENをProduction登録・デプロイ済みとの報告を受け、HTTP403が継続するverifyとは別に識別UAを付けたGETで実際の応答を確認する。
- 作成: 本ログ。変更: TODO_ROADMAP.md記録のみ。コード・設定・権限・データの変更なし。
- 確認: AGENTS.md、ロードマップ、前回作業ログ、git statusを確認。

## 実施したHTTP検証
- 接続先: https://anti-memo.seronworks.dev/api/memos。
- 既存のOracle auth.jsonをread_configで読み込む。APIトークンとService Token二項目の非空を確認。秘密値は出力/ログ保存しない。
- User-Agent: antigravity-memo-oracle-diagnostics/1.0（アプリを識別する文字列であり秘密情報なし）。
- HTTPS GETのみ。リダイレクト追従なし、Cookieなし、環境プロキシなし、キャッシュフォールバックなし。
- 両リクエストで専用APIトークンは同じ既存値。Service Tokenの有無だけを切替。

| 条件 | 実HTTP | JSON形式 | メモ配列 | 分類 |
|---|---|---|---|---|
| Service Tokenなし | 302 | JSONではない | 未確認 | Accessログイン先へのredirect（未追従） |
| Service Tokenあり | 401 | application/json | メモ配列ではない | 既存Workerの認証拒否JSONと完全一致 |

- 識別UA付きの両応答でCloudflare Error1010の形式は検出されなかった。
- レスポンス本文はメモリ内で既知エラーとの一致/配列型だけを判定。メモ本文・画像・Cookie・認証ヘッダー・Location実値は出力/記録しない。
- 実auth.jsonの内容ハッシュ・mtime・ファイル/親権限をリクエスト前後にメモリ内比較して一致。ハッシュ値そのものも非出力。

## 結論と未確認事項
- HTTP200＋メモ配列JSONは未達。登録後の自動通信復旧とは判断できない。
- 元のverifyの403とは別に、識別UAでブラウザ識別拒否を回避した後もWorker認証拒否と一致する401が残っている。
- Service Tokenなし302/あり401の差はAccess通過後のWorker拒否と整合する。既存コード上は専用API認証とAccess JWT検証の両方が不成立の場合401。
- 本人による登録/デプロイはユーザー報告として受領。対象アカウント/Worker/Productionの現行設定、実際に登録した値とOracle既存値の一致、現行稼働バージョンは管理API未取得で独立確認していない。
- 401のみから新登録値の不一致・未反映・別対象・JWT内部失敗のどれかを断定しない。
- 次に必要なのは対象ドメインと現行本番Worker/Version/Secret名の照合。APIトークンの再生成や再入力を先に求める根拠はない。

## 実施していない操作
- コード修正・設定変更・Secret登録・POST・デプロイ・プッシュ・サービス再起動なし。アプリテストはコード未変更のため再実行なし。
- 実際のHTTP応答で成功条件未達を報告する。本人がSecretを登録した事実と、今回のGET成功判定を混同しない。
