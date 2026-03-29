#!/usr/bin/env python3
"""
Merge DrugEye 2026 prices into drugs-extended.json

Strategy:
1. Normalise drug names (lowercase, strip punctuation, strip trailing dosage info)
2. For each extended drug, try to find a DrugEye match by normalised brand name
3. When matched, overwrite priceEGP with the 2026 price and mark source
4. Write merged file back to drugs-extended.json
5. Also write a standalone drugeye-price-map.json for quick lookup
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent   # medassist/
EXTENDED_PATH = ROOT / "packages/shared/lib/data/drugs-extended.json"
DRUGEYE_PATH  = Path(__file__).parent / "drugs_drugeye_2026.json"
PRICEMAP_PATH = ROOT / "packages/shared/lib/data/drugeye-price-map.json"

# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

STRIP_RE  = re.compile(r"[^a-z0-9 ]")
DOSAGE_RE = re.compile(r"\s+\d[\d.,/]*\s*(mg|mcg|iu|ml|g|%|ug|mmol|unit).*$")

def normalise(name: str) -> str:
    """Lower, strip non-alnum, remove trailing dosage information."""
    n = name.lower()
    n = DOSAGE_RE.sub("", n)
    n = STRIP_RE.sub(" ", n)
    return " ".join(n.split())


def head_words(name: str, n: int = 2) -> str:
    """First n words — good enough for brand-name matching."""
    return " ".join(normalise(name).split()[:n])


# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

print("Loading extended drugs …")
extended: list[dict] = json.loads(EXTENDED_PATH.read_text(encoding="utf-8"))
print(f"  {len(extended):,} drugs loaded")

print("Loading DrugEye 2026 data …")
de_raw = json.loads(DRUGEYE_PATH.read_text(encoding="utf-8"))
de_drugs: list[dict] = de_raw["drugs"]
print(f"  {len(de_drugs):,} DrugEye drugs loaded")

# ---------------------------------------------------------------------------
# Build DrugEye lookup tables
# ---------------------------------------------------------------------------

# exact normalised name  → entry
de_exact: dict[str, dict] = {}
# head-2-words           → list of entries  (for fuzzy fallback)
de_head2: dict[str, list[dict]] = {}

for d in de_drugs:
    brand = d.get("brandName", "")
    norm  = normalise(brand)
    h2    = head_words(brand)
    if norm and norm not in de_exact:
        de_exact[norm] = d
    if h2:
        de_head2.setdefault(h2, []).append(d)

print(f"  {len(de_exact):,} unique normalised names in DrugEye")

# ---------------------------------------------------------------------------
# Also build a price map by brand name for JSON export
# ---------------------------------------------------------------------------

price_map: dict[str, float] = {}   # normalised name → price

for d in de_drugs:
    norm  = normalise(d.get("brandName", ""))
    price = d.get("priceEGP")
    if norm and price is not None:
        price_map[norm] = price

# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

matched_exact = 0
matched_fuzzy = 0
unmatched     = 0

for drug in extended:
    brand = drug.get("brandName", "")
    norm  = normalise(brand)
    h2    = head_words(brand)

    # Tier-1: exact normalised match
    if norm in de_exact:
        de_entry = de_exact[norm]
        drug["priceEGP"]   = de_entry["priceEGP"]
        drug["priceSource"] = "drugeye-2026"
        if de_entry.get("genericName") and not drug.get("genericName"):
            drug["genericName"] = de_entry["genericName"]
        matched_exact += 1
        continue

    # Tier-2: head-2-word fuzzy match (only if single candidate)
    candidates = de_head2.get(h2, [])
    if len(candidates) == 1:
        de_entry = candidates[0]
        drug["priceEGP"]   = de_entry["priceEGP"]
        drug["priceSource"] = "drugeye-2026-fuzzy"
        matched_fuzzy += 1
        continue

    unmatched += 1

total = len(extended)
print(f"\nMerge results:")
print(f"  Exact matches : {matched_exact:,}  ({matched_exact/total*100:.1f}%)")
print(f"  Fuzzy matches : {matched_fuzzy:,}  ({matched_fuzzy/total*100:.1f}%)")
print(f"  Unmatched     : {unmatched:,}  ({unmatched/total*100:.1f}%)")
print(f"  Total updated : {matched_exact+matched_fuzzy:,}")

# ---------------------------------------------------------------------------
# Write outputs
# ---------------------------------------------------------------------------

print(f"\nWriting {EXTENDED_PATH} …")
EXTENDED_PATH.write_text(
    json.dumps(extended, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8"
)
print(f"  Done ({EXTENDED_PATH.stat().st_size/1_048_576:.1f} MB)")

print(f"Writing {PRICEMAP_PATH} …")
PRICEMAP_PATH.write_text(
    json.dumps(price_map, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8"
)
print(f"  Done ({PRICEMAP_PATH.stat().st_size/1_024:.0f} KB)")

# ---------------------------------------------------------------------------
# Stats: also write all DrugEye drugs that DIDN'T match anything
#        (potential new drugs not in GitHub dataset)
# ---------------------------------------------------------------------------

extended_norms = {normalise(d.get("brandName", "")) for d in extended}
de_only = [d for d in de_drugs if normalise(d.get("brandName","")) not in extended_norms]
print(f"\nDrugEye-only drugs (not in extended): {len(de_only):,}")
print("  (These are in drugeye_2026 but not in the GitHub dataset — could be added later)")

print("\n✅ Merge complete!")
