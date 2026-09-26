# Judging guideline (fictional runbook corpus)

Judge each (query, document) pair on its own. Read the whole document. Do not look at
which system retrieved it or at what rank.

| Grade | Label | Rule for this corpus |
| --- | --- | --- |
| 3 | Highly relevant | The document alone lets the responder do what the query asks. |
| 3 | Highly relevant, multi-part query | The query has two parts or two alternatives, and the document alone lets the responder do one whole part. |
| 2 | Relevant | The document supplies a step or fact the responder needs, but not all of it (for a multi-part query, not all of any one part). |
| 1 | Partially relevant | Same topic, but nothing the responder could act on for this query. |
| 0 | Not relevant | Different topic, or it only shares a word such as "error". |

Rules added after the first agreement check:

- **Multi-part queries.** The second grade-3 row. Judges had split on whether a document
  that fully covers one half of a two-part query is a 3 or a 2. It is a 3.
- **Policy and overview documents.** A policy or overview document that names the topic is
  a 1, not a 2, unless it states a step or a number the query needs.

A query is unanswerable when no document in the corpus reaches grade 2.

The labels shipped with this guideline are constructed: judge A's grades come from a rule
applied to each query's written-from documents and topic, and judge B is a scripted
variation of judge A. They teach the method; they do not measure real assessors.
