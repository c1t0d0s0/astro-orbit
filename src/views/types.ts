import type { NamedPlace } from '../data/places';

export type ViewId = 'space' | 'seasons' | 'polar' | 'ground' | 'moon' | 'tide';

/** 表示の切りかえ (ボタン 1 つ) */
export interface Toggle {
  key: string;
  label: string;
}

/** カメラの位置のプリセット */
export interface CameraPreset {
  key: string;
  label: string;
}

/** どの画面にも共通の条件 */
export interface ViewContext {
  place: NamedPlace;
  /** 説明を「くわしく」にするか */
  detail: boolean;
  /** 表示の切りかえの状態 (Toggle.key ごと) */
  options: Record<string, boolean>;
}

/** 3D の画面 1 つ分。stage の root の下に立体を作り、時刻が進むたびに置きなおす */
export interface View {
  readonly id: ViewId;
  readonly toggles: readonly Toggle[];
  readonly cameras: readonly CameraPreset[];
  /** はじめの表示の切りかえの状態 */
  readonly defaults: Record<string, boolean>;
  /** 時刻 ms・条件 ctx に合わせて置きなおす */
  update(ms: number, ctx: ViewContext): void;
  /** カメラをプリセットの位置にする */
  setCamera(key: string, ctx: ViewContext): void;
  /** 毎フレーム (カメラを地球についていかせるなど)。なくてもよい */
  frame?(dt: number): void;
  dispose?(): void;
}
