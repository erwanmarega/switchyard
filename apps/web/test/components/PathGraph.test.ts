// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PathGraph from '~/components/dashboard/PathGraph.vue'
import { demoDiagnostics, demoPath, demoProject, demoStatuses } from '~/utils/demo-path'

// The 3D plan is stubbed: it renders a marker and lets tests emit select / unsupported.
const LinePlanStub = {
  name: 'LinePlan',
  props: ['path', 'statuses', 'diagnostics', 'incident', 'selectedId'],
  emits: ['select', 'unsupported'],
  template: '<div data-test="plan" />',
}

const mountGraph = (props: Record<string, unknown> = {}) =>
  mount(PathGraph, {
    props: {
      path: demoPath,
      statuses: demoStatuses,
      errors: [],
      diagnostics: demoDiagnostics,
      incident: demoProject.incident,
      selectedId: null,
      ...props,
    },
    global: { stubs: { LinePlan: LinePlanStub } },
  })

const toggleButton = (wrapper: ReturnType<typeof mountGraph>, name: string) =>
  wrapper.findAll('[aria-label="Affichage du chemin"] button').find((b) => b.text() === name)!

describe('PathGraph', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the header and the plan by default', async () => {
    const wrapper = mountGraph()
    await flushPromises()
    expect(wrapper.text()).toContain('PLAN DE LIGNE')
    expect(wrapper.text()).toContain("Parcours d'une requête, de gauche à droite")
    expect(wrapper.find('[data-test="plan"]').exists()).toBe(true)
    expect(wrapper.find('ol').exists()).toBe(false)
  })

  it('forwards the plan selection and its props', async () => {
    const wrapper = mountGraph({ selectedId: 'vercel' })
    const plan = wrapper.findComponent(LinePlanStub)
    expect(plan.props('selectedId')).toBe('vercel')
    expect(plan.props('incident')).toEqual(demoProject.incident)
    plan.vm.$emit('select', 'stripe')
    expect(wrapper.emitted('select')).toEqual([['stripe']])
  })

  it('shows the incident legend entry only when there is an incident', () => {
    const withIncident = mountGraph()
    expect(withIncident.findAll('.legend li').map((li) => li.text())).toEqual([
      'OK',
      'Attention',
      'Bloqué',
      'Voie coupée',
      'Hors chemin de la panne',
    ])
    const healthy = mountGraph({ incident: null })
    expect(healthy.findAll('.legend li')).toHaveLength(4)
    expect(healthy.text()).not.toContain('Hors chemin de la panne')
  })

  it('falls back to the list when the plan reports it is unsupported', async () => {
    const wrapper = mountGraph()
    wrapper.findComponent(LinePlanStub).vm.$emit('unsupported')
    await flushPromises()
    expect(wrapper.find('[data-test="plan"]').exists()).toBe(false)
    expect(wrapper.findAll('ol > li')).toHaveLength(demoPath.nodes.length)
  })

  it('shows only the error box for an invalid path', () => {
    const wrapper = mountGraph({ errors: ['cycle'] })
    expect(wrapper.find('.error-box').text()).toContain('cycle')
    expect(wrapper.find('[data-test="plan"]').exists()).toBe(false)
    expect(wrapper.find('.legend').exists()).toBe(false)
  })

  describe('list view', () => {
    it('switches to the list and back, updating aria-pressed', async () => {
      const wrapper = mountGraph()
      expect(toggleButton(wrapper, 'Graphe').attributes('aria-pressed')).toBe('true')
      expect(toggleButton(wrapper, 'Liste').attributes('aria-pressed')).toBe('false')

      await toggleButton(wrapper, 'Liste').trigger('click')
      expect(toggleButton(wrapper, 'Liste').attributes('aria-pressed')).toBe('true')
      expect(wrapper.findAll('ol > li')).toHaveLength(demoPath.nodes.length)
      expect(wrapper.find('[data-test="plan"]').exists()).toBe(false)
      expect(wrapper.findAll('.legend li').length).toBeGreaterThan(0)

      await toggleButton(wrapper, 'Graphe').trigger('click')
      expect(wrapper.find('[data-test="plan"]').exists()).toBe(true)
      expect(wrapper.find('ol').exists()).toBe(false)
    })

    it('emits select when a list row is clicked', async () => {
      const wrapper = mountGraph()
      await toggleButton(wrapper, 'Liste').trigger('click')
      await wrapper.find('[data-row-button="stripe"]').trigger('click')
      expect(wrapper.emitted('select')).toEqual([['stripe']])
    })

    it('writes the preference to localStorage', async () => {
      const wrapper = mountGraph()
      await toggleButton(wrapper, 'Liste').trigger('click')
      expect(localStorage.getItem('switchyard:path-view')).toBe('list')
      await toggleButton(wrapper, 'Graphe').trigger('click')
      expect(localStorage.getItem('switchyard:path-view')).toBe('graph')
    })

    it('restores the saved preference on mount', async () => {
      localStorage.setItem('switchyard:path-view', 'list')
      const wrapper = mountGraph()
      await flushPromises()
      expect(toggleButton(wrapper, 'Liste').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('ol').exists()).toBe(true)
    })

    it('ignores an invalid saved preference', async () => {
      localStorage.setItem('switchyard:path-view', 'nope')
      const wrapper = mountGraph()
      await flushPromises()
      expect(toggleButton(wrapper, 'Graphe').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('[data-test="plan"]').exists()).toBe(true)
    })
  })
})
