"""Optional sampled telemetry for dashboard live graphs (JSONL).

Enable with environment variable ABIDES_TELEMETRY_N > 0 (record one event per N sendMessage calls).
Output: log/<log_dir>/telemetry.jsonl
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Tuple


def _message_kind(body: Any) -> Tuple[str, Optional[str]]:
    """Return (family, raw_msg_key) for macro agent messages."""
    if not isinstance(body, dict):
        return "unknown", None
    key = body.get("msg")
    if not isinstance(key, str):
        return "unknown", str(key) if key is not None else None

    labor = {
        "LABOR_APPLICATION",
        "JOB_OFFER",
        "EMPLOYMENT_TERMINATED",
        "EMPLOYMENT_STATUS",
    }
    credit = {
        "LOAN_REQUEST",
        "LOAN_DECISION",
        "DEBT_SERVICE_DUE",
        "DEBT_SERVICE_PAYMENT",
    }
    fiscal = {
        "TAX_PAYMENT",
        "BENEFITS_REQUEST",
        "TRANSFER_PAYMENT",
        "FIRM_STATUS",
    }
    monetary = {"INTEREST_RATE_UPDATE", "MACRO_SIGNAL"}
    policy = {"POLICY_UPDATE"}
    trade = {"CONSUMER_DEMAND", "GOODS_FILLED", "WAGE_PAYMENT"}

    if key in labor:
        return "labor", key
    if key in credit:
        return "credit", key
    if key in fiscal:
        return "fiscal", key
    if key in monetary:
        return "monetary", key
    if key in policy:
        return "policy", key
    if key in trade:
        return "trade", key
    return "unknown", key


def append_send_message_sample(
    *,
    log_dir: str,
    repo_root: str,
    sim_time: Any,
    sender: int,
    recipient: int,
    sender_type: str,
    recipient_type: str,
    msg_body: Any,
) -> None:
    """Append one JSON line; caller must enforce sampling cadence."""
    family, msg_key = _message_kind(msg_body)
    path = os.path.join(repo_root, "log", log_dir, "telemetry.jsonl")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    record = {
        "sim_time": str(sim_time) if sim_time is not None else None,
        "sender": int(sender),
        "recipient": int(recipient),
        "sender_type": sender_type,
        "recipient_type": recipient_type,
        "family": family,
        "msg": msg_key,
    }
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, separators=(",", ":")) + "\n")
        handle.flush()
