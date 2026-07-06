// Минимальный i18n-слой без внешних зависимостей (приложение полностью офлайн).
// Добавление языка = новый словарь с теми же ключами + строка в `locales`.
// Сейчас единственная и дефолтная локаль — ru.

import { ru, type TranslationKey } from './ru'

export type Locale = 'ru'

const locales: Record<Locale, Record<TranslationKey, string>> = { ru }

let currentLocale: Locale = 'ru'

export function setLocale(locale: Locale) {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: TranslationKey): string {
  return locales[currentLocale][key] ?? key
}

export type { TranslationKey }
