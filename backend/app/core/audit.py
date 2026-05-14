from __future__ import annotations

import json
import logging

AUDIT_LOGGER_NAME = "guardian.audit"

audit_logger = logging.getLogger(AUDIT_LOGGER_NAME)


def log_audit_event(event: str, **fields: object) -> None:
    payload = {"event": event, **fields}
    audit_logger.info(
        json.dumps(
            payload,
            default=str,
            separators=(",", ":"),
            sort_keys=True,
        )
    )
