#!/usr/bin/env python3
"""
Phase 1 — GitHub Drug JSON Transformer
Converts mohmedn424/Egypt-drugs-database JSON format into MedAssist's
EgyptianDrug TypeScript format.

Input:  drugs_github_raw.json  (drop the downloaded JSON here)
        → from: https://github.com/mohmedn424/Egypt-drugs-database
        → file: "(JSON) New prices up to 03-08-2024.json"

Output: drugs_github_transformed.json
        → merged into egyptian-drugs.ts by the merge script

Fields in source JSON:
  id, tradename, activeingredient, company, form, group,
  new_price, pharmacology, route

Fields we produce (EgyptianDrug interface):
  id, brandName, brandNameAr, genericName, strength,
  form (DrugForm), category, subcategory, defaults {type, frequency, duration}
  source: 'github-2024'  (so curated 801 take priority in search)
"""

import json
import re
import sys
from pathlib import Path

INPUT_FILE  = Path(__file__).parent / "drugs_github_raw.json"
OUTPUT_FILE = Path(__file__).parent / "drugs_github_transformed.json"

# ============================================================================
# FORM MAPPING  (56 unique forms → our DrugForm enum values)
# Used by MedicationChips: أقراص|كبسولة|شراب|حقن|كريم|نقط|بخاخ|لبوس
# ============================================================================

FORM_MAP: dict[str, str] = {
    # Solid oral
    "tab": "أقراص",
    "tabs": "أقراص",
    "tablet": "أقراص",
    "tablets": "أقراص",
    "f.c tab": "أقراص",
    "f.c tabs": "أقراص",
    "f.c. tab": "أقراص",
    "f.c. tabs": "أقراص",
    "ec tab": "أقراص",
    "sr tab": "أقراص",
    "sr tabs": "أقراص",
    "er tab": "أقراص",
    "er tabs": "أقراص",
    "effervescent tab": "أقراص",
    "chewable tab": "أقراص",
    "dispersible tab": "أقراص",
    "sublingual tab": "أقراص",
    "orodispersible tab": "أقراص",
    "buccal tab": "أقراص",
    # Capsule
    "cap": "كبسولة",
    "caps": "كبسولة",
    "capsule": "كبسولة",
    "capsules": "كبسولة",
    "sr cap": "كبسولة",
    "sr caps": "كبسولة",
    "er cap": "كبسولة",
    "er caps": "كبسولة",
    "hard cap": "كبسولة",
    "soft cap": "كبسولة",
    "soft gelatin cap": "كبسولة",
    # Liquid oral
    "syrup": "شراب",
    "suspension": "شراب",
    "oral suspension": "شراب",
    "oral solution": "شراب",
    "solution": "شراب",
    "oral drops": "نقط",
    "drops": "نقط",
    "elixir": "شراب",
    "mixture": "شراب",
    # Topical
    "cream": "كريم",
    "ointment": "كريم",
    "gel": "كريم",
    "lotion": "كريم",
    "foam": "كريم",
    "patch": "كريم",
    "topical solution": "كريم",
    # Inhaled
    "inhaler": "بخاخ",
    "inhalation": "بخاخ",
    "nasal spray": "بخاخ",
    "nasal drops": "نقط",
    "eye drops": "نقط",
    "ear drops": "نقط",
    "eye ointment": "كريم",
    # Injectable
    "injection": "حقن",
    "vial": "حقن",
    "ampoule": "حقن",
    "amp": "حقن",
    "i.v.": "حقن",
    "i.m.": "حقن",
    "infusion": "حقن",
    "prefilled syringe": "حقن",
    # Suppository / other
    "suppository": "لبوس",
    "suppositories": "لبوس",
    "pessary": "لبوس",
    "ovule": "لبوس",
    "rectal": "لبوس",
}


def map_form(raw_form: str) -> str:
    """Map raw form string to our DrugForm value."""
    key = (raw_form or "").strip().lower()
    if key in FORM_MAP:
        return FORM_MAP[key]
    # Partial match fallback
    for k, v in FORM_MAP.items():
        if k in key:
            return v
    return "أقراص"  # safe default


# ============================================================================
# CATEGORY MAPPING  (group strings → clinical categories)
# Source has 200+ unique group values; map to ~25 clinical categories
# ============================================================================

GROUP_CATEGORY_MAP: list[tuple[str, str, str]] = [
    # (substring_to_match_lower, category, subcategory)
    ("antibiotic", "Antibiotics", ""),
    ("antibacterial", "Antibiotics", ""),
    ("anti-infect", "Antibiotics", ""),
    ("penicillin", "Antibiotics", "Penicillins"),
    ("cephalosporin", "Antibiotics", "Cephalosporins"),
    ("macrolide", "Antibiotics", "Macrolides"),
    ("quinolone", "Antibiotics", "Fluoroquinolones"),
    ("fluoroquin", "Antibiotics", "Fluoroquinolones"),
    ("tetracycline", "Antibiotics", "Tetracyclines"),
    ("metronidazol", "Antibiotics", "Metronidazole"),
    ("antifungal", "Antifungals", ""),
    ("antiviral", "Antivirals", ""),
    ("antiparasit", "Antiparasitic", ""),
    ("antihelm", "Antiparasitic", ""),
    ("nsaid", "Analgesics", "NSAIDs"),
    ("non-steroidal", "Analgesics", "NSAIDs"),
    ("analgesic", "Analgesics", ""),
    ("antipyretic", "Analgesics", ""),
    ("pain", "Analgesics", ""),
    ("opioid", "Analgesics", "Opioids"),
    ("corticosteroid", "Corticosteroids", ""),
    ("steroid", "Corticosteroids", ""),
    ("glucocorticoid", "Corticosteroids", ""),
    ("antihypertens", "Cardiovascular", "Antihypertensives"),
    ("ace inhibitor", "Cardiovascular", "ACE Inhibitors"),
    ("arb", "Cardiovascular", "ARBs"),
    ("beta block", "Cardiovascular", "Beta Blockers"),
    ("calcium channel", "Cardiovascular", "Calcium Channel Blockers"),
    ("diuretic", "Cardiovascular", "Diuretics"),
    ("cardiac glycoside", "Cardiovascular", "Cardiac Glycosides"),
    ("anticoagul", "Cardiovascular", "Anticoagulants"),
    ("antiplatel", "Cardiovascular", "Antiplatelets"),
    ("statin", "Cardiovascular", "Statins"),
    ("lipid", "Cardiovascular", "Lipid-lowering"),
    ("antidiabet", "Diabetes", ""),
    ("insulin", "Diabetes", "Insulin"),
    ("biguanide", "Diabetes", "Metformin"),
    ("sulfonylurea", "Diabetes", "Sulfonylureas"),
    ("glp-1", "Diabetes", "GLP-1 Agonists"),
    ("bronchodilat", "Respiratory", "Bronchodilators"),
    ("asthma", "Respiratory", "Asthma"),
    ("expectorant", "Respiratory", "Expectorants"),
    ("mucolytic", "Respiratory", "Mucolytics"),
    ("antitussive", "Respiratory", "Cough Suppressants"),
    ("antihistamine", "Allergy", "Antihistamines"),
    ("histamine", "Allergy", "Antihistamines"),
    ("decongest", "Allergy", "Decongestants"),
    ("proton pump", "Gastrointestinal", "Proton Pump Inhibitors"),
    ("antacid", "Gastrointestinal", "Antacids"),
    ("h2 block", "Gastrointestinal", "H2 Blockers"),
    ("antiemetic", "Gastrointestinal", "Antiemetics"),
    ("laxative", "Gastrointestinal", "Laxatives"),
    ("antidiarrhe", "Gastrointestinal", "Antidiarrheals"),
    ("antispasmodic", "Gastrointestinal", "Antispasmodics"),
    ("thyroid", "Endocrine", "Thyroid"),
    ("antithyroid", "Endocrine", "Antithyroid"),
    ("hormone", "Endocrine", ""),
    ("contraceptive", "Endocrine", "Contraceptives"),
    ("antidepressant", "Psychiatry", "Antidepressants"),
    ("ssri", "Psychiatry", "SSRIs"),
    ("antipsychotic", "Psychiatry", "Antipsychotics"),
    ("anxiolytic", "Psychiatry", "Anxiolytics"),
    ("benzodiazepine", "Psychiatry", "Benzodiazepines"),
    ("hypnotic", "Psychiatry", "Hypnotics"),
    ("sedative", "Psychiatry", "Sedatives"),
    ("anticonvuls", "Neurology", "Anticonvulsants"),
    ("antiepileptic", "Neurology", "Anticonvulsants"),
    ("migraine", "Neurology", "Migraine"),
    ("parkinson", "Neurology", "Parkinson's"),
    ("alzheimer", "Neurology", "Dementia"),
    ("vitamin", "Vitamins & Supplements", ""),
    ("supplement", "Vitamins & Supplements", ""),
    ("mineral", "Vitamins & Supplements", "Minerals"),
    ("iron", "Vitamins & Supplements", "Iron"),
    ("calcium", "Vitamins & Supplements", "Calcium"),
    ("urologica", "Urology", ""),
    ("prostate", "Urology", "BPH"),
    ("erectile", "Urology", "Erectile Dysfunction"),
    ("ophthalm", "Ophthalmology", ""),
    ("eye", "Ophthalmology", ""),
    ("dermatol", "Dermatology", ""),
    ("topical antibiotic", "Dermatology", "Topical Antibiotics"),
    ("acne", "Dermatology", "Acne"),
    ("antifungal topical", "Dermatology", "Antifungals"),
    ("muscle relaxant", "Musculoskeletal", "Muscle Relaxants"),
    ("gout", "Musculoskeletal", "Gout"),
    ("osteoporosis", "Musculoskeletal", "Osteoporosis"),
    ("immunosuppressant", "Immunology", ""),
    ("biological", "Immunology", "Biologics"),
    ("chemotherapy", "Oncology", ""),
    ("antineoplastic", "Oncology", ""),
]


def map_group_to_category(group: str) -> tuple[str, str]:
    """Map group string to (category, subcategory)."""
    g = (group or "").lower()
    for substr, cat, subcat in GROUP_CATEGORY_MAP:
        if substr in g:
            return cat, subcat
    return "Other", ""


# ============================================================================
# STRENGTH EXTRACTOR  (from tradename string)
# Examples: "Augmentin 625mg" → "625mg"
#           "Flagyl 500 mg" → "500mg"
#           "Amoxil 250mg/5ml" → "250mg/5ml"
# ============================================================================

STRENGTH_RE = re.compile(
    r"(\d+\.?\d*\s*(?:mg|mcg|μg|g|iu|%|mmol|ml|mg/ml|mg/5ml|mcg/dose|mg/dose)"
    r"(?:\s*/\s*\d+\.?\d*\s*(?:mg|mcg|g|iu|%|ml))?)",
    re.IGNORECASE,
)


def extract_strength(tradename: str) -> str | None:
    matches = STRENGTH_RE.findall(tradename or "")
    if matches:
        # Clean up whitespace around slashes
        s = matches[0].strip()
        s = re.sub(r"\s*/\s*", "/", s)
        s = re.sub(r"\s+", "", s)
        return s
    return None


# ============================================================================
# SMART DEFAULTS  (category + form → prescription defaults)
# ============================================================================

def get_defaults(category: str, form: str) -> dict:
    """Return smart defaults based on clinical category and form."""
    # Frequency
    if category in ("Antibiotics", "Antivirals", "Antifungals"):
        freq = "1-pill-twice-daily"
        dur  = "7-days"
    elif category in ("Analgesics",):
        freq = "1-pill-three-times-daily"
        dur  = "3-days"
    elif category in ("Cardiovascular", "Diabetes", "Endocrine"):
        freq = "1-pill-once-daily"
        dur  = "ongoing"
    elif category in ("Psychiatry", "Neurology"):
        freq = "1-pill-once-daily"
        dur  = "ongoing"
    elif category in ("Gastrointestinal",):
        freq = "1-pill-twice-daily"
        dur  = "7-days"
    elif category in ("Respiratory", "Allergy"):
        freq = "1-pill-twice-daily"
        dur  = "5-days"
    else:
        freq = "1-pill-twice-daily"
        dur  = "5-days"

    # Form overrides
    if form in ("بخاخ", "كريم", "نقط"):
        freq = "1-pill-twice-daily"
        dur  = "7-days"
    if form == "حقن":
        freq = "1-pill-once-daily"
        dur  = "5-days"

    # Meal instructions
    instructions = "after-food"
    if category in ("Antibiotics",):
        instructions = "after-food"
    elif category in ("Gastrointestinal",):
        instructions = "before-food"

    return {
        "type": "prescription",
        "frequency": freq,
        "duration": dur,
        "instructions": instructions,
    }


# ============================================================================
# MAIN TRANSFORM
# ============================================================================

def transform(raw_drugs: list[dict]) -> list[dict]:
    transformed = []
    skipped_cosmetic = 0

    for raw in raw_drugs:
        group = (raw.get("group") or "").strip()
        tradename = (raw.get("tradename") or "").strip()
        active = (raw.get("activeingredient") or "").strip()
        form_raw = (raw.get("form") or "").strip()
        company = (raw.get("company") or "").strip()
        price_raw = raw.get("new_price")
        pharmacology = (raw.get("pharmacology") or "").strip()
        source_id = str(raw.get("id", ""))

        # Skip empty entries
        if not tradename:
            continue

        # Skip obvious cosmetics / empty group
        # (4,140 records have empty group — mostly cosmetics/supplements)
        if not group and not active and not pharmacology:
            skipped_cosmetic += 1
            continue

        category, subcategory = map_group_to_category(group or pharmacology)
        form = map_form(form_raw)
        strength = extract_strength(tradename)
        defaults = get_defaults(category, form)

        # Parse price
        price_egp: float | None = None
        if price_raw is not None:
            try:
                price_egp = float(str(price_raw).replace(",", ""))
            except ValueError:
                pass

        # Build search terms
        search_terms = [
            tradename.lower(),
            active.lower(),
            company.lower(),
        ]
        if strength:
            search_terms.append(strength.lower())

        drug = {
            "id": f"gh-{source_id}",
            "brandName": tradename,
            "brandNameAr": None,           # Only 6 in the source — populated by Phase 2
            "genericName": active or None,
            "strength": strength,
            "form": form,
            "category": category,
            "subcategory": subcategory or None,
            "company": company or None,
            "priceEGP": price_egp,
            "defaults": defaults,
            "searchTerms": [t for t in search_terms if t],
            "source": "github-2024",       # Lower priority than curated-801
        }

        transformed.append(drug)

    print(f"  ✅ Transformed: {len(transformed)} drugs")
    print(f"  ⏭  Skipped (no data): {skipped_cosmetic}")
    return transformed


def main():
    if not INPUT_FILE.exists():
        print(f"❌ Input file not found: {INPUT_FILE}")
        print()
        print("To use this script:")
        print("  1. Download '(JSON) New prices up to 03-08-2024.json'")
        print("     from https://github.com/mohmedn424/Egypt-drugs-database")
        print(f"  2. Save it as: {INPUT_FILE}")
        print("  3. Run this script again")
        sys.exit(1)

    print(f"📂 Loading {INPUT_FILE}...")
    raw = json.loads(INPUT_FILE.read_text(encoding="utf-8"))

    # Source can be list or wrapped dict
    if isinstance(raw, dict):
        raw_drugs = raw.get("drugs") or raw.get("data") or list(raw.values())
    else:
        raw_drugs = raw

    print(f"   {len(raw_drugs)} raw records")
    print()
    print("🔄 Transforming...")

    transformed = transform(raw_drugs)

    OUTPUT_FILE.write_text(
        json.dumps(transformed, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"\n✅ Written to {OUTPUT_FILE}")
    print(f"   Ready for merge into egyptian-drugs.ts")


if __name__ == "__main__":
    main()
