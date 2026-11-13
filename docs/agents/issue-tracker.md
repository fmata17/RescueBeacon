# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues at `fmata17/RescueBeacon`. Use the `gh` CLI from this repo.

## Conventions

- Create: `gh issue create --title "..." --body "..."`.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`, with appropriate filters.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: comment with the reason, then run `gh issue close <number>`.
- Sub-issues: use `gh issue create --parent <parent>` or `gh issue edit <parent> --add-sub-issue <child>` when supported. Otherwise, put `Part of #<parent>` in the child body.
- Blocking: use `gh issue edit <child> --add-blocked-by <blocker>` when supported. Otherwise, put `Blocked by: #<number>` in the child body. A ticket is ready when all blockers are closed.

Before creating an issue, check `gh repo view --json nameWithOwner` resolves to `fmata17/RescueBeacon`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if external pull requests should enter the triage queue.

## Skill terminology

- “Publish to the issue tracker” means create a GitHub issue.
- “Fetch the relevant ticket” means read that GitHub issue.
- For wayfinding, use one `wayfinder:map` issue with child issues as tickets. Claim a ticket by assigning it to yourself; resolve it by commenting, closing it, and updating the map.
