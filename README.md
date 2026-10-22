# 天体ビューア

地球・月・太陽の動きを 3D で見る、小学 4 年生から中学 3 年生向けの天体シミュレーターです。時間を進めたり戻したりしながら、教科書の文章や 2 次元の図だけではわかりにくい現象を、ぐるっと回して目でたしかめます。ブラウザだけで、PC・タブレット・スマートフォンのどれでも使えます。

問題を解くアプリではないので、今日のチャレンジ・スタンプ・カードはありません。見た目と柴犬のハカセ、Google ログインのしくみは [理科ラボ](../science-lab) と同じです。

- **解説 (6 本・45 ステップ)**: ハカセの説明にそって、ステップごとに日時・場所・視点・表示が自動で切りかわります
  | 解説 | 内容 | 単元の目安 |
  |---|---|---|
  | なぜ夏は暑く、冬は寒いの？ | 地軸が 23.4° 傾いたまま公転 → 夏至と冬至の地球 → 太陽の高さと光の強さ → 昼の長さ → 傾きがなかったら → 距離のせいではない (近日点は 1 月) → 南半球は逆 | 中 3 |
  | 季節ごとの太陽の通り道 | 透明半球で春分・夏至・冬至の経路、地上から見上げる、赤道、南半球 (北の空を通る) | 小 3・中 3 |
  | 白夜と極夜 | 夏至・冬至の北極圏、真夜中の太陽 (トロムソ)、北極点、南極 (昭和基地) | 中 3 発展 |
  | 月の満ち欠けと動き | 公転と満ち欠け (新月・上弦・満月・下弦)、満月・上弦の月の動き、毎日約 50 分おそくなる、南半球では左右が逆 | 小 4・小 6・中 3 |
  | 星の動き | 北の空 (反時計回り・1 時間 15°)、星の軌跡、東から西へ、年周運動、北極星の高さ = 緯度、南半球、赤道 | 小 4・中 3 |
  | 潮の満ち引きと大潮・小潮 | 起潮力で 2 か所がふくらむ、1 日 2 回の満潮、太陽の力 (月の約 0.46 倍)、新月・満月は大潮、半月は小潮 | 中学の発展 |
- **3D で自由に見る (6 つの画面)**: 宇宙から見た太陽・地球・月 / 季節と地軸のかたむき / 地上から見た空 / 白夜と極夜 / 月の満ち欠け / 潮の満ち引き
- **タイムラプス**: 日時の表示、スライダー (範囲は 1 日・1 か月・1 年)、再生・一時停止、速さ (1 秒で 10 分 〜 1 か月)、「いま」、春分・夏至・秋分・冬至と新月・上弦・満月・下弦へのジャンプ
- **本当の日時に合わせた位置**: 太陽と月の位置は、Meeus『天文アルゴリズム』の式で計算します (太陽は誤差 0.01° 程度、月は 0.05° 程度)。大きさと距離だけは、見やすく縮めています (地球と月の大きさの比は本当と同じ)
- **観察する場所**: 東京・札幌・那覇・シンガポール・シドニー・トロムソ・北極点・昭和基地、または緯度・経度を入れる・いまいる場所 (位置情報。0.1° に丸めて使う)
- **説明のレベル**: 「かんたん」(ふりがな付き) と「くわしく」(中学生向け、数値つき) を切りかえられます
- 地球・月の模様はその場で canvas にかき、グラフは SVG でかきます (画像ファイルは使いません)。暗い画面の設定では黒板のような色になり、「視差効果を減らす」設定では自動で再生しません

## 動かし方

```sh
npm install
npm run dev      # 開発サーバー
npm test         # テスト
npm run build    # dist/ に公開用のファイルを作る
npm run preview  # dist/ の中身を手元で見る
```

3D の画面 (three.js) は、はじめて開いたときに読みこむので、ホームはすぐに表示されます。

## Google のタグ

理科ラボと同じです。ビルドのときに、環境変数 `GTM_ID`、なければプロジェクト直下の `config.js` (`config.example.js` を参照) の `GTM_ID` を読んで、`index.html` に Google のタグを埋めこみます (`GTM-…` なら タグ マネージャー、`G-…` なら Google アナリティクス)。`config.js` は Git で管理しません。

GitHub Pages に公開するときは、リポジトリの変数 `GTM_ID` に ID を入れてください (`.github/workflows/deploy.yml`)。

## ログインと記録の保存 (Firebase)

理科ラボ (science-lab) と同じしくみです。Google でログインした人の記録は Firestore に保存し、ログインしない人はそのブラウザの localStorage だけに保存します。
**Firebase の設定を入れていないビルドでは、ログインの入り口は出ず、Firebase のコードも読みこまれません。**

保存するのは次の 2 つだけです。

| 記録 | 合わせ方 (`src/core/merge.ts`) |
|---|---|
| 設定 (観察する場所・説明のレベル) | あとから変えたほう |
| 最後まで見た解説 | 両方を合わせる (同じものは、はじめて見た時刻) |

- 画面はいつも手元 (localStorage) の記録を読み書きし (`src/core/storage.ts`)、ログイン中は書きかわった分を少しまとめて Firestore に送ります (`src/cloud/sync.ts`)。合わせ方は何回やっても同じ結果になります
- 手元の記録は人ごとに分けます。ログインなしは `astro-orbit:v1:…`、ログイン中の人の写しは `astro-orbit:u:<uid>:…`。ログアウトすると、その人の写しは端末から消します

### Firestore の形

記録は `users/{uid}/apps/astro-orbit` に入ります。理科ラボなどと同じ Firebase プロジェクトを使っても、記録はまざりません。ルールは `firestore.rules` にあります (読み書きできるのはログインしている本人だけ)。

```
users/{uid}                        その人の情報 (全アプリ共通)。名前・メールアドレスは保存しない
users/{uid}/apps/astro-orbit       記録のまとめ
  completed: string[]              最後まで見た解説 (seasons, tide など)
  settings:  { seen: { seasons: 1792650000000 },   解説を最後まで見た時刻
               place: { id, name, lat, lon, tz },  観察する場所
               detail: false,                      説明が「くわしく」か
               at: 1792650000000 }                 設定を変えた時刻
  activeDays / inventory / spent                   (このアプリでは使わない。全アプリ共通の形)
```

### 設定

次の 4 つの値を入れます。4 つのうち一部だけを入れると、ビルドがエラーになります。

- 手元: `config.js` に `FIREBASE_API_KEY` `FIREBASE_AUTH_DOMAIN` `FIREBASE_PROJECT_ID` `FIREBASE_APP_ID` を書く (書き方は `GTM_ID` と同じ)
- GitHub Pages: リポジトリの Settings → Secrets and variables → Actions → Variables に、同じ 4 つの名前で登録する
- 公開先のドメインを、Firebase コンソールの Authentication → 設定 → 承認済みドメイン に足しておく

### エミュレーターで動かす (開発用)

```sh
npx firebase-tools emulators:start --only auth,firestore --project demo-astro-orbit
FIREBASE_API_KEY=x FIREBASE_AUTH_DOMAIN=localhost FIREBASE_PROJECT_ID=demo-astro-orbit FIREBASE_APP_ID=x FIREBASE_EMULATOR=1 npm run dev
```

ブラウザのコンソールで `window.__testUser = 'kid1'` としてからログインのボタンをおします。

## しくみ

| 場所 | 中身 |
|---|---|
| `src/astro/` | 天文計算 (画面に依存しない)。時刻と恒星時 `time.ts`、太陽 `sun.ts`、月 `moon.ts`、座標変換 `coords.ts`、二十四節気・満ち欠け・日の出入り・白夜/極夜 `events.ts`、平衡潮汐 `tide.ts` |
| `src/three/` | three.js の描画 (`stage.ts`)、座標系の向き (`frames.ts`)、太陽・地球・月 (`bodies.ts`)、canvas のテクスチャ (`textures.ts`) |
| `src/views/` | 3D の画面。宇宙・季節・白夜 `space.ts`、地上の空 `ground.ts`、月の満ち欠け `moon.ts`、潮汐 `tide.ts` |
| `src/guides/` | 解説のステップ (文・画面・日時・場所・視点・表示) |
| `src/ui/` | ホーム、3D の画面のまわり (`viewer.ts`)、タイムラプス (`timebar.ts`)、いまのようす (`info.ts`)、グラフ (`chart.ts`)、柴犬のハカセ (`shiba.ts`) |
| `src/core/` / `src/cloud/` | 記録の読み書き・合わせ方、ログインと Firestore との同期 (Firebase に依存するのは `firebase.ts` だけ) |
| `src/data/` | 観察地点、明るい星と星座線、陸地の形 |
| `tests/` | 天文計算 (Meeus の例題・2026 年の二十四節気・東京の日の出入り・白夜/極夜・大潮/小潮)、3D の向き、解説のステップ、同期 |

### 3D の向き

- 宇宙の画面: 黄道面を水平にし、x を春分点の方向、y を黄道の北にする。地球の球は、恒星時と地軸の傾きから向きを決める (`earthQuaternion`)
- 地上の画面: x を東、y を真上、z を南にする。星をまとめた入れ物に、緯度と地方恒星時から作った行列 (`skyMatrix`) をつけて日周運動させる

### 解説を足すには

`src/guides/` にファイルを作り、`src/guides/index.ts` の `GUIDES` に足します。ステップごとに、画面 (`view`)・日時 (`when`: 二十四節気・月の形・日付)・場所 (`place`)・視点 (`camera`)・表示 (`options`)・再生 (`span` `speed` `play`) と、「かんたん」(`easy`)・「くわしく」(`detail`) の 2 つの文を書きます。文の「漢字(かんじ)」はふりがなになります。

## データの出典

- 星: Yale Bright Star Catalogue 第 5 版 (Hoffleit & Warren, 1991。CDS V/50) の 5.0 等より明るい星 (`src/data/stars.json`)
- 陸地: Natural Earth 1:110m land (パブリックドメイン) (`src/data/land.json`)
- 作りなおすときは `scripts/gen-data.mjs` を使います (使い方はファイルの先頭)

## ライセンス

MIT (`LICENSE`)
