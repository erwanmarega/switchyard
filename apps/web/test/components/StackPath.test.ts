// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StackPath from '~/components/landing/StackPath.vue'

describe('StackPath', () => {
  it('starts in the operational state', () => {
    const wrapper = mount(StackPath)
    expect(wrapper.get('[role="status"]').text()).toContain('Tout le chemin est opérationnel.')
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
  })

  it('shows the Stripe diagnostic when simulating an outage, and restores on second click', async () => {
    const wrapper = mount(StackPath)
    const button = wrapper.get('button')

    await button.trigger('click')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.text()).toBe('Rétablir')
    const status = wrapper.get('[role="status"]').text()
    expect(status).toContain('/api/stripe')
    expect(status).toContain('500')
    expect(wrapper.findAll('.node.bad')).toHaveLength(1)

    await button.trigger('click')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[role="status"]').text()).toContain('Tout le chemin est opérationnel.')
    expect(wrapper.findAll('.node.bad')).toHaveLength(0)
  })
})
