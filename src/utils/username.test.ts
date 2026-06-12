import { describe, expect, it } from 'vitest'
import {
  getDisplayNameValidationError,
  getUsernameValidationError,
} from './username'

describe('getUsernameValidationError', () => {
  it('accepts a valid lowercase handle', () => {
    expect(getUsernameValidationError('bilal_42')).toBeNull()
    expect(getUsernameValidationError('a.b-c_d')).toBeNull()
  })

  it('rejects a too-short handle', () => {
    expect(getUsernameValidationError('ab')).toBe('Kullanıcı adı en az 3 karakter olmalıdır.')
  })

  it('rejects a too-long handle', () => {
    expect(getUsernameValidationError('a'.repeat(33))).toBe('Kullanıcı adı en fazla 32 karakter olabilir.')
  })

  it('rejects spaces and uppercase as a format error', () => {
    const formatMessage =
      'Kullanıcı adı yalnızca küçük harf, rakam, nokta, tire ve alt çizgi içerebilir. Boşluk kullanılamaz.'
    expect(getUsernameValidationError('ali veli')).toBe(formatMessage)
    expect(getUsernameValidationError('AliVeli')).toBe(formatMessage)
    expect(getUsernameValidationError('.leadingdot')).toBe(formatMessage)
  })
})

describe('getDisplayNameValidationError', () => {
  it('accepts a visible name with spaces', () => {
    expect(getDisplayNameValidationError('bilalim ben')).toBeNull()
  })

  it('rejects an empty display name', () => {
    expect(getDisplayNameValidationError('   ')).toBe('Görünen ad boş olamaz.')
  })

  it('rejects a too-long display name', () => {
    expect(getDisplayNameValidationError('x'.repeat(41))).toBe('Görünen ad en fazla 40 karakter olabilir.')
  })
})
