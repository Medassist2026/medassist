/**
 * Extended Drug Search — GitHub Egypt Drug Database (25,374 drugs)
 * Source: github.com/mohmedn424/Egypt-drugs-database (August 2024 prices)
 *
 * Two-tier search strategy:
 *   Tier 1 — curated EGYPTIAN_DRUGS (801 drugs, full schema, priority)
 *   Tier 2 — this module (25K drugs, lightweight, fills the gap)
 *
 * Loaded lazily and cached in module scope (survives across requests
 * in the same Node.js process, so cold-start cost is paid once).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExtendedDrug {
  id: string
  brandName: string
  genericName: string | null
  strength: string | null
  form: string                   // Arabic UI value: 'أقراص' | 'كبسولة' | ...
  category: string
  subcategory: string | null
  company: string | null
  priceEGP: number | null
  defaults: {
    type: string
    frequency: string
    duration: string
    instructions: string
  }
  source: 'github-2024'
}

// ============================================================================
// FORM → English DrugForm mapping (for MedicationChips compatibility)
// ============================================================================

const ARABIC_TO_ENGLISH_FORM: Record<string, string> = {
  'أقراص':   'tablet',
  'كبسولة':  'capsule',
  'شراب':    'syrup',
  'حقن':     'injection',
  'كريم':    'cream',
  'نقط':     'drops',
  'بخاخ':    'inhaler',
  'لبوس':    'suppository',
}

// ============================================================================
// MODULE-LEVEL CACHE (survives across requests in same process)
// ============================================================================

let _drugs: ExtendedDrug[] | null = null

function getExtendedDrugs(): ExtendedDrug[] {
  if (!_drugs) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _drugs = require('./drugs-extended.json') as ExtendedDrug[]
  }
  return _drugs
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Search the extended (GitHub) drug database.
 * Returns results NOT already covered by the curated database.
 * Uses simple prefix → includes matching (fast, no Fuse init overhead for 25K).
 *
 * @param query         Search string (brand name or generic)
 * @param limit         Max results to return
 * @param excludeIds    Set of IDs already returned by curated search (avoid dupes)
 */
export function searchExtendedDrugs(
  query: string,
  limit: number = 10,
  excludeIds: Set<string> = new Set()
): ExtendedDrug[] {
  if (!query || query.trim().length < 2) return []

  const q = query.trim().toLowerCase()
  const drugs = getExtendedDrugs()

  const exact:      ExtendedDrug[] = []
  const startsWith: ExtendedDrug[] = []
  const includes:   ExtendedDrug[] = []

  for (const drug of drugs) {
    if (excludeIds.has(drug.id)) continue

    const brand   = drug.brandName.toLowerCase()
    const generic = (drug.genericName || '').toLowerCase()

    if (brand === q || generic === q) {
      exact.push(drug)
    } else if (brand.startsWith(q) || generic.startsWith(q)) {
      startsWith.push(drug)
    } else if (brand.includes(q) || generic.includes(q)) {
      includes.push(drug)
    }

    // Early exit once we have enough candidates
    if (exact.length + startsWith.length + includes.length >= limit * 3) break
  }

  return [...exact, ...startsWith, ...includes].slice(0, limit)
}

/**
 * Format an ExtendedDrug for the API response (same shape as curated drugs)
 */
export function formatExtendedDrugResult(drug: ExtendedDrug) {
  return {
    id:               drug.id,
    name:             drug.brandName,
    nameAr:           null,
    genericName:      drug.genericName,
    strength:         drug.strength,
    strengthVariants: undefined,
    form:             ARABIC_TO_ENGLISH_FORM[drug.form] || 'tablet',
    category:         drug.category,
    subcategory:      drug.subcategory,
    priceEGP:         drug.priceEGP,
    defaults:         drug.defaults,
    requiresMonitoring: false,
    controlledSubstance: false,
    source:           'github-2024' as const,
  }
}

// ============================================================================
// ALTERNATIVES LOOKUP — same generic, sorted cheapest first
// ============================================================================

export interface DrugAlternative {
  id:          string
  brandName:   string
  genericName: string | null
  strength:    string | null
  form:        string        // Arabic form value
  company:     string | null
  priceEGP:    number
  source:      string
}

/**
 * Find all drugs that share the same generic name, sorted cheapest-first.
 * Used to power the "cheaper alternatives" popover in MedicationChips.
 *
 * Matching strategy (lenient):
 *   - normalised exact match on generic name
 *   - OR the stored generic starts with / contains the queried generic
 *   - Only returns entries that have a known, positive price
 *
 * @param genericName  Generic INN name (English), e.g. "amoxicillin"
 * @param excludeId    Drug ID to exclude (the currently selected one)
 * @param limit        Max results (default 10)
 */
export function getDrugAlternativesByGeneric(
  genericName: string,
  excludeId?: string,
  limit: number = 10
): DrugAlternative[] {
  if (!genericName || genericName.trim().length < 3) return []

  const q = genericName.trim().toLowerCase()
  const drugs = getExtendedDrugs()

  const results: DrugAlternative[] = []

  for (const drug of drugs) {
    if (drug.id === excludeId) continue
    if (!drug.priceEGP || drug.priceEGP <= 0) continue

    const g = (drug.genericName || '').toLowerCase().trim()
    if (!g) continue

    // Lenient match: exact, or one contains the other (handles combo drugs)
    const isMatch = g === q || g.startsWith(q) || q.startsWith(g) || g.includes(q)
    if (!isMatch) continue

    results.push({
      id:          drug.id,
      brandName:   drug.brandName,
      genericName: drug.genericName,
      strength:    drug.strength,
      form:        drug.form,
      company:     drug.company,
      priceEGP:    drug.priceEGP,
      source:      drug.source,
    })
  }

  // Sort cheapest first
  results.sort((a, b) => a.priceEGP - b.priceEGP)

  return results.slice(0, limit)
}

/**
 * Total number of extended drugs loaded
 */
export function getExtendedDrugCount(): number {
  return getExtendedDrugs().length
}
