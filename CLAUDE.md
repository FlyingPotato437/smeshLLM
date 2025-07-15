"""
CLAUDE.md — Multi-Agent Orchestration Protocol

This file defines the operating protocol for all Claude-like agents collaborating on this project. It ensures:
- Every agent action is logged and traceable
- All work is directly aligned with the current <goal> in comms.md
- Steps are atomic, testable, and production-ready
- No agent stops until the <goal> is fully achieved
- Real data/services are always used (no mock/dummy data)
- All context and results are version-controlled and knowledge is preserved

Example: If the <goal> is to train a model on n5_stanford.csv and deploy a real-time map, every step must move toward that, with no dead-ends or skipped details.
"""

# Agent Operating Protocol

1. **Context First**
   - Before any action, always use byterover-retrive-knowledge to gather all relevant context.
   - Always read comms.md for the current <goal> and review the Action Log.

2. **Action Logging**
   - Log every action in the Action Log in comms.md, using:
     Act done: <tool> | <agent> | <desc> | <file(s)>
   - Keep logs concise but specific enough for another agent to pick up instantly.

3. **Atomic Steps**
   - Break work into the smallest possible, testable, goal-relevant steps.
   - Each step must move directly toward the <goal> in comms.md.
   - Never overthink, but never skip necessary details.

4. **Continuous Progress**
   - Never stop until the <goal> is fully implemented and production/deployment ready.
   - If stuck, log the issue and next best step.

5. **Real Data & Services**
   - Always use real data, real APIs, and real DB connections (no mock/dummy data).
   - Validate that all integrations (ML, DB, HYSPLIT, LLM, map, deployment) are working as described in <goal>.

6. **Knowledge Preservation**
   - After every critical step, use byterover-store-knowledge to save key insights, fixes, and results.

7. **Handoff Protocol**
   - At the end of each step, clearly identify the next actionable step for the next agent.
   - If a step is blocked, log the blocker and suggest a resolution path.

8. **Testing & Quality**
   - Write or update tests for every non-trivial change.
   - Ensure all business rules and integrations are covered.

9. **Version Control**
   - All code, schema, and infra changes must be version-controlled and committed with clear, imperative messages.

10. **Deployment Readiness**
    - Ensure all work is ready for deployment (e.g., Netlify) and will function in production.

# Example Action Log Entry
Act done: edit_file | ClaudeAgent | Refactored agent protocol for clarity and goal alignment | CLAUDE.md

# DO NOT STOP
- Continue until the <goal> in comms.md is fully achieved.
- If the <goal> changes, immediately adapt all steps to the new goal.[byterover-mcp]

# important 
always use byterover-retrive-knowledge tool to get the related context before any tasks 
always use byterover-store-knowledge to store all the critical informations after sucessful tasks