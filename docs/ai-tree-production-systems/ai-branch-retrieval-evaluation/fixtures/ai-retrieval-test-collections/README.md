# Fixtures: Retrieval Test Collections

Lab fixtures for [Retrieval Test Collections](../../ai-retrieval-test-collections.md). Save
every file below into `fixtures/` in an empty lab directory; each name links to the file.
Everything here is fictional and constructed for teaching.

| File | Contents |
| --- | --- |
| [corpus.jsonl](corpus.jsonl) | 48 runbook documents in 12 topics of 4, one `{"id", "title", "text"}` object per line. |
| [queries.jsonl](queries.jsonl) | 60 queries, one `{"qid", "stratum", "query"}` object per line. D01-D20 are dev and T01-T40 test; strata are `id`, `para`, `multi` and `none`. |
| [qrels.json](qrels.json) | Judge A: 548 grades, `{qid: {doc_id: grade}}`, 0-3. The depth-10 pool of `bm25_raw`, `bm25` and `cosine`, plus each query's written-from documents, plus the rest of the topic wherever one of those fell outside the pool. |
| [qrels-repool.json](qrels-repool.json) | 26 grades for pairs that only the two `expand` runs surface, in the same shape. |
| [judge-b.json](judge-b.json) | A second judge on 12 queries (112 pairs), in the same shape. |
| [synonyms.json](synonyms.json) | The expansion table: nine entries, each written for a dev query (D02, D06, D10, D14, D18). |
| [synonyms-leaky.json](synonyms-leaky.json) | A table that also draws on test queries, for the lab's deliberate leak. |
| [guideline.md](guideline.md) | The 0-3 judging guideline, including the two rules added after the first agreement check. |

How the labels were made: judge A's grades come from a rule, not from reading. Each query
was written from zero or more documents, each given a grade by design: 3 for a document
that answers the query or one whole part of it, 2 for one that supplies a needed step or
fact, 1 for one a reader might expect to help but that does not. The other documents in
the query's topic are grade 1, and everything else is grade 0. A written-from document
can sit outside the topic, at any grade: CERT-04 on T01 and VPN-02 on T37 are grade-1
cases on answerable queries, and D08, T04, T24, T32, T36 and T40 are unanswerable queries
whose only written-from document is a grade 1.

Twelve written-from documents, on 11 queries, fell outside the depth-10 pool, so all four
documents of their topic were judged: D06 AUTH-02 and AUTH-03, D08 CERT-04, D10 AUTH-03,
D14 DISK-01, D18 DISK-02, T01 CERT-04, T05 CERT-01, T18 POD-02, T26 ACC-01, T31 ACC-03 and
T37 VPN-02.

Judge B copies judge A except for two scripted disagreements: a policy or overview
document judge A graded 1 is a 2, and on a multi-part query the document judge A graded 3
for the query's second part is a 2 (D03: CERT-03, the "after" steps; D19: DISK-01, the
kubernetes node; T15: DNS-01, name resolution). The kappa these give teaches the method;
it is not a real agreement level.
