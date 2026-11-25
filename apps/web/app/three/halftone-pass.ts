import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three'

/** Objects on this layer are printed as halftone dots; everything else stays sharp (layer 0). */
export const HALFTONE_LAYER = 1
/** Dot-screen cell size in CSS pixels. */
export const HALFTONE_CELL_CSS_PX = 5
/** Screen angle (45 degrees, like scripts/halftone.py). */
export const HALFTONE_ANGLE = Math.PI / 4
/** Below this darkness no dot is printed. */
export const HALFTONE_MIN_DARKNESS = 0.01

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Grey whose linear value is `1 - darkness`: what the halftone pass reads back as tone. */
export function toneColor(darkness: number): Color {
  return new Color().setScalar(1 - clamp01(darkness))
}

/** Dot radius for a cell: area ~ darkness * cell^2 (mirrors the fragment shader). */
export function dotRadius(darkness: number, cell: number): number {
  const d = clamp01(darkness)
  return d < HALFTONE_MIN_DARKNESS ? 0 : Math.sqrt(d / Math.PI) * cell
}

const vertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D tTone;
uniform vec2 uResolution;
uniform float uCell;
uniform float uAngle;
uniform float uMinDarkness;
uniform vec3 uInk;

void main() {
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 p = gl_FragCoord.xy;
  // Rotate into screen space, find the cell and its centre.
  vec2 rp = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  vec2 centreR = (floor(rp / uCell) + 0.5) * uCell;
  // Rotate the centre back to pixel space and sample the tone there.
  vec2 centre = vec2(c * centreR.x - s * centreR.y, s * centreR.x + c * centreR.y);
  float darkness = 1.0 - texture2D(tTone, clamp(centre / uResolution, 0.0, 1.0)).r;
  float r = darkness < uMinDarkness ? 0.0 : sqrt(darkness / 3.14159265) * uCell;
  float alpha = darkness < uMinDarkness ? 0.0 : clamp(r - length(rp - centreR) + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(uInk, alpha);
  #include <colorspace_fragment>
}
`

export interface HalftonePass {
  /** Renders the HALFTONE_LAYER objects as dots onto the (cleared) canvas. */
  render: (scene: Scene, camera: OrthographicCamera) => void
  setSize: (drawingBufferW: number, drawingBufferH: number) => void
  dispose: () => void
}

export function createHalftonePass(renderer: WebGLRenderer, ink: number): HalftonePass {
  const target = new WebGLRenderTarget(1, 1)
  const material = new ShaderMaterial({
    uniforms: {
      tTone: { value: target.texture },
      uResolution: { value: new Vector2(1, 1) },
      uCell: { value: HALFTONE_CELL_CSS_PX * renderer.getPixelRatio() },
      uAngle: { value: HALFTONE_ANGLE },
      uMinDarkness: { value: HALFTONE_MIN_DARKNESS },
      uInk: { value: new Color(ink) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const geometry = new PlaneGeometry(2, 2)
  const quad = new Mesh(geometry, material)
  quad.frustumCulled = false
  const quadScene = new Scene()
  quadScene.add(quad)
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const savedColor = new Color()

  return {
    render(scene, camera) {
      const mask = camera.layers.mask
      const savedAlpha = renderer.getClearAlpha()
      renderer.getClearColor(savedColor)

      camera.layers.set(HALFTONE_LAYER)
      renderer.setRenderTarget(target)
      renderer.setClearColor(0xffffff, 1)
      renderer.clear(true, true, false)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)

      renderer.setClearColor(savedColor, savedAlpha)
      renderer.clear(true, true, false)
      renderer.render(quadScene, quadCamera)
      camera.layers.mask = mask
    },
    setSize(w, h) {
      target.setSize(w, h)
      material.uniforms.uResolution!.value.set(w, h)
      material.uniforms.uCell!.value = HALFTONE_CELL_CSS_PX * renderer.getPixelRatio()
    },
    dispose() {
      target.dispose()
      geometry.dispose()
      material.dispose()
    },
  }
}
