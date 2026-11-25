// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LinePlan from '~/components/dashboard/LinePlan.vue'
import {
  demoDiagnostics,
  demoHealthyStatuses,
  demoPath,
  demoProject,
  demoStatuses,
} from '~/utils/demo-path'

const webgl = vi.hoisted(() => ({ available: true }))
vi.mock('~/utils/webgl', () => ({ isWebGLAvailable: () => webgl.available }))

const fake = vi.hoisted(() => ({
  setView: vi.fn(),
  setSelected: vi.fn(),
  dispose: vi.fn(),
  resize: vi.fn(),
  project: vi.fn((x: number, z: number) => ({ x: 100 + x * 10, y: 200 + z * 10 })),
  onChange: vi.fn(() => () => {}),
}))
vi.mock('~/three/line-plan', () => ({ createLinePlan: vi.fn(() => fake) }))

const mountPlan = (props: Record<string, unknown> = {}) =>
  mount(LinePlan, {
    props: {
      path: demoPath,
      statuses: demoStatuses,
      diagnostics: demoDiagnostics,
      incident: demoProject.incident,
      selectedId: 'vercel',
      ...props,
    },
  })

beforeEach(() => {
  webgl.available = true
  for (const fn of Object.values(fake)) fn.mockClear()
})

describe('LinePlan', () => {
  it('emits unsupported when WebGL is unavailable', async () => {
    webgl.available = false
    const wrapper = mountPlan()
    await flushPromises()
    expect(wrapper.emitted('unsupported')).toHaveLength(1)
  })

  it('shows a loading state, then one button per station with its status line', async () => {
    const wrapper = mountPlan()
    expect(wrapper.text()).toContain('Chargement du plan…')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Chargement du plan…')
    const buttons = wrapper.findAll('button.station')
    expect(buttons).toHaveLength(demoPath.nodes.length)
    const vercel = buttons.find((b) => b.text().includes('Vercel'))!
    expect(vercel.text()).toContain('Bloqué · /api/stripe en 500')
    expect(vercel.attributes('aria-label')).toBe('Vercel — Bloqué, afficher le détail')
    expect(vercel.attributes('aria-pressed')).toBe('true')
    expect(buttons.filter((b) => b.attributes('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('falls back to the generic status label without a diagnostic', async () => {
    const wrapper = mountPlan({ diagnostics: undefined })
    await flushPromises()
    const cloudflare = wrapper
      .findAll('button.station')
      .find((b) => b.text().includes('Cloudflare'))!
    expect(cloudflare.text()).toContain('Attention')
  })

  it('emits select with the station id on click', async () => {
    const wrapper = mountPlan()
    await flushPromises()
    await wrapper
      .findAll('button.station')
      .find((b) => b.text().includes('Stripe'))!
      .trigger('click')
    expect(wrapper.emitted('select')).toEqual([['stripe']])
  })

  it('renders the incident tags only with an incident', async () => {
    const wrapper = mountPlan()
    await flushPromises()
    const tags = wrapper.findAll('.tag')
    expect(tags.map((t) => t.text())).toEqual([
      'SYMPTÔME',
      'CAUSE PROBABLE · DÉPLOIEMENT 14H02',
      'VOIE COUPÉE',
    ])
    expect(tags.every((t) => t.attributes('aria-hidden') === 'true')).toBe(true)

    const healthy = mountPlan({ statuses: demoHealthyStatuses, incident: null })
    await flushPromises()
    expect(healthy.findAll('.tag')).toHaveLength(0)
    expect(healthy.get('canvas').attributes('aria-label')).toContain('opérationnelles')
  })

  it('describes the incident on the canvas', async () => {
    const wrapper = mountPlan()
    await flushPromises()
    const canvas = wrapper.get('canvas')
    expect(canvas.attributes('role')).toBe('img')
    expect(canvas.attributes('aria-label')).toContain('Voie Stripe vers Vercel coupée')
    expect(canvas.attributes('aria-label')).toContain('déploiement 14h02')
  })

  it('switches the view with the toggle', async () => {
    const wrapper = mountPlan()
    await flushPromises()
    const [persp, plan] = wrapper.findAll('.toggle-btn')
    expect(persp!.attributes('aria-pressed')).toBe('true')
    await plan!.trigger('click')
    expect(fake.setView).toHaveBeenCalledWith('plan')
    expect(plan!.attributes('aria-pressed')).toBe('true')
    expect(persp!.attributes('aria-pressed')).toBe('false')
  })

  it('updates the selection without rebuilding the scene', async () => {
    const wrapper = mountPlan()
    await flushPromises()
    await wrapper.setProps({ selectedId: 'stripe' })
    expect(fake.setSelected).toHaveBeenCalledWith('stripe')
    expect(fake.dispose).not.toHaveBeenCalled()
  })

  it('disposes the controller on unmount', async () => {
    const wrapper = mountPlan()
    await flushPromises()
    wrapper.unmount()
    expect(fake.dispose).toHaveBeenCalled()
  })
})
