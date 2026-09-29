import {
  Group,
  Matrix4,
  Mesh,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  Color,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Simulation } from './Simulation.js';
import { Particles } from './Particles.js';
import { buildPalette, SHAPE_IDS } from './palette.js';
import { HEART_AXIS, HEART_BASE, HEART_SHIFT } from './shapes/heart.js';
import backgroundShader from './glsl/background.frag.glsl?raw';
import finalShader from './glsl/final.frag.glsl?raw';

const FULLSCREEN_VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const PASS_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// How each shape turns on its own (radians), as a function of time.
const SPIN = {
  flatline: () => 0,
  heart: () => 0,
  dna: (t) => t * 0.32,
  neuron: (t) => Math.sin(t * 0.21) * 0.35,
  chip: (t) => Math.sin(t * 0.17) * 0.12,
  globe: (t) => -0.25 + Math.sin(t * 0.11) * 0.55,
};

export class Experience {
  constructor({ canvas, size, shapes, pacemaker, quality = {} }) {
    this.pm = pacemaker;
    this.size = size;
    this.quality = { maxDpr: 2, halfFloat: false, bloom: true, ...quality };

    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr);
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(35, 1, 0.1, 60);
    this.camera.position.set(0, 0, 6.4);
    this.lookTarget = new Vector3();

    // Backdrop
    this.bgUniforms = {
      uRes: { value: new Vector2(1, 1) },
      uDpr: { value: this.dpr },
      uTheme: { value: 0 },
      uScroll: { value: 0 },
      uMonA: { value: new Color('#010302') },
      uMonB: { value: new Color('#06100c') },
      uMonGrid: { value: new Color('#0a1d14') },
      uPaper: { value: new Color('#fbf0ea') },
      uGridMinor: { value: new Color('#f3c9c0') },
      uGridMajor: { value: new Color('#e58f82') },
    };
    this.background = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: backgroundShader, uniforms: this.bgUniforms, depthTest: false, depthWrite: false })
    );
    this.background.frustumCulled = false;
    this.background.renderOrder = -1;
    this.scene.add(this.background);

    // Particles
    this.textures = {};
    for (const [name, data] of Object.entries(shapes)) this.textures[name] = Simulation.shapeTexture(data, size);
    // Float render targets are needed for the simulation; fall back to half floats.
    const ext = this.renderer.extensions;
    const fullFloat = ext.has('EXT_color_buffer_float');
    if (!fullFloat && !ext.has('EXT_color_buffer_half_float')) throw new Error('No float render targets');
    this.sim = new Simulation(this.renderer, size, shapes.flatline, { halfFloat: this.quality.halfFloat || !fullFloat });
    this.palette = buildPalette('monitor');
    this.particles = new Particles(size, this.palette);
    // rig: per-section placement (tweened). sway: pointer parallax and idle drift.
    this.rig = new Group();
    this.sway = new Group();
    this.rig.add(this.sway);
    this.sway.add(this.particles.points);
    this.scene.add(this.rig);

    const pu = this.particles.uniforms;
    pu.uHeartBase.value.set(HEART_BASE[0] + HEART_SHIFT[0], HEART_BASE[1] + HEART_SHIFT[1], HEART_BASE[2] + HEART_SHIFT[2]);
    pu.uHeartAxis.value.set(...HEART_AXIS);
    pu.uAtriaCenter.value.set(-0.19 + HEART_SHIFT[0], 0.57 + HEART_SHIFT[1], -0.36 + HEART_SHIFT[2]);

    this.from = 'flatline';
    this.to = 'flatline';
    this.progress = 1;
    this.morphTween = null;
    this.applyShapes();

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(512, 512), 0.78, 0.5, 0.16);
    this.bloom.enabled = this.quality.bloom;
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uAberration: { value: 0.012 },
        uScanlines: { value: 0.045 },
        uGrain: { value: 0.022 },
      },
      vertexShader: PASS_VERT,
      fragmentShader: finalShader,
    });
    this.composer.addPass(this.finalPass);
    this.composer.addPass(new OutputPass());

    // Pointer
    this.raycaster = new Raycaster();
    this.pointer = { ndc: new Vector2(0, 0), inside: false, force: 0, prev: new Vector3(), vel: new Vector3(), has: false };
    this.inverse = new Matrix4();
    this.tmpO = new Vector3();
    this.tmpD = new Vector3();
    this.tmpP = new Vector3();

    this.time = 0;
    this.theme = 'monitor';
  }

  applyShapes() {
    const su = this.sim.uniforms;
    const pu = this.particles.uniforms;
    su.tFrom.value = pu.tFrom.value = this.textures[this.from];
    su.tTo.value = pu.tTo.value = this.textures[this.to];
    pu.uFromId.value = SHAPE_IDS[this.from];
    pu.uToId.value = SHAPE_IDS[this.to];
    su.uProgress.value = this.progress;
  }

  get current() {
    return this.to;
  }

  // Start a morph toward `name`. Returns the tween so callers can chain.
  morphTo(name, { duration = 1.9, ordered = 0.55, flight = 2.4, gsap } = {}) {
    if (name === this.to) return null;
    if (this.morphTween) this.morphTween.kill();
    this.from = this.to;
    this.to = name;
    this.progress = 0;
    this.sim.uniforms.uOrdered.value = ordered;
    this.sim.uniforms.uFlight.value = flight;
    this.applyShapes();
    const state = { p: 0 };
    this.morphTween = gsap.to(state, {
      p: 1,
      duration,
      ease: 'power1.inOut',
      onUpdate: () => {
        this.progress = state.p;
        this.sim.uniforms.uProgress.value = state.p;
      },
      onComplete: () => {
        this.morphTween = null;
      },
    });
    return this.morphTween;
  }

  setTheme(theme, gsap) {
    this.theme = theme;
    const paper = theme === 'paper';
    buildPalette(theme, this.palette);
    this.particles.setTheme(theme);
    this.bloom.enabled = !paper && this.quality.bloom;
    const f = this.finalPass.uniforms;
    f.uAberration.value = paper ? 0.004 : 0.012;
    f.uScanlines.value = paper ? 0 : 0.045;
    f.uGrain.value = paper ? 0.03 : 0.022;
    if (gsap) gsap.to(this.bgUniforms.uTheme, { value: paper ? 1 : 0, duration: 0.01 });
    else this.bgUniforms.uTheme.value = paper ? 1 : 0;
  }

  setPointer(x, y, inside = true) {
    this.pointer.ndc.set(x, y);
    this.pointer.inside = inside;
  }

  // Radial kick at the point under the cursor.
  impulse(x, y, strength = 3.2) {
    this.raycaster.setFromCamera(new Vector2(x, y), this.camera);
    this.inverse.copy(this.particles.points.matrixWorld).invert();
    const o = this.tmpO.copy(this.raycaster.ray.origin).applyMatrix4(this.inverse);
    const d = this.tmpD.copy(this.raycaster.ray.direction).transformDirection(this.inverse);
    const p = o.clone().addScaledVector(d, -o.dot(d));
    this.sim.uniforms.uImpulse.value.set(p.x, p.y, p.z, strength);
  }

  // Where the rig's origin lands on screen, in CSS pixels.
  rigScreenPosition(w, h) {
    const v = this.tmpP.set(0, 0, 0);
    this.rig.localToWorld(v);
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  setPixelRatio(v) {
    this.dpr = v;
    this.renderer.setPixelRatio(v);
    if (this.width) this.resize(this.width, this.height);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep shapes inside narrow portrait screens
    this.camera.position.z = 6.4 * Math.max(1, 0.95 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.particles.uniforms.uViewportH.value = h * this.dpr;
    this.bgUniforms.uRes.value.set(w * this.dpr, h * this.dpr);
    this.bgUniforms.uDpr.value = this.dpr;
    this.finalPass.uniforms.uRes.value.set(w * this.dpr, h * this.dpr);
  }

  update(dt, scrollY = 0) {
    this.time += dt;
    const t = this.time;
    const s = this.pm.state;
    const pu = this.particles.uniforms;
    const su = this.sim.uniforms;

    su.uSpinFrom.value = SPIN[this.from](t);
    su.uSpinTo.value = SPIN[this.to](t);

    // parallax toward the pointer plus a slow idle drift
    const k = 1 - Math.exp(-dt * 2.5);
    const tx = this.pointer.ndc.y * -0.12 + Math.sin(t * 0.37) * 0.03;
    const ty = this.pointer.ndc.x * 0.2 + Math.sin(t * 0.23) * 0.06;
    this.sway.rotation.x += (tx - this.sway.rotation.x) * k;
    this.sway.rotation.y += (ty - this.sway.rotation.y) * k;

    pu.uTime.value = t;
    pu.uVent.value = s.vent;
    pu.uAtria.value = s.atria;
    pu.uSinceR.value = s.sinceR;
    pu.uBeat.value = s.beat;
    pu.uRR.value = s.rr;

    // pointer ray in the particles' local space
    this.rig.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer.ndc, this.camera);
    this.inverse.copy(this.particles.points.matrixWorld).invert();
    const o = this.tmpO.copy(this.raycaster.ray.origin).applyMatrix4(this.inverse);
    const d = this.tmpD.copy(this.raycaster.ray.direction).transformDirection(this.inverse);
    su.uRayOrigin.value.copy(o);
    su.uRayDir.value.copy(d);
    const p = this.tmpP.copy(o).addScaledVector(d, -o.dot(d));
    if (this.pointer.has && dt > 0) {
      const v = p.clone().sub(this.pointer.prev).divideScalar(Math.max(dt, 1 / 120));
      v.clampLength(0, 6);
      this.pointer.vel.lerp(v, 0.25);
    }
    this.pointer.prev.copy(p);
    this.pointer.has = true;
    const targetForce = this.pointer.inside ? 26 : 0;
    this.pointer.force += (targetForce - this.pointer.force) * (1 - Math.exp(-dt * 6));
    su.uMouseForce.value = this.pointer.force;
    su.uMouseVel.value.copy(this.pointer.vel).multiplyScalar(this.pointer.inside ? 0.12 : 0);

    this.sim.step(Math.min(dt, 1 / 30), t);
    pu.tPos.value = this.sim.texture;

    this.bgUniforms.uScroll.value = scrollY * 0.15;
    this.finalPass.uniforms.uTime.value = t;
    this.composer.render(dt);
  }
}
