# Changelog

## [1.2.0] - 2026-10-27

- `↗ original` and `o` work on Windows: the pasted file opens in the default app for its type. Before, they always toasted `could not open`.
- On Windows, JPEG, BMP, GIF and TIFF pastes, and screenshots over 4 MiB, get a preview: they are converted with PowerShell and System.Drawing. WebP and HEIC still show `no preview` there.
- README: Windows behavior, including that Windows terminals get half-block thumbnails.

## [1.1.0] - 2026-10-20

- Buttons under sent prompts come back after `/resume`, including `--fork-session`: sent prompts with images are now also kept in the mod's store (the last 500).
- A button is left out when its image is no longer in Claude Code's paste cache, for example after a reboot.
- Prompts sent with 1.0.0 were not stored, so they still get no button after `/resume`.

## [1.0.0] - 2026-10-20

Initial release of image-peek by AnnihilationWizard.

- Thumbnail row above the prompt for each `[Image #n]` in the draft, shown right after a paste and cleared when the prompt is sent or the tags are deleted; tiles keep the picture's shape, shrink to fit the band and end in `+N` when there are too many.
- `↗ #n` under each tile above the prompt opens the pasted file before the prompt is sent.
- `[ Image #n ]` button under each sent prompt that carried images, with a hover card showing the thumbnail and a side pane for a larger view (Esc closes it).
- `↗ original` in the hover card and `o` in the pane open the pasted file at full size in the system viewer.
- Real pictures where Claude Code draws them (Ghostty, kitty, or any terminal with `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`), colored half blocks everywhere else, including iTerm2 and Herdr; `IMAGE_PEEK_RENDERER` overrides the choice.
- One-time hint in Herdr explaining how to get real pictures.
- Non-PNG pastes converted once with `sips`; screenshots over 4 MiB shrunk for the half-block thumbnail.
- Sent prompts matched by their attached-image count, so a typed `[Image #1]` gets no button, and prompts with the same words but different images get none.
- Marketplace file so the repository installs with `/plugin install image-peek --marketplace AnnihilationWizard/image-peek`.
- Tests for layout, PNG decoding, half blocks, terminal detection, the prompt band, sent-prompt buttons, the zoom pane, opening the original and Herdr, run with `claude plugin test`.

Adapted from jarrodwatts/claude-image-view and GGGODLIN/cc-mod-image-view (MIT). Built on Claude Code's early-access function-hooks mod API.

[1.2.0]: https://github.com/AnnihilationWizard/image-peek/releases/tag/v1.2.0
[1.1.0]: https://github.com/AnnihilationWizard/image-peek/releases/tag/v1.1.0
[1.0.0]: https://github.com/AnnihilationWizard/image-peek/releases/tag/v1.0.0
