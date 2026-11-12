# Execution ledger — core architecture alignment
Plan: 2026-11-12-core-architecture-alignment.md
Branch: core/architecture-alignment, from d347385.
Baseline: 474 tests passed; existing Starlette/httpx deprecation warning.
Ruling: work in the requested new branch in this checkout; no extra worktree.
Ruling: preserve public port signatures and tables; explicitly change bootstrap order and media routing under the user's refactor authorization.
Pre-flight: tasks 2 and 4 share creation refresh behavior; implement with the current session first, then move refresh behind Transaction.
Pre-flight: tasks 3 and 6 share schema converters; preserve record attributes while changing storage types.
Pre-flight: tasks 7 and 9 share canonical media URL plus authenticated legacy alias.
Pre-flight: tasks 5 and 8 share settings/last_area behavior; add consent only after persistence extraction.
Task 1: contract fixture captured; documentation reconciled; baseline contract passes.
Task 4: composition.py added, routes/gateways build services through it; test_transactions.py covers audience/participant/commit failure injection, post-commit failure, SQL/can_see parity. 490 tests pass.
Task 6: media failure tests, approval-no-widen test, lane-isolation map extended to new core modules.
Task 7: canonical /media + legacy alias (no-store), bundled generated PNG assets + manifest, seed/media.py, public mark allowlist route, tests (test_seed_media.py + consent tests), wheel verified from isolated install.
Task 8: core/areas.py (UT Dallas envelope), UserService.record_near_area (opt-in only, label only, opt-out clears), both nearby routes record, uvicorn access-log redaction, tests; fixed _dump in privacy suite to compare full rows. 515 pass.
