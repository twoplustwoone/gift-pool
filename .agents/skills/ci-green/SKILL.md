---
name: ci-green
description: Monitor the current pull request's CI, diagnose failures, prepare focused fixes, and repeat until all checks and Sonar are green. Use when the user asks to watch, diagnose, or repair CI for the current PR. Follow any approval requirements of the active CI-fix workflow before modifying code.
---

# CI Green

Poll the current PR's CI. For each failure, inspect the failing check and logs, explain the root cause, obtain any required implementation approval, fix it in a focused commit, push, and repeat until all checks and Sonar are green.
