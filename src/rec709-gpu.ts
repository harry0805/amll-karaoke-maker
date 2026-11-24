import { makeRec709Sample } from './rec709-frame';

const vertexSource = `#version 300 es
void main() {
  // One triangle covers the entire framebuffer.
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D rgb;
out vec4 packedBytes;

const vec3 weights = vec3(0.2126, 0.7152, 0.0722);

vec3 pixel(ivec2 p) {
  return texelFetch(rgb, ivec2(min(p.x, textureSize(rgb, 0).x - 1), p.y), 0).rgb;
}

float yCode(ivec2 p) {
  return 16.0 + 219.0 * dot(weights, pixel(p));
}

vec2 uvCodes(ivec2 p) {
  vec3 average = (pixel(p) + pixel(p + ivec2(1, 0)) +
                  pixel(p + ivec2(0, 1)) + pixel(p + ivec2(1, 1))) * 0.25;
  float y = dot(weights, average);
  return vec2(128.0) + 112.0 * (average.br - vec2(y)) /
                       (vec2(1.0) - weights.br);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int height = textureSize(rgb, 0).y;
  int x = p.x * 4;
  // Each RGBA pixel stores four luma bytes or two interleaved chroma pairs.
  if (p.y < height) {
    packedBytes = vec4(yCode(ivec2(x, p.y)), yCode(ivec2(x + 1, p.y)),
                       yCode(ivec2(x + 2, p.y)), yCode(ivec2(x + 3, p.y))) / 255.0;
  } else {
    int y = (p.y - height) * 2;
    packedBytes = vec4(uvCodes(ivec2(x, y)), uvCodes(ivec2(x + 2, y))) / 255.0;
  }
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

/** Convert on the GPU, then download only the packed YUV bytes needed by WebCodecs. */
export function createRec709Packer(width: number, height: number) {
  const output = document.createElement('canvas');
  const packedWidth = (output.width = Math.ceil(width / 4));
  const packedHeight = (output.height = height + height / 2);
  const gl = output.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl || gl.drawingBufferWidth !== packedWidth || gl.drawingBufferHeight !== packedHeight)
    return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const dispose = () => {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.deleteTexture(texture);
    output.width = output.height = 0;
  };
  if (!vertex || !fragment || !program || !texture) {
    dispose();
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    dispose();
    return null;
  }

  gl.useProgram(program);
  gl.disable(gl.DITHER);
  gl.viewport(0, 0, packedWidth, packedHeight);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  if (gl.getError() !== gl.NO_ERROR) {
    dispose();
    return null;
  }

  const stride = packedWidth * 4;
  const layout = [
    { offset: 0, stride },
    { offset: stride * height, stride },
  ];
  return {
    dispose,
    pack(canvas: HTMLCanvasElement, timestamp: number, duration: number) {
      if (gl.isContextLost()) return null;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const planes = new Uint8Array(stride * packedHeight);
      gl.readPixels(0, 0, packedWidth, packedHeight, gl.RGBA, gl.UNSIGNED_BYTE, planes);
      if (gl.getError() !== gl.NO_ERROR) return null;
      try {
        return makeRec709Sample(planes, {
          format: 'NV12',
          codedWidth: width,
          codedHeight: height,
          layout,
          timestamp,
          duration,
        });
      } catch (error) {
        if (!(error instanceof DOMException || error instanceof TypeError)) throw error;
        return null;
      }
    },
  };
}
