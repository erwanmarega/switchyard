// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IncidentBanner from '~/components/dashboard/IncidentBanner.vue'
import { demoProject } from '~/utils/demo-path'

const incident = demoProject.incident!

describe('IncidentBanner', () => {
  it('renders the chip, the message and the highlight in <strong>', () => {
    const wrapper = mount(IncidentBanner, { props: { incident } })
    expect(wrapper.attributes('aria-label')).toBe('Incident en cours')
    expect(wrapper.text()).toContain('INCIDENT')
    expect(wrapper.find('strong').text()).toBe('/api/stripe')
    expect(wrapper.find('.text').text()).toBe(incident.message)
  })

  it('renders the plain message when the highlight is absent from it', () => {
    const wrapper = mount(IncidentBanner, {
      props: { incident: { ...incident, highlight: 'zzz' } },
    })
    expect(wrapper.find('strong').exists()).toBe(false)
    expect(wrapper.find('.text').text()).toBe(incident.message)
  })
})
