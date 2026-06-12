export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Şifre en az 8 karakter olmalı ve büyük harf, küçük harf, rakam ve sembol içermelidir'

export function getPasswordValidationError(password: string): string | null {
  if (password.length < 8) return PASSWORD_REQUIREMENTS_MESSAGE
  if (!/[a-z]/.test(password)) return PASSWORD_REQUIREMENTS_MESSAGE
  if (!/[A-Z]/.test(password)) return PASSWORD_REQUIREMENTS_MESSAGE
  if (!/[0-9]/.test(password)) return PASSWORD_REQUIREMENTS_MESSAGE
  if (!/[^a-zA-Z0-9]/.test(password)) return PASSWORD_REQUIREMENTS_MESSAGE
  return null
}

export function isStrongPassword(password: string): boolean {
  return getPasswordValidationError(password) === null
}
