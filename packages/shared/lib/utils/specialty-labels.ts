/**
 * specialty-labels.ts
 *
 * Client-safe utility — NO server-side imports.
 * Maps English DB slugs to Arabic display labels for doctor specialties.
 * Import from here in Client Components; frontdesk.ts re-exports this too.
 */

const SPECIALTY_AR: Record<string, string> = {
  internal_medicine: 'باطنة',
  cardiology: 'قلب',
  dermatology: 'جلدية',
  pediatrics: 'أطفال',
  gynecology: 'نساء وتوليد',
  orthopedics: 'عظام',
  neurology: 'مخ وأعصاب',
  ophthalmology: 'عيون',
  ent: 'أنف وأذن وحنجرة',
  urology: 'مسالك بولية',
  psychiatry: 'طب نفسي',
  general_surgery: 'جراحة عامة',
  general: 'طب عام',
  dentistry: 'أسنان',
  radiology: 'أشعة',
  anesthesiology: 'تخدير',
  oncology: 'أورام',
  nephrology: 'كلى',
  pulmonology: 'صدر وتنفس',
  gastroenterology: 'جهاز هضمي',
  endocrinology: 'غدد صماء',
  rheumatology: 'روماتيزم',
  hematology: 'دم',
  infectious_diseases: 'أمراض معدية',
  plastic_surgery: 'جراحة تجميل',
  vascular_surgery: 'جراحة أوعية دموية',
  neurosurgery: 'جراحة مخ وأعصاب',
  thoracic_surgery: 'جراحة صدر',
  pediatric_surgery: 'جراحة أطفال',
  physical_therapy: 'علاج طبيعي',
  nutrition: 'تغذية',
  family_medicine: 'طب أسرة',
  emergency_medicine: 'طب طوارئ',
  sports_medicine: 'طب رياضي',
  geriatrics: 'طب المسنين',
}

/**
 * Translates an English specialty slug (e.g. "cardiology") to Arabic (e.g. "قلب").
 * Returns the original value unchanged if no translation is found.
 */
export function translateSpecialty(specialty: string | null | undefined): string {
  if (!specialty) return ''
  const key = specialty.trim().toLowerCase().replace(/\s+/g, '_')
  return SPECIALTY_AR[key] ?? specialty
}
