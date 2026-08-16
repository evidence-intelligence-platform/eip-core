"""
EIF: Turkish tax-identity validation.
---
A company profile is only worth collecting if the number is at least
internally consistent. Both Turkish forms carry a check digit, so an offline
test can reject a mistyped number without a call to the tax authority:

  - VKN  (Vergi Kimlik Numarası): 10 digits, legal entities.
  - TCKN (T.C. Kimlik Numarası):  11 digits, sole proprietors / individuals.

What this catches: single-digit typos and transpositions in a real number, and
the low-effort filler people type to get past a form — nine of the ten
repeated-digit strings fail, "1111111111" and "0000000000" among them. That is
the whole of its power.

What it does NOT catch, stated plainly because a registration flow, a KVKK
record and an employer-facing "verified company" claim all rest on it:

  - Its acceptance rate is the reciprocal of the check digit space, not
    something better. A VKN's tenth digit is fully determined by the first
    nine, so exactly one in ten arbitrary 10-digit strings passes — including
    "1234567890" and "4444444444". A TCKN has two check digits and a non-zero
    leading digit, so roughly nine in a thousand 11-digit strings pass.
  - Whether the number is REGISTERED to anyone, and whether it belongs to the
    person registering. Only an online GİB lookup answers that.

So a passing number means "not obviously mistyped", never "verified company".
Any product surface that promises the stronger claim needs the online lookup
behind it.
"""


def is_valid_vkn(value: str) -> bool:
    """Validate a 10-digit VKN by its official checksum algorithm."""
    if len(value) != 10 or not value.isdigit():
        return False
    digits = [int(c) for c in value]
    total = 0
    for i in range(9):
        tmp = (digits[i] + (9 - i)) % 10
        if tmp != 0:
            tmp = (tmp * pow(2, 9 - i, 9)) % 9
            if tmp == 0:
                tmp = 9
        total += tmp
    check = (10 - (total % 10)) % 10
    return check == digits[9]


def is_valid_tckn(value: str) -> bool:
    """Validate an 11-digit TCKN by its official checksum algorithm."""
    if len(value) != 11 or not value.isdigit():
        return False
    d = [int(c) for c in value]
    if d[0] == 0:
        return False
    odd = d[0] + d[2] + d[4] + d[6] + d[8]
    even = d[1] + d[3] + d[5] + d[7]
    if (odd * 7 - even) % 10 != d[9]:
        return False
    if sum(d[:10]) % 10 != d[10]:
        return False
    return True


def is_valid_tax_number(value: str) -> bool:
    """
    True for a checksum-valid VKN (10 digits) or TCKN (11 digits).

    Callers must read this as a format check, not as proof of an existing
    entity — see the module docstring for exactly how weak the guarantee is.
    """
    value = (value or "").strip()
    return is_valid_vkn(value) or is_valid_tckn(value)
