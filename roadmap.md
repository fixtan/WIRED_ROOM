# ROOM 実装計画

## 概要
個人サイトに設置できる3Dウォークスルー空間。ZIPを解凍してサーバーに置くだけで動く。
ビルドツールなし、vanilla JS + Three.js。

---
## ディレクトリ構成

```
room/
├── index.html
├── app.js           ← state, init, lights, render loop（エントリポイント）
├── style.css
├── roadmap.md
├── js/
│   ├── avatar.js       ← VRM読み込み / アニメーション / 更新
│   ├── controls.js     ← 入力 / 衝突判定 / 移動 / カメラ / ポータル判定
│   ├── editor.js       ← GLBアップロード / Room Info / 調整スライダー
│   ├── media.js        ← 画像・動画・クレジットボード配置
│   ├── menu.js         ← 右クリックコンテキストメニュー（拡張API）
│   ├── room-loader.js  ← GLB / 部屋 / 家具 / スカイボックス / ポータル
│   ├── setup.js        ← ウィザード / config管理 / buildRoomDataFromConfig
│   └── vr.js           ← WebXR VRモード / Quest コントローラー
└── assets/
    ├── room/           ← GLBファイル + models.json + サムネイル
    ├── pose/           ← ポーズデータ
    └── avatar/         ← VRM + .vrma アニメーション
```


## マニュアル

操作: ダブルクリック → 配置済みメディア選択 → MEDIA ADJUST で再編集
操作: Tab → コンテキストメニュー表示（ポインターロック中）
操作: 右クリック → コンテキストメニュー表示（ポインター解放時）

※github　に公式マニュアル作成予定

---

## データ永続化マップ

### localStorage（軽量メタデータ）
| キー | 内容 | 書き込み元 |
|------|------|------------|
| `room_config` | ウィザード設定（roomId, avatarId, skyPreset, roomDefaults, roomMeta） | setup.js / editor.js |
| `room_media` | メディア配置メタデータ配列 `[{id, type, pos, rot, scale, label, url}]` | media.js |

### IndexedDB: RoomDB.assets（バイナリ＋大容量データ）
| キーパターン | 内容 | 形式 |
|-------------|------|------|
| `custom_room_*` | カスタムGLBバイナリ | ArrayBuffer |
| `custom_vrm` | カスタムVRMバイナリ | ArrayBuffer |
| `media_<timestamp>` | 画像 → base64 data URL / 動画 → ArrayBuffer | mixed |
| `meta_custom_room_*` | 部屋メタ（name, author, license, thumbnail, triangles等） | Object |
| `meta_room_<roomId>` | プリセット部屋のメタ（thumbnail等） | Object |

### データフロー
```
起動 → loadConfig() [localStorage]
     → config あり → buildRoomDataFromConfig() → meta_* [IndexedDB] マージ
     → config なし → showSetupWizard() → saveConfig() [localStorage]

メディア追加 → media_<id> [IndexedDB] に画像/動画保存
           → MEDIA ADJUST の Save → room_media [localStorage] に配置情報保存
           → リロード時 → room_media 読み → media_<id> 復元

room.json は不要（loadConfig → ウィザード → room.json の優先順位で、config存在時は読まれない）
```

---

## MEMO

・掲示板機能（訪問者へのお知らせテキスト保存機能）
 　訪問者のメッセージ投稿機能（外部サーバが必要？）

・glb 圧縮機能　gltf-transform webp input.glb output.glb

・公開チェッカー
　 URLを入力するとROOMが公開されているかどうか確認できる。

・オブジェクト移動ピッチを少し細かくする（移動量が多すぎて調整できない）


  [ポータルを踏む]
    ↓
  [プロシージャル十字路を生成]
    ↓
  [portal_list.json から random に 3-4件抽出]
    ↓
  [各行き止まりにワープポイント配置]
    ↓ (将来)
  [相手の manifest.json を fetch → 宣伝画像を壁に貼る]



  portal_list.json GitHub リポジトリに置く。PR で登録申請、マージで公開。サーバー不要。

  [
    { "name": "alice's room", "url": "https://alice.example.com/room/", "description": "pixel art gallery" },
    { "name": "bob's lab", "url": "https://bob.example.com/room/", "description": "music studio" }
  ]


## Phase 1: 基盤 ✅ 完了（2026/07/09）
- [x] フォルダ構成（index.html, app.js, style.css, room.json）
- [x] importmapでCDNからThree.js読み込み
- [x] GLB部屋モデル読み込み（GLTFLoader + DRACOLoader）
- [x] room.jsonによるデータ駆動の部屋定義
- [x] WASD移動 + マウスルック
- [x] BVHレイキャスト衝突判定（three-mesh-bvh）
- [x] 床なし落下防止（下方向レイ）
- [x] VRMアバター表示（@pixiv/three-vrm）
- [x] .vrmaアニメーション（idle/walk切り替え）
- [x] 3人称カメラ（アバター後方追従、独立回転）
- [x] プロシージャルスカイボックス（グラデーション + 星 + 月）
- [x] PBRマテリアル黒潰れ対策（metalness上限）
- [x] ポータル機能（定義のみ、遷移は実装済み）
- [x] models.json（部屋テンプレートカタログ）
- [x] トップページにROOMボタン追加（iframe連携）

---

## Phase 2: 初期設定ダイアログ
初回起動時のウィザード。Click to Start画面を置き換え。

### VRM選択
- [x] デフォルトVRM 2体同梱（男性・女性）
- [x] サムネイル付き選択UI
- [x] オリジナルVRMアップロード（ファイル選択）
- [x] アップロードしたVRMをIndexedDBに保存
- [x] 次回起動時にIndexedDBから読み込み

### ROOM選択
- [x] models.jsonからサムネイル一覧表示
- [x] クリエイター名 + Sketchfabリンク表示
- [x] クリック選択でdefaults（scale, pos, spawn）を自動適用
- [x] スカイ選択（4プリセット + アニメーション）
- [-] オリジナルGLBアップロード → IndexedDB保存 ※右クリックメニューに追加

### ユーザー設定
- [x] ROOM名入力（自由テキスト）
- [x] 設定情報をlocalStorageに保存
- [x] 次回起動時はlocalStorageから読んでウィザードスキップ
- [-] 「設定リセット」ボタン（localStorageクリア → ウィザード再表示）※右クリックメニューに追加

### VR 実装

- [x] VRボタン（XRButton、WebXR未対応時は非表示）
- [x] avatarをXRコントローラーで移動（ヘッドセット方向基準）
- [x] XRコントローラーの追尾（cameraGroupの子として配置）
- [x] レイキャスター：衝突判定、落下防止（PC版と共通）
- [x] コントローラモデル表示 + レイ表示
- [x] setAnimationLoopへの切り替え（WebXR必須）

---

## Phase 3: エディタ機能
部屋のカスタマイズ。右クリックメニュー or UIパネル。

### ROOM追加
- [x] カスタムGLBアップロード + info入力フォーム　IndexedDB保存
- [x] stats自動取得（triangles/vertices）
- [x] Room Info編集（IndexedDB永続化）
- [x] ROOM調整スライダー（scale/pos/rot/spawn リアルタイム）
- [x] Save（localStorage保存）
- [x] Copy JSON（models.json用エントリ出力）
- [x] Take Thumbnail（Canvas撮影 → IndexedDB保存）
- [x] ウィザードにカスタムROOM表示（サムネ付き）

### デバッグ（カクツキ問題）
- [x] vr.js          updateVR内のVector3/Euler → 関数外でconst宣言
- [x] controls.js    update内のVector3 → 関数外でconst宣言
- [x] controls.js    checkCollision内のBox3/Vector3確認
- [x] avatar.js      updateAvatar内があれば同様
- [x] index.astro    R3F Canvas が生きたまま ROOM の WebGL が重なるカツ付きの根本原因を修正


### 展示空間 [New]
- [x] 画像データを配置※アトリエ風
- [x] 動画を配置※プロモーションビデオ
- [x] VRNを配置+ポーズ※VRMをフィギュア化
- [x] クレジットボードを作成

### 家具配置
- [ ] GLBオブジェクトの追加（ファイル選択 or プリセット）
- [ ] TransformControls的な移動・回転・スケール
- [ ] 配置情報をroom.jsonに反映
- [ ] 配置のundo/redo

### 保存機能
- [x] 部屋設定 → localStorage `room_config`（ウィザード/editor.js）
- [x] メディア配置 → localStorage `room_media` + IndexedDB `media_*`（media.js）
- [x] カスタムGLB/VRM → IndexedDB（editor.js/setup.js）
- [x] サムネイル → IndexedDB `meta_*`（menu.js Take Thumbnail）
- [x] リロード時の自動復元（全データ）
- [ ] 「セーブスロット」複数（将来拡張、フォルダコピーで代替可）

### 公開用エクスポート
- [ ] GLTFExporterで部屋+家具を一括GLB出力
- [ ] room.json自動生成（部屋設定、アバター参照、ポータル定義）
- [ ] ZIPダウンロード（GLB + room.json + index.html + app.js + style.css）

---

## Phase 4: ポータル接続
個人サイト間のリンク。サーバー不要、manifest.json にURL を書くだけで部屋同士が繋がる。
既存実装: controls.js の tryPortalInteract() + checkPortalProximity() で骨格あり（Eキーで遷移）

### 2種類のポータル
- **Friend Portal** — その部屋の manifest にだけ書いてある秘密のリンク。一般公開されてないが、その部屋からだけ別のROOMに繋がる
- **Global Portal** — 公開ディレクトリから読み込んで全ROOMに表示されるワープポイント（ロビー等）



### ポータルUI
- [ ] 部屋内にドア型メッシュを配置
- [ ] 遷移先URL表示 + 確認ダイアログ
- [ ] 遷移アニメーション（フェードアウト → フェードイン）

### ディスカバリー
- [ ] 公開ROOMのJSON仕様策定
  ```json
  {
    "name": "Lain's Room",
    "url": "https://lain-lab.com/room/",
    "glb": "https://lain-lab.com/room/assets/room.glb",
    "avatar_vrm": "https://lain-lab.com/room/assets/avatar.vrm",
    "creator": "lain",
    "portals": ["someone"]
  }
  ```
- [ ] GitHub Pagesにリンク集JSON（キュレーション）
- [ ] PRベースの登録（承認制）
- [ ] Global Portal用の公開ディレクトリ（静的JSON、サーバー不要）

---

## Phase 5: 追加機能（優先度低）

### WebXR対応
- [x] VRモード（Quest 3）
- [ ] MRモード（パススルー + 部屋オーバーレイ）
- [ ] ハンドトラッキングでの家具操作

### マルチユーザー（将来構想）
- [ ] WebRTCシグナリング or WebSocketリレー
- [ ] 他ユーザーのVRM表示
- [ ] 位置同期
- [ ] ※ サーバーが必要になるため慎重に検討

### ビジュアル改善
- [ ] HDRI環境マップ（Poly Haven）
- [ ] テクスチャスカイボックス（画像読み込み）
- [ ] ポストプロセス（bloom, SSAO）
- [ ] パーティクルエフェクト

---

## 設計原則
- サーバーは作らない。静的ファイルで完結。
- 荒らす場所を作らない。各自が自分のサーバーに自分の部屋を持つ。
- ビルドツール不要。importmap + CDN。
- room.jsonがすべての定義。データ駆動。
- 段階的に機能追加。動くものを先に出す。
