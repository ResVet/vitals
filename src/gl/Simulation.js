import { DataTexture, FloatType, HalfFloatType, NearestFilter, RGBAFormat, Vector3, Vector4 } from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import noise from './glsl/noise.glsl?raw';
import velocityShader from './glsl/simVelocity.glsl?raw';
import positionShader from './glsl/simPosition.glsl?raw';

// Ping-pong position and velocity textures, one texel per particle.
export class Simulation {
  constructor(renderer, size, initial, { halfFloat = false } = {}) {
    this.size = size;
    this.gpu = new GPUComputationRenderer(size, size, renderer);
    if (halfFloat) this.gpu.setDataType(HalfFloatType);

    const pos0 = this.gpu.createTexture();
    pos0.image.data.set(initial);
    for (let i = 3; i < pos0.image.data.length; i += 4) pos0.image.data[i] = 1;
    const vel0 = this.gpu.createTexture();

    this.velocity = this.gpu.addVariable('textureVelocity', velocityShader.replace('#include <noise>', noise), vel0);
    this.position = this.gpu.addVariable('texturePosition', positionShader, pos0);
    this.gpu.setVariableDependencies(this.velocity, [this.position, this.velocity]);
    this.gpu.setVariableDependencies(this.position, [this.position, this.velocity]);

    this.uniforms = {
      uTime: { value: 0 },
      uDelta: { value: 1 / 60 },
      uProgress: { value: 1 },
      uOrdered: { value: 0.5 },
      uStiffness: { value: 58 },
      uDamping: { value: 8.5 },
      uTurbulence: { value: 0.035 },
      uFlight: { value: 2.4 },
      tFrom: { value: null },
      tTo: { value: null },
      uSpinFrom: { value: 0 },
      uSpinTo: { value: 0 },
      uRayOrigin: { value: new Vector3(0, 0, 100) },
      uRayDir: { value: new Vector3(0, 0, -1) },
      uMouseForce: { value: 0 },
      uMouseRadius: { value: 0.36 },
      uMouseVel: { value: new Vector3() },
      uImpulse: { value: new Vector4() },
    };
    Object.assign(this.velocity.material.uniforms, this.uniforms);
    const pu = this.position.material.uniforms;
    pu.uDelta = this.uniforms.uDelta;
    pu.uProgress = this.uniforms.uProgress;
    pu.uOrdered = this.uniforms.uOrdered;

    const error = this.gpu.init();
    if (error) throw new Error(error);
  }

  static shapeTexture(data, size) {
    const tex = new DataTexture(data, size, size, RGBAFormat, FloatType);
    tex.minFilter = tex.magFilter = NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  get texture() {
    return this.gpu.getCurrentRenderTarget(this.position).texture;
  }

  step(dt, time) {
    this.uniforms.uDelta.value = dt;
    this.uniforms.uTime.value = time;
    this.gpu.compute();
    this.uniforms.uImpulse.value.w = 0;
  }

  dispose() {
    this.gpu.dispose();
  }
}
