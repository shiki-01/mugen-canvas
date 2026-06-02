# CLAUDE.md

このファイルは、リポジトリ内のコードを扱う Claude Code (claude.ai/code) に対してガイダンスを提供します。

## ブランチ運用

**常に `main` ブランチで作業してください。** 別ブランチへの切り替えやプッシュは、ユーザーから明示的に指示された場合のみ行います。

## コマンド

```bash
bun run dev          # 開発サーバー起動
bun run build        # プロダクションビルド
bun run preview      # プロダクションビルドのプレビュー
bun run check        # svelte-check + TypeScript 型チェック
bun run check:watch  # ウォッチモード
bun run lint         # prettier --check + eslint
bun run format       # prettier --write
```

テストスイートは設定されていません。

## アーキテクチャ

**SvelteKit** のシングルページアプリ（Svelte 5 / runes）。LoiLoNote（日本の教育用カード・キャンバスツール）をモデルにしています。

### 2層のビューモデル

アプリ全体は単一ルート（`src/routes/+page.svelte`）で構成されており、`viewMode` 状態により2つの全画面レイヤーを切り替えます。

1. **`canvas`** — `NoteCanvas.svelte`：`Card` オブジェクトを絶対位置で配置する無限パン・ズームキャンバス。SVG オーバーレイでカード間の `Connector` 矢印を描画します。ドラッグ・パン・ズーム・コネクター描画・インラインテキスト編集など、すべてのポインター操作をこのコンポーネントが担います。

2. **`editor`** — `CardEditor.svelte`：単一カードのリッチ編集用 Fabric.js 全画面キャンバス（ペン・マーカー・消しゴム・図形・テキスト）。戻るボタンまたは Escape で Fabric キャンバスを JSON にシリアライズし `onSave` を呼び出します。

### 状態の管理

すべての可変状態（`notes`・`currentNoteId`・`viewMode`・`editingCardId`・`selectedCardId`）は `+page.svelte` に集約されています。コンポーネントはプロパティでデータを受け取り、型付きコールバックプロパティ（`onCardMove`・`onCardOpen`・`onSave` など）で上位に通知します。コンポーネントが共有状態を直接変更することはありません。

### データモデル（`src/lib/types/index.ts`）

- `Note` — 最上位ドキュメント。`Card` と `Connector` の配列、およびゴミ箱・フォルダのメタデータを持ちます。
- `Card` — キャンバス上に配置された矩形。`type` は `'text' | 'image' | 'pdf'`。`editorData` はシリアライズ済み Fabric.js JSON を保持します（エディターで一度も開いていない場合は `null`）。
- `Connector` — 2つのカード ID 間の有向エッジ。黄色い矢印として描画されます。

### 永続化（`src/lib/utils/db.ts`）

`idb` を通じた **IndexedDB** と、インメモリ `Map` のフォールバックを使用します。ファイル冒頭の `useMemory` フラグで切り替えます。現在は `true`（インメモリのみ）に設定されており、サンドボックス化されたデプロイ環境向けです。ローカル開発で完全な永続化を行う場合は `false` に変更してください。データは 5 秒ごと、および Ctrl+S で自動保存されます。エクスポート・インポートはプレーン JSON（`version: 3`）です。

### スタイリング

**Master CSS**（`@master/css`）を使用します。`master.css.ts` で設定されたアトミック CSS-in-JS フレームワークです。スタイルはマークアップ内でスペース区切りのユーティリティクラス文字列として記述します（例：`"d:flex ai:center gap:8px"`）。Tailwind ではありません。

デザイントークンは `master.css.ts` で CSS 変数として定義され、クラス内では `$` シジルで参照します（例：`bg:$sb-bg`）。ライト/ダークモードの切り替えは `<html>` への `dark` クラスの付け外しで行います。主なトークン：

| トークン | 用途 |
|---|---|
| `cv-bg` | キャンバス背景（ネイビー） |
| `sb-bg / sb-bd / sb-tx / sb-ih` | サイドバーの面・境界・テキスト・ホバー |
| `hd-bg / hd-tx` | ヘッダーバー |
| `ed-bg / edtb-bg / edtb-bd` | カードエディターの面・ツールバー |
| `pri` | プライマリアクセント（`#4a90d9`） |
| `conn` | コネクター矢印の色（黄色 `#f5c542`） |
| `sel` | カード選択時のボーダー |
| `tx / sf / bd` | 本文テキスト・面・境界線 |

### 主な依存ライブラリ

- **Fabric.js**（`fabric` v7） — カードエディターキャンバスの中核。フリードロー・IText・図形・アンドゥ/リドゥスタックを担います。
- **pdf.js**（`pdfjs-dist`） — インポート時に PDF ページをキャンバスの data URL にレンダリングします。
- **idb** — IndexedDB ラッパー。ノートの永続化に使用します。
- **uuid** — カード・ノート・コネクターの ID 生成に使用します。
- **jsPDF** — 依存関係には含まれていますが、まだ UI に組み込まれていません。

## 規約

- **Svelte 5 runes** — `$state`・`$derived`・`$props`・`$effect` を使用します。旧来の `export let` や `$:` リアクティブ構文は使用しません。
- **UI 文字列は日本語** — すべての表示ラベルとツールチップは日本語です（例：`テキスト`・`削除`・`戻る`）。新しい UI 文字列も日本語で記述してください。
- **カード色** — アドホックな hex 値ではなく、`src/lib/types/index.ts` の `CARD_COLORS` パレットを使用します。
- **ダブルクリック検出** — `NoteCanvas` は 400 ms 以内の 2 回のシングルクリックで独自にダブルクリックを実装しています（ポインターキャプチャ中はネイティブの `dblclick` が不安定なため）。
- **`useMemory` フラグ** — 永続化機能を追加する際は、インメモリフォールバックのパスも考慮し、`db`（IndexedDB）と `mem*`（Map）の両方のブランチを同期して保つようにしてください。
