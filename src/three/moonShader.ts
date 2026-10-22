import * as THREE from 'three';
import { moonTexture } from './textures';

/**
 * 月の材質。満ち欠け (太陽の向き sunDir) と、地球の影 (月食) をぬる。
 * 影の中心の向き axis から見た角度が umbra (本影の半径) より小さいところは赤黒く、penumbra (半影) までは少し暗くする。
 * 角度は、原点 (観察者・地球の中心) から見たもの。月を k 倍の大きさでかいているときは、月の上の点の位置を
 * 本当の大きさにもどしてから影とくらべる (geo は影をはかるための月の中心の向き。地上の画面では、視差のない地球の中心から見た向き)
 */
export function moonMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      map: { value: moonTexture() },
      center: { value: new THREE.Vector3(0, 0, 1) },
      geo: { value: new THREE.Vector3(0, 0, 1) },
      axis: { value: new THREE.Vector3(0, 0, -1) },
      umbra: { value: 0 },
      penumbra: { value: 0 },
      k: { value: 1 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec3 sunDir;
      uniform sampler2D map;
      uniform vec3 center;
      uniform vec3 geo;
      uniform vec3 axis;
      uniform float umbra;
      uniform float penumbra;
      uniform float k;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        float lit = smoothstep(-0.04, 0.06, dot(normalize(vNormal), sunDir));
        vec3 tex = texture2D(map, vUv).rgb * 1.15;
        vec3 real = normalize(geo + (normalize(vWorld) - center) / k);
        float a = acos(clamp(dot(real, axis), -1.0, 1.0));
        float inUmbra = 1.0 - smoothstep(umbra * 0.985, umbra * 1.015, a);
        float inPenumbra = 1.0 - smoothstep(umbra, penumbra, a);
        vec3 day = tex * (1.0 - 0.45 * inPenumbra);
        // 本影の中の月は、地球の大気を通って曲がった赤い光で、赤黒く見える
        day = mix(day, tex * vec3(0.62, 0.2, 0.1) * 0.55, inUmbra);
        // 光の当たらない側は、ほとんど黒 (地球からの照り返しで、ほんの少しだけ見える)
        gl_FragColor = vec4(mix(tex * 0.035 + vec3(0.015, 0.018, 0.03), day, lit), 1.0);
      }`,
  });
}
