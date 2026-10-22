import * as THREE from 'three';
import land from '../data/land.json';

// 地球・月・光のテクスチャは、画像ファイルを使わずに canvas でかく (一度かいたら使い回す)

let earth: THREE.Texture | null = null;
let moon: THREE.Texture | null = null;
let glow: THREE.Texture | null = null;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** 地球 (正距円筒図法の地図)。陸は Natural Earth 1:110m (パブリックドメイン) */
export function earthTexture(): THREE.Texture {
  if (earth) return earth;
  const W = 2048;
  const H = 1024;
  const [c, g] = canvas(W, H);
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#5d8fc9');
  sea.addColorStop(0.5, '#2f68b0');
  sea.addColorStop(1, '#5d8fc9');
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  const x = (lon: number) => ((lon + 180) / 360) * W;
  const y = (lat: number) => ((90 - lat) / 180) * H;
  g.beginPath();
  for (const ring of land as number[][]) {
    for (let i = 0; i < ring.length; i += 2) {
      if (i === 0) g.moveTo(x(ring[i]), y(ring[i + 1]));
      else g.lineTo(x(ring[i]), y(ring[i + 1]));
    }
    g.closePath();
  }
  g.fillStyle = '#7fb069';
  g.fill('evenodd');
  g.strokeStyle = '#4f7d43';
  g.lineWidth = 1.5;
  g.stroke();
  // 南極・グリーンランドの氷
  g.save();
  g.clip('evenodd');
  g.fillStyle = '#f2f5f7';
  g.fillRect(0, y(-62), W, H - y(-62));
  g.fillRect(x(-75), 0, x(-10) - x(-75), y(60));
  g.restore();
  // 経線・緯線 (30° ごと)
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 1.5;
  for (let lon = -180; lon <= 180; lon += 30) {
    g.beginPath();
    g.moveTo(x(lon), 0);
    g.lineTo(x(lon), H);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    g.beginPath();
    g.moveTo(0, y(lat));
    g.lineTo(W, y(lat));
    g.stroke();
  }
  earth = new THREE.CanvasTexture(c);
  earth.colorSpace = THREE.SRGBColorSpace;
  earth.anisotropy = 4;
  return earth;
}

/** 月。地球に向いている側 (経度 0° のまわり) に「海」の暗いもようがある */
export function moonTexture(): THREE.Texture {
  if (moon) return moon;
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#c9c6bf';
  g.fillRect(0, 0, W, H);
  const x = (lon: number) => ((lon + 180) / 360) * W;
  const y = (lat: number) => ((90 - lat) / 180) * H;
  // おもな海 (経度・緯度・半径の目安)
  const maria = [
    [-15, 30, 22], // 雨の海
    [-50, 20, 30], // 嵐の大洋
    [18, 28, 13], // 晴れの海
    [32, 8, 15], // 静かの海
    [58, 16, 9], // 危難の海
    [-20, -20, 12], // 雲の海
    [48, -5, 11], // 豊かの海
    [-38, -22, 7], // 湿りの海
  ];
  g.fillStyle = '#8f8b84';
  for (const [lon, lat, r] of maria) {
    g.beginPath();
    g.ellipse(x(lon), y(lat), (r / 360) * W * 1.1, (r / 180) * H * 0.55, 0, 0, Math.PI * 2);
    g.fill();
  }
  // クレーター
  g.strokeStyle = 'rgba(90,86,80,0.35)';
  for (let i = 0; i < 70; i++) {
    const cx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const cy = (Math.sin(i * 78.233) * 12345.678) % 1;
    g.beginPath();
    g.arc(Math.abs(cx) * W, 20 + Math.abs(cy) * (H - 40), 2 + (i % 5), 0, Math.PI * 2);
    g.stroke();
  }
  moon = new THREE.CanvasTexture(c);
  moon.colorSpace = THREE.SRGBColorSpace;
  return moon;
}

/** 太陽のまわりの光 */
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,250,220,1)');
  r.addColorStop(0.25, 'rgba(255,220,120,0.8)');
  r.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}
