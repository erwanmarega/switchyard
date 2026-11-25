// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PathList from '~/components/dashboard/PathList.vue'
import { demoDiagnostics, demoPath, demoStatuses } from '~/utils/demo-path'

const mountList = (props: Record<string, unknown> = {}) =>
  mount(PathList, {
    props: { path: demoPath, statuses: demoStatuses, diagnostics: demoDiagnostics, ...props },
  })

const rowButton = (wrapper: ReturnType<typeof mountList>, id: string) =>
  wrapper.find(`[data-row-button="${id}"]`)

describe('PathList', () => {
  it('renders one item per node, in order, with status line and neighbours', () => {
    const wrapper = mountList()
    const items = wrapper.findAll('ol > li')
    expect(items).toHaveLength(demoPath.nodes.length)
    expect(items.map((i) => i.find('.label').text())).toEqual(demoPath.nodes.map((n) => n.label))
    expect(items[0]!.text()).toContain('OK · expire dans 210 j')
    expect(items[4]!.text()).toContain('Bloqué · 14 webhooks en échec')
    // Vercel: depends on Cloudflare and Stripe, feeds Supabase and Resend.
    expect(items[2]!.text()).toContain('Dépend de : Cloudflare, Stripe')
    expect(items[2]!.text()).toContain('Alimente : Supabase, Resend')
    // Domain has no upstream.
    expect(items[0]!.text()).toContain('Dépend de : —')
  })

  it('falls back to the status label when there is no diagnostic', () => {
    const wrapper = mountList({ diagnostics: undefined })
    const items = wrapper.findAll('ol > li')
    expect(items[0]!.find('.status-line').text()).toBe('OK')
    expect(items[2]!.find('.status-line').text()).toBe('Bloqué')
  })

  it('marks only the selected row as pressed', () => {
    const wrapper = mountList({ selectedId: 'vercel' })
    expect(rowButton(wrapper, 'vercel').attributes('aria-pressed')).toBe('true')
    expect(rowButton(wrapper, 'stripe').attributes('aria-pressed')).toBe('false')
  })

  it('emits select with the node id on click', async () => {
    const wrapper = mountList()
    await rowButton(wrapper, 'stripe').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['stripe']])
  })
})
