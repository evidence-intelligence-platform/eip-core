"""
EIF: Tests that keep documentation honest.
---
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — a claim nobody tests
is a claim that drifts.

Two kinds of documentation rot have already cost this project real time:

  1. A setup command that does not work. README instructs
     `cd ai-engine && cp .env.example .env`, and for a while the template lived
     one directory up — anyone following the README exactly got an error on
     their first run.
  2. A docstring that overstates what code does. `tax_id` claimed to stop
     "1234567890"; that number passes the checksum, and a registration flow, a
     KVKK record and an employer-facing company claim all rested on the
     stronger reading.

The tests below pin both to measurable facts, so the next change to either has
to update the prose along with the code.
"""

import re
from pathlib import Path

from src.services.tax_id import is_valid_tax_number, is_valid_tckn, is_valid_vkn

AI_ENGINE_ROOT = Path(__file__).resolve().parents[1]
ENV_EXAMPLE = AI_ENGINE_ROOT / ".env.example"

# The variables an operator MUST be able to find in the template: without them
# the engine either refuses to start, silently loses a feature, or mails users
# a link into nowhere.
REQUIRED_KEYS = (
    "DATABASE_URL",
    "INTERNAL_API_KEY",
    "JWT_SECRET_KEY",
    "GEMINI_API_KEY",
    "DEBUG",
    "FRONTEND_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "SENTRY_DSN",
)

# A template is copied verbatim and committed by mistake sooner or later, so
# nothing here may carry a usable credential.
SECRET_KEYS = ("INTERNAL_API_KEY", "JWT_SECRET_KEY", "GEMINI_API_KEY", "RESEND_API_KEY", "SENTRY_DSN")

_GETENV = re.compile(r"""os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']""")


def _env_names_read_by_engine() -> set[str]:
    """Every environment variable name `src/` actually reads."""
    names: set[str] = set()
    for path in (AI_ENGINE_ROOT / "src").rglob("*.py"):
        names.update(_GETENV.findall(path.read_text(encoding="utf-8")))
    return names


def _assignments(text: str) -> dict[str, str]:
    """KEY=value pairs from uncommented lines of an env template."""
    pairs: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        pairs[key.strip()] = value.strip()
    return pairs


def test_env_example_exists_where_the_readme_says_it_does():
    """`cd ai-engine && cp .env.example .env` must work as written."""
    assert ENV_EXAMPLE.is_file(), (
        "ai-engine/.env.example is missing. The README's quick start copies it "
        "from inside ai-engine/; the root template configures docker-compose "
        "and is not a substitute."
    )


def test_env_example_documents_every_required_variable():
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    missing = [key for key in REQUIRED_KEYS if key not in _assignments(text)]
    assert not missing, f"ai-engine/.env.example does not set: {missing}"


def test_env_example_covers_every_variable_the_engine_reads():
    """
    A variable added to the code but not to the template is invisible to the
    operator until the feature quietly fails to work.
    """
    text = ENV_EXAMPLE.read_text(encoding="utf-8")
    # Commented lines count: optional overrides are documented, not set.
    undocumented = sorted(name for name in _env_names_read_by_engine() if name not in text)
    assert not undocumented, (
        f"src/ reads these without documenting them in ai-engine/.env.example: {undocumented}"
    )


def test_env_example_carries_no_usable_credential():
    values = _assignments(ENV_EXAMPLE.read_text(encoding="utf-8"))
    for key in SECRET_KEYS:
        value = values.get(key, "")
        assert value == "" or value.startswith("change-me"), (
            f"{key} in ai-engine/.env.example looks like a real value ({value!r}). "
            "Templates carry placeholders only."
        )


# ─────────────────────────────────────────────────────────────────────────────
# tax_id: the module docstring makes falsifiable claims. These are them.
# ─────────────────────────────────────────────────────────────────────────────


def test_sequential_digits_pass_the_vkn_checksum():
    """
    The number the old docstring promised to stop. It passes — and that is the
    honest position, because the check is a checksum, not a registry lookup.
    """
    assert is_valid_vkn("1234567890") is True
    assert is_valid_tax_number("1234567890") is True


def test_repeated_digit_strings_are_rejected_except_one():
    """
    Nine of ten repeated-digit strings fail, which is what makes the check
    worth running on form filler. "4444444444" is the exception, and the
    docstring says so rather than rounding it to "all".
    """
    passing = [str(d) * 10 for d in range(10) if is_valid_vkn(str(d) * 10)]
    assert passing == ["4444444444"]


def test_exactly_one_in_ten_ten_digit_strings_passes():
    """
    The VKN's tenth digit is fully determined by the first nine, so for any
    prefix exactly one completion is valid — the acceptance rate is 1/10, not
    something better. The docstring states this; here it is measured.
    """
    for prefix in ("000000000", "123456789", "987654321", "555555555"):
        valid = [d for d in range(10) if is_valid_vkn(prefix + str(d))]
        assert len(valid) == 1, f"prefix {prefix} accepted {valid}"


def test_exactly_one_in_a_hundred_completions_passes_for_tckn():
    """
    TCKN carries two check digits, so a 9-digit prefix admits exactly one of
    the 100 possible endings — roughly nine in a thousand of all 11-digit
    strings once the non-zero leading digit is accounted for.
    """
    for prefix in ("100000000", "123456789", "987654321"):
        valid = [
            (a, b)
            for a in range(10)
            for b in range(10)
            if is_valid_tckn(f"{prefix}{a}{b}")
        ]
        assert len(valid) == 1, f"prefix {prefix} accepted {valid}"


def test_leading_zero_and_repeated_digits_are_rejected_for_tckn():
    assert is_valid_tckn("11111111111") is False
    assert is_valid_tckn("01234567890") is False


def test_wrong_length_is_never_accepted():
    """Length alone was the entire check once; it is now a precondition."""
    for value in ("", "123", "123456789", "123456789012"):
        assert is_valid_tax_number(value) is False
