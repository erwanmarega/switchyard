// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ProjectHead from '~/components/dashboard/ProjectHead.vue'
import {
  demoDiagnostics,
  demoHealthyProject,
  demoHealthyStatuses,
  demoPath,
  demoProject,
  demoStatuses,
} from '~/utils/demo-path'

const mountHead = (props: Record<string, unknown> = {}) =>
  mount(ProjectHead, {
    props: {
      project: demoProject,
      statuses: demoStatuses,
      diagnostics: demoDiagnostics,
      path: demoPath,
      ...props,
    },
  })

describe('ProjectHead', () => {
  it('shows the incident pill and the last check time', async () => {
    const wrapper = mountHead()
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('mon-saas')
    expect(wrapper.find('.pill').text()).toBe('1 incident en cours')
    expect(wrapper.find('.when').text()).toMatch(
      /^Dernière vérification à 14h31 · il y a \d+ (min|h|j)$/,
    )
  })

  it('omits the relative time before mount (SSR-safe)', () => {
    const wrapper = mountHead()
    // Before the mounted hook has re-rendered, only the clock time is shown.
    expect(wrapper.find('.when').text()).toContain('Dernière vérification à 14h31')
  })

  it('shows the healthy pill without incident', () => {
    const wrapper = mountHead({ project: demoHealthyProject, statuses: demoHealthyStatuses })
    expect(wrapper.find('.pill').text()).toBe('Tout circule · aucun incident')
  })

  it('shows the empty pill when no tool is connected', () => {
    const wrapper = mountHead({
      project: { ...demoHealthyProject },
      path: { nodes: [], edges: [] },
      statuses: {},
      diagnostics: {},
    })
    expect(wrapper.find('.pill').text()).toBe('Aucun outil connecté')
    expect(wrapper.text()).toContain("Projet créé aujourd'hui")
  })

  it('disables Revérifier and links "Ajouter un outil" to the integrations', () => {
    const wrapper = mountHead()
    const recheck = wrapper.find('button')
    expect(recheck.text()).toBe('Revérifier')
    expect(recheck.attributes('disabled')).toBeDefined()
    expect(recheck.attributes('aria-disabled')).toBe('true')
    expect(recheck.attributes('title')).toBe('Bientôt : vérifications réelles')
    const add = wrapper.find('a')
    expect(add.text()).toBe('Ajouter un outil')
    expect(add.attributes('href')).toBe('#integrations')
  })
})
