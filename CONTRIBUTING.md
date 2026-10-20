# Contributing

Thank you for helping improve image-peek. It is a small Claude Code mod written as a plugin of function hooks. Start with the [README](README.md).

## Report a bug

Use the [issue tracker](https://github.com/AnnihilationWizard/image-peek/issues). Include:

- The image-peek version, Claude Code version (`claude --version`) and operating system.
- The terminal (iTerm2, Ghostty, kitty, Herdr, WezTerm, VS Code, …), whether it runs inside tmux, and whether `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` or `IMAGE_PEEK_RENDERER` is set.
- Where it looked wrong (the band above the prompt, the button under a sent prompt, the hover card, the zoom pane, opening the original), the image format, and what you expected to see.
- Any transcript line that names `image-peek`, such as `image-peek: ui.render (AbovePrompt) refused: …`.

Never attach images, paths or code you are not allowed to share. For security concerns, follow [SECURITY.md](SECURITY.md).

## Propose a change

Open an issue that describes the problem and the intended behavior before a broad change. Keep changes focused: the mod should only change what the terminal draws, never the prompt, the stored message or what the model reads.

## Develop and verify

Run from the repository root:

```bash
claude plugin validate .
claude plugin test .
npx -p typescript@5 tsc -p .
```

The type-check needs the types Claude Code writes to `.claude-plugin/types/` the first time it loads the mod, for example with `claude --plugin-dir .`.

For behavior changes, add or update a test in `tests/image-peek.test.tsx`. Cover both a terminal that draws pictures (Ghostty) and one that gets half blocks (iTerm2), as the existing tests do.

## Submit a pull request

- Explain the problem and the resulting behavior.
- List the checks you ran and their results, and the terminals you tried.
- Update the README and CHANGELOG when behavior changes.
- Use a Conventional Commit message, such as `fix: keep the tile shape for tall screenshots`.
