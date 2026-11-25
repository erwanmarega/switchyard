// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StationPanel from '~/components/dashboard/StationPanel.vue'
import { demoDiagnostics, demoPath, demoProject } from '~/utils/demo-path'

const node = (id: string) => demoPath.nodes.find((n) => n.id === id)!

const mountPanel = (id: string, status: 'ok' | 'warning' | 'error' | 'unknown', incident = true) =>
  mount(StationPanel, {
    props: {
      node: node(id),
      status,
      diagnostic: demoDiagnostics[id],
      incident: incident ? demoProject.incident : null,
    },
  })

describe('StationPanel', () => {
  it('shows the name, description and status since the incident', () => {
    const wrapper = mountPanel('vercel', 'error')
    expect(wrapper.find('h2').text()).toBe('Vercel')
    expect(wrapper.text()).toContain('Hébergement et API · environnement production')
    expect(wrapper.find('[data-test="status-pill"]').text()).toBe('Bloqué depuis 14h02')
  })

  it('shows only the status label when there is no since date', () => {
    const wrapper = mountPanel('cloudflare', 'warning')
    expect(wrapper.find('[data-test="status-pill"]').text()).toBe('Attention')
  })

  it('lists the checks with an accessible status dot', () => {
    const wrapper = mountPanel('vercel', 'error')
    const items = wrapper.findAll('.checks li')
    expect(items).toHaveLength(5)
    expect(items[0]!.find('[role="img"]').attributes('aria-label')).toBe('Bloqué')
    expect(items[0]!.text()).toContain('Route /api/stripe')
    expect(items[1]!.text()).toContain('STRIPE_WEBHOOK_SECRET absente en production')
    expect(items[2]!.find('[role="img"]').attributes('aria-label')).toBe('OK')
  })

  it('renders a safe console link and the check time', () => {
    const wrapper = mountPanel('vercel', 'error')
    const link = wrapper.find('a.console')
    expect(link.text()).toContain('Ouvrir dans Vercel')
    expect(link.attributes('href')).toBe('https://vercel.com/dashboard')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.text()).toContain('Vérifié à 14h31')
  })

  it('renders the trace with the probable cause chip and the incident action', () => {
    const wrapper = mountPanel('vercel', 'error')
    const steps = wrapper.findAll('.trace li')
    expect(steps).toHaveLength(3)
    expect(steps[0]!.text()).toContain('Stripe · symptôme')
    expect(wrapper.findAll('.cause-chip')).toHaveLength(1)
    expect(steps[2]!.find('.cause-chip').text()).toBe('CAUSE PROBABLE')
    expect(steps[2]!.find('.marker').classes()).toContain('cause')
    const action = wrapper.find('a.action')
    expect(action.text()).toBe('Voir le déploiement de 14h02')
    expect(action.attributes('href')).toBe('https://vercel.com/dashboard')
  })

  it('has no trace nor action for a station outside the incident', () => {
    const wrapper = mountPanel('supabase', 'ok')
    expect(wrapper.text()).not.toContain('REMONTER VERS')
    expect(wrapper.find('a.action').exists()).toBe(false)
  })

  it('has no action without incident', () => {
    const wrapper = mountPanel('vercel', 'error', false)
    expect(wrapper.find('a.action').exists()).toBe(false)
  })

  it('emits close from the close button', async () => {
    const wrapper = mountPanel('vercel', 'error')
    const button = wrapper.find('button[aria-label="Fermer le panneau"]')
    await button.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows a fallback without diagnostic', () => {
    const wrapper = mount(StationPanel, {
      props: { node: node('vercel'), status: 'unknown', incident: null },
    })
    expect(wrapper.text()).toContain('Aucun diagnostic disponible.')
    expect(wrapper.find('.checks').exists()).toBe(false)
  })
})
