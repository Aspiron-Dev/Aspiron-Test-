# Rules for Claude in this repository

## Zero bill: never add anything that can cost money

The owner is on the GitHub Free and Copilot Free plans and wants the bill to stay at ₹0 / $0.
Before you add or change anything, check that it cannot raise paid usage. If a task needs something
that might cost money, stop and ask the owner first, and say plainly what it could cost.

Do not do any of these without the owner's clear permission:
- Add a new GitHub Actions workflow, or make an existing one run more often. This includes a tighter
  `cron`, more `push`/`pull_request` triggers, a larger `runs-on` runner, macOS/Windows runners, or
  longer jobs. Frequent schedules use up the free Actions minutes quickly.
  `security-alerts.yml` was cut from hourly to daily for this reason.
- Use Codespaces, GitHub Packages, Git LFS, large artifacts or caches, or paid Copilot / AI-credit features.
- Change billing, budgets, spending limits or payment methods. The $0 budgets must stay at $0.
- Sign up for, or connect, any paid third-party service, API or plan. This includes Supabase plan
  upgrades and paid add-ons.

When you write a workflow, keep it small: `timeout-minutes` set, `ubuntu-latest`, and the rarest
schedule that still does the job.
