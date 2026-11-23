// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FooterSection from '~/components/landing/FooterSection.vue'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FooterSection', () => {
  it('renders deduplicated and shortened credits', async () => {
    const longTitle = 'A'.repeat(80) + '.jpg'
    const credits = [
      {
        title: 'Locomotive.jpg',
        source_url: 'https://example.org/a',
        author: 'Jane Doe, publisher',
      },
      { title: 'Locomotive (crop).jpg', source_url: 'https://example.org/a' },
      { title: longTitle, source_url: 'javascript:alert(1)' },
      { source_url: 'https://example.org/untitled' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(credits) }),
    )

    const wrapper = mount(FooterSection)
    await flushPromises()

    const items = wrapper.findAll('.credits li')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toBe('Locomotive — Jane Doe')
    expect(items[0]!.get('a').attributes('href')).toBe('https://example.org/a')
    // Long titles are shortened and unsafe URLs are not linked.
    expect(items[1]!.text()).toHaveLength(60)
    expect(items[1]!.text().endsWith('…')).toBe(true)
    expect(items[1]!.find('a').exists()).toBe(false)
  })

  it('renders no credits list when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    const wrapper = mount(FooterSection)
    await flushPromises()

    expect(wrapper.find('.credits').exists()).toBe(false)
    expect(wrapper.text()).toContain('Switchyard')
  })
})
