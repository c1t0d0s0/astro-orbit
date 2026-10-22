import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { rubyHtml } from '../ui/dom';

/** 画面のすみに出す小さな窓 (別のカメラで見たところ) */
export interface Inset {
  camera: THREE.PerspectiveCamera;
  /** 画面の大きさから、窓の位置と大きさ (左下が原点) を決める */
  rect(width: number, height: number): { x: number; y: number; w: number; h: number };
  background: THREE.Color;
  /** 窓の上に出す説明 (「漢字(かんじ)」はふりがな付き) */
  caption?: string;
}

/**
 * three.js の描画をまとめる (立体と展開図ラボの SceneManager を下敷きにしている)。
 * 指 1 本で回す・2 本指でズーム。止まっているあいだは描きなおさない (スマートフォンの電池のため)
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  /** 画面ごとの立体を入れる入れ物。画面を切りかえるときに、中身をまるごと捨てる */
  readonly root = new THREE.Group();
  insets: Inset[] = [];
  /** 背景の色 (宇宙・空の色) */
  readonly background = new THREE.Color(0x0b1630);

  private readonly labels = new CSS2DRenderer();
  private readonly caption = document.createElement('p');
  private readonly frameCallbacks = new Set<(dt: number) => void>();
  private readonly resizeObserver: ResizeObserver;
  private last = performance.now();
  private animId = 0;
  private dirty = true;

  constructor(private readonly container: HTMLElement) {
    const width = Math.max(container.clientWidth, 200);
    const height = Math.max(container.clientHeight, 160);
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 2000);
    // WebGL が使えないときは、ここで例外になる (よぶ側で案内を出す)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.autoClear = false;
    this.renderer.domElement.classList.add('stage-canvas');
    this.labels.setSize(width, height);
    this.labels.domElement.classList.add('stage-labels');
    this.caption.className = 'stage-caption';
    this.caption.hidden = true;
    container.append(this.renderer.domElement, this.labels.domElement, this.caption);

    this.scene.add(this.root);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => this.invalidate());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.loop();
  }

  /** 次のフレームで描きなおす */
  invalidate(): void {
    this.dirty = true;
  }

  /** 毎フレームよばれる処理を足す。もどり値をよぶと外れる */
  onFrame(cb: (dt: number) => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  /** 画面ごとの立体をすべて捨てる (共有のテクスチャは残す) */
  clear(): void {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of materials) m.dispose();
    });
    this.root.clear();
    this.insets = [];
    this.invalidate();
  }

  /** 日本語のラベル (「漢字(かんじ)」はふりがな付き) */
  label(text: string, cls = ''): CSS2DObject {
    const el = document.createElement('div');
    el.className = `stage-label ${cls}`;
    el.innerHTML = rubyHtml(text);
    return new CSS2DObject(el);
  }

  setLabelText(obj: CSS2DObject, text: string): void {
    const html = rubyHtml(text);
    if (obj.element.innerHTML !== html) obj.element.innerHTML = html;
  }

  /** 縦長の画面では、横がはみ出さないようにカメラを遠ざける倍率 (aspect が base 以上なら 1) */
  fit(base = 1.25): number {
    return Math.max(1, base / this.camera.aspect);
  }

  get size(): { width: number; height: number } {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  private resize(): void {
    const { width, height } = this.size;
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.invalidate();
  }

  private loop(): void {
    const tick = () => {
      this.animId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      for (const cb of this.frameCallbacks) cb(dt);
      this.controls.update();
      if (!this.dirty) return;
      this.dirty = false;
      this.render();
    };
    tick();
  }

  private render(): void {
    const { width, height } = this.size;
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, width, height);
    r.setClearColor(this.background, 1);
    r.clear();
    r.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    for (const inset of this.insets) {
      const { x, y, w, h } = inset.rect(width, height);
      inset.camera.aspect = w / h;
      inset.camera.updateProjectionMatrix();
      r.setScissorTest(true);
      r.setScissor(x, y, w, h);
      r.setViewport(x, y, w, h);
      r.setClearColor(inset.background, 1);
      r.clear();
      r.render(this.scene, inset.camera);
    }
    r.setScissorTest(false);
    this.placeCaption(width, height);
  }

  private placeCaption(width: number, height: number): void {
    const inset = this.insets.find((i) => i.caption);
    const rect = inset?.rect(width, height);
    if (!inset || !rect || rect.w < 20) {
      this.caption.hidden = true;
      return;
    }
    this.caption.hidden = false;
    const html = rubyHtml(inset.caption!);
    if (this.caption.innerHTML !== html) this.caption.innerHTML = html;
    Object.assign(this.caption.style, { left: `${rect.x}px`, width: `${rect.w}px`, bottom: `${rect.y + rect.h}px` });
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.resizeObserver.disconnect();
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    this.caption.remove();
  }
}
