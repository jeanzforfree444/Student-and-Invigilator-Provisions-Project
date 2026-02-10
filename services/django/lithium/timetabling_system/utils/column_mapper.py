import re
from .equivalents import EQUIVALENT_COLUMNS

def normalize(col):
    """Normalize column names: lowercase, underscores, remove punctuation."""
    text = str(col).strip().lower()
    if text.startswith("unnamed") or text in ("", "nan"):
        return ""
    text = re.sub(r'\s+', '_', text)            # collapse all whitespace (incl. newlines)
    text = re.sub(r'[^a-z0-9_]', '', text)      # drop punctuation
    text = re.sub(r'_+', '_', text).strip('_')  # collapse duplicate underscores

    return text

def map_equivalent_columns(columns):
    """Map messy Excel columns to standardized field names."""
    normalized_to_canonical = {}
    for canonical, equivalents in EQUIVALENT_COLUMNS.items():
        for eq in equivalents:
            normalized_to_canonical[normalize(eq)] = canonical

    def safe_key(value):
        try:
            hash(value)
        except Exception:
            return str(value)
        return value

    mapping = {}
    for col in columns:
        norm = normalize(col)
        mapping[safe_key(col)] = normalized_to_canonical.get(norm, norm)
    return mapping
