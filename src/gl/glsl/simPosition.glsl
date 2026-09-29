// Position pass. Also writes each particle's own morph progress into w so the
// render pass colours it in step with where it actually is.
uniform float uDelta;
uniform float uProgress;
uniform float uOrdered;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  float idx = (floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x)) / (resolution.x * resolution.y);
  float delay = mix(hash12(gl_FragCoord.xy), idx, uOrdered) * 0.6;
  float k = clamp((uProgress - delay) / 0.4, 0.0, 1.0);
  gl_FragColor = vec4(p.xyz + v * uDelta, k);
}
