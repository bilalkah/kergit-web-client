import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChangeEmailModal from './ChangeEmailModal.vue'

function mountModal(props: {
  initialEmail?: string
  loading?: boolean
  error?: string
} = {}) {
  return mount(ChangeEmailModal, {
    props: {
      modelValue: true,
      ...props,
    },
    global: {
      stubs: {
        Teleport: true,
      },
    },
  })
}

describe('ChangeEmailModal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks an empty email', async () => {
    const wrapper = mountModal()

    await wrapper.find('input').setValue('   ')
    await wrapper.find('.btn.primary').trigger('click')

    expect(wrapper.text()).toContain('E-posta gerekli')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('blocks an invalid email', async () => {
    const wrapper = mountModal()

    await wrapper.find('input').setValue('invalid-email')
    await wrapper.find('.btn.primary').trigger('click')

    expect(wrapper.text()).toContain('Geçerli bir e-posta gir')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('blocks the current email case-insensitively', async () => {
    const wrapper = mountModal({ initialEmail: 'user@example.com' })

    await wrapper.find('input').setValue('USER@example.com')
    await wrapper.find('.btn.primary').trigger('click')

    expect(wrapper.text()).toContain('Yeni e-posta mevcut e-posta adresinden farklı olmalı')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('emits a trimmed valid email', async () => {
    const wrapper = mountModal({ initialEmail: 'current@example.com' })

    await wrapper.find('input').setValue('  next@example.com  ')
    await wrapper.find('.btn.primary').trigger('click')

    expect(wrapper.emitted('submit')).toEqual([['next@example.com']])
  })

  it('shows a server error', () => {
    const wrapper = mountModal({ error: 'E-posta güncellenemedi' })

    expect(wrapper.text()).toContain('E-posta güncellenemedi')
  })

  it('disables input, actions, and dismissal controls while loading', () => {
    const wrapper = mountModal({ loading: true })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn.ghost').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn.primary').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Geri"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Kapat"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Güncelleniyor...')
  })
})
