import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LEGAL_LOCALE,
  PRIVACY_NOTICE_DOCUMENT_SHA256,
  PRIVACY_NOTICE_VERSION,
  TERMS_DOCUMENT_SHA256,
  TERMS_VERSION,
} from '@/src/legal/constants'

export type LegalSignupInput = {
  email: string
  password: string
  username: string
  avatarSeed: string
  emailRedirectTo: string
}

export function buildTermsAcceptanceMetadata() {
  return {
    legal_terms_accepted: true,
    legal_terms_version: TERMS_VERSION,
    legal_terms_locale: LEGAL_LOCALE,
    legal_terms_hash: TERMS_DOCUMENT_SHA256,
  }
}

export function buildPrivacyNoticeDeliveryMetadata() {
  return {
    legal_privacy_notice_delivered: true,
    legal_privacy_notice_version: PRIVACY_NOTICE_VERSION,
    legal_privacy_notice_locale: LEGAL_LOCALE,
    legal_privacy_notice_hash: PRIVACY_NOTICE_DOCUMENT_SHA256,
  }
}

export function buildSignupLegalMetadata() {
  return {
    ...buildTermsAcceptanceMetadata(),
    ...buildPrivacyNoticeDeliveryMetadata(),
  }
}

export async function signUpWithLegalRecords(
  supabase: Pick<SupabaseClient, 'auth'>,
  input: LegalSignupInput,
) {
  const legalMetadata = buildSignupLegalMetadata()

  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        // Seed kergit_app.profiles via the signup trigger.
        // Initial display_name equals the chosen username.
        user_name: input.username,
        username: input.username,
        display_name: input.username,
        avatar_seed: input.avatarSeed,
        ...legalMetadata,
      },
      emailRedirectTo: input.emailRedirectTo,
    },
  })
}
