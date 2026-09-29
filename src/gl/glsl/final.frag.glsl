// Last pass before tone mapping: a touch of chromatic aberration toward the
// edges, faint scanlines on the monitor, and film grain.
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uAberration;
uniform float uScanlines;
uniform float uGrain;
varying vec2 vUv;

void main() {
  vec2 d = vUv - 0.5;
  vec2 off = d * dot(d, d) * uAberration;
  vec3 col;
  col.r = texture2D(tDiffuse, vUv + off).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv - off).b;
  float line = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.6);
  col *= 1.0 - uScanlines * (1.0 - line);
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 7.3) * 413.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * uGrain;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
