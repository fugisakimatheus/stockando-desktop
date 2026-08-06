# Contributing

Thank you for helping improve this project.

## Development setup

- Node.js 24.18 or newer
- pnpm 11.13 or newer
- VS Code with the recommended extensions

Install dependencies:

```bash
pnpm install
```

Start the application locally:

```bash
pnpm dev
```

## Workflow

1. Create a branch from the latest main branch.
2. Keep changes focused and avoid mixing unrelated edits.
3. Run the validation commands before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

4. Update documentation when a feature, workflow, or architecture decision changes.

## Pull request checklist

- The change has a clear purpose and scope.
- Relevant documentation has been updated.
- The app still builds and typechecks locally.
- The PR description explains the problem, the solution, and any follow-up work.

## Commit guidance

Use concise, descriptive commit messages. A simple convention is:

- feat: for new capabilities
- fix: for bug fixes
- docs: for documentation updates
- chore: for maintenance and tooling changes
