# Feature repository fixtures

The minimal Feast repository the lab and the live run use, so the six
commands have definitions to apply and rows to join. All fictional.

- [feature_store.yaml](feature_store.yaml) — local provider, file registry,
  SQLite online store.
- [features.py](features.py) — the `user_id` entity and the `user_stats`
  feature view (`tenure_days`, `txn_count_7d`, two-day TTL) over the parquet
  source.
- [make_data.py](make_data.py) — writes `data/user_stats.parquet`: one row
  dated 2026-09-01T11:00 UTC for the point-in-time join, one an hour old for
  materialisation. Run it before `feast apply`.

Copy these three files into an empty lab directory (`make_data.py` may live
in a `fixtures/` subdirectory with a `.feastignore` entry naming it, since
`feast apply` imports every Python module it finds), run
`python make_data.py`, and the leaf's Commands 1-6 run as written.
