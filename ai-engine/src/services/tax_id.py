"""
EIF: Turkish tax-identity validation.
---
A company profile is only worth collecting if the number actually checks out.
Both Turkish forms carry a checksum, so a typo — or a random 10 digits — can
be rejected offline, without a call to the tax authority:

  - VKN  (Vergi Kimlik Numarası): 10 digits, legal entities.
  - TCKN (T.C. Kimlik Numarası):  11 digits, sole proprietors / individuals.

This does not prove the entity exists at GİB — that needs an online lookup —
but it stops "1234567890" and mistyped numbers, which the length-only check
let straight through.
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
    """True for a checksum-valid VKN (10 digits) or TCKN (11 digits)."""
    value = (value or "").strip()
    return is_valid_vkn(value) or is_valid_tckn(value)
