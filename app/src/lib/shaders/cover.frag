precision highp float;

varying vec2 v_uv;

uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform sampler2D u_noise;
uniform float u_t;
uniform vec2 u_res;
uniform vec2 u_sizeA;
uniform vec2 u_sizeB;
uniform float u_dpr;
uniform vec2 u_noiseSize;

// gradient Perlin noise
vec3 grad3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7,  74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return normalize(2.0 * fract(sin(p) * 43758.5453) - 1.0);
}

float perlin(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float v000 = dot(grad3(i),              f);
  float v100 = dot(grad3(i+vec3(1,0,0)),  f - vec3(1,0,0));
  float v010 = dot(grad3(i+vec3(0,1,0)),  f - vec3(0,1,0));
  float v110 = dot(grad3(i+vec3(1,1,0)),  f - vec3(1,1,0));
  float v001 = dot(grad3(i+vec3(0,0,1)),  f - vec3(0,0,1));
  float v101 = dot(grad3(i+vec3(1,0,1)),  f - vec3(1,0,1));
  float v011 = dot(grad3(i+vec3(0,1,1)),  f - vec3(0,1,1));
  float v111 = dot(grad3(i+vec3(1,1,1)),  f - vec3(1,1,1));

  return mix(
    mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
    mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y),
    u.z
  ) * 0.5 + 0.5;
}

float p5noise(float x, float y, float z) {
  vec3 p = vec3(x, y, z);
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * perlin(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v / 0.9375;
}

vec2 coverUV(vec2 uv, vec2 imgSize) {
  float ca = u_res.x / u_res.y;
  float ia = imgSize.x / imgSize.y;
  vec2 scale = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
  scale *= 0.7;
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec4 colorA = texture2D(u_texA, coverUV(v_uv, u_sizeA));
  vec4 colorB = texture2D(u_texB, coverUV(v_uv, u_sizeB));

  vec2 cssRes = u_res / u_dpr;

  float bnVal = texture2D(u_noise, v_uv * cssRes / u_noiseSize).r;

  vec2 px = v_uv * cssRes * 0.5;
  float noiseVal = p5noise(px.x * 0.001, px.y * 0.001, u_t);

  float useB = noiseVal < u_t + (bnVal - 0.5) * 0.5 ? 1.0 : 0.0;

  gl_FragColor = mix(colorA, colorB, useB);
}
