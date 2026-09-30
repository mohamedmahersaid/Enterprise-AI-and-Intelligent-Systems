# Document ingestion fixtures

The two input documents the lab and the live run ingest, and the pinned
packages that read them. All fictional.

- [make_docs.py](make_docs.py) - writes `docs/invoice.pdf`, an invoice with a
  bordered line-item table and a line of white 4-point text addressed to "the
  AI assistant" at the foot of the page, and `docs/scan.png`, an image of
  printed text with no text layer whose second line is an instruction. Needs
  reportlab and Pillow.
- [requirements-ocr.txt](requirements-ocr.txt) - the OCR and PDF stack, with
  `opencv-python-headless` in place of the `opencv-python` that
  `rapidocr-onnxruntime` declares, so nothing needs the system's libGL.

Install as the leaf's Command 1 does, copy `make_docs.py` next to the leaf's
`ingest.py`, run `.venv/bin/python make_docs.py`, and Commands 2-8 run as
written.
