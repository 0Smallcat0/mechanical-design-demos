# mechanical-design-demos

- No drive-by refactors, renames or cleanups: change only what the task needs. Review the diff, not only the summary.
- Done means you actually ran the tests or opened the page and looked at it. A run that executes nothing (zero tests matched, page never opened) is not evidence.
- Pages under `*/live.html` and `*/index.html` open straight from disk or GitHub Pages; check them in a browser (console clean) before saying done.
- Tests: `cd mobile-robot-localization && npm test`; `node robot-arm-planning/tests/test.mjs`.
- New interactive component or layout (dialog, popover, tabs, carousel, scroll effect): first `npx --yes modern-web-guidance@latest search "<feature>"`, then `retrieve <id>` and read the saved guide in full.
