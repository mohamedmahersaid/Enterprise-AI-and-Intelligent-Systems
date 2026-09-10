# AI & Intelligent Systems catalog

Enterprise AI engineering: local and offline inference with Ollama, Azure OpenAI integration, prompt engineering for operations, model selection and cost control, retrieval-augmented generation over private data, agent frameworks, Model Context Protocol servers, and AI security and evaluation.

## Running and Integrating Models

How enterprises actually host, call, tune and pay for large language models - from air-gapped local inference to governed managed endpoints.

### Local and Private Inference

- **Beginner:** [Ollama and Local Model Serving](docs/ai-tree-model-platforms/ai-branch-local-inference/ai-ollama-local-inference.md)
- **Intermediate:** [Model Selection, Sizing and Cost Control](docs/ai-tree-model-platforms/ai-branch-local-inference/ai-model-selection-cost.md)

### Managed Model Services and Prompt Discipline

- **Advanced:** [Azure OpenAI Enterprise Integration](docs/ai-tree-model-platforms/ai-branch-managed-model-services/ai-azure-openai-integration.md)
- **Intermediate:** [Prompt Engineering for IT Operations](docs/ai-tree-model-platforms/ai-branch-managed-model-services/ai-prompt-engineering-ops.md)

## Applied AI Systems

Building production AI systems on top of foundation models: retrieval-augmented generation over private data, agent orchestration for multi-step enterprise workflows, the Model Context Protocol for tool integration, and the security and evaluation discipline that keeps all of it governable.

### RAG & Knowledge Systems

- **Advanced:** [RAG Architecture: Embeddings, Chunking and Vector Search](docs/ai-tree-applied-systems/ai-branch-rag-knowledge/ai-rag-architecture.md)
- **Enterprise:** [Grounding Enterprise Data Privately: Offline RAG and Access Control](docs/ai-tree-applied-systems/ai-branch-rag-knowledge/ai-private-enterprise-rag.md)

### Agents & Enterprise Integration

- **Advanced:** [AI Agents and Orchestration Patterns](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-agents-orchestration.md)
- **Expert:** [MCP Servers, AI Security and Evaluation](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-mcp-security-evaluation.md)
- **Intermediate:** [Content Safety and Guardrails: Input Filtering, Output Classification and Refusal Design](docs/ai-tree-applied-systems/ai-branch-agents-integration/ai-content-safety-guardrails.md)

## AI Operations & Governance

Running AI systems as production software - deployment pipelines, drift detection, observability at scale - and the governance layer that keeps an AI estate compliant and defensible: standards, regulation, data residency and disciplined use-case selection.

### LLMOps and Production Observability

- **Intermediate:** [LLMOps: Deployment, Versioning and Drift Detection](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-llmops-deployment-lifecycle.md)
- **Advanced:** [AI Observability and Production Performance Monitoring](docs/ai-tree-operations-governance/ai-branch-llmops-observability/ai-observability-performance-monitoring.md)

### Governance, Compliance and Enterprise Adoption

- **Enterprise:** [AI Governance and Compliance: ISO 42001, EU AI Act and Data Residency](docs/ai-tree-operations-governance/ai-branch-governance-adoption/ai-governance-compliance-framework.md)
- **Expert:** [Enterprise AI Adoption Patterns and Use-Case Selection](docs/ai-tree-operations-governance/ai-branch-governance-adoption/ai-enterprise-adoption-patterns.md)

## AI Platform Engineering

Building the platform beneath the models: MLOps registries and promotion gates, distributed training on Kubernetes, GPU economics through quantisation and partitioning, and feature stores.

### Model and Feature Lifecycle

- **Advanced:** [MLOps with MLflow: Experiment Tracking, Model Registry and Promotion Gates](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-mlops-mlflow-registry.md)
- **Advanced:** [Feature Stores and Training-Serving Skew: Point-in-Time Correctness with Feast](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-feature-store-skew.md)
- **Intermediate:** [Fine-Tuning and PEFT: When to Tune, LoRA Adapters and Evaluation](docs/ai-tree-platform-engineering/ai-branch-model-feature-lifecycle/ai-fine-tuning-peft.md)

### Training and GPU Infrastructure

- **Advanced:** [Distributed Training on Kubernetes with Kubeflow Pipelines and Ray](docs/ai-tree-platform-engineering/ai-branch-training-gpu-infrastructure/ai-distributed-training-kubeflow-ray.md)
- **Advanced:** [Model Quantisation and GPU Sharing: Precision, MIG Partitioning and KV Cache Sizing](docs/ai-tree-platform-engineering/ai-branch-training-gpu-infrastructure/ai-quantisation-gpu-sharing.md)

## Production AI Systems

Running AI systems in production: vector store selection and retrieval quality, evaluation harnesses that gate every change, agent orchestration with real guardrails, and the cost model that decides build versus buy.

### Retrieval and Evaluation

- **Advanced:** [Vector Database Selection and Hybrid Retrieval: pgvector, Qdrant, Milvus and Reranking](docs/ai-tree-production-systems/ai-branch-retrieval-evaluation/ai-vector-db-hybrid-retrieval.md)
- **Advanced:** [LLM Evaluation Harnesses and Regression Gates for Production AI](docs/ai-tree-production-systems/ai-branch-retrieval-evaluation/ai-evaluation-harness-gates.md)

### Agent Runtime and Cost Control

- **Advanced:** [Agent Orchestration with LangGraph: State, Guardrails and Tool Authorisation](docs/ai-tree-production-systems/ai-branch-agent-runtime-cost/ai-agent-orchestration-guardrails.md)
- **Advanced:** [AI FinOps: Token Cost Attribution, GPU Utilisation and Build-versus-Buy Crossover](docs/ai-tree-production-systems/ai-branch-agent-runtime-cost/ai-finops-build-vs-buy.md)
- **Beginner:** [From Prototype to Production: Gateway, Limits, Logging and Rollback](docs/ai-tree-production-systems/ai-branch-agent-runtime-cost/ai-prototype-to-production.md)
