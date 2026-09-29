// Velocity pass. Every particle is pulled toward a target that slides from
// its point in shape A to its point in shape B, gets pushed around by curl
// noise while in flight, and is shoved aside by the mouse ray.
uniform float uTime;
uniform float uDelta;
uniform float uProgress;
uniform float uOrdered;
uniform float uStiffness;
uniform float uDamping;
uniform float uTurbulence;
uniform float uFlight;
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform float uSpinFrom;
uniform float uSpinTo;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform float uMouseForce;
uniform float uMouseRadius;
uniform vec3 uMouseVel;
uniform vec4 uImpulse;

#include <noise>

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 spinY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  float idx = (floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x)) / (resolution.x * resolution.y);
  float rnd = hash12(gl_FragCoord.xy);
  float delay = mix(rnd, idx, uOrdered) * 0.6;
  float k = clamp((uProgress - delay) / 0.4, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  float flight = sin(3.14159265 * k);

  vec3 a = spinY(texture2D(tFrom, uv).xyz, uSpinFrom);
  vec3 b = spinY(texture2D(tTo, uv).xyz, uSpinTo);
  vec3 target = mix(a, b, e);

  vec3 acc = (target - pos) * uStiffness * mix(1.0, 0.3, flight);
  acc += curlNoise(pos * 0.6 + vec3(0.0, uTime * 0.08, rnd * 0.2)) * (uTurbulence + flight * uFlight);

  // Mouse: distance from the particle to the pointer ray.
  vec3 w = pos - uRayOrigin;
  vec3 perp = w - uRayDir * dot(w, uRayDir);
  float d = length(perp);
  float fall = 1.0 - smoothstep(0.0, uMouseRadius, d);
  fall *= fall;
  acc += (perp / max(d, 1e-4)) * fall * uMouseForce;
  acc += uMouseVel * fall * 7.0;

  // One-frame radial kick (clicks).
  vec3 q = pos - uImpulse.xyz;
  float qd = length(q);
  vel += (q / max(qd, 1e-4)) * uImpulse.w * exp(-qd * 2.2) * (0.6 + rnd * 0.8);

  vel += acc * uDelta;
  vel *= exp(-uDamping * uDelta);
  gl_FragColor = vec4(vel, 1.0);
}
