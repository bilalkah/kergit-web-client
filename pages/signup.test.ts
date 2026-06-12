import { mount } from '@vue/test-utils'
import { useAttrs } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignupPage from './signup.vue'

const NuxtLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountSignup() {
  return mount(SignupPage, {
    global: {
      stubs: {
        NuxtLink: NuxtLinkStub,
      },
    },
  })
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

describe('signup legal notice flow', () => {
  beforeEach(() => {
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal('useAttrs', useAttrs)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the Discord-style legal notice with links and no checkbox or modal acceptance flow', () => {
    const wrapper = mountSignup()
    const notice = wrapper.get('.auth-legal-notice')
    const links = notice.findAll('a')

    expect(normalizeText(notice.text())).toBe(
      '“Hesap Oluştur” butonuna tıklayarak 18 yaş ve üzerinde olduğunu beyan eder, Kergit’in Kullanıcı Sözleşmesi’ni kabul etmiş ve Gizlilik Politikası / KVKK Aydınlatma Metni’ni okuduğunu kabul etmiş olursun.'
    )
    expect(notice.text()).not.toContain('tarafına sunulur')
    expect(links.map(link => link.attributes('href'))).toEqual(['/terms', '/privacy'])
    expect(wrapper.find('.auth-legal-list').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="legal-scroll-area"]').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
