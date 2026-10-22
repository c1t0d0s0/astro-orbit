export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

declare const __FIREBASE_CONFIG__: FirebaseConfig | null | undefined;
declare const __FIREBASE_EMULATOR__: boolean | undefined;

/**
 * Firebase の設定。ビルドのときに config.js か環境変数から入る (vite.config.ts)。
 * 設定がなければ null で、そのときはログインの入り口を出さず、Firebase のコードも読みこまない。
 */
export const firebaseConfig: FirebaseConfig | null =
  typeof __FIREBASE_CONFIG__ !== 'undefined' && __FIREBASE_CONFIG__ ? __FIREBASE_CONFIG__ : null;

/** 手元の Firebase エミュレーターにつなぐか (開発・テスト用) */
export const useEmulator: boolean = typeof __FIREBASE_EMULATOR__ !== 'undefined' && __FIREBASE_EMULATOR__ === true;
