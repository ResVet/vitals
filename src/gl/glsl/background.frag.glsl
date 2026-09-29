// Full-screen backdrop: a dark monitor with a faint grid, or ECG paper with
// 1 mm and 5 mm squares. uTheme crossfades between the two.
uniform vec2 uRes;
uniform float uDpr;
uniform float uTheme;
uniform float uScroll;
uniform vec3 uMonA;
uniform vec3 uMonB;
uniform vec3 uMonGrid;
uniform vec3 uPaper;
uniform vec3 uGridMinor;
uniform vec3 uGridMajor;

float gridLine(vec2 p, float spacing, float width) {
  vec2 d = abs(fract(p / spacing + 0.5) - 0.5) * spacing;
  vec2 l = 1.0 - smoothstep(vec2(width * 0.5), vec2(width * 0.5 + 1.0), d);
  return max(l.x, l.y);
}

void main() {
  vec2 css = gl_FragCoord.xy / uDpr;
  css.y += uScroll;
  vec2 uv = gl_FragCoord.xy / uRes;
  float minor = gridLine(css, 8.0, 0.8);
  float major = gridLine(css, 40.0, 1.2);
  float vig = 1.0 - smoothstep(0.25, 1.05, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 0.9);

  vec3 mon = mix(uMonA, uMonB, vig);
  mon += uMonGrid * (minor * 0.28 + major * 0.75) * (0.35 + 0.65 * vig);

  vec3 pap = uPaper * mix(0.93, 1.0, vig);
  pap = mix(pap, uGridMinor, minor * 0.42);
  pap = mix(pap, uGridMajor, major * 0.55);

  gl_FragColor = vec4(mix(mon, pap, uTheme), 1.0);
}
