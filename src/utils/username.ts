// Username (account handle) and display-name validation.
//
// Mirrors the kergit_app.profiles DB constraints so the UI rejects values the
// database would reject, and shows specific Turkish messages instead of a
// generic server error.
//
// DB:
//   profiles_user_name_length  -> active user: 3..32 chars
//   profiles_user_name_format  -> user_name = lower(user_name)
//                                 AND user_name ~ '^[a-z0-9_][a-z0-9_.-]*[a-z0-9_]$'
//   profiles_display_name_length -> 1..40 chars

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32
export const DISPLAY_NAME_MAX_LENGTH = 40

// Lowercase letters/digits/underscore at both ends; dot and hyphen allowed inside.
const USERNAME_FORMAT_PATTERN = /^[a-z0-9_][a-z0-9_.-]*[a-z0-9_]$/

export const DUPLICATE_USERNAME_MESSAGE =
  'Bu kullanıcı adı kullanımda. Lütfen başka bir kullanıcı adı seçin.'
export const USERNAME_FORMAT_MESSAGE =
  'Kullanıcı adı yalnızca küçük harf, rakam, nokta, tire ve alt çizgi içerebilir. Boşluk kullanılamaz.'
export const USERNAME_TOO_SHORT_MESSAGE = 'Kullanıcı adı en az 3 karakter olmalıdır.'
export const USERNAME_TOO_LONG_MESSAGE = 'Kullanıcı adı en fazla 32 karakter olabilir.'

export const DISPLAY_NAME_EMPTY_MESSAGE = 'Görünen ad boş olamaz.'
export const DISPLAY_NAME_TOO_LONG_MESSAGE = 'Görünen ad en fazla 40 karakter olabilir.'

// Returns a Turkish error message, or null when the username is valid.
export function getUsernameValidationError(value: string): string | null {
  const trimmed = value.trim()

  if (trimmed.length < USERNAME_MIN_LENGTH) return USERNAME_TOO_SHORT_MESSAGE
  if (trimmed.length > USERNAME_MAX_LENGTH) return USERNAME_TOO_LONG_MESSAGE
  if (!USERNAME_FORMAT_PATTERN.test(trimmed)) return USERNAME_FORMAT_MESSAGE

  return null
}

// Returns a Turkish error message, or null when the display name is valid.
export function getDisplayNameValidationError(value: string): string | null {
  const trimmed = value.trim()

  if (trimmed.length === 0) return DISPLAY_NAME_EMPTY_MESSAGE
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return DISPLAY_NAME_TOO_LONG_MESSAGE

  return null
}
