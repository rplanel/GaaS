from pathlib import Path
from typing import Any, Dict, Hashable, List, Optional, TypeGuard
import pyarrow.parquet as pq
import json
import sys


def is_path(file_path: Optional[Path]) -> TypeGuard[Path]:
    return not (file_path == "-" or file_path is None)


def load_parquet_documents(file_path: Optional[Path]) -> List[Dict[Hashable, Any]]:
    if is_path(file_path):
        docs = pq.read_table(file_path)

    else:
        docs = pq.read_table(sys.stdin)
    return docs.to_pylist()


def load_json_documents(documents: Optional[Path]) -> List[Dict[Hashable, Any]]:
    if is_path(documents):
        with open(documents, "r") as f:
            return json.load(f)
    else:
        return json.load(sys.stdin)


def load_csv_documents(file_path: Optional[Path]) -> List[Dict[Hashable, Any]]:
    import pandas as pd

    if is_path(file_path):
        docs = pd.read_csv(file_path)
    else:
        docs = pd.read_csv(sys.stdin)
    return docs.to_dict(orient="records")
