import { buildSculpture, type HologramSculpture } from "./sculpture";

export const DROP_SECONDS = 3.28;
export const SETTLED_SECONDS = 1.35;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in float material;
uniform vec2 uYaw;
uniform vec2 uPitch;
uniform vec2 uScale;
uniform vec3 uPixels;
uniform float uTime;
uniform float uDrop;
uniform bool uDepthOnly;
uniform bool uDetached;
out vec4 vLight;

vec3 rotate(vec3 point) {
  vec3 turn = vec3(uYaw.x * point.x + uYaw.y * point.z, point.y, uYaw.x * point.z - uYaw.y * point.x);
  return vec3(turn.x, uPitch.x * turn.y - uPitch.y * turn.z, uPitch.y * turn.y + uPitch.x * turn.z);
}

vec4 project(vec3 turned) {
  return vec4(turned.xy * uScale, -.29 * turned.z, 1. - .085 * turned.z);
}

void main() {
  if (uDepthOnly) {
    gl_Position = project(rotate(position));
    gl_PointSize = 1.;
    vLight = vec4(0.);
    return;
  }

  uint bits = uint(gl_VertexID) * 2246822519u + 3266489917u;
  bits = (bits ^ (bits >> 16u)) * 668265263u;
  float seed = float(bits >> 16u) / 65535.;
  float rank = float(bits & 65535u) / 65535.;
  float phase = seed * 48.;
  float moving = step(.001, uTime);
  float twinkle = cos(phase + uTime * (1.4 + 1.6 * seed));
  vec3 jitter = .006 * vec3(sin(phase * 1.39), cos(phase * 2.63), seed - .5);
  vec3 point = rotate(position + jitter + moving * .006 * vec3(twinkle, sin(phase + uTime * 1.6), 0.));
  float scattered = 0.;
  if (uDrop >= 0.) {
    float t = max(0., uDrop - (.21 * seed + .045 * (position.y + .6)));
    float floorY = min(point.y, -1.42 - .04 * point.z + .16 * rank * rank);
    float gravity = 10.;
    float impact = sqrt(2. * gravity * (point.y - floorY));
    float sinceHit = max(0., t - impact / gravity);
    float rebound = max(0., sinceHit * (impact * .22 - .5 * gravity * sinceHit));
    vec3 dropped = point;
    dropped.y = max(floorY, point.y - .5 * gravity * t * t) + rebound;
    vec2 drift = vec2(cos(phase * 2.89), sin(phase * 2.89));
    dropped.xz += (.14 + .19 * rank) * (1. - exp(-3. * t)) * drift;
    float riseStart = 1.89 + .36 * clamp(.3 + .48 * position.y + .39 * rank, 0., 1.);
    float rise = smoothstep(riseStart, riseStart + .93, uDrop);
    float gap = distance(dropped, point) * (1. - rise);
    point = mix(dropped, point, rise);
    scattered = smoothstep(0., .26, t) * smoothstep(.018, .085, gap);
  }

  gl_Position = project(point);
  gl_Position.z -= .010 * gl_Position.w;

  vec3 n = rotate(normal);
  if (material < 0. && n.z < 0.) n = -n;
  float key = max(0., dot(n, vec3(-.40, .56, .72)));
  float fill = max(0., dot(n, vec3(.75, -.26, .60)));
  float edge = 1. - abs(n.z);
  float light = clamp(abs(material) * (.39 + .79 * key + .28 * fill + .25 * edge * edge), 0., 1.);
  float front = .06 + .94 * smoothstep(-.20, .46, n.z);
  float detail = uPixels.z;
  float energy = clamp((light * (.76 + .43 * seed) + moving * .085 * twinkle * pow(seed, 4.)) * mix(1.42, 1.12, detail), .015, 1.);
  float tone = mix(.56, 1., smoothstep(.18, .83, energy));
  float density = mix(.45, 1., detail);
  float visible = 1. - smoothstep(density, density + .12, rank);
  float intensity = uDetached ? (.31 + .26 * seed) * scattered : energy * front * (1. - scattered);
  vLight = vec4(vec3(tone), intensity * visible);
  float size = (.78 + .32 * seed + .23 * light) * (1.06 - .28 * edge);
  gl_PointSize = max(mix(.91, 1.18, detail) * uPixels.y, .018 * uPixels.x * size / gl_Position.w);
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec4 vLight;
uniform bool uDepthOnly;
out vec4 outColor;

void main() {
  if (uDepthOnly) return;
  vec2 square = abs(gl_PointCoord - .5);
  float coverage = 1. - smoothstep(.27, .50, max(square.x, square.y));
  float alpha = vLight.a * coverage;
  if (alpha < .012) discard;
  outColor = vec4(vLight.rgb * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, stage: number, source: string) {
  const shader = gl.createShader(stage);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

let sculpture: HologramSculpture | undefined;

export function makeProjection(gl: WebGL2RenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  const pointArray = gl.createVertexArray();
  const depthArray = gl.createVertexArray();
  const pointBuffer = gl.createBuffer();
  const depthBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  function dispose() {
    gl.deleteProgram(program);
    gl.deleteVertexArray(pointArray);
    gl.deleteVertexArray(depthArray);
    gl.deleteBuffer(pointBuffer);
    gl.deleteBuffer(depthBuffer);
    gl.deleteBuffer(indexBuffer);
  }

  if (!vertex || !fragment || !program || !pointArray || !depthArray || !pointBuffer || !depthBuffer || !indexBuffer) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    dispose();
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!linked) {
    dispose();
    return null;
  }

  const { points, surface, indices } = sculpture ??= buildSculpture();
  const stride = 7 * Float32Array.BYTES_PER_ELEMENT;

  gl.bindVertexArray(depthArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, depthBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, surface, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(pointArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.useProgram(program);
  const yawLocation = gl.getUniformLocation(program, "uYaw");
  const pitchLocation = gl.getUniformLocation(program, "uPitch");
  const scaleLocation = gl.getUniformLocation(program, "uScale");
  const pixelsLocation = gl.getUniformLocation(program, "uPixels");
  const depthOnlyLocation = gl.getUniformLocation(program, "uDepthOnly");
  const detachedLocation = gl.getUniformLocation(program, "uDetached");
  const timeLocation = gl.getUniformLocation(program, "uTime");

  const dropLocation = gl.getUniformLocation(program, "uDrop");
  let screenWidth = 0;
  let screenHeight = 0;
  let scale = 1;
  let hitRadius = 1;

  return {
    resize(width: number, height: number, dpr: number) {
      screenWidth = width;
      screenHeight = height;
      scale = Math.min(width / 3.75, height / 3.56, 154 * dpr);
      hitRadius = 7 * dpr / scale;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(scaleLocation, 2 * scale / width, 2 * scale / height);
      const fraction = Math.max(0, Math.min(1, (scale / dpr - 19) / 36));
      const detail = fraction * fraction * (3 - 2 * fraction);
      gl.uniform3f(pixelsLocation, scale, dpr, detail);
    },
    hits(x: number, y: number, yaw: number, pitch: number) {
      const targetX = x * screenWidth / scale;
      const targetY = y * screenHeight / scale;
      const cosine = Math.cos(yaw);
      const sine = Math.sin(yaw);
      const tilt = Math.cos(pitch);
      const lift = Math.sin(pitch);
      for (let index = 0; index < points.length; index += 7) {
        const px = points[index]!;
        const py = points[index + 1]!;
        const pz = points[index + 2]!;
        const z = cosine * pz - sine * px;
        const perspective = 1 - .085 * (lift * py + tilt * z);
        const dx = (cosine * px + sine * pz) - targetX * perspective;
        const dy = (tilt * py - lift * z) - targetY * perspective;
        if (dx * dx + dy * dy < hitRadius * hitRadius) return true;
      }
      return false;
    },
    draw(yaw: number, pitch: number, time: number, drop: number) {
      gl.uniform2f(yawLocation, Math.cos(yaw), Math.sin(yaw));
      gl.uniform2f(pitchLocation, Math.cos(pitch), Math.sin(pitch));
      gl.uniform1f(timeLocation, time);
      gl.uniform1f(dropLocation, drop);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1i(depthOnlyLocation, 1);
      gl.colorMask(false, false, false, false);
      gl.bindVertexArray(depthArray);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      gl.colorMask(true, true, true, true);
      gl.uniform1i(depthOnlyLocation, 0);
      gl.uniform1i(detachedLocation, 0);
      gl.bindVertexArray(pointArray);
      gl.drawArrays(gl.POINTS, 0, points.length / 7);
      if (drop >= 0) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniform1i(detachedLocation, 1);
        gl.drawArrays(gl.POINTS, 0, points.length / 7);
      }
    },
    dispose,
  };
}
