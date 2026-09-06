---
id: 'ai-agents-orchestration'
title: 'AI Agents and Orchestration Patterns'
level: 'Advanced'
forest: 'AI & Intelligent Systems'
tree: 'Applied AI Systems'
branch: 'Agents & Enterprise Integration'
---

# AI Agents and Orchestration Patterns

**Level:** Advanced
**Tree:** [Applied AI Systems](../README.md)
**Branch:** [Agents & Enterprise Integration](README.md)
**Forest:** [AI & Intelligent Systems](../../../README.md)

## Explanation

An agent, in the enterprise sense, is a loop: the model receives a goal and a set of tools, decides which tool to call, observes the result, and decides again - repeating until it produces a final answer or hits a limit. That loop is what separates an agent from a single-shot chatbot call, and it is also exactly why agents are harder to operate reliably: every additional step is another place for the system to go wrong, and errors compound multiplicatively across steps.

**Tool calling** is the foundation. The model is given a set of function signatures with descriptions; instead of only producing text, it can produce a structured request to call one, receive the result, and continue reasoning with it. This is how a model reads a ticket, queries an inventory system, and drafts a response, all in one interaction. Reliability depends entirely on tool descriptions being precise and on the application validating and executing the actual call - the model never has direct system access, it only ever proposes a call.

**Orchestration frameworks** provide the loop, state management and control flow so teams do not hand-roll it. LangChain provides composable chains and a large tool/integration ecosystem. LangGraph models the agent as an explicit state graph, which makes branching, retries, cycles and human-in-the-loop checkpoints first-class rather than implicit - this matters enormously for auditability. Semantic Kernel is Microsoft's equivalent, integrating cleanly with Azure OpenAI, .NET and enterprise identity, with 'planners' that decide function-call sequences.

**Multi-agent designs** decompose a complex task across specialised agents - a researcher, a coder, a reviewer - coordinated by an orchestrator agent or a fixed pipeline. This helps when a single prompt would need to hold too much context or too many competing instructions, but it multiplies cost, latency and failure surface, and should be justified by a measured quality gain over a single well-designed agent, not adopted by default.

**Failure modes** are the operational reality: infinite tool-call loops, hallucinated tool arguments, cascading errors where a wrong step 2 poisons steps 3 through 10, and cost blowouts from unbounded retries. Production agent systems bound every loop with a maximum step count, validate every tool call's arguments before execution, and log the full trajectory for post-hoc debugging.

## Architecture and flow

```mermaid
flowchart TD
    A[Goal / user request] --> B[Agent reasoning step]
    B --> C{Needs a tool?}
    C -->|Yes| D[Propose tool call\nstructured arguments]
    D --> E[Application validates\n+ executes tool]
    E --> F[Observation result]
    F --> B
    C -->|No, has answer| G[Final response]
    B --> H{Step count > max?}
    H -->|Yes| I[Force stop + escalate to human]
    H -->|No| C
    subgraph Guardrails
      E
      H
    end
```

## Commands

### Command 1

Install LangGraph for explicit state-graph agent orchestration against Azure OpenAI.

```text
pip install langgraph langchain-openai
```

### Command 2

Install Semantic Kernel for .NET-aligned enterprise agent orchestration with Azure integration.

```text
pip install semantic-kernel
```

### Command 3

Verify the orchestration framework version installed, since agent graph APIs change between major versions.

```text
python -c "import langgraph; print(langgraph.__version__)"
```

### Command 4

Provision Application Insights to capture agent step traces for debugging and audit.

```text
az monitor app-insights component create -g rg-ai -a agent-tracing -l swedencentral
```

### Command 5

Call a locally hosted model's tool-calling API to test an agent step without a hosted provider.

```text
curl -X POST http://localhost:11434/api/chat -d "{\"model\":\"llama3.1:8b\",\"messages\":[{\"role\":\"user\",\"content\":\"...\"}],\"tools\":[...]}"
```

## Automation scripts

### Bounded agent loop with tool validation and trajectory logging

```python
#!/usr/bin/env python3
"""A minimal, dependency-free agent loop pattern showing the guardrails that
belong in any production agent regardless of which framework wraps it:
a hard step limit, argument validation before execution, and full
trajectory logging for post-hoc debugging.
"""
import json
import time

MAX_STEPS = 8


def tool_lookup_inventory(sku):
    if not isinstance(sku, str) or not sku.isalnum():
        raise ValueError("invalid sku argument: %r" % sku)
    catalog = {"AB1234": 42, "CD5678": 0}
    return {"sku": sku, "quantity": catalog.get(sku, None)}


def tool_create_ticket(summary, priority):
    if priority not in ("low", "medium", "high"):
        raise ValueError("invalid priority: %r" % priority)
    return {"ticket_id": "TCK-%d" % int(time.time()), "summary": summary, "priority": priority}


TOOLS = {
    "lookup_inventory": tool_lookup_inventory,
    "create_ticket": tool_create_ticket,
}


def call_model(messages):
    """Stand-in for a real model call. Replace with an Azure OpenAI or Ollama
    chat completion call that supports tool/function calling."""
    raise NotImplementedError(
        "Wire this to your model provider's tool-calling chat completion API")


def run_agent(goal):
    trajectory = []
    messages = [{"role": "system", "content": "You are an inventory operations agent."},
                {"role": "user", "content": goal}]

    for step in range(1, MAX_STEPS + 1):
        response = call_model(messages)
        trajectory.append({"step": step, "model_output": response})

        tool_call = response.get("tool_call")
        if not tool_call:
            trajectory.append({"step": step, "final_answer": response.get("content")})
            return {"status": "complete", "answer": response.get("content"),
                    "steps": step, "trajectory": trajectory}

        name = tool_call.get("name")
        args = tool_call.get("arguments", {})
        fn = TOOLS.get(name)
        if fn is None:
            trajectory.append({"step": step, "error": "unknown tool: %s" % name})
            return {"status": "error", "reason": "unknown_tool", "steps": step,
                    "trajectory": trajectory}

        try:
            result = fn(**args)
        except (TypeError, ValueError) as exc:
            trajectory.append({"step": step, "error": "invalid arguments: %s" % exc})
            messages.append({"role": "tool", "content": "ERROR: %s" % exc})
            continue

        trajectory.append({"step": step, "tool": name, "args": args, "result": result})
        messages.append({"role": "tool", "content": json.dumps(result)})

    trajectory.append({"step": MAX_STEPS, "error": "max_steps_exceeded"})
    return {"status": "escalate", "reason": "max_steps_exceeded",
            "steps": MAX_STEPS, "trajectory": trajectory}


if __name__ == "__main__":
    result = run_agent("Check stock for SKU AB1234 and open a ticket if it is out of stock.")
    print(json.dumps(result, indent=2))
```

## Lab

**Objective:** Build a bounded, logged agent loop with real tool-calling against a local model, and prove the step-limit and argument-validation guardrails actually trigger.

### Steps

1. Install Ollama and a model that supports tool calling, or configure Azure OpenAI, then wire the call_model function in the provided script to the real chat completions API with the two tools' schemas.
2. Run the agent against the goal 'Check stock for SKU AB1234 and open a ticket if it is out of stock' and review the full trajectory JSON output.
3. Deliberately break one tool's argument validation, for example ask the agent to look up a SKU with special characters, and confirm the agent logs the validation error and continues rather than crashing.
4. Craft a goal designed to loop, such as asking the agent to keep checking the same SKU repeatedly, and confirm the MAX_STEPS guardrail halts execution and returns an escalate status.
5. Install LangGraph and rebuild the same two-tool agent as an explicit state graph with a human-in-the-loop checkpoint before create_ticket executes.
6. Compare the LangGraph trajectory visualisation against the hand-rolled trajectory log for the same scenario.
7. Add Application Insights tracing and confirm each agent step appears as a distinct span with tool name and arguments visible.

### Validation

The agent successfully completes the inventory-check-and-ticket scenario end to end against a real model.,An invalid tool argument produces a logged error entry in the trajectory rather than an unhandled exception.,A loop-inducing goal is halted at exactly MAX_STEPS and returns status escalate, not an infinite run.,The LangGraph version enforces the human-in-the-loop checkpoint before create_ticket executes, confirmed by the graph pausing for approval.,Application Insights shows a distinct trace span per agent step for at least one full run.

## Operational automation

### Automating agent reliability and governance

**Hard bounds are non-negotiable.** Every agent loop, regardless of framework, must have a maximum step count and a maximum wall-clock time, enforced in code, not left to the model to self-regulate. This is the single cheapest control against runaway cost and infinite loops.

**Schema-validate every tool call before execution.** Never pass model-proposed arguments directly into a function call. Validate types, ranges and enums first, and treat a validation failure as a recoverable error fed back to the model, not a crash - this is what lets an agent self-correct on the next step instead of dying on a malformed argument.

**Trajectory logging as a first-class artifact.** Log every step - model output, tool called, arguments, result, timestamp - to a durable store, not just console output. This is what makes agent failures debuggable after the fact and is the evidence base for any incident review of an agent that took a wrong action.

**CI evaluation for agent behaviour, not just model output.** Build a suite of scenario-based tests - a fixed goal plus mocked tool responses - and assert on the resulting trajectory: which tools were called, in what order, whether the step limit was respected, whether a human-in-the-loop checkpoint was honoured. Run this on every change to the agent's prompt, tools or graph structure.

**Human-in-the-loop for irreversible actions.** Any tool call with a real-world side effect that cannot be trivially undone - sending an email, modifying a production record, spending money - gets an approval checkpoint in the orchestration graph, not an assumption that the agent will 'know' to ask.

## Troubleshooting

### Scenario 1: The agent calls the same tool repeatedly with slightly different arguments and never reaches a final answer.

**Likely cause:** No hard step limit is enforced, or the tool's result format is ambiguous enough that the model cannot tell it already has the information it needs.

**Resolution:** Enforce MAX_STEPS in code and treat exhaustion as an explicit escalate status, never a silent infinite loop. Improve the tool's returned schema to be unambiguous, and add an explicit instruction not to repeat an identical tool call with the same arguments.

### Scenario 2: A multi-agent pipeline produces a worse result than a single well-prompted agent did on the same task.

**Likely cause:** The task was decomposed without evidence that decomposition helps, and errors from an early agent in the chain propagated and compounded through later agents with no verification step between them.

**Resolution:** Add a verification or review step between agent handoffs rather than chaining blindly. Benchmark the multi-agent pipeline against a single-agent baseline on the same evaluation set before committing to the added complexity, cost and latency.

### Scenario 3: A tool call executes with arguments that pass type validation but are semantically wrong, such as a valid-looking but non-existent account ID.

**Likely cause:** Argument validation only checked shape (types, format) and not business validity, and the downstream system either fails unhelpfully or, worse, silently no-ops.

**Resolution:** Add a business-rule validation layer beyond type checking - existence checks against the real system before mutating calls, dry-run modes for destructive tools, and clear error responses fed back to the agent so it can retry with a corrected argument instead of failing opaquely.

### Scenario 4: Agent cost is far higher than expected even though the task looks simple.

**Likely cause:** Each step re-sends the full conversation history including every prior tool result, so token cost grows roughly quadratically with step count, or an unnecessary multi-agent design triples the model calls per task.

**Resolution:** Summarise or truncate older tool results out of the context window on long trajectories, cap context growth explicitly, and measure whether the multi-agent design is earning its added token cost against a single-agent baseline.

### Scenario 5: The agent behaves correctly in testing but takes a wrong irreversible action in production.

**Likely cause:** No human-in-the-loop checkpoint existed before an irreversible tool call, and the test suite exercised only the happy path, not adversarial or edge-case inputs.

**Resolution:** Add a mandatory approval checkpoint in the orchestration graph before any irreversible action executes. Expand the evaluation suite to include adversarial and edge-case scenarios, and review the trajectory log of the incident to identify exactly which step's output should have been caught by validation.

## Interview questions

### 1. What distinguishes an agent from a single-shot LLM call, and why does that distinction matter operationally?

A single-shot call takes an input and produces an output once; an agent runs a loop where the model can decide to call a tool, observe the result, and decide again, repeating until it reaches a final answer or hits a limit. That loop is what enables multi-step tasks - looking something up before drafting a response, checking a condition before acting - but it is also exactly why agents are operationally harder: every additional step is an additional opportunity for a wrong decision, a malformed tool call, or an unbounded loop, and errors from an early step compound into every step after it. Operationally this means an agent system needs guardrails a single-shot call does not: a hard maximum step count, validation of every tool call's arguments before execution, full trajectory logging so a bad outcome can be traced back to the step that caused it, and in many cases a human approval checkpoint before any irreversible action. I treat 'is this actually an agent or could a single well-structured call do it' as a real design question, because the added complexity and failure surface of a loop should be earned by a genuine multi-step requirement, not adopted by default because it is fashionable.

### 2. Compare LangGraph and Semantic Kernel and explain when you would choose one over the other.

Both are orchestration frameworks that provide the loop, state and tool-calling plumbing so you are not hand-rolling it, but they come from different ecosystems and make different things explicit. LangGraph models the agent as an explicit state graph - nodes and edges you define - which makes branching, cycles, retries and human-in-the-loop checkpoints first-class and visible, which matters a lot for auditability and for debugging exactly why an agent took a particular path. It is Python-first and fits naturally into a Python/data-science-adjacent stack with broad model provider support. Semantic Kernel is Microsoft's equivalent, with strong .NET support alongside Python, and it integrates cleanly with Azure OpenAI, Entra ID and the rest of the Azure ecosystem - its planners handle function-call sequencing somewhat more implicitly than LangGraph's explicit graph, though newer versions have moved toward more explicit control too. In practice I choose based on the surrounding stack: a .NET enterprise application already deep in Azure services leans Semantic Kernel for the identity and tooling fit; a Python-heavy data or ML team that wants maximum visibility into and control over the exact state transitions leans LangGraph. Both need the same guardrails - step limits, validation, logging - regardless of which one you pick.

### 3. How do you decide whether a task needs a multi-agent design versus a single well-designed agent?

I start from the assumption that a single agent is simpler, cheaper and easier to debug, and require evidence before adding more agents. The legitimate reasons to decompose are when a single prompt would need to hold too much conflicting context or too many competing instructions to perform any one part well - for example a 'write code' persona and a 'critically review code' persona genuinely benefit from separation, because a single model instance is worse at adversarially reviewing its own just-written output than a second pass with a different framing is. The illegitimate reason, which I see often, is decomposing because it looks more sophisticated or mirrors how a human team is organised, without measuring whether it actually improves the result. The way I settle it is empirically: build the single-agent version first, establish a baseline on a labelled evaluation set, then build the multi-agent version and compare quality, latency and cost. If the multi-agent design does not clear a meaningful quality bar over the baseline, it is not worth the tripled token cost, added latency and larger failure surface - more agents mean more places a wrong step compounds into a wrong final answer.

### 4. Describe the guardrails you consider mandatory for any agent making tool calls in a production enterprise system.

Five things I do not consider optional. First, a hard maximum step count and wall-clock timeout enforced in code, because relying on the model to know when to stop is not a control. Second, argument validation on every tool call before execution - type, range and business-rule checks - because the model proposes a call but the application must never trust it blindly; a failed validation should be fed back to the model as a recoverable error, not crash the process. Third, full trajectory logging of every step - what the model output, which tool was called with what arguments, what came back - to a durable store, because when an agent takes a wrong action the only way to understand why is to replay exactly what it saw at each step. Fourth, a human-in-the-loop approval checkpoint before any tool call with an irreversible or high-impact real-world effect - sending a message, modifying a production record, spending money - the agent proposes, a human or a policy layer confirms. Fifth, scenario-based regression testing in CI that asserts on the trajectory, not just the final answer, so a change to the prompt or the tool set that alters agent behaviour in an unintended way is caught before it reaches production.

## Certification alignment

- AI-102 Azure AI Engineer Associate - Implement generative AI solutions: orchestrate function/tool calling
- AI-900 Azure AI Fundamentals - Identify capabilities of Azure AI services for building intelligent applications
- AZ-305 Designing Microsoft Azure Infrastructure Solutions - Design an application architecture with distributed processing
- Vendor-neutral - NIST AI RMF MANAGE function: monitor deployed AI systems and their autonomy boundaries
- Vendor-neutral - OWASP Top 10 for LLM Applications: LLM08 Excessive Agency

## References

- LangChain / LangGraph documentation - agent and state graph orchestration
- Microsoft Learn - Semantic Kernel agent and planner documentation
- Microsoft Learn - Azure OpenAI function calling and tool use
- OWASP - Top 10 for Large Language Model Applications, LLM08 Excessive Agency
- NIST AI 100-1 - AI Risk Management Framework, MANAGE function

## Suggested video search

AI agents orchestration LangGraph Semantic Kernel multi-agent tool calling enterprise patterns

---

> Validate commands, versions, permissions, licensing, and rollback procedures in an isolated lab before production use.
