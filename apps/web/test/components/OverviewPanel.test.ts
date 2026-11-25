// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OverviewPanel from '~/components/dashboard/OverviewPanel.vue'
import { demoHealthyProject, demoPath, demoProject } from '~/utils/demo-path'

describe('OverviewPanel', () => {
  it('shows the stats, deadlines, hint and next check', () => {
    const wrapper = mount(OverviewPanel, { props: { project: demoProject, path: demoPath } })
    expect(wrapper.findAll('.num').map((n) => n.text())).toEqual(['6', '5', '1'])
    expect(wrapper.findAll('.unit').map((n) => n.text())).toEqual(['gares', 'voies', 'incident'])
    const deadlines = wrapper.findAll('.deadlines li')
    expect(deadlines).toHaveLength(3)
    expect(deadlines[0]!.text()).toContain('Certificat SSL · Cloudflare')
    expect(deadlines[0]!.text()).toContain('dans 12 j')
    expect(wrapper.text()).toContain('Aucune gare sélectionnée')
    expect(wrapper.text()).toContain('Prochaine vérification à 14h36')
  })

  it('counts zero incidents for a healthy project', () => {
    const wrapper = mount(OverviewPanel, { props: { project: demoHealthyProject, path: demoPath } })
    expect(wrapper.findAll('.num')[2]!.text()).toBe('0')
  })
})
