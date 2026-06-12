import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGAL_LOCALE,
  PRIVACY_NOTICE_DOCUMENT_SHA256,
  PRIVACY_NOTICE_VERSION,
  TERMS_DOCUMENT_SHA256,
  TERMS_VERSION,
} from '@/src/legal/constants'
import {
  buildPrivacyNoticeDeliveryMetadata,
  buildSignupLegalMetadata,
  buildTermsAcceptanceMetadata,
  signUpWithLegalRecords,
} from './signup'

describe('signup legal metadata', () => {
  const signUp = vi.fn()
  const client = {
    auth: {
      signUp,
    },
  }
  const input = {
    email: 'signup-test@example.invalid',
    password: 'Strong1!',
    username: 'test-user',
    avatarSeed: 'Caleb',
    emailRedirectTo: 'https://example.invalid/login',
  }

  beforeEach(() => {
    signUp.mockReset()
    signUp.mockResolvedValue({ data: {}, error: null })
  })

  it('builds current terms acceptance metadata', () => {
    const metadata = buildTermsAcceptanceMetadata()

    expect(metadata).toEqual({
      legal_terms_accepted: true,
      legal_terms_version: TERMS_VERSION,
      legal_terms_locale: LEGAL_LOCALE,
      legal_terms_hash: TERMS_DOCUMENT_SHA256,
    })
    expect(Object.keys(metadata)).not.toContain('legal_privacy_notice_delivered')
  })

  it('builds only privacy notice delivery metadata and never consent metadata', () => {
    const metadata = buildPrivacyNoticeDeliveryMetadata()

    expect(metadata).toEqual({
      legal_privacy_notice_delivered: true,
      legal_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      legal_privacy_notice_locale: LEGAL_LOCALE,
      legal_privacy_notice_hash: PRIVACY_NOTICE_DOCUMENT_SHA256,
    })
    expect(Object.keys(metadata).some(key => key.toLowerCase().includes('consent'))).toBe(false)
    expect(Object.keys(metadata).some(key => key.toLowerCase().includes('accepted'))).toBe(false)
    expect(Object.keys(metadata)).not.toContain('legal_terms_accepted')
  })

  it('builds current signup legal metadata without modal completion input', () => {
    expect(buildSignupLegalMetadata()).toEqual(expect.objectContaining({
      legal_terms_accepted: true,
      legal_terms_version: TERMS_VERSION,
      legal_terms_locale: LEGAL_LOCALE,
      legal_terms_hash: TERMS_DOCUMENT_SHA256,
      legal_privacy_notice_delivered: true,
      legal_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      legal_privacy_notice_locale: LEGAL_LOCALE,
      legal_privacy_notice_hash: PRIVACY_NOTICE_DOCUMENT_SHA256,
    }))
  })

  it('sends the current versions, locale, and hashes without consent-style privacy metadata', async () => {
    await signUpWithLegalRecords(client as never, input)

    const request = signUp.mock.calls[0]?.[0]
    const metadata = request?.options?.data

    expect(metadata).toEqual(expect.objectContaining({
      legal_terms_accepted: true,
      legal_terms_version: TERMS_VERSION,
      legal_terms_locale: LEGAL_LOCALE,
      legal_terms_hash: TERMS_DOCUMENT_SHA256,
      legal_privacy_notice_delivered: true,
      legal_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      legal_privacy_notice_locale: LEGAL_LOCALE,
      legal_privacy_notice_hash: PRIVACY_NOTICE_DOCUMENT_SHA256,
    }))
    expect(Object.keys(metadata ?? {}).some(key => key.toLowerCase().includes('consent'))).toBe(false)
  })

  it('seeds profile creation metadata with username/display_name/avatar_seed and no full_name', async () => {
    await signUpWithLegalRecords(client as never, input)

    const metadata = signUp.mock.calls[0]?.[0]?.options?.data

    expect(metadata).toEqual(expect.objectContaining({
      user_name: 'test-user',
      username: 'test-user',
      display_name: 'test-user',
      avatar_seed: 'Caleb',
    }))
    expect(Object.keys(metadata ?? {})).not.toContain('full_name')
  })
})
