// Particle render pass. Positions come from the simulation texture; colour,
// size and the travelling pulses come from whichever shapes the particle is
// moving between. The heartbeat is applied here (not in the simulation) so it
// stays locked to the ECG.
uniform sampler2D tPos;
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform sampler2D tPal;
uniform int uFromId;
uniform int uToId;
uniform float uTime;
uniform float uSize;
uniform float uViewportH;
uniform float uTheme;
uniform float uOpacity;
uniform float uDensity;

uniform float uVent;
uniform float uAtria;
uniform float uSinceR;
uniform float uBeat;
uniform float uRR;
uniform vec3 uHeartBase;
uniform vec3 uHeartAxis;
uniform vec3 uAtriaCenter;

uniform float uIntroX;
uniform float uIntroAmp;
uniform float uScan;
uniform vec3 uInk;

attribute vec2 aRef;
attribute float aRnd;

varying vec3 vColor;
varying float vAlpha;

#define FLATLINE 0
#define HEART 1
#define DNA 2
#define NEURON 3
#define CHIP 4
#define GLOBE 5

vec4 palColor(int shape, float cls) { return texelFetch(tPal, ivec2(int(cls), shape), 0); }
vec4 palExtra(int shape, float cls) { return texelFetch(tPal, ivec2(int(cls), shape + 6), 0); }

float bump(float x, float w) { return exp(-(x * x) / (w * w)); }

// A PQRST complex drawn along x (world units), centred on the R wave.
float complexShape(float x) {
  return 0.13 * bump(x + 0.52, 0.08) - 0.14 * bump(x + 0.07, 0.03) + 1.0 * bump(x, 0.035) - 0.3 * bump(x - 0.065, 0.03) + 0.26 * bump(x - 0.46, 0.11);
}

vec3 heartbeat(vec3 p, float cls) {
  vec3 rel = p - uHeartBase;
  float ax = dot(rel, uHeartAxis);
  vec3 radial = rel - uHeartAxis * ax;
  float h = clamp(ax / 1.9, 0.0, 1.0); // 0 at the base, 1 at the apex
  vec3 o = vec3(0.0);
  if (cls < 1.5 || (cls > 6.5 && cls < 7.5)) {
    // ventricles and coronaries: squeeze, base descends, and the apex twists
    float c = uVent;
    o -= radial * c * (0.05 + 0.1 * h * (1.0 - h) * 2.0);
    o += uHeartAxis * (1.0 - h) * 0.075 * c;
    float ang = c * 0.2 * (h - 0.35);
    vec3 tang = cross(uHeartAxis, radial);
    o += radial * (cos(ang) - 1.0) + tang * sin(ang);
  } else if (cls < 2.5) {
    // atria: contract after the P wave, refill while the ventricles eject
    vec3 r = p - uAtriaCenter;
    o += -r * 0.09 * uAtria + r * 0.035 * uVent;
  } else if (cls < 4.5) {
    // great arteries swell slightly as the stroke volume arrives
    o += radial * 0.02 * smoothstep(0.05, 0.2, uSinceR) * (1.0 - smoothstep(0.3, 0.6, uSinceR));
  }
  return o;
}

float pulse(int shape, float cls, float s) {
  if (shape == FLATLINE) {
    float x = (s / 99.0 * 2.0 - 1.0) * 4.2;
    return bump(x - uIntroX, 0.5) * 1.2 * uIntroAmp;
  }
  if (shape == HEART) {
    if (cls < 1.5) return uBeat * 0.55;
    if (cls < 2.5) return uAtria * 0.5;
    if (cls < 4.5) {
      // pressure wave running up the aorta and pulmonary trunk after ejection
      float t = uSinceR - 0.07;
      float front = max(t, 0.0) * 42.0;
      return bump(s - front, 3.2) * 1.5 * step(0.0, t);
    }
    if (cls > 6.5 && cls < 7.5) {
      // coronary arteries fill in diastole, after the T wave
      float t = uSinceR - 0.33;
      float front = max(t, 0.0) * 30.0;
      return 0.1 + bump(s - front, 3.5) * 1.1 * step(0.0, t);
    }
    return 0.0;
  }
  if (shape == DNA) {
    float d = s - uScan;
    float g = bump(d, 0.75);
    return (cls > 1.5 && cls < 5.5) ? g * 1.8 : g * 0.9;
  }
  if (shape == NEURON) {
    // an action potential leaves the soma on every beat; dendrites carry
    // input the other way
    if (cls > 3.5 && cls < 6.5) {
      float front = uSinceR * 34.0;
      return bump(s - front, 1.8) * (cls > 4.5 && cls < 5.5 ? 0.5 : 2.0);
    }
    if (cls > 1.5 && cls < 3.5) {
      float inward = 30.0 - uSinceR * 38.0;
      return bump(s - inward, 2.4) * 1.0;
    }
    if (cls < 1.5) return uBeat * 0.9;
    return 0.0;
  }
  if (shape == CHIP) {
    if (cls > 4.5 && cls < 6.5) {
      float lane = floor(s / 25.0);
      float local = s - lane * 25.0;
      float packets = pow(max(0.0, sin(local * 0.6 - uTime * (5.0 + lane) + lane * 2.1)), 20.0);
      return packets * 1.1 + bump(local - uSinceR * 34.0, 1.8) * 1.4;
    }
    if (cls > 6.5 && cls < 7.5) return bump(s - fract(uTime * 0.2) * 110.0 + 5.0, 6.0) * 1.6;
    if (cls > 2.5 && cls < 3.5) return 0.2 + uBeat * 0.9;
    if (cls > 3.5 && cls < 4.5) return uBeat * 0.6;
    return 0.0;
  }
  if (shape == GLOBE) {
    if (cls > 3.5 && cls < 4.5) {
      float ring = floor(s / 30.0);
      float ph = fract(uTime * 0.55 - ring * 0.22);
      return (1.0 - ph) * (1.0 - ph) * 1.6;
    }
    if (cls > 4.5 && cls < 5.5) return bump(s - (fract(uTime * 0.26) * 72.0 - 6.0), 4.0) * 1.9;
    if (cls > 2.5 && cls < 3.5) return 0.4 + uBeat * 1.4;
    if (cls > 6.5) return uBeat * 0.8;
    return 0.0;
  }
  return 0.0;
}

// Globe points on the far hemisphere fade out so the continents read clearly.
float globeFacing(vec3 p, float cls) {
  if (cls > 5.5 && cls < 6.5) return 1.0; // atmosphere keeps the full rim
  vec3 n = normalize(normalMatrix * normalize(p));
  vec3 v = normalize(-(modelViewMatrix * vec4(p, 1.0)).xyz);
  float f = dot(n, v);
  return cls > 4.5 && cls < 5.5 ? smoothstep(-0.35, 0.1, f) : smoothstep(-0.02, 0.22, f);
}

void main() {
  vec4 P = texture2D(tPos, aRef);
  vec3 pos = P.xyz;
  vec4 A = texture2D(tFrom, aRef);
  vec4 B = texture2D(tTo, aRef);

  float k = P.w;
  float e = k * k * (3.0 - 2.0 * k);
  float flight = sin(3.14159265 * k);

  float cA = floor(A.w / 100.0);
  float sA = A.w - cA * 100.0;
  float cB = floor(B.w / 100.0);
  float sB = B.w - cB * 100.0;

  float wHeart = (uFromId == HEART ? 1.0 - e : 0.0) + (uToId == HEART ? e : 0.0);
  if (wHeart > 0.001) pos += heartbeat(pos, uFromId == HEART ? cA : cB) * wHeart;

  float wFlat = (uFromId == FLATLINE ? 1.0 - e : 0.0) + (uToId == FLATLINE ? e : 0.0);
  if (wFlat > 0.001) {
    float sF = uFromId == FLATLINE ? sA : sB;
    float x = (sF / 99.0 * 2.0 - 1.0) * 4.2;
    pos.y += complexShape(x - uIntroX) * uIntroAmp * wFlat;
  }

  vec4 colA = palColor(uFromId, cA);
  vec4 colB = palColor(uToId, cB);
  vec4 exA = palExtra(uFromId, cA);
  vec4 exB = palExtra(uToId, cB);
  float gA = pulse(uFromId, cA, sA) * exA.y;
  float gB = pulse(uToId, cB, sB) * exB.y;
  float g = mix(gA, gB, e);

  if (uFromId == GLOBE) colA.a *= globeFacing(pos, cA);
  if (uToId == GLOBE) colB.a *= globeFacing(pos, cB);
  vec3 base = mix(colA.rgb, colB.rgb, e);
  float alpha = mix(colA.a, colB.a, e);
  float sizeMul = mix(exA.x, exB.x, e);

  vec3 col;
  if (uTheme < 0.5) {
    col = base * (1.0 + g) + vec3(g * g * 0.08);
    alpha *= 1.0 + g * 0.5;
  } else {
    col = mix(base, uInk, clamp(g * 0.45, 0.0, 0.8));
    alpha *= 1.0 + g * 0.7;
  }
  alpha *= 1.0 + flight * 0.6;
  alpha *= 0.82 + 0.18 * sin(uTime * (0.8 + aRnd * 2.6) + aRnd * 57.0);
  sizeMul *= 1.0 + g * 0.18 + flight * 0.25;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(0.1, -mv.z);
  float fog = smoothstep(10.5, 4.2, depth);
  vColor = col;
  vAlpha = alpha * mix(0.3, 1.0, fog) * uOpacity * uDensity;
  float size = uSize * sizeMul * (0.55 + 0.9 * fract(aRnd * 7.31)) * mix(1.0, 1.2, clamp(uDensity - 1.0, 0.0, 1.0));
  gl_PointSize = max(1.0, size * uViewportH * 0.5 * projectionMatrix[1][1] / depth);
}
