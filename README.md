# MOSAIC Community Toolkit

> Open-source infrastructure, interactive AI fine-tuning workshops, and developer tooling for the MOSAIC community.

## Project Structure
- `/client`: Next.js frontend application with terminal-inspired UI components.
- `/server`: Python/Flask API endpoints for AI models and agentic workflows.
- `/docs`: Workshop guides, event documentation, and architecture notes.

## Getting Started
1. **Frontend**: Navigate to `client` and run `npm install`.
2. **Backend**: Navigate to `server` and run `pip install -r requirements.txt`.

## Community Schema Validation
From the repository root, use Node.js 22 and the committed dependency lockfile:

```bash
npm ci
npm run validate:schemas
npm run test:schemas
```

`validate:schemas` uses AJV with strict Draft-07 schema compilation and
`ajv-formats` to check the positive CNMid event fixture and the repository speaker
example. `test:schemas` covers valid/invalid fixtures, existing host values, format
checks, and CLI failure handling. No network services or credentials are needed
after dependency installation.

To validate your own JSON files (one object per file):

```bash
npm run validate:schemas -- event path/to/event.json
npm run validate:schemas -- speaker path/to/speaker.json path/to/another-speaker.json
```

The CLI exits nonzero for schema violations, unreadable files, malformed JSON, or
invalid arguments. Its canonical contracts are `schemas/events-schema.json` and
`schemas/speaker.schema.json`; event `primaryGroup` now accepts `CNMid` alongside
the existing groups. Checked-in fixtures are examples, not approved listings.

The **Validate Community Schemas** GitHub Actions workflow runs the same smoke
checks and regression tests on every PR and push to `main`. The separate
`npm run validate:data` command and **Validate Corkboard Data** workflow continue
to validate published CNMid corkboard items against their own contract.

**Schema validity is not publication approval.** Geography, holiday-social
exclusions, source truth, host affiliation, freshness, and duplicate detection
remain outside these event/speaker schema checks. A valid record must still pass
the relevant editorial review; this change does not add those policies to either
schema.
