"""Writes the offline rows the feature view reads.

Two rows for user 1001: one dated 2026-09-01T11:00 UTC, an hour before the
timestamp Command 3 joins as of, and one an hour ago, inside the two-day TTL,
so materialize-incremental (Command 2) carries it to the online store and
Command 4 reads it back. Guarded by __main__ so `feast apply`, which imports
every module in the repository, has no side effects here.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

if __name__ == "__main__":
    now = datetime.now(timezone.utc).replace(microsecond=0)
    rows = pd.DataFrame(
        {
            "user_id": [1001, 1001],
            "event_timestamp": [datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc), now - timedelta(hours=1)],
            "created": [datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc), now - timedelta(hours=1)],
            "tenure_days": [50, 76],
            "txn_count_7d": [7, 3],
        }
    )
    Path("data").mkdir(exist_ok=True)
    rows.to_parquet("data/user_stats.parquet", index=False)
    print(f"wrote data/user_stats.parquet: {len(rows)} rows for user 1001")
