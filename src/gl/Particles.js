import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, CustomBlending, AddEquation, Points, ShaderMaterial, SrcColorFactor, Vector3, ZeroFactor } from 'three';
import vertexShader from './glsl/particles.vert.glsl?raw';
import fragmentShader from './glsl/particles.frag.glsl?raw';

export class Particles {
  constructor(size, palette) {
    const N = size * size;
    const geometry = new BufferGeometry();
    const ref = new Float32Array(N * 2);
    const rnd = new Float32Array(N);
    let seed = 1234567;
    for (let i = 0; i < N; i++) {
      ref[i * 2] = ((i % size) + 0.5) / size;
      ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
      seed = (seed * 16807) % 2147483647;
      rnd[i] = seed / 2147483647;
    }
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    geometry.setAttribute('aRef', new BufferAttribute(ref, 2));
    geometry.setAttribute('aRnd', new BufferAttribute(rnd, 1));

    this.uniforms = {
      tPos: { value: null },
      tFrom: { value: null },
      tTo: { value: null },
      tPal: { value: palette },
      uFromId: { value: 0 },
      uToId: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 0.0135 },
      uViewportH: { value: 1000 },
      uTheme: { value: 0 },
      uOpacity: { value: 1 },
      // fewer particles on phones: each one glows a little more to compensate
      uDensity: { value: Math.min(1.8, Math.sqrt(65536 / N)) },
      uVent: { value: 0 },
      uAtria: { value: 0 },
      uSinceR: { value: 10 },
      uBeat: { value: 0 },
      uRR: { value: 0.83 },
      uHeartBase: { value: new Vector3() },
      uHeartAxis: { value: new Vector3(0, -1, 0) },
      uAtriaCenter: { value: new Vector3() },
      uIntroX: { value: -10 },
      uIntroAmp: { value: 0 },
      uScan: { value: -10 },
      uInk: { value: new Color('#6b0716') },
    };

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  setTheme(theme) {
    const paper = theme === 'paper';
    this.uniforms.uTheme.value = paper ? 1 : 0;
    if (paper) {
      this.material.blending = CustomBlending;
      this.material.blendEquation = AddEquation;
      this.material.blendSrc = ZeroFactor;
      this.material.blendDst = SrcColorFactor;
    } else {
      this.material.blending = AdditiveBlending;
    }
    this.material.needsUpdate = true;
  }
}
