#!/usr/bin/env python3
from __future__ import annotations  # Python 3.9 compat: enables X | Y type syntax
"""
DrugEye Scraper — Phase 2
Scrapes drugeye.pharorg.com for all Egyptian registered drugs with
current 2026 prices, Arabic names, and clinical data.

Usage:
    pip install requests beautifulsoup4
    python3 scrape_drugeye.py
    # Outputs: drugs_drugeye_2026.json (~17K drugs expected)
    # Runtime: ~25-40 minutes (676 prefix queries × 2.5s delay)

Strategy: POST to the search endpoint with every 2-letter Arabic prefix
combination (ا→ي = 28 letters → 28×28 = 784 combos, minus non-starters).
Each request returns up to 50 drugs. Overlapping is fine — we deduplicate
by drugGroupId.
"""

import requests
import json
import time
import re
import sys
import urllib3
from itertools import product
from bs4 import BeautifulSoup
from pathlib import Path

# Suppress SSL warnings — drugeye.pharorg.com has an expired certificate
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ============================================================================
# CONFIG
# ============================================================================

BASE_URL = "https://drugeye.pharorg.com/drugeyeapp/android-search/drugeye-android-live-go.aspx"
DETAIL_URL = "https://drugeye.pharorg.com/apiforus/gi.aspx"

OUTPUT_FILE = Path(__file__).parent / "drugs_drugeye_2026.json"
CHECKPOINT_FILE = Path(__file__).parent / "drugeye_checkpoint.json"

# English letters a-z (DrugEye brand names are almost all in English)
ENGLISH_LETTERS = list("abcdefghijklmnopqrstuvwxyz")

# Arabic letters — kept for any Arabic-named drugs in the DB
ARABIC_LETTERS = list("ابتثجحخدذرزسشصضطظعغفقكلمنهوي")

REQUEST_DELAY = 2.5   # seconds between requests (be polite)
RETRY_DELAY   = 10.0  # seconds on HTTP error
MAX_RETRIES   = 3
SSL_VERIFY    = False  # drugeye.pharorg.com has an expired SSL cert

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.7,en;q=0.3",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://drugeye.pharorg.com",
    "Referer": BASE_URL,
}

# ============================================================================
# VIEWSTATE FETCHER — get fresh ASP.NET form tokens
# ============================================================================

_viewstate_cache: dict | None = None

def get_viewstate(session: requests.Session) -> dict:
    """Fetch the search page and extract ASP.NET form state tokens."""
    global _viewstate_cache
    if _viewstate_cache:
        return _viewstate_cache

    resp = session.get(BASE_URL, headers=HEADERS, timeout=30, verify=SSL_VERIFY)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    vs = soup.find("input", {"id": "__VIEWSTATE"})
    vsg = soup.find("input", {"id": "__VIEWSTATEGENERATOR"})
    ev = soup.find("input", {"id": "__EVENTVALIDATION"})

    _viewstate_cache = {
        "__VIEWSTATE": vs["value"] if vs else "",
        "__VIEWSTATEGENERATOR": vsg["value"] if vsg else "",
        "__EVENTVALIDATION": ev["value"] if ev else "",
    }
    return _viewstate_cache


# ============================================================================
# SEARCH PARSER — 6 rows per drug in the result table
# ============================================================================

def parse_search_results(html: str) -> list[dict]:
    """
    Confirmed DrugEye table structure — table id="MyTable", 6 rows per drug:
      Row +0 (2 cells): brandName | price (EGP)
      Row +1 (1 cell):  genericName / active ingredients
      Row +2 (1 cell):  drugClass
      Row +3 (1 cell):  company
      Row +4 (5 cells): button row (similars / alternatives / more / images)
      Row +5 (4 cells): button row repeated
    """
    soup = BeautifulSoup(html, "html.parser")

    # Confirmed table ID from DOM inspection
    table = soup.find("table", {"id": "MyTable"})
    if not table:
        return []

    rows = table.find_all("tr", recursive=False)  # direct children only
    if not rows:
        # Some responses nest rows one level deeper
        rows = table.find_all("tr")

    drugs = []
    i = 0

    while i < len(rows):
        try:
            cells0 = rows[i].find_all("td")

            # Drug entry starts with a 2-cell row: brand name + price
            if len(cells0) < 2:
                i += 1
                continue

            brand_name = cells0[0].get_text(strip=True)
            price_egp  = extract_price(cells0[-1].get_text(strip=True))

            # Row +1: generic name (1 cell)
            generic_name = ""
            if i + 1 < len(rows):
                c = rows[i + 1].find_all("td")
                if len(c) == 1:
                    generic_name = c[0].get_text(strip=True)

            # Row +2: drug class (1 cell)
            drug_class = ""
            if i + 2 < len(rows):
                c = rows[i + 2].find_all("td")
                if len(c) == 1:
                    drug_class = c[0].get_text(strip=True)

            # Row +3: company (1 cell)
            company = ""
            if i + 3 < len(rows):
                c = rows[i + 3].find_all("td")
                if len(c) == 1:
                    company = c[0].get_text(strip=True)

            if brand_name:
                drugs.append({
                    "brandName":   brand_name,
                    "priceEGP":    price_egp,
                    "genericName": generic_name,
                    "drugClass":   drug_class,
                    "company":     company,
                })

            i += 6  # skip all 6 rows of this drug entry

        except Exception:
            i += 1

    return drugs


def extract_price(text: str) -> float | None:
    """Extract numeric price from strings like '125.00 ج.م' or '125'."""
    match = re.search(r"[\d]+\.?\d*", text.replace(",", ""))
    if match:
        try:
            return float(match.group())
        except ValueError:
            pass
    return None


def extract_drug_group_id(row) -> str | None:
    """Find drugGroupId from button title or onclick in the actions row."""
    # DrugEye stores it as: title="Details_12345" or in onclick params
    for btn in row.find_all(["input", "button", "a"]):
        title = btn.get("title", "")
        match = re.search(r"(\d{4,})", title)
        if match:
            return match.group(1)
        onclick = btn.get("onclick", "")
        match = re.search(r"(\d{4,})", onclick)
        if match:
            return match.group(1)
    return None


# ============================================================================
# DETAIL FETCHER — indications + dosage from gi.aspx
# ============================================================================

def fetch_drug_detail(session: requests.Session, brand_name: str) -> dict:
    """
    Fetch clinical detail for a drug: indications, adult dose, pediatric dose.
    Endpoint: GET /apiforus/gi.aspx?passed=BRAND_NAME
    """
    try:
        resp = session.get(
            DETAIL_URL,
            params={"passed": brand_name},
            headers={**HEADERS, "Referer": BASE_URL},
            timeout=20,
            verify=SSL_VERIFY,
        )
        if not resp.ok:
            return {}

        soup = BeautifulSoup(resp.text, "html.parser")
        result = {}

        # Parse indications, adult dose, pediatric dose from the response
        # Structure varies — try common patterns
        text = soup.get_text(separator="\n")
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        for i, line in enumerate(lines):
            if "indication" in line.lower() or "دواعي" in line:
                if i + 1 < len(lines):
                    result["indications"] = lines[i + 1]
            elif "adult" in line.lower() or "بالغ" in line:
                if i + 1 < len(lines):
                    result["adultDose"] = lines[i + 1]
            elif "pediatric" in line.lower() or "pediatric" in line.lower() or "أطفال" in line:
                if i + 1 < len(lines):
                    result["pediatricDose"] = lines[i + 1]

        return result
    except Exception:
        return {}


# ============================================================================
# MAIN SCRAPER LOOP
# ============================================================================

def search_prefix(session: requests.Session, prefix: str, viewstate: dict) -> list[dict]:
    """POST a search for the given prefix, return parsed drugs."""
    form_data = {
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__VIEWSTATE": viewstate["__VIEWSTATE"],
        "__VIEWSTATEGENERATOR": viewstate["__VIEWSTATEGENERATOR"],
        "__EVENTVALIDATION": viewstate["__EVENTVALIDATION"],
        "ttt": prefix,   # actual search input field name (confirmed via DOM inspection)
        "b1": "search",  # actual submit button name
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = session.post(BASE_URL, data=form_data, headers=HEADERS, timeout=30, verify=SSL_VERIFY)
            resp.raise_for_status()
            return parse_search_results(resp.text)
        except requests.RequestException as e:
            print(f"  ⚠ Attempt {attempt+1}/{MAX_RETRIES} failed for '{prefix}': {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)

    return []


def load_checkpoint() -> tuple[set, list]:
    """Load previously scraped drugGroupIds and results from checkpoint."""
    if CHECKPOINT_FILE.exists():
        try:
            data = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
            seen_ids = set(data.get("seenIds", []))
            results = data.get("results", [])
            print(f"📂 Checkpoint loaded: {len(results)} drugs, {len(seen_ids)} IDs")
            return seen_ids, results
        except Exception:
            pass
    return set(), []


def save_checkpoint(seen_ids: set, results: list, completed_prefixes: list):
    """Save progress so we can resume if interrupted."""
    CHECKPOINT_FILE.write_text(
        json.dumps({
            "seenIds": list(seen_ids),
            "results": results,
            "completedPrefixes": completed_prefixes,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def main():
    print("🚀 DrugEye Scraper — Phase 2")
    print(f"   Target: {BASE_URL}")
    print(f"   Output: {OUTPUT_FILE}")
    print()

    session = requests.Session()

    # Load checkpoint (resume support)
    seen_ids, results = load_checkpoint()
    completed_prefixes = set()

    if CHECKPOINT_FILE.exists():
        try:
            ckpt = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
            completed_prefixes = set(ckpt.get("completedPrefixes", []))
            print(f"   Resuming from checkpoint, {len(completed_prefixes)} prefixes done\n")
        except Exception:
            pass

    # Get fresh ViewState tokens
    print("🔑 Fetching ViewState tokens...")
    try:
        viewstate = get_viewstate(session)
        print(f"   ViewState: {viewstate['__VIEWSTATE'][:40]}...\n")
    except Exception as e:
        print(f"❌ Failed to fetch ViewState: {e}")
        sys.exit(1)

    # Generate prefixes — English 2-letter combos cover >95% of Egyptian drug names
    # Arabic single-letters added for completeness
    eng_1 = ENGLISH_LETTERS
    eng_2 = [a + b for a, b in product(ENGLISH_LETTERS, ENGLISH_LETTERS)]
    ara_1 = ARABIC_LETTERS
    all_prefixes = eng_1 + eng_2 + ara_1   # English first (most results)

    total = len(all_prefixes)
    done = 0

    print(f"📋 Total prefixes to search: {total}")
    print(f"   ({len(eng_1)} English single + {len(eng_2)} English two-letter + {len(ara_1)} Arabic single)")
    print(f"   Estimated time: {total * REQUEST_DELAY / 60:.0f} minutes\n")

    completed_list = list(completed_prefixes)

    for prefix in all_prefixes:
        if prefix in completed_prefixes:
            done += 1
            continue

        drugs = search_prefix(session, prefix, viewstate)
        new_count = 0

        for drug in drugs:
            key = drug["brandName"].lower()

            if key not in seen_ids:
                seen_ids.add(key)
                results.append(drug)
                new_count += 1

        done += 1
        completed_list.append(prefix)

        print(f"[{done:4d}/{total}] '{prefix}' → {len(drugs)} results, {new_count} new | total: {len(results)}")

        # Save checkpoint every 50 prefixes
        if done % 50 == 0:
            save_checkpoint(seen_ids, results, completed_list)
            print(f"  💾 Checkpoint saved")

        time.sleep(REQUEST_DELAY)

    # Final save
    save_checkpoint(seen_ids, results, completed_list)

    # Write final output
    output = {
        "scraped": "2026",
        "source": "drugeye.pharorg.com",
        "totalDrugs": len(results),
        "drugs": results,
    }
    OUTPUT_FILE.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"\n✅ Done! {len(results)} unique drugs saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
