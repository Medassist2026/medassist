import { ar } from './ar'
import { en } from './en'

export type Language = 'en' | 'ar'

/**
 * Type-safe translation key - ensures only valid keys can be used
 */
export type TranslationKey = keyof typeof ar

/**
 * Translation dictionary for both languages
 */
const translations = {
  en,
  ar,
}

/**
 * Get a translation with fallback support
 * @param key - The translation key
 * @param lang - The language ('en' or 'ar')
 * @returns The translated string, or the key itself as fallback
 */
export function t(key: string, lang: Language = 'ar'): string {
  const translations_dict = translations[lang] as Record<string, string>

  if (translations_dict && key in translations_dict) {
    return translations_dict[key]
  }

  // Fallback: if Arabic not available, try English
  if (lang === 'ar' && key in en) {
    return (en as Record<string, string>)[key]
  }

  // Final fallback: return the key itself (which is English-readable)
  return key
}

/**
 * Check if a language is RTL (Right-to-Left)
 * @param lang - The language
 * @returns true if RTL, false if LTR
 */
export function isRTL(lang: Language): boolean {
  return lang === 'ar'
}

/**
 * Get the direction attribute value for HTML element
 * @param lang - The language
 * @returns 'rtl' or 'ltr'
 */
export function getDir(lang: Language): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

/**
 * Format a date with language-specific formatting
 * @param date - The date to format
 * @param lang - The language
 * @returns Formatted date string
 */
export function formatDate(date: Date, lang: Language = 'ar'): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }

  if (lang === 'ar') {
    return date.toLocaleDateString('ar-EG', options)
  }

  return date.toLocaleDateString('en-US', options)
}

/**
 * Format a time with language-specific formatting
 * @param date - The date to format
 * @param lang - The language
 * @returns Formatted time string
 */
export function formatTime(date: Date, lang: Language = 'ar'): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  }

  if (lang === 'ar') {
    return date.toLocaleTimeString('ar-EG', options)
  }

  return date.toLocaleTimeString('en-US', options)
}

/**
 * Format a number with language-specific formatting
 * @param number - The number to format
 * @param lang - The language
 * @returns Formatted number string
 */
export function formatNumber(number: number, lang: Language = 'ar'): string {
  if (lang === 'ar') {
    return number.toLocaleString('ar-EG')
  }

  return number.toLocaleString('en-US')
}

/**
 * Format currency with language-specific formatting
 * @param amount - The amount to format
 * @param currency - The currency code (default: EGP for Egypt)
 * @param lang - The language
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = 'EGP',
  lang: Language = 'ar'
): string {
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
  }

  if (lang === 'ar') {
    return amount.toLocaleString('ar-EG', options)
  }

  return amount.toLocaleString('en-US', options)
}

/**
 * Get margin/padding utility class for RTL/LTR
 * Useful for Tailwind CSS margin/padding
 * @param direction - 'start' or 'end'
 * @param lang - The language
 * @returns The appropriate margin/padding direction ('l' for left in LTR, 'r' for right in RTL)
 */
export function getStartDir(lang: Language): 'l' | 'r' {
  return lang === 'ar' ? 'r' : 'l'
}

export function getEndDir(lang: Language): 'l' | 'r' {
  return lang === 'ar' ? 'l' : 'r'
}

/**
 * Get rotation direction for icons
 * @param lang - The language
 * @returns The rotation value
 */
export function getIconRotation(lang: Language): number {
  return lang === 'ar' ? 180 : 0
}

/**
 * Get text alignment for language
 * @param lang - The language
 * @returns 'text-right' for RTL, 'text-left' for LTR
 */
export function getTextAlign(lang: Language): 'text-left' | 'text-right' {
  return lang === 'ar' ? 'text-right' : 'text-left'
}

/**
 * Get flex direction for language-aware layouts
 * @param lang - The language
 * @returns 'flex-row' for LTR, 'flex-row-reverse' for RTL
 */
export function getFlexDir(lang: Language): 'flex-row' | 'flex-row-reverse' {
  return lang === 'ar' ? 'flex-row-reverse' : 'flex-row'
}

// Re-export translations
export { ar, en }
