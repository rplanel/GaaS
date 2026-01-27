import math
from typing import Annotated, Optional, Union

from pydantic import BeforeValidator


def na_float_to_none(v: Union[str, float, None]) -> Optional[float]:
    if v is None or v in ("", "na", "nan"):
        return None
    try:
        float_val = float(v)
        return None if math.isnan(float_val) else float_val
    except (ValueError, TypeError):
        return None


def na_string_to_none(v: Union[str, None]) -> Optional[str]:
    if v is None or v in ("", "na", "nan"):
        return None
    if isinstance(v, str):
        return v
    return str(v)


def comma_split(v: Union[str, list[str], None]) -> list[str]:
    if v is None or v == "":
        return []
    if isinstance(v, list):
        return v
    return [item.strip() for item in v.split(",") if item.strip()]


NaFloat = Annotated[Optional[float], BeforeValidator(na_float_to_none)]
NaString = Annotated[Optional[str], BeforeValidator(na_string_to_none)]
CommaList = Annotated[list[str], BeforeValidator(comma_split)]
