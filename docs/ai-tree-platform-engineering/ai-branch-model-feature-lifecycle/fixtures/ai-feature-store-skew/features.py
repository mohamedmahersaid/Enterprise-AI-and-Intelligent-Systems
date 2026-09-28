"""The one feature declaration both stores share - the leaf's whole point.

user_stats reads the parquet fixtures/make_data.py writes: one row well in
the past for the point-in-time join (Command 3 asks as of 2026-09-01T12:00),
and one recent row inside the TTL so materialisation reaches the online
store (Commands 2 and 4).
"""
from datetime import timedelta

from feast import Entity, FeatureView, Field, FileSource
from feast.types import Int64

user = Entity(name="user_id", join_keys=["user_id"])

user_stats_source = FileSource(
    path="data/user_stats.parquet",
    timestamp_field="event_timestamp",
    created_timestamp_column="created",
)

user_stats = FeatureView(
    name="user_stats",
    entities=[user],
    ttl=timedelta(days=2),
    schema=[
        Field(name="tenure_days", dtype=Int64),
        Field(name="txn_count_7d", dtype=Int64),
    ],
    source=user_stats_source,
)
