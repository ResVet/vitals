uniform float uTheme;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  if (uTheme < 0.5) {
    // additive glow on the dark monitor
    gl_FragColor = vec4(vColor, exp(-r2 * 4.2) * vAlpha);
  } else {
    // stippled ink on paper: firm dots, multiplied into the page
    float a = (1.0 - smoothstep(0.35, 0.9, r2)) * vAlpha;
    gl_FragColor = vec4(mix(vec3(1.0), vColor, clamp(a, 0.0, 1.0)), 1.0);
  }
}
