# Learning paths

The catalog lists every leaf by tree and branch. This file lists them in the
order a particular reader should meet them.

Paths overlap on purpose - a leaf that matters to three audiences appears in
three paths - and every leaf in the curriculum appears in at least one path,
which is enforced by `npm run validate`. Nothing here is a prerequisite chain:
a step you already know is a step you skip.

| Path | Steps | For |
| --- | ---: | --- |
| [Ship your first AI feature](#ship-your-first-ai-feature) | 8 | An engineer with a working prototype who has been asked when it can go live. |
| [Build retrieval that actually answers](#build-retrieval-that-actually-answers) | 7 | An engineer whose search or RAG system returns plausible things that are not the right things. |
| [Govern AI across an organisation](#govern-ai-across-an-organisation) | 6 | Whoever has been handed responsibility for AI risk, policy or approval. |
| [Run the model platform](#run-the-model-platform) | 7 | A platform or infrastructure engineer who now owns GPUs, training jobs and model artefacts. |
| [Decide what to run, and what it costs](#decide-what-to-run-and-what-it-costs) | 6 | An architect or lead answering 'which model, hosted where, and what will this cost at scale'. |
| [Put an agent in front of real systems](#put-an-agent-in-front-of-real-systems) | 5 | An engineer being asked to let a model take actions rather than only produce text. |

## Ship your first AI feature

**For:** An engineer with a working prototype who has been asked when it can go live.

The prototype already works. What follows is everything the demo let you skip: deciding whether you need retrieval at all, versioning the prompt, gating the release on evidence, and knowing what to do at 3am.

1. **[From Prototype to Production: Gateway, Limits, Logging and Rollback](docs/ai-tree-production-systems/ai-branch-agent-runtime-cost/ai-prototype-to-production.md)** &middot; Beginner
   Start by naming what actually changes between a demo and a system other people depend on. Nothing later makes sense without that list.
2. **[Do You Need RAG? Context Windows, Grounding and the Cheapest Thing That Works](docs/ai-tree-applied-systems/ai-branch-rag-knowledge/ai-do-you-need-rag.md)** &middot; Beginner
   Settle the retrieval question before you build retrieval. Often the corpus fits in the context window and the cheapest thing works.
3. **[Prompt Engineering for IT Operations](docs/ai-tree-model-platforms/ai-branch-managed-model-services/ai-prompt-engineering-ops.md)** &middot; Intermediate
   The prompt is the behaviour. Treat it as a versioned artefact now, or you will be unable to explain why yesterday's output differed.
4. **[LLMOps: Deployment, Versioning and Drift Detection](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-llmops-deployment-lifecycle.md)** &middot; Intermediate
   How a change reaches production: what gets promoted, what gets rolled back, and what a release even means when the model is someone else's.
5. **[Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-content-safety-guardrails.md)** &middot; Intermediate
   Guardrails are layers, not a switch. Decide your thresholds here, while the false-positive cost is still a design question rather than a support ticket.
6. **[LLM Evaluation Harnesses and Regression Gates for Production AI](docs/ai-tree-production-systems/ai-branch-retrieval-evaluation/ai-evaluation-harness-gates.md)** &middot; Advanced
   A release gate needs evidence. Build the harness before you need to argue that a change was safe.
7. **[AI Observability and Production Performance Monitoring](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-observability-performance-monitoring.md)** &middot; Advanced
   Once it is live, the question shifts from 'does it work' to 'how would I know if it stopped'.
8. **[AI Incident Response: Detection, Containment and Postmortems for Non-Deterministic Systems](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-incident-response.md)** &middot; Advanced
   Read this before the incident, not during it. The blast-radius question is much harder to answer under pressure.

## Build retrieval that actually answers

**For:** An engineer whose search or RAG system returns plausible things that are not the right things.

Retrieval fails quietly: the answer is fluent and wrong because the right passage was never retrieved. This path goes from deciding whether you need retrieval to measuring whether it works, and ends with the access-control problem that makes enterprise RAG different.

1. **[Do You Need RAG? Context Windows, Grounding and the Cheapest Thing That Works](docs/ai-tree-applied-systems/ai-branch-rag-knowledge/ai-do-you-need-rag.md)** &middot; Beginner
   The cheapest retrieval system is the one you did not build. Rule that out first.
2. **[How Retrieval Finds Things: Keywords, Meaning and Why Each One Misses](docs/ai-tree-production-systems/ai-branch-retrieval-evaluation/ai-how-retrieval-finds-things.md)** &middot; Beginner
   Understand what similarity search is actually comparing before tuning anything, or you will tune blind.
3. **[RAG Architecture: Embeddings, Chunking and Vector Search](docs/ai-tree-applied-systems/ai-branch-rag-knowledge/ai-rag-architecture.md)** &middot; Advanced
   Chunking and embedding decisions made here determine your ceiling. Most recall problems are chunking problems.
4. **[Vector Database Selection and Hybrid Retrieval: pgvector, Qdrant, Milvus and Reranking](docs/ai-tree-production-systems/ai-branch-retrieval-evaluation/ai-vector-db-hybrid-retrieval.md)** &middot; Advanced
   Dense vectors miss exact terms - product codes, error numbers, names. Hybrid retrieval is the usual fix.
5. **[LLM Evaluation Harnesses and Regression Gates for Production AI](docs/ai-tree-production-systems/ai-branch-retrieval-evaluation/ai-evaluation-harness-gates.md)** &middot; Advanced
   Recall is measurable. Until you measure it, every tuning change is superstition.
6. **[Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-content-safety-guardrails.md)** &middot; Intermediate
   Retrieved content is untrusted input. A document in your own corpus can carry an injection.
7. **[Grounding Enterprise Data Privately: Offline RAG and Access Control](docs/ai-tree-applied-systems/ai-branch-rag-knowledge/ai-private-enterprise-rag.md)** &middot; Enterprise
   The hard part of enterprise RAG is not retrieval quality, it is making sure the answer only contains what this user is allowed to see.

## Govern AI across an organisation

**For:** Whoever has been handed responsibility for AI risk, policy or approval.

Governance that starts with a policy document fails. This path starts with finding out what is already running, then builds the framework, the technical controls and the rollout around that reality.

1. **[Before the Framework: AI Inventory, Acceptable Use and Who Decides](docs/ai-tree-operations-governance/ai-branch-governance-adoption/ai-inventory-acceptable-use.md)** &middot; Beginner
   You cannot govern what you cannot see. Inventory first - and note the deliberate design choice to report teams rather than individuals.
2. **[AI Governance and Compliance: ISO 42001, EU AI Act and Data Residency](docs/ai-tree-operations-governance/ai-branch-governance-adoption/ai-governance-compliance-framework.md)** &middot; Enterprise
   Now write the framework, against real usage rather than an imagined future state.
3. **[Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-content-safety-guardrails.md)** &middot; Intermediate
   Policy without an enforcement point is advice. This is where the policy becomes a control.
4. **[MCP Servers, AI Security and Evaluation](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-mcp-security-evaluation.md)** &middot; Expert
   Every tool an agent can call is attack surface you inherited. Evaluate third-party integrations as supply chain, not features.
5. **[AI Incident Response: Detection, Containment and Postmortems for Non-Deterministic Systems](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-incident-response.md)** &middot; Advanced
   Your framework will be judged on what happens when something goes wrong, including who must be notified.
6. **[Enterprise AI Adoption Patterns and Use-Case Selection](docs/ai-tree-operations-governance/ai-branch-governance-adoption/ai-enterprise-adoption-patterns.md)** &middot; Expert
   Governance that blocks everything gets routed around. This covers rollout that people accept.

## Run the model platform

**For:** A platform or infrastructure engineer who now owns GPUs, training jobs and model artefacts.

From a first GPU job to distributed training, with the reproducibility and registry discipline that decides whether a model you shipped six months ago can be explained or rebuilt today.

1. **[Your First GPU Job: What You Are Renting, Why It Queues and How Not to Waste It](docs/ai-tree-platform-engineering/ai-branch-training-gpu-infrastructure/ai-first-gpu-job.md)** &middot; Beginner
   Get one job running and learn to read utilisation properly. Most GPU spend is wasted on jobs that look busy and are not.
2. **[From Notebook to a Reproducible Training Run: Environments, Seeds, Data Versions and Artifacts](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-reproducible-training-runs.md)** &middot; Beginner
   Reproducibility is cheap to build in now and near-impossible to retrofit. Note the script that refuses to run from uncommitted code.
3. **[MLOps with MLflow: Experiment Tracking, Model Registry and Promotion Gates](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-mlops-mlflow-registry.md)** &middot; Advanced
   A registry is how a model artefact acquires provenance instead of being a file someone remembers training.
4. **[Fine-Tuning and PEFT: When to Tune, LoRA Adapters and Evaluation](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-fine-tuning-peft.md)** &middot; Intermediate
   Fine-tuning is the point where training discipline stops being theoretical, and PEFT is what makes it affordable.
5. **[Feature Stores and Training-Serving Skew: Point-in-Time Correctness with Feast](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-feature-store-skew.md)** &middot; Advanced
   Training-serving skew is the failure that passes every test and degrades silently in production.
6. **[Model Quantisation and GPU Sharing: Precision, MIG Partitioning and KV Cache Sizing](docs/ai-tree-platform-engineering/ai-branch-training-gpu-infrastructure/ai-quantisation-gpu-sharing.md)** &middot; Advanced
   Getting more out of the hardware you already have, before asking for more of it.
7. **[Distributed Training on Kubernetes with Kubeflow Pipelines and Ray](docs/ai-tree-platform-engineering/ai-branch-training-gpu-infrastructure/ai-distributed-training-kubeflow-ray.md)** &middot; Advanced
   Scaling past one machine, once the single-node discipline above is actually in place.

## Decide what to run, and what it costs

**For:** An architect or lead answering 'which model, hosted where, and what will this cost at scale'.

The model choice, the hosting choice and the cost model are one decision, not three. This path runs from local inference through managed endpoints to the build-versus-buy arithmetic, including what happens when your provider has an outage.

1. **[Ollama and Local Model Serving](docs/ai-tree-model-platforms/ai-branch-local-inference/ai-ollama-local-inference.md)** &middot; Beginner
   Run a model locally first. It makes every later cost and latency comparison concrete rather than theoretical.
2. **[Model Selection, Sizing and Cost Control](docs/ai-tree-model-platforms/ai-branch-local-inference/ai-model-selection-cost.md)** &middot; Intermediate
   Size and capability against the actual task. The largest model that fits the budget is rarely the right answer.
3. **[Local Inference at Production Scale: Batching, KV Cache and the Point It Stops Being Cheaper](docs/ai-tree-model-platforms/ai-branch-local-inference/ai-local-inference-at-scale.md)** &middot; Advanced
   Before comparing local against managed, find out what local actually delivers under concurrency. The single-stream benchmark that makes self-hosting look cheap is measuring a condition production never has.
4. **[Azure OpenAI Enterprise Integration](docs/ai-tree-model-platforms/ai-branch-managed-model-services/ai-azure-openai-integration.md)** &middot; Advanced
   What a governed managed endpoint gives you that a raw API key does not - and what it costs.
5. **[When the Provider Fails: Fallback Tiers, Graceful Degradation and Model Deprecation](docs/ai-tree-model-platforms/ai-branch-managed-model-services/ai-provider-failover.md)** &middot; Intermediate
   Single-provider dependency is a decision, whether or not you made it deliberately. Plan the degradation before the outage.
6. **[AI FinOps: Token Cost Attribution, GPU Utilisation and Build-versus-Buy Crossover](docs/ai-tree-production-systems/ai-branch-agent-runtime-cost/ai-finops-build-vs-buy.md)** &middot; Advanced
   The arithmetic, with the crossover points that actually decide it.

## Put an agent in front of real systems

**For:** An engineer being asked to let a model take actions rather than only produce text.

An agent that can act can act wrongly, at machine speed, in a loop. This path covers how agent orchestration works, then every bound you need before it touches anything that matters.

1. **[AI Agents and Orchestration Patterns](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-agents-orchestration.md)** &middot; Advanced
   How multi-step agent workflows are actually structured, and where they fail.
2. **[Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-content-safety-guardrails.md)** &middot; Intermediate
   An agent consumes untrusted input from tools and documents, not just from users.
3. **[MCP Servers, AI Security and Evaluation](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-mcp-security-evaluation.md)** &middot; Expert
   Every MCP server is code you are trusting with your agent's permissions. Evaluate before connecting.
4. **[Agent Orchestration with LangGraph: State, Guardrails and Tool Authorisation](docs/ai-tree-production-systems/ai-branch-agent-runtime-cost/ai-agent-orchestration-guardrails.md)** &middot; Advanced
   Loop limits, budgets and kill switches. An unbounded agent is a billing incident waiting to happen.
5. **[AI Incident Response: Detection, Containment and Postmortems for Non-Deterministic Systems](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-incident-response.md)** &middot; Advanced
   When an agent does something wrong, the blast radius question is 'what did it touch', and you need the answer fast.
