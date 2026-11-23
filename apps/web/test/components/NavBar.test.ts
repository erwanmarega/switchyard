// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import type { AuthUser } from '~/composables/useAuth'
import NavBar from '~/components/landing/NavBar.vue'

const user = ref<AuthUser | null>(null)
vi.mock('~/composables/useAuth', () => ({ useAuth: () => ({ user }) }))

const mountNav = () => mount(NavBar, { global: { stubs: { NuxtLink: RouterLinkStub } } })

describe('NavBar', () => {
  beforeEach(() => {
    user.value = null
  })

  it('links to the login page when logged out', () => {
    const account = mountNav().getComponent('[data-testid="nav-account"]')
    expect(account.text()).toBe('Se connecter')
    expect(account.props('to')).toBe('/connexion')
  })

  it('links to the dashboard when logged in', () => {
    user.value = { id: '1', email: 'a@example.com' }
    const account = mountNav().getComponent('[data-testid="nav-account"]')
    expect(account.text()).toBe('Tableau de bord')
    expect(account.props('to')).toBe('/dashboard')
  })

  it('toggles aria-expanded on the mobile menu button', async () => {
    const wrapper = mountNav()
    const toggle = wrapper.get('button.toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('nav').classes()).toContain('open')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('closes the menu when a link is clicked', async () => {
    const wrapper = mountNav()
    const toggle = wrapper.get('button.toggle')
    await toggle.trigger('click')
    await wrapper.get('nav ul a').trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })
})
