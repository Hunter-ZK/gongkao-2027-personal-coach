# Workbench testing status

This file records checks that have actually been run. A green CI run does not substitute for real-device visual acceptance.

## Automated checks

- Python tests: run in GitHub Actions on Ubuntu, macOS, Windows.
- Python compile: run in GitHub Actions on Ubuntu, macOS, Windows.
- Frontend JavaScript syntax: `python tools/check_frontend.py`.
- Frontend boot smoke: `node tests/frontend_boot_smoke.mjs`.
- Content lint: run in GitHub Actions.
- Visual lint: after the 2026-09-14 visual rebuild, the replacement CSS set and shell template were checked locally with the supplied `css_lint.py`; result was 0 ERROR for CSS, 0 ERROR for the template, and `node --check static/js/app.js` passed. Full repository markup lint remains a separate cleanup item because some legacy page modules still contain symbol-based microcopy.

## Manual acceptance still required

- Start scripts on real Windows hardware.
- Start scripts on real macOS hardware.
- 1440x900 visual acceptance for the overview, knowledge, mistakes, review and import pages.
- Real browser verification of keyboard navigation and focus rings.
- Real PDF import visual acceptance with the supplied Fenbi fixture.

## Product audit baseline

The active visual baseline follows the supplied `03-UI设计规范.md` and `08-改进PRD-视觉与内容返工.md`: pale 224px sidebar, print-indigo accent, 4px panel radius, no decorative panel shadows, minimum 12.5px interface text, yearbook-style tables and exam-paper reading layout.
