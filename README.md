# image-peek

<p align="center">
  <strong>See the images you paste, not just <code>[Image #1]</code>.</strong><br>
  A Claude Code mod that shows thumbnails above the prompt and a preview under each prompt you sent.
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/Version-1.1.0-green.svg" alt="Version 1.1.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://code.claude.com/docs"><img src="https://img.shields.io/badge/Platform-Claude%20Code-D97757.svg" alt="Platform: Claude Code"></a>
  <a href="hooks/register.tsx"><img src="https://img.shields.io/badge/Type-Function%20hooks%20mod-6E7681.svg" alt="Function hooks mod"></a>
  <a href="tests/image-peek.test.tsx"><img src="https://img.shields.io/badge/Tests-20%20passing-3FB950.svg" alt="20 tests passing"></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#install">Install</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#terminal-support">Terminal support</a> ·
  <a href="#development">Development</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

![Side-by-side Claude Code session: on the left a pasted image shows only as an [Image #1] tag; on the right a thumbnail sits above the prompt and the sent prompt has an Image #1 button whose hover card shows the picture with zoom and original buttons](docs/images/preview.svg)

*Illustration of a session before and after.*

When you paste an image into Claude Code, the prompt shows a bare `[Image #1]` tag, and once the prompt is sent there is no way to look at the picture again. image-peek draws the picture: a thumbnail row above the prompt while you write, and an image button under each sent prompt that carried one. It only changes what the terminal draws: the prompt, the stored message and what Claude reads stay the same.

> [!NOTE]
> image-peek is built on Claude Code's function-hooks mod API, which is in early access and may change between releases.

## Features

- **Thumbnails above the prompt:** Each `[Image #n]` in the prompt box gets a tile with its number, right after you paste. Tiles keep the picture's shape and shrink to fit; extra ones become `+N`. Click a tile's `↗ #n` to open the image before you send.
- **Preview under sent prompts:** A prompt you sent with images gets an `[ Image #n ]` button. Hover it for a thumbnail; press it to open a larger view in a side pane (Esc closes it).
- **Open the original:** `↗ original` in the hover card, or `o` in the pane, opens the pasted file at full size in the system viewer (Preview on macOS).
- **Works in any terminal:** Where Claude Code draws pictures (Ghostty, kitty) you get the real picture. Everywhere else (iTerm2, Terminal.app, WezTerm, Herdr, VS Code) you get a thumbnail drawn in colored half blocks.
- **Any image format:** PNG is drawn as is. JPEG, WebP, HEIC and other formats are converted once with macOS `sips`, and screenshots over 4 MiB are shrunk for the block thumbnail.
- **No false previews:** A typed `[Image #1]` with no attached image gets no button, and two sent prompts with the same words but different images get none rather than the wrong one.

## Install

In a Claude Code **terminal** session, run:

```
/plugin install image-peek --marketplace AnnihilationWizard/image-peek
```

1. Answer `y` to add the `github:AnnihilationWizard/image-peek` marketplace.
2. Choose a scope. The **user** scope loads the mod in every session.
3. Claude Code confirms `Installed image-peek. Plugin is now active.` The mod works in the current session without a restart.

To update later, run `claude plugin update`, then `/reload-plugins`.

<details>
<summary>Run from a local clone instead</summary>

```bash
git clone https://github.com/AnnihilationWizard/image-peek.git
claude --plugin-dir ./image-peek
```

To load a clone in every session, add it to the `env` block of `~/.claude/settings.json`:

```json
{
  "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/image-peek" }
}
```

</details>

## Usage

Once installed, there is nothing to configure. Paste an image into the prompt and its thumbnail appears above the input.

| Where | What you can do |
| --- | --- |
| Above the prompt | See each pasted image. Click `↗ #n` under a tile to open the original. The row clears when you send the prompt or delete the tags. |
| Under a sent prompt | Hover `[ Image #n ]` for a thumbnail. Press it, or `⤢ zoom` in the card, to open the side pane. |
| Hover card | `↗ original` opens the pasted file in the system viewer. |
| Side pane | `o` or `↗ open original` opens the file; `Esc` closes the pane. |

Hover and clicks need Claude Code's fullscreen layout, which is on by default. With `CLAUDE_CODE_NO_FLICKER=0`, or inside tmux, the terminal does not report the mouse, so the buttons cannot be pressed.

### Limitations

- Only prompts sent while the mod (1.1.0 or later) is loaded get buttons. They come back after `/resume`, including `--fork-session`, as long as Claude Code's paste cache still holds the images: it is a temp folder that a reboot empties, and then the buttons are left out.
- Converting non-PNG images and shrinking large screenshots uses `sips`, so on Linux and Windows those images show `no preview`. PNG pastes work everywhere.
- Opening the original runs `open` (macOS) or `xdg-open` (Linux).
- The desktop app already previews pasted images, so the mod draws nothing there.
- Labels are in English.

## Terminal support

Claude Code, not the mod, decides whether a terminal gets real pictures: it draws them in kitty and Ghostty, and turns them off inside tmux and screen and in background sessions. image-peek follows the same rule, so it never draws an empty box.

| Terminal | Thumbnail |
| --- | --- |
| Ghostty, kitty | Real picture |
| iTerm2, Terminal.app, WezTerm, VS Code, most others | Colored half blocks |
| Herdr | Colored half blocks, or real pictures with `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` when Herdr runs in Ghostty or kitty |
| Inside tmux or screen | Colored half blocks |

`CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` makes Claude Code draw pictures in any terminal. Set it only when the terminal supports the kitty graphics protocol's Unicode placeholders; otherwise the tile is a grid of colored squares. In Herdr, the mod shows this hint once.

To override the mod's guess, set `IMAGE_PEEK_RENDERER=blocks` (always half blocks) or `IMAGE_PEEK_RENDERER=image` (always real pictures) in the environment you start Claude Code from.

## Development

```bash
claude plugin validate .   # manifest, marketplace file and hooks module
claude plugin test .       # tests/*.test.tsx against the engine
```

After Claude Code first loads the mod, it writes the API types to `.claude-plugin/types/` (git-ignored). Type-check against them with TypeScript 5.4 or newer:

```bash
npx -p typescript@5 tsc -p .
```

Run `claude --plugin-dir .` to try changes. In an interactive session the folder is watched, and saving a file reloads the mod.

## Project Structure

```text
.claude-plugin/   plugin.json manifest and marketplace.json
hooks/            hooks.json, the hooks module, layout helpers and the PNG decoder
types/            state contract: draft images, sent prompts, the zoomed image
tests/            tests run with claude plugin test
docs/images/      README illustration
```

## Credits

image-peek builds on two MIT-licensed mods: [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view) (thumbnails above the prompt, the PNG decoder and half-block drawing) and [GGGODLIN/cc-mod-image-view](https://github.com/GGGODLIN/cc-mod-image-view) (buttons under sent prompts and the zoom pane). See [NOTICE](NOTICE).

## Contributing

Bug reports and ideas are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an [issue](https://github.com/AnnihilationWizard/image-peek/issues) or pull request, and follow [SECURITY.md](SECURITY.md) for security reports.

## License

[MIT License](LICENSE). Copyright © 2026 [AnnihilationWizard](https://github.com/AnnihilationWizard), Jarrod Watts and gggodlin.
