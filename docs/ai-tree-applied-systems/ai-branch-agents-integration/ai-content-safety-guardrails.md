---
id: 'ai-content-safety-guardrails'
title: 'Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design'
level: 'Intermediate'
forest: 'AI & Intelligent Systems'
tree: 'Applied AI Systems'
branch: 'Agents & Enterprise Integration'
---

# Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design

**Level:** Intermediate
**Tree:** [Applied AI Systems](../README.md)
**Branch:** [Agents & Enterprise Integration](README.md)
**Forest:** [AI & Intelligent Systems](../../../README.md)

## Explanation

### Guardrails are layers, not a switch

Four layers sit between a request and a response, and each fails differently. The
model's own alignment refuses obvious harm but is the layer an attacker is directly
trying to talk past. The provider's content filter catches broad categories
consistently but knows nothing about your domain. **Your policy filter** encodes what
is unacceptable *for this application* - a rule the provider cannot know. And human
escalation handles the residue, because some decisions should not be automated at all.
Teams that treat safety as a single vendor toggle are relying on the one layer with no
knowledge of their context.

### Input and output filtering solve different problems

Input filtering rejects a request before it costs anything - a policy-violating ask, or
a recognisable injection pattern. Output filtering inspects what the model actually
produced. They are not redundant, because **a safe input can produce an unsafe output**:
the model can hallucinate a defamatory claim, leak content from a retrieved document the
requester should not see, or be talked into something the input filter did not recognise
as an attempt. Output filtering is the layer teams skip, and it is the layer that
catches the failure the input filter was never going to see.

### The false-positive cost is the real design constraint

An over-tight filter is not a safe filter. Block a security team's assistant from
discussing exploit techniques, a clinical team from describing symptoms, or a legal team
from quoting a threatening letter, and the users do not accept it - they route around
the system, and you have made the estate less safe while the dashboard reports
compliance. **Measure both directions**: how much unsafe content gets through, and how
much legitimate work is blocked. A guardrail with only the first number is untuned.

### Thresholds belong to the use case, not the platform

Severity thresholds should be per application tier, not one global setting. A
customer-facing assistant and an internal security research tool need genuinely
different violence and self-harm thresholds, and expressing that as configuration -
tiers with named policies - is what stops the argument being relitigated per team. The
tier a workload belongs to is a governance decision; enforcing it is a runtime one.

### Refusal is a user interface

A bare "I can't help with that" teaches nothing and generates a support ticket. A good
refusal names the category that was blocked and offers the compliant path. Two rules:
**never echo the blocked content back** in the refusal, and always attach the request id
so a wrongly blocked user can appeal with something actionable.

### Retrieved content is untrusted input

RAG changes the threat model. A document in the corpus can carry instructions, and it
reaches the model having never passed the input filter, because it was not typed by the
user. **Filter retrieved context on the same path as user input**, and treat any
document source that outsiders can write to as hostile by default.

## Architecture and flow

```mermaid
flowchart TD
    A[User request] --> B[Input filter<br/>policy categories + injection patterns]
    B -->|Blocked| C[Refusal: name the category,<br/>offer the compliant path,<br/>attach request id]
    B -->|Allowed| D[Retrieval]
    E[(Document corpus)] --> D
    D --> F[Filter retrieved context<br/>same path as user input]
    F --> G[Model call<br/>provider filter + model alignment]
    G --> H[Output filter<br/>categories, PII, groundedness]
    H -->|Blocked| C
    H -->|Allowed| I[Response to user]
    H -->|Uncertain / high severity| J[Human escalation queue]
    C --> K[Log: category, severity, request id<br/>NOT the blocked content]
    I --> K
    K --> L[Measure BOTH directions<br/>false negatives AND false positives]
    L --> M[Tune thresholds per tier<br/>from data, not intuition]
    N[TRAP: retrieved documents never<br/>pass the input filter - a corpus an<br/>outsider can write to is an input] -.-> F
```

## Commands

### Command 1

Classify a single text against the standard harm categories and read back per-category severity

```text
curl -s "$ENDPOINT/contentsafety/text:analyze?api-version=2024-09-01" -H "Ocp-Apim-Subscription-Key: $KEY" -H "Content-Type: application/json" -d "{\"text\":\"$SAMPLE\"}" | jq ".categoriesAnalysis"
```

### Command 2

Test a jailbreak attempt against the dedicated prompt-shield endpoint rather than the category classifier

```text
curl -s "$ENDPOINT/contentsafety/text:shieldPrompt?api-version=2024-09-01" -H "Ocp-Apim-Subscription-Key: $KEY" -d "{\"userPrompt\":\"$ATTACK\",\"documents\":[]}" | jq
```

### Command 3

Scan a retrieved document for embedded instructions before it reaches the prompt - the path user input never takes

```text
curl -s "$ENDPOINT/contentsafety/text:shieldPrompt?api-version=2024-09-01" -H "Ocp-Apim-Subscription-Key: $KEY" -d "{\"userPrompt\":\"\",\"documents\":[\"$(cat retrieved.txt)\"]}" | jq ".documentsAnalysis"
```

### Command 4

Report the block rate by category from the gateway log - the false-negative half of the picture

```text
jq -r "select(.blocked) | .category" gateway.log | sort | uniq -c | sort -rn
```

### Command 5

Report refusals against total requests per application tier - the false-positive signal that precedes users routing around you

```text
jq -r "[.tier, (.blocked|tostring)] | @tsv" gateway.log | sort | uniq -c
```

### Command 6

Confirm the refusal path does not echo blocked content back to the caller

```text
grep -c "$KNOWN_BLOCKED_PHRASE" refusal-responses.log
```

## Automation scripts

### guardrail_threshold_tuner.py

Thresholds are usually set by intuition and then never revisited, which produces a
filter nobody can defend in either direction. This runs a labelled set through the
filter at every threshold and reports what each setting actually costs, so the choice is
made from a table rather than a feeling.

```python
#!/usr/bin/env python3
"""Choose content-filter thresholds from measured precision and recall.

Takes a labelled corpus of prompts - benign ones drawn from real traffic and
violating ones per category - and sweeps the severity threshold. Reports, for
each category and threshold, what fraction of violations is caught and what
fraction of legitimate work is blocked.
"""
import json
import sys
from collections import defaultdict

import requests

ENDPOINT = "https://example.cognitiveservices.azure.com"
SEVERITIES = [0, 2, 4, 6]  # provider severity levels, ascending


def classify(text, key):
    response = requests.post(
        f"{ENDPOINT}/contentsafety/text:analyze?api-version=2024-09-01",
        headers={"Ocp-Apim-Subscription-Key": key},
        json={"text": text},
        timeout=30,
    )
    response.raise_for_status()
    return {
        item["category"]: item["severity"]
        for item in response.json().get("categoriesAnalysis", [])
    }


def main(corpus_path, key):
    """corpus: JSONL of {"text": ..., "violates": "Hate"|null}"""
    with open(corpus_path) as handle:
        records = [json.loads(line) for line in handle if line.strip()]

    scored = [(r, classify(r["text"], key)) for r in records]
    categories = sorted({c for _, s in scored for c in s})

    print(f"{'category':<12}{'thresh':>7}{'caught':>9}{'missed':>8}{'blocked_ok':>12}{'note':>26}")
    for category in categories:
        violating = [(r, s) for r, s in scored if r.get("violates") == category]
        benign = [(r, s) for r, s in scored if not r.get("violates")]
        for threshold in SEVERITIES:
            caught = sum(1 for _, s in violating if s.get(category, 0) >= threshold)
            blocked_benign = sum(1 for _, s in benign if s.get(category, 0) >= threshold)
            recall = caught / len(violating) if violating else 0.0
            fpr = blocked_benign / len(benign) if benign else 0.0
            note = ""
            if fpr > 0.05:
                note = "users will route around this"
            elif violating and recall < 0.8:
                note = "misses most violations"
            print(
                f"{category:<12}{threshold:>7}{recall:>8.0%}{1 - recall:>8.0%}"
                f"{fpr:>11.1%}{note:>26}"
            )

    # The pairing that matters: a threshold is only defensible with both numbers.
    print(
        "\nPick per tier: the lowest threshold whose false-positive rate the tier's "
        "users will tolerate, then report the residual miss rate as accepted risk."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
```

## Lab

**Objective:** Build the four-layer guardrail path around one assistant, then measure what each threshold costs in both directions and demonstrate the failure that input filtering alone cannot catch.

### Steps

1. Stand up an assistant with no guardrails beyond the provider default and record its behaviour on a small adversarial prompt set.
2. Add input filtering at the gateway and confirm policy-violating requests are rejected before a model call is billed.
3. Assemble a labelled corpus: benign prompts drawn from real traffic, plus violating prompts per category.
4. Run `guardrail_threshold_tuner.py` and record, for each category and threshold, the catch rate and the fraction of benign traffic blocked.
5. Choose thresholds per application tier from that table, and write down the residual miss rate you are accepting.
6. Add output filtering and demonstrate a case where a benign input produces an output the output filter blocks.
7. Place a document containing embedded instructions into the retrieval corpus, and confirm it reaches the model without passing the input filter.
8. Route retrieved context through the same filtering path and confirm the injected document is now caught.
9. Implement the refusal response: name the category, offer the compliant path, attach the request id, and confirm the blocked content is not echoed back.
10. Drive a wrongly blocked request end to end through the appeal path, from the user-visible request id to the logged decision.

### Validation

- Both directions are measured: the residual false-negative rate and the fraction of benign traffic blocked are recorded per category and threshold.
- A benign input producing a blocked output is demonstrated, proving input filtering alone is insufficient.
- An injected document reaches the model before the fix and is caught after it, on the same retrieval path.
- Thresholds differ between at least two application tiers, and the difference traces to a named policy rather than preference.
- The refusal names the blocked category and carries a request id, and the blocked content appears nowhere in the response.
- Filter decisions are logged with category, severity and request id, and the logs contain no blocked content.

## Operational automation

### Automating the guardrail path in production

- **Enforce filtering in the retrieval pipeline, not the prompt template.** The day
  someone assembles a prompt by a different route, retrieved context arrives unfiltered.
  Placing the check on the path every document must cross makes the guarantee structural
  rather than a convention the next pull request can quietly drop.
- **Ship thresholds as versioned configuration keyed by application tier.** Thresholds
  scattered through service code cannot be reviewed, diffed or attested. As
  configuration, a change is a pull request with an owner, the security team reads the
  estate's posture in one file, and tier assignment becomes an onboarding decision
  rather than a per-team argument.
- **Log the decision, never the content.** Category, severity, tier and request id are
  enough to debug, tune and audit. Writing the blocked text into logs moves the most
  sensitive material in the system into the least protected store, turning a safety
  control into a data-classification incident at the next log export.
- **Alert on refusal rate per tier, not only on block counts.** A rising refusal rate in
  one tier is the earliest visible signal that users are about to route around the
  system, and shadow usage is invisible once it starts. Treat the false-positive side as
  an SLO with a threshold and a pager, exactly as you would latency.
- **Re-run the labelled corpus on every provider model or filter version change.**
  Vendors update classifiers on their own schedule, and behaviour shifts without a
  release note you will read. Pinning versions where the provider allows it and gating
  upgrades on the corpus turns a silent regression into a failed check.
- **Route disputed blocks back into the labelled corpus.** Every appealed refusal is a
  free, real-traffic label. Without that loop, thresholds are tuned once against a
  synthetic set and then decay; with it, the tuning table is refreshed from the
  distribution the system actually sees.
- **Do not build the policy layer on keyword blocklists.** Regular-expression matching
  as a primary defence is the superseded approach: it is evaded by paraphrase, encoding
  or translation, and it generates most of the false positives. Classifier-based
  category scoring plus a dedicated injection detector replaced it; keep pattern
  matching only as a cheap pre-filter for known literal strings such as leaked keys.

## Troubleshooting

### Scenario 1: Users report the assistant refuses ordinary work questions, and usage is falling.

**Likely cause:** A single global severity threshold tuned for the most sensitive tier is being applied to every workload, so domain-legitimate language - exploit names, clinical symptoms, quoted abuse in a legal matter - scores above the bar.

**Resolution:** Split thresholds by application tier and re-derive each from the labelled corpus rather than lowering the global setting by feel. Confirm the diagnosis first by pulling the refusal rate per tier and sampling the refused prompts: refusals concentrated in one tier and reading as legitimate work mean calibration, not attack traffic. Falling usage alongside rising refusals means the work has already moved somewhere unmonitored - the more urgent problem.

### Scenario 2: A jailbreak reached the model even though category filtering was enabled and passing tests.

**Likely cause:** Category classifiers and injection detection are different detectors. A prompt that instructs the model to ignore its instructions contains no hate, violence or sexual content, so every category scores zero and the request passes.

**Resolution:** Add the dedicated prompt-shield call alongside category analysis rather than expecting one endpoint to cover both. Confirm the diagnosis by replaying the attack through the category endpoint: all-zero severities on a prompt that obviously attacks the system is the signature. Treat a green category result as evidence about categories only, never as evidence the request was safe.

### Scenario 3: Filtering passes every test in staging and misses the same content in production.

**Likely cause:** Only the current user turn is being filtered, while the model receives an assembled prompt containing conversation history, system instructions and retrieved documents. The harmful content enters through a part of the payload the filter never sees.

**Resolution:** Filter each untrusted component on its own path - user turn, retrieved chunk, tool output - and assert at startup that every source of model-visible text has a filtering step. Confirm the diagnosis by logging a hash of the string sent to the filter and of the string sent to the model; where they diverge is the vulnerability. Fixtures that submit a bare string reproduce none of this, which is why staging stayed green.

### Scenario 4: Block rates changed sharply overnight with no deployment on your side.

**Likely cause:** The provider updated the model version or the safety classifier behind the same endpoint, shifting severity scores under thresholds tuned against the previous behaviour.

**Resolution:** Re-run the labelled corpus to quantify the shift in both directions before adjusting thresholds, because the move can be toward more blocking or less and the two demand opposite responses. Pin model and API versions where the provider supports it, and gate upgrades on the corpus run. Confirm it by checking the served model version in response metadata against the version recorded at the last tuning run.

### Scenario 5: A refusal message returned to the user contained the blocked text.

**Likely cause:** The error path echoes the offending input for debuggability - a pattern inherited from ordinary input validation, where echoing is helpful and harmless.

**Resolution:** Construct refusals from the category and request id alone, and add a test asserting a known blocked phrase never appears in a refusal body. Then check the logs on the same assumption, since the same reflex usually writes the content there too - the more serious finding, because it relocates the most sensitive material in the system into a store with weaker access controls and longer retention.

## Interview questions

### 1. The model provider already filters content. Why would you build another layer?

Because the provider's filter is the only layer that knows nothing about your application. It catches broad categories consistently, but it cannot know that this assistant must never discuss competitor pricing, or that this one must be free to discuss exploit techniques because it serves a security team. Those are policy statements about a specific use case, and they can only live in your layer. I think of it as four layers with different failure modes: the model's own alignment, which is exactly what an attacker is trying to talk past; the provider filter, broad and context-free; your policy filter, which encodes what is unacceptable here; and human escalation for decisions that should not be automated. A team relying on the vendor toggle alone has delegated its policy to a party that has never seen its requirements, and cannot tune the false-positive side - the side that determines whether users keep using the system at all.

### 2. How do you choose a severity threshold, and what would you show an auditor to defend it?

Not by intuition, because a number picked that way cannot be defended in either direction. I build a labelled corpus - benign prompts sampled from real traffic, plus violating prompts per category - sweep the threshold across every severity level, and produce a table showing what fraction of violations each setting catches and what fraction of legitimate work it blocks. I pick the lowest threshold whose false-positive rate that tier's users will tolerate, and write down the residual miss rate as accepted risk with a named owner. That table is what I show an auditor: it demonstrates the control was calibrated from measurement, states the risk knowingly accepted, and identifies who accepted it. A dashboard showing only blocks proves the filter fires, not that it is correct - and the re-run history proves it still is.

### 3. A RAG assistant summarises documents that partners upload. Where is the injection risk?

In the corpus, and teams miss it because the mental model is that filtering happens at the user's keyboard. A partner-uploaded document can carry instructions addressed to the model - reveal the system prompt, ignore prior constraints, call a tool with different arguments - and that text reaches the model having never crossed the input filter, because no user typed it. The fix is to put retrieved context on the same filtering path as user input, in the retrieval pipeline rather than the prompt template, so a future feature that assembles prompts differently cannot bypass it. Beyond filtering, I treat any source outsiders can write to as hostile by default: a separate index with tighter thresholds, no path by which its content influences tool selection, and output filtering on the way back out, since exfiltration is the usual goal.

### 4. Your filter blocks unsafe content effectively and complaints are rising. What is the actual risk?

That people stop using the system, which makes the estate less safe while the dashboard reports the opposite. Shadow usage is the failure mode: work moves to a personal account with no logging, no data residency and no filter at all, and it is invisible by construction, so the first evidence is falling volume rather than an alert. That is why I treat the false-positive rate as a first-class metric with an owner and a threshold, not as friction users absorb. Concretely I would split thresholds by tier so the complaining workload is calibrated against its own traffic, and rebuild the refusal itself - naming the blocked category, offering the compliant path, attaching a request id - so a wrongly blocked user has something actionable instead of a dead end. Then I would route appealed refusals back into the corpus, which is the only mechanism that keeps calibration from decaying after the initial tuning.

## Certification alignment

- AI-102 Azure AI Engineer Associate - implement content moderation and responsible AI safeguards in generative AI solutions
- SC-100 Microsoft Cybersecurity Architect - designing security controls and threat protection for AI workloads
- AWS Certified Machine Learning - Specialty - responsible AI, model monitoring and guardrail design for generative applications
- Google Professional Machine Learning Engineer - responsible AI practices, safety evaluation and production monitoring
- Vendor-neutral - OWASP Top 10 for LLM Applications: LLM01 prompt injection and LLM02 insecure output handling, mapped to NIST AI RMF MANAGE

## References

- Azure AI Content Safety documentation - harm categories, severity levels and Prompt Shields for user prompts and documents
- OWASP Top 10 for Large Language Model Applications - prompt injection, insecure output handling and the associated mitigations
- NIST AI Risk Management Framework (AI 100-1) - MEASURE and MANAGE functions for operational safeguards
- ISO/IEC 42001 - AI management system requirements covering operational controls and incident handling
- EU AI Act - transparency and risk-management obligations for general-purpose and high-risk AI systems

## Suggested video search

LLM content safety guardrails prompt injection output filtering threshold tuning false positives enterprise

---

> Validate commands, versions, permissions, licensing, and rollback procedures in an isolated lab before production use.
