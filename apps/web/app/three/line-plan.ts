import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { CheckStatus } from '@switchyard/plugin-sdk'
import { createHalftonePass, HALFTONE_LAYER, toneColor } from '~/three/halftone-pass'
import type { LinePlanLayout, Point2 } from '~/three/line-plan-layout'

export type LinePlanView = 'persp' | 'plan'

export interface LinePlanOptions {
  layout: LinePlanLayout
  selectedId: string | null
  reducedMotion: boolean
  onPick?: (id: string) => void
  /** Initial camera preset (default: perspective). */
  view?: LinePlanView
}

export interface LinePlanController {
  setView: (view: LinePlanView) => void
  setSelected: (id: string | null) => void
  /** Projects a ground point to CSS pixels inside the canvas. */
  project: (x: number, z: number) => { x: number; y: number }
  /** Called whenever the camera moved or the size changed, so labels must be re-projected. */
  onChange: (cb: () => void) => () => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

// Tunables.
const BLUE = 0x1b3a8c
const PAPER = 0xf4f1e8
const RED = 0xc0392b
const STATUS_COLORS: Record<CheckStatus, [light: number, dark: number]> = {
  ok: [0x2f7d4a, 0x1f5a34],
  warning: [0xd9822b, 0xa35e17],
  error: [0xc0392b, 0x8e2a1f],
  unknown: [0x8a90a6, 0x5f6478],
}
const VIEWS: Record<LinePlanView, { elev: number; azim: number }> = {
  persp: { elev: 38, azim: -22 },
  plan: { elev: 89, azim: 0 },
}
const AZIM_LIMIT = 60
const ELEV_MIN = 28
const ELEV_MAX = 89
/** World units of horizontal / vertical margin around the bounds (room for labels and tags). */
const PAD_X = 1.6
const PAD_Z = 2
const MIN_SPAN_X = 6
const MIN_SPAN_Z = 3
/** Extra world units of ground tint around the padded bounds. */
const TINT_MARGIN_X = 2.6
const TINT_MARGIN_Z = 1
/** Halftone darkness (0..1) of the decor layers. */
const TINT_DARKNESS = 0.12
const EMBANKMENT_DARKNESS = 0.3
const EMBANKMENT_WIDTH = 0.55
const STATION_HALO_DARKNESS = 0.35
const STATION_HALO_RADIUS = 0.6
const DIM_DARKNESS = 0.45
const CLICK_SLOP = 5
const PACKET_SPACING = 1.8
const PACKET_SPEED = 1
const CUT_FADE = 0.5
const FALLBACK_SIZE = { w: 960, h: 460 }

interface PacketPath {
  segs: { a: Point2; b: Point2; len: number; start: number }[]
  total: number
}

function toPacketPath(points: Point2[]): PacketPath {
  const segs: PacketPath['segs'] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-6) continue
    segs.push({ a, b, len, start: total })
    total += len
  }
  return { segs, total }
}

function pointAt(path: PacketPath, d: number) {
  const last = path.segs[path.segs.length - 1]!
  const seg = path.segs.find((s) => d <= s.start + s.len) ?? last
  const t = Math.min(1, Math.max(0, (d - seg.start) / seg.len))
  return {
    x: seg.a[0] + (seg.b[0] - seg.a[0]) * t,
    z: seg.a[1] + (seg.b[1] - seg.a[1]) * t,
    angle: -Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]),
  }
}

interface Packet {
  mesh: Mesh<BoxGeometry, MeshBasicMaterial>
  offset: number
}
interface PacketFlow {
  path: PacketPath
  speed: number
  cut: number | null
  items: Packet[]
}

/**
 * The 3D "plan de ligne": flat tracks and two-tone station rings, sharp and in colour. Decor
 * (ground tint, embankments, station halos, dimmed tracks) is drawn as a screen-space blue
 * halftone underneath, see halftone-pass.ts.
 */
export function createLinePlan(
  canvas: HTMLCanvasElement,
  options: LinePlanOptions,
): LinePlanController {
  const { layout, reducedMotion, onPick } = options
  const bounds = layout.bounds
  const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 }
  const spanX = Math.max(bounds.maxX - bounds.minX + PAD_X, MIN_SPAN_X)
  const spanZ = Math.max(bounds.maxZ - bounds.minZ + PAD_Z, MIN_SPAN_Z)

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0xffffff, 0)
  renderer.autoClear = false
  const halftone = createHalftonePass(renderer, BLUE)
  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
  canvas.style.touchAction = 'pan-y'
  canvas.style.cursor = 'grab'

  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const basic = (color: number, extra: ConstructorParameters<typeof MeshBasicMaterial>[0] = {}) => {
    const m = new MeshBasicMaterial({ color, ...extra })
    materials.push(m)
    return m
  }
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g)
    return g
  }

  // Halftone decor: tone materials are grey, the pass turns darkness into dot size.
  const tone = (darkness: number) => {
    const m = new MeshBasicMaterial({ color: toneColor(darkness) })
    materials.push(m)
    return m
  }
  const decor = <T extends Mesh>(mesh: T): T => {
    mesh.layers.set(HALFTONE_LAYER)
    scene.add(mesh)
    return mesh
  }

  // Ground tint: faint screen fading out toward the edges, like a printed map.
  const tintMaterial = new ShaderMaterial({
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv;void main(){
      vec2 e=min(vUv,1.0-vUv);
      float f=smoothstep(0.0,0.35,min(e.x,e.y));
      gl_FragColor=vec4(vec3(1.0-${TINT_DARKNESS.toFixed(3)}*f),1.0);}`,
  })
  materials.push(tintMaterial)
  const tint = decor(
    new Mesh(geo(new PlaneGeometry(spanX + TINT_MARGIN_X, spanZ + TINT_MARGIN_Z)), tintMaterial),
  )
  tint.rotation.x = -Math.PI / 2
  tint.position.set(center.x, -0.02, center.z)

  const embankmentMaterial = tone(EMBANKMENT_DARKNESS)
  const embankment = (a: Point2, b: Point2) => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const mesh = decor(
      new Mesh(
        geo(new BoxGeometry(Math.hypot(dx, dz), 0.01, EMBANKMENT_WIDTH)),
        embankmentMaterial,
      ),
    )
    mesh.position.set((a[0] + b[0]) / 2, -0.01, (a[1] + b[1]) / 2)
    mesh.rotation.y = -Math.atan2(dz, dx)
  }
  const haloGeometry = geo(new CylinderGeometry(STATION_HALO_RADIUS, STATION_HALO_RADIUS, 0.01, 48))
  const haloMaterial = tone(STATION_HALO_DARKNESS)
  const dimMaterial = tone(DIM_DARKNESS)

  const bar = (a: Point2, b: Point2, material: MeshBasicMaterial, width = 0.13) => {
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const mesh = new Mesh(geo(new BoxGeometry(Math.hypot(dx, dz), 0.07, width)), material)
    mesh.position.set((a[0] + b[0]) / 2, 0.035, (a[1] + b[1]) / 2)
    mesh.rotation.y = -Math.atan2(dz, dx)
    if (material === dimMaterial) decor(mesh)
    else scene.add(mesh)
  }
  const jointGeometry = geo(new CylinderGeometry(0.065, 0.065, 0.07, 24))
  const blueMaterial = basic(BLUE)
  const joint = (p: Point2, material: MeshBasicMaterial) => {
    const mesh = new Mesh(jointGeometry, material)
    mesh.position.set(p[0], 0.035, p[1])
    if (material === dimMaterial) decor(mesh)
    else scene.add(mesh)
  }

  // Tracks: blue, dimmed during an incident, red dashes (blinking) when broken.
  const incidentMode = layout.tracks.some((t) => t.dim)
  const brokenMaterial = basic(RED, { transparent: true, opacity: 1 })
  for (const track of layout.tracks) {
    for (let i = 0; i < track.points.length - 1; i++) {
      const a = track.points[i]!
      const b = track.points[i + 1]!
      // Dimmed tracks get no embankment: their own faded dots must stand out from the tint.
      if (!track.dim) embankment(a, b)
      if (!track.broken) {
        bar(a, b, track.dim ? dimMaterial : blueMaterial)
        continue
      }
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const len = Math.hypot(dx, dz)
      for (let n = 0; n < Math.floor(len / 0.24); n++) {
        const t0 = (n * 0.24 + 0.05) / len
        const t1 = Math.min((n * 0.24 + 0.19) / len, 1)
        const dash = new Mesh(geo(new BoxGeometry((t1 - t0) * len, 0.06, 0.11)), brokenMaterial)
        dash.position.set(a[0] + dx * ((t0 + t1) / 2), 0.03, a[1] + dz * ((t0 + t1) / 2))
        dash.rotation.y = -Math.atan2(dz, dx)
        scene.add(dash)
      }
    }
  }
  for (const j of layout.joints) {
    const on = layout.tracks.filter((t) =>
      t.points.some((p) => Math.abs(p[0] - j[0]) < 1e-6 && Math.abs(p[1] - j[1]) < 1e-6),
    )
    if (on.length > 0 && on.every((t) => t.broken)) continue
    joint(j, on.length > 0 && on.every((t) => t.dim) ? dimMaterial : blueMaterial)
  }

  // Stations: two-tone status ring around a paper disc.
  const outerGeometry = geo(new CylinderGeometry(0.3, 0.3, 0.18, 48))
  const innerGeometry = geo(new CylinderGeometry(0.16, 0.16, 0.2, 48))
  const innerMaterials = [basic(0xe2dccb), basic(PAPER), basic(PAPER)]
  const pulseGeometry = geo(new RingGeometry(0.3, 0.34, 64))
  const pulses: Mesh<RingGeometry, MeshBasicMaterial>[] = []
  const pickable: Mesh[] = []
  const stationPos = new Map<string, Point2>()
  for (const s of layout.stations) {
    const [light, dark] = STATUS_COLORS[s.status]
    stationPos.set(s.id, [s.x, s.z])
    decor(new Mesh(haloGeometry, haloMaterial)).position.set(s.x, -0.005, s.z)
    const outer = new Mesh(outerGeometry, [basic(dark), basic(light), basic(dark)])
    outer.position.set(s.x, 0.09, s.z)
    outer.userData.stationId = s.id
    scene.add(outer)
    pickable.push(outer)
    const inner = new Mesh(innerGeometry, innerMaterials)
    inner.position.set(s.x, 0.1, s.z)
    scene.add(inner)
    if (s.status === 'error') {
      const pulse = new Mesh(
        pulseGeometry,
        basic(RED, { transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false }),
      )
      pulse.rotation.x = -Math.PI / 2
      pulse.position.set(s.x, 0.01, s.z)
      scene.add(pulse)
      pulses.push(pulse)
    }
  }

  // Selection ring on the ground, moved by setSelected.
  const selectedRing = new Mesh(
    geo(new RingGeometry(0.42, 0.46, 64)),
    basic(BLUE, { side: DoubleSide }),
  )
  selectedRing.rotation.x = -Math.PI / 2
  selectedRing.visible = false
  scene.add(selectedRing)
  function setSelected(id: string | null) {
    const p = id === null ? undefined : stationPos.get(id)
    selectedRing.visible = !!p
    if (p) selectedRing.position.set(p[0], 0.005, p[1])
    requestFrame()
  }

  // Packets flowing along the lines.
  const packetGeometry = geo(new BoxGeometry(0.18, 0.09, 0.09))
  const packetFlows: PacketFlow[] = []
  for (const flow of layout.flows) {
    const path = toPacketPath(flow.points)
    if (path.total < 0.2) continue
    const count = Math.max(2, Math.round(path.total / PACKET_SPACING))
    const color = flow.broken ? RED : incidentMode ? BLUE : 0xffffff
    const items: Packet[] = []
    for (let i = 0; i < count; i++) {
      const mesh = new Mesh(packetGeometry, basic(color, { transparent: true, opacity: 1 }))
      scene.add(mesh)
      items.push({ mesh, offset: (i / count) * path.total })
    }
    packetFlows.push({
      path,
      speed: PACKET_SPEED,
      cut: flow.broken ? (flow.cutAt ?? 0.55) : null,
      items,
    })
  }

  // Camera state: current and target angles in degrees.
  const start = VIEWS[options.view ?? 'persp']
  const view = { elev: start.elev, azim: start.azim, tElev: start.elev, tAzim: start.azim }
  let size = { w: canvas.clientWidth || FALLBACK_SIZE.w, h: canvas.clientHeight || FALLBACK_SIZE.h }

  function updateProjection() {
    const scale = Math.min(size.w / spanX, size.h / spanZ)
    camera.left = -size.w / 2 / scale
    camera.right = size.w / 2 / scale
    camera.top = size.h / 2 / scale
    camera.bottom = -size.h / 2 / scale
    camera.updateProjectionMatrix()
  }
  function updatePose() {
    const e = (view.elev * Math.PI) / 180
    const a = (view.azim * Math.PI) / 180
    const r = 40
    camera.position.set(
      center.x + r * Math.cos(e) * Math.sin(a),
      r * Math.sin(e),
      center.z + r * Math.cos(e) * Math.cos(a),
    )
    camera.lookAt(center.x, 0, center.z)
    camera.updateMatrixWorld()
  }
  const bufferSize = new Vector2()
  renderer.setSize(size.w, size.h, false)
  renderer.getDrawingBufferSize(bufferSize)
  halftone.setSize(bufferSize.x, bufferSize.y)
  updateProjection()
  updatePose()

  // Render loop: runs only while visible, and (reduced motion) only when something changed.
  const listeners = new Set<() => void>()
  let raf: number | null = null
  let visible = true
  let inDocument = !document.hidden
  let notify = true
  let dragging: { x: number; y: number; startX: number; startY: number; moved: boolean } | null =
    null
  let disposed = false
  const t0 = performance.now()
  let renderOnce = true

  function requestFrame() {
    renderOnce = true
    if (raf === null && !disposed && visible && inDocument) raf = requestAnimationFrame(frame)
  }

  function animate(t: number) {
    for (const flow of packetFlows) {
      const total = flow.path.total
      const limit = flow.cut === null ? total : total * flow.cut
      const loop = flow.cut === null ? total : limit + CUT_FADE
      for (const item of flow.items) {
        // Reduced motion: packets stay where they were laid out.
        const d = reducedMotion ? item.offset % loop : (t * flow.speed + item.offset) % loop
        const p = pointAt(flow.path, Math.min(d, limit))
        item.mesh.position.set(p.x, 0.08, p.z)
        item.mesh.rotation.y = p.angle
        if (flow.cut !== null && d > limit) {
          const q = (d - limit) / CUT_FADE
          item.mesh.scale.setScalar(1 + q * 0.8)
          item.mesh.material.opacity = 1 - q
        } else {
          item.mesh.scale.setScalar(1)
          item.mesh.material.opacity = 1
        }
      }
    }
    for (const pulse of pulses) {
      const q = reducedMotion ? 0 : (t % 1.8) / 1.8
      pulse.scale.setScalar(1 + q * 1.6)
      pulse.material.opacity = reducedMotion ? 0.5 : 0.6 * (1 - q)
    }
    brokenMaterial.opacity = reducedMotion ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2))
  }

  function frame() {
    raf = null
    if (disposed) return
    const t = (performance.now() - t0) / 1000
    const k = reducedMotion ? 1 : dragging ? 0.35 : 0.1
    const pe = view.elev
    const pa = view.azim
    view.elev += (view.tElev - view.elev) * k
    view.azim += (view.tAzim - view.azim) * k
    // Snap once close enough so the loop can go idle.
    if (Math.abs(view.tElev - view.elev) < 0.02) view.elev = view.tElev
    if (Math.abs(view.tAzim - view.azim) < 0.02) view.azim = view.tAzim
    const moved = Math.abs(view.elev - pe) + Math.abs(view.azim - pa) > 0.001
    if (moved) updatePose()
    animate(t)
    halftone.render(scene, camera)
    renderer.clearDepth()
    renderer.render(scene, camera)
    renderOnce = false
    if (moved || notify) {
      notify = false
      listeners.forEach((cb) => cb())
    }
    const easing = view.elev !== view.tElev || view.azim !== view.tAzim
    if (!reducedMotion || easing || renderOnce) requestFrame()
  }

  // Pause while off-screen or in a background tab.
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          visible = entries[entries.length - 1]?.isIntersecting ?? true
          if (visible) requestFrame()
        })
  observer?.observe(canvas)
  const onVisibility = () => {
    inDocument = !document.hidden
    if (inDocument) requestFrame()
  }
  document.addEventListener('visibilitychange', onVisibility)

  // Pointer: drag to rotate, click (without drag) on a station to pick it.
  const raycaster = new Raycaster()
  const ndc = new Vector2()
  function stationUnder(e: PointerEvent): string | null {
    const rect = canvas.getBoundingClientRect()
    ndc.set(
      ((e.clientX - rect.left) / (rect.width || size.w)) * 2 - 1,
      -((e.clientY - rect.top) / (rect.height || size.h)) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObjects(pickable, false)[0]
    return (hit?.object.userData.stationId as string | undefined) ?? null
  }
  const onDown = (e: PointerEvent) => {
    dragging = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }
    canvas.setPointerCapture?.(e.pointerId)
    canvas.style.cursor = 'grabbing'
  }
  const onMove = (e: PointerEvent) => {
    const d = dragging
    if (!d) {
      canvas.style.cursor = stationUnder(e) ? 'pointer' : 'grab'
      return
    }
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > CLICK_SLOP) d.moved = true
    view.tAzim = Math.max(-AZIM_LIMIT, Math.min(AZIM_LIMIT, view.tAzim + (e.clientX - d.x) * 0.3))
    view.tElev = Math.max(ELEV_MIN, Math.min(ELEV_MAX, view.tElev - (e.clientY - d.y) * 0.25))
    d.x = e.clientX
    d.y = e.clientY
    requestFrame()
  }
  const onUp = (e: PointerEvent) => {
    const d = dragging
    dragging = null
    canvas.style.cursor = 'grab'
    if (d && !d.moved && e.type === 'pointerup') {
      const id = stationUnder(e)
      if (id) onPick?.(id)
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  setSelected(options.selectedId)
  requestFrame()

  const projected = new Vector3()
  return {
    setView(next) {
      view.tElev = VIEWS[next].elev
      view.tAzim = VIEWS[next].azim
      requestFrame()
    },
    setSelected,
    project(x, z) {
      projected.set(x, 0, z).project(camera)
      return {
        x: Math.round(((projected.x + 1) / 2) * size.w),
        y: Math.round(((1 - projected.y) / 2) * size.h),
      }
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    resize(w, h) {
      if (w <= 0 || h <= 0) return
      size = { w, h }
      renderer.setSize(w, h, false)
      renderer.getDrawingBufferSize(bufferSize)
      halftone.setSize(bufferSize.x, bufferSize.y)
      updateProjection()
      notify = true
      requestFrame()
    },
    dispose() {
      disposed = true
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      listeners.clear()
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      halftone.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
