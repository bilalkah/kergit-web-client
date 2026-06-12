import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeleteAccountModal from './DeleteAccountModal.vue'

function mountModal(props: {
  currentEmail?: string
  loading?: boolean
  error?: string
} = {}) {
  return mount(DeleteAccountModal, {
    props: {
      modelValue: true,
      currentEmail: 'user@example.com',
      ...props,
    },
    global: {
      stubs: {
        Teleport: true,
      },
    },
  })
}

describe('DeleteAccountModal', () => {
  it('blocks an empty email confirmation', async () => {
    const wrapper = mountModal()

    await wrapper.find('input').trigger('blur')

    expect(wrapper.text()).toContain('Devam etmek için mevcut e-posta adresini yaz.')
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('blocks an invalid email confirmation', async () => {
    const wrapper = mountModal()

    await wrapper.find('input').setValue('invalid-email')
    await wrapper.find('input').trigger('blur')

    expect(wrapper.text()).toContain('Geçerli bir e-posta adresi yaz.')
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('blocks mismatched email confirmation', async () => {
    const wrapper = mountModal({ currentEmail: 'user@example.com' })

    await wrapper.find('input').setValue('other@example.com')
    await wrapper.find('input').trigger('blur')

    expect(wrapper.text()).toContain('E-posta adresi mevcut hesabınla eşleşmiyor.')
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('enables deletion and accepts matching email confirmation case-insensitively', async () => {
    const wrapper = mountModal({ currentEmail: 'user@example.com' })

    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()
    await wrapper.find('input').setValue(' USER@EXAMPLE.COM ')
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeUndefined()
    await wrapper.find('.btn.danger').trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([['USER@EXAMPLE.COM']])
  })

  it('disables controls while loading', () => {
    const wrapper = mountModal({ loading: true })

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn.ghost').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Geri"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-label="Kapat"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('İşleniyor...')
  })

  it('shows a server error', () => {
    const wrapper = mountModal({ error: 'Hesap silinemedi. Lütfen tekrar dene.' })

    expect(wrapper.text()).toContain('Hesap silinemedi. Lütfen tekrar dene.')
  })

  it('disables deletion when current email is unavailable', () => {
    const wrapper = mountModal({ currentEmail: '   ' })

    expect(wrapper.text()).toContain('Mevcut e-posta doğrulanamadı. Lütfen tekrar giriş yap.')
    expect(wrapper.find('.btn.danger').attributes('disabled')).toBeDefined()
  })
})
