# Security Notes

image-peek only changes what Claude Code draws in the terminal. These notes describe what it can reach; they do not establish a support SLA.

## What the mod does

- It reads the prompt box every 200 ms to find `[Image #n]` tags, because pasting an image raises no edit event.
- It lists Claude Code's temp folder to find the current session's paste cache, and reads each pasted image (up to Claude Code's 4 MiB read limit) to get its size and draw half-block thumbnails.
- It runs `id -u` once to find that temp folder, and `sips` to convert non-PNG pastes and shrink large screenshots, writing PNG copies into the same session folder (`image-peek-<n>.png`, `image-peek-small-<n>.png`). It deletes nothing; the folder is Claude Code's.
- When you press `↗ original`, it runs `open` (or `xdg-open`) on the pasted file.
- It keeps the session's sent prompts that carried images, their image paths, and the image shown in the pane in session state, and one flag in its own store so the Herdr hint shows once.
- It reads terminal variables (`TERM`, `TERM_PROGRAM`, `TMUX`, `HERDR_ENV` and similar) to tell which kind of thumbnail Claude Code can draw.
- It makes no network requests, calls no model, changes no settings and does not alter the prompt or what the model reads.

Run `claude plugin validate .` to see every event it hooks, every call it makes and every variable it reads.

## Report a security concern

If this repository offers GitHub private vulnerability reporting, use the **Report a vulnerability** option on its [Security page](https://github.com/AnnihilationWizard/image-peek/security). This document does not assume that the option is enabled.

If no private reporting option is available, open a minimal issue asking the maintainer to arrange a private channel. Do not publish exploit details, credentials, private images or code in that issue.

Include the affected version, Claude Code version, environment, steps to reproduce and impact. No response-time or supported-version guarantee is currently stated.
