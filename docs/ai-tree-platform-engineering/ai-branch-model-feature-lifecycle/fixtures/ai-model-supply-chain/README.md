# Model supply-chain fixtures

The artifacts the lab and the live run inspect. All fictional; the two
malicious pickles are inert and only write a marker file when loaded.

- [make_models.py](make_models.py) - writes `models/clean.pkl`,
  `models/exec.pkl` (calls `builtins.exec`), `models/sneaky.pkl` (calls
  `pathlib.Path.write_text`, which denylist scanners do not name),
  `models/model.safetensors` with `source`, `revision` and `license`
  metadata, and `models.sha256`, the digests recorded for the approved
  artifacts. Needs numpy and safetensors.
- [allowlist.txt](allowlist.txt) - the three imports a clean numpy weights
  pickle makes, for `pickle_imports.py --allow`.

Copy both files into an empty lab directory next to the leaf's
`pickle_imports.py`, install the tools from Command 1, run
`.venv/bin/python make_models.py`, and the leaf's Commands 2-9 run as
written. Never load `exec.pkl` or `sneaky.pkl` outside a throwaway
directory: they are harmless, but the habit is the point.
