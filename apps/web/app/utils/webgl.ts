/** True when the browser can create a WebGL context (the 3D rail yard needs it). */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    // Release the probe context right away: browsers cap the number of live contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}
