# teams-api

`teams.cloud.microsoft.har` から Teams Web API の認証情報と実行コンテキストを抽出し、読み取り専用 API を呼び出すためのクライアントです。

## Install

```bash
bun install
```

## Quick Start

```ts
import { TeamsApiClient } from './index.ts'

const client = await TeamsApiClient.fromHarFile('./teams.cloud.microsoft.har')

const bootstrap = await client.listBootstrap()
console.log('teams:', bootstrap.teams?.length ?? 0)
console.log('chats:', bootstrap.chats?.length ?? 0)

const notifications = await client.listNotificationMessages({ pageSize: 20 })
console.log('notification messages:', notifications.messages?.length ?? 0)
```

Cookie だけで開始する場合:

```ts
import { TeamsApiClient } from './index.ts'

const client = TeamsApiClient.fromCookie(process.env.TEAMS_COOKIE ?? '')
const auth = await client.refreshSkypeTokenFromCookie()
console.log(auth.source, auth.expiresAt)
```

HAR から認証関連 JS を抽出して調べる場合:

```bash
bun run example/extract-auth-js.ts ./teams.cloud.microsoft.har ./example/har-js 8
# 出力されたファイルは bunx oxfmt で整形
```

## Main APIs

- `TeamsApiClient.fromHarFile(harPath)`
  - `HAR` から `skypeToken` とヘッダー情報を抽出してクライアントを作成
- `TeamsApiClient.fromCookie(cookie)`
  - `cookie` のみでクライアントを作成。初回 API 呼び出し時、または `refreshSkypeTokenFromCookie()` で `authsvc` から `skypeToken` を取得
- `listBootstrap()`
  - `api/csa/{geo}/api/v3/teams/users/me` を呼び、チーム/チャット一覧を取得
- `listTeams()`, `listChats()`
  - `listBootstrap()` の便利ラッパー
- `listChannelPosts(teamId, channelId)`
  - `api/csa/{geo}/api/v1/teams/{teamId}/channels/{channelId}` を呼び、投稿スレッド（`replyChains`）を取得
- `listChannelMessages(teamId, channelId)`
  - `replyChains` からメッセージを平坦化
- `getConversation(conversationId)`
  - `api/chatsvc/{geo}/api/v1/users/ME/conversations/{conversationId}` を取得
- `listConversationMessages(conversationId, options)`
  - `api/chatsvc/{geo}/api/v1/users/ME/conversations/{conversationId}/messages` を取得
- `listNotificationMessages()`, `listMentionMessages()`, `listAnnotationMessages()`
  - それぞれ `48:notifications`, `48:mentions`, `48:annotations` の便利ラッパー

## CLI Usage

```bash
bun run src/cli/index.ts [options] <command> [arguments]
```

またはインストール後:

```bash
teams [options] <command> [arguments]
```

### Commands

- `teams notifications [--limit N]`
  - 通知一覧を取得
- `teams messages <conversationId> [--limit N]`
  - 会話のメッセージを取得
- `teams channel messages <channelId> [--limit N]`
  - チームチャンネルのメッセージを取得（`me` 結果から `teamId` を自動解決）
- `teams teams list`
  - 参加チーム一覧を取得
- `teams teams channels <teamId>`
  - 指定チームのチャンネル一覧を取得
- `teams me`
  - 現在ユーザー情報（チーム/チャット含む）を取得
- `teams set-refresh-token --refresh-token=<token> [--profile=<name>]`
  - プロファイルへリフレッシュトークンを保存

### Options

- `--profile=<name>`: `~/.teams-cli/<name>.json` を使用（既定: `default`）
- `--profile-json=<path>`: 任意の profile json を使用
- `--refresh-token=<token>`: リフレッシュトークンを指定
- `--json`: 機械可読 JSON で出力
- `--no-color`: ANSI カラーを無効化
- `--help`: ヘルプ表示

## Notes

- 本実装は **write 系 API を含みません**。
- `HAR` は通常 `Authorization/Cookie` を完全に含まないため、抽出できる `skypeToken` の有効期限切れ時は再取得が必要です。
- `cookie` 単体で動かす場合でも、内部では `https://teams.microsoft.com/api/authsvc/v1.0/authz` に対して `cookie` を使い `skypeToken` を取得してから各 API を呼びます。
- `fromCookie()` で `endpoint.baseUrl` を上書きした場合、`endpoint.authzUrl` を未指定ならクラウド環境に応じた `authsvc` URL を自動推定します。
