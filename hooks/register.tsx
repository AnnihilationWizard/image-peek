import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastedImage, SentPrompt } from '../types'
import { blockCells, buttonOffsets, drawsPictures, fitBox, fitCells, fitRow, imageNumbers, pngSize, sentFor, shouldHintHerdr } from './layout'
import type { Cells, Size } from './layout'
import { decodeThumb } from './png'
import type { Thumb } from './png'

// Pasting an image raises no prompt.edit (the tag only shows up on the next keystroke),
// so the draft is polled instead.
const POLL_MS = 200
const PANE = 'image-peek'
// Sent prompts kept for their buttons; older ones lose them.
const MAX_SENT = 200
// Longest side, in pixels, of the decoded copy half blocks are drawn from.
const TILE_SIDE = 96
const ZOOM_SIDE = 320
// Converted and shrunk copies stay under this many pixels on their longest side.
const COPY_SIDE = '1600'

const images = atom({ plugin: 'image-peek', key: 'images' } as const, [] as PastedImage[])
const sent = atom({ plugin: 'image-peek', key: 'sent' } as const, [] as SentPrompt[])
const zoomed = atom({ plugin: 'image-peek', key: 'zoomed' } as const, null as PastedImage | null)

let tmpRoot: string | undefined
let found: { sessionId: string; dir: string } | undefined
// The image numbers last drawn, so an unchanged draft doesn't rewrite state; undefined
// while a drawn image's file is still missing, so the next poll looks again.
let shownKey: string | undefined
let isChecking = false
// Whether Claude Code draws Image as a real picture here; set at session start.
let pictures = false
const sizes = new Map<string, Size | null>()
// Files whose first bytes aren't a PNG's: they never will be, so they aren't read again.
const notPng = new Set<string>()
// Source files sips couldn't convert, so a broken paste isn't retried on every poll.
const unconvertible = new Set<string>()
// Decoded copies for half blocks, by `${side}:${path}`; null when the file can't be decoded.
const thumbs = new Map<string, Thumb | null>()

// Claude Code doesn't tell mods whether its Image draws a picture, so go by the environment
// it decides from.
async function terminalEnv($: EngineInterface): Promise<Record<string, string | undefined>> {
  return {
    TERM: await $.env.get('TERM'),
    TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
    TMUX: await $.env.get('TMUX'),
    STY: await $.env.get('STY'),
    KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    GHOSTTY_RESOURCES_DIR: await $.env.get('GHOSTTY_RESOURCES_DIR'),
    CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
    CLAUDE_CODE_SESSION_KIND: await $.env.get('CLAUDE_CODE_SESSION_KIND'),
    IMAGE_PEEK_RENDERER: await $.env.get('IMAGE_PEEK_RENDERER'),
    HERDR_ENV: await $.env.get('HERDR_ENV'),
  }
}

const HERDR_HINT =
  'image-peek: Herdr gets block thumbnails. If Herdr runs in Ghostty or kitty, start Claude Code with CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1 for real pictures'

// Shown once, ever: kept in the store so it doesn't come back every session.
async function hintHerdr($: EngineInterface, env: Record<string, string | undefined>) {
  if (!shouldHintHerdr(env) || (await $.store.get('herdrHintShown')) === true) return
  $.ui.toast(HERDR_HINT)
  await $.store.set('herdrHintShown', true)
}

// Claude Code keeps its temp files in <base>/claude-<uid>, or <base>\claude on Windows. The base
// is CLAUDE_CODE_TMPDIR when set, else /tmp (%TEMP% on Windows).
async function tempRoot($: EngineInterface): Promise<string | undefined> {
  const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
  if ((await $.env.get('OS')) === 'Windows_NT') {
    const base = fromEnv ?? (await $.env.get('TEMP'))
    return base === undefined ? undefined : `${base.replace(/[\\/]+$/, '')}/claude`
  }
  const uid = (await $.process.run(['id', '-u'])).stdout.trim()
  return `${(fromEnv ?? '/tmp').replace(/\/+$/, '')}/claude-${uid}`
}

// Claude Code caches each paste as <tmp>/<project>/<session>/images/<n>.<ext>. The project
// folder is named after a working directory that may since have moved, so find it by the
// session id instead of rebuilding it.
async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  tmpRoot ??= await tempRoot($)
  if (tmpRoot === undefined) return undefined
  const entries = await $.fs.list(tmpRoot).catch(() => [])
  for (const entry of entries) {
    const dir = `${tmpRoot}/${entry.name}/${sessionId}/images`
    if (entry.kind === 'dir' && (await $.fs.exists(dir))) {
      found = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

const sessionDirOf = (path: string) => path.replace(/\/images\/[^/]+$/, '')

/** A shrunk PNG copy of `source` in the session folder, made once with sips (macOS only). */
async function copyWithSips($: EngineInterface, source: string, out: string): Promise<string | undefined> {
  if (await $.fs.exists(out)) return out
  if (unconvertible.has(source)) return undefined
  const { exitCode } = await $.process
    .run(['sips', '-s', 'format', 'png', '-Z', COPY_SIDE, source, '--out', out], { timeoutMs: 10_000 })
    .catch(() => ({ exitCode: 1 }))
  if (exitCode === 0) return out
  unconvertible.add(source)
  return undefined
}

// Pastes are cached as <n>.png or <n>.webp (or another format), but pictures are drawn from PNG
// only, so anything else is converted once to <session>/image-peek-<n>.png.
// The original paste is kept beside it, for opening at full size.
async function pngFor($: EngineInterface, dir: string, n: number): Promise<{ png: string; original: string } | undefined> {
  const png = `${dir}/${n}.png`
  if (await $.fs.exists(png)) return { png, original: png }
  const entries = await $.fs.list(dir).catch(() => [])
  const source = entries.find(entry => entry.kind === 'file' && entry.name.startsWith(`${n}.`))
  if (source === undefined) return undefined
  const original = `${dir}/${source.name}`
  const converted = await copyWithSips($, original, `${sessionDirOf(png)}/image-peek-${n}.png`)
  return converted === undefined ? undefined : { png: converted, original }
}

async function describe($: EngineInterface, dir: string | undefined, n: number): Promise<PastedImage> {
  const found = dir === undefined ? undefined : await pngFor($, dir, n)
  const path = found?.png
  if (path === undefined || notPng.has(path)) return { n, path: null, size: null }
  const original = found!.original
  if (!sizes.has(path)) {
    const base64 = await $.fs.read(path, { as: 'bytes' }).then(
      bytes => bytes.base64,
      () => undefined, // too big to read: still drawable, just without its aspect ratio
    )
    const head = base64 === undefined ? undefined : pngSize(base64)
    if (head === null) {
      // A file no longer than the 24-byte header may still be being written; a longer one is settled.
      if (base64!.length > 32) notPng.add(path)
      return { n, path: null, size: null }
    }
    sizes.set(path, head ?? null)
  }
  return { n, path, size: sizes.get(path) ?? null, original }
}

/** Opens the original paste in the system's viewer (Preview on macOS), at full size. */
async function openOriginal($: EngineInterface, image: PastedImage) {
  const file = image.original ?? image.path
  if (file == null) return
  const opened = await $.process.run(['open', file], { timeoutMs: 10_000 }).then(run => run.exitCode === 0, () => false)
  if (!opened) {
    const viaXdg = await $.process.run(['xdg-open', file], { timeoutMs: 10_000 }).then(run => run.exitCode === 0, () => false)
    if (!viaXdg) $.ui.toast(`image-peek: could not open ${file}`)
  }
}

/**
 * The decoded copy half blocks are drawn from. A PNG over $.fs.read's 4 MiB cap (a large
 * screenshot) is shrunk with sips first, so it still gets blocks.
 */
async function thumbFor($: EngineInterface, image: PastedImage, side: number): Promise<Thumb | null> {
  if (image.path === null) return null
  const key = `${side}:${image.path}`
  if (thumbs.has(key)) return thumbs.get(key)!
  const readBytes = (path: string) => $.fs.read(path, { as: 'bytes' }).then(bytes => bytes.base64, () => undefined)
  let base64 = await readBytes(image.path)
  if (base64 === undefined) {
    const small = await copyWithSips($, image.path, `${sessionDirOf(image.path)}/image-peek-small-${image.n}.png`)
    base64 = small === undefined ? undefined : await readBytes(small)
  }
  const thumb = base64 === undefined ? null : decodeThumb(Uint8Array.fromBase64(base64), side)
  thumbs.set(key, thumb)
  return thumb
}

async function show($: EngineInterface, draft: string) {
  const numbers = imageNumbers(draft)
  const key = numbers.join(',')
  if (key === shownKey) return
  const dir = numbers.length > 0 ? await imagesDir($) : undefined
  const list: PastedImage[] = []
  for (const n of numbers) list.push(await describe($, dir, n))
  shownKey = list.every(image => image.path !== null) ? key : undefined
  await update($, images, () => list)
}

async function check($: EngineInterface) {
  if (isChecking) return
  isChecking = true
  try {
    await show($, (await $.prompt.read()).text)
  } finally {
    isChecking = false
  }
}

/**
 * Records which pictures a sent prompt carried, while their cached files are known. The tags
 * are trusted only when their count matches the images the engine attached, so a typed
 * `[Image #1]` never borrows an earlier paste.
 */
async function remember($: EngineInterface, text: string, attached: number) {
  let numbers = imageNumbers(text)
  if (numbers.length !== attached) {
    const draft = (await read($, images)).map(image => image.n)
    if (draft.length !== attached) return
    numbers = draft
  }
  const dir = await imagesDir($)
  const list: PastedImage[] = []
  for (const n of numbers) list.push(await describe($, dir, n))
  if (list.every(image => image.path === null)) return
  await update($, sent, all => [...all, { text: text.trim(), images: list }].slice(-MAX_SENT))
}

// The terminal's table: it has Image and Raster, which every hook here draws only after checking the surface.
type Elements = Extract<ReturnType<EngineInterface['ui']['resolve']>, { Image: unknown; Raster: unknown }>

/** A picture: the real one where Claude Code draws pictures, else colored half blocks. */
function picture(el: Elements, image: PastedImage, cells: Cells, key: string, thumb: Thumb | null, noPreview: string) {
  const { Box, Image, Raster, Text } = el
  if (image.path === null || (!pictures && thumb === null)) {
    return (
      <Box width={cells.columns} height={cells.rows} alignItems="center" justifyContent="center">
        <Text dimColor wrap="truncate">{noPreview}</Text>
      </Box>
    )
  }
  if (!pictures && thumb !== null) {
    return <Raster key={`blocks-${key}`} columns={cells.columns} rows={cells.rows} cells={blockCells(thumb, cells.columns, cells.rows)} />
  }
  return (
    <Image
      key={`image-${key}`}
      source={{ file: image.path, format: 'png' }}
      columns={cells.columns}
      rows={cells.rows}
      alt={`[Image #${image.n}]`}
    />
  )
}

// One hover group per image: its button and its card light together. Numbers are unique per session.
const scopeOf = (n: number) => `image-peek-${n}`
const buttonLabel = (n: number) => `Image #${n}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const env = await terminalEnv($)
    pictures = drawsPictures(env)
    if (e.surface === 'terminal') await hintHerdr($, env).catch(() => undefined)
    $.clock.every(POLL_MS, () => check($))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const attached = (e.attachments ?? []).filter(item => item.type === 'image').length
    if (e.origin.kind === 'composer' && attached > 0) {
      await remember($, e.text, attached).catch(error => $.ui.log(`image-peek: could not record images: ${String(error)}`))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, images)
    if (list.length === 0) return next(e)

    const el = $.ui.resolve(e)
    const { Box, Text } = el
    const cells = fitRow(list.map(image => image.size), e.props.maxRows, e.props.bodyColumns)
    if (cells.length === 0) return next(e)
    const shown = list.slice(0, cells.length)
    const drawn = await Promise.all(shown.map(image => (pictures ? null : thumbFor($, image, TILE_SIDE))))
    const hidden = list.length - cells.length
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          {shown.map((image, i) => (
            <Box key={`tile-${image.n}`} flexDirection="column" alignItems="center" borderStyle="round" borderDimColor>
              {picture(el, image, cells[i]!, `draft-${image.n}`, drawn[i] ?? null, 'no preview')}
              <Text dimColor>#{image.n}</Text>
            </Box>
          ))}
          {hidden > 0 && <Text dimColor>+{hidden}</Text>}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer') return next(e)
    const entry = sentFor(await read($, sent), e.props.text)
    const list = entry?.images.filter(image => image.path !== null) ?? []
    if (list.length === 0) return next(e)

    const el = $.ui.resolve(e)
    const { Box, Button } = el
    const drawn = await Promise.all(list.map(image => (pictures ? null : thumbFor($, image, TILE_SIDE))))
    // The pane is opened first, in the press itself: a pane the person asked for is placed at any
    // width, while one opened after an await may count as unasked and wait for a wide terminal
    // (a Herdr pane beside its sidebar is narrower than that).
    const zoom = async (image: PastedImage) => {
      const opening = $.ui.open({ id: PANE, title: `Image #${image.n}`, focus: true, closeOnEscape: true })
      await update($, zoomed, () => image)
      const opened = await opening
      if (!opened.isPlaced) $.ui.toast(`image-peek: the zoom pane did not open (${opened.reason}); try ↗ original`)
    }
    const row = await next(e)
    const offsets = buttonOffsets(list.map(image => buttonLabel(image.n)))

    return (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="row" columnGap={1}>
          {list.map(image => (
            <Box hover={{ scope: scopeOf(image.n) }}>
              <Button key={`image-peek:open:${image.n}`} label={buttonLabel(image.n)} dimColor onPress={() => zoom(image)} />
            </Box>
          ))}
        </Box>
        {list.map((image, i) => (
          // In the flow under the button row, shifted under its own button: the rows below move
          // down while it shows, the buttons never do.
          <Box display="none" hover={{ scope: scopeOf(image.n), display: 'flex' }} marginLeft={offsets[i]} flexDirection="column" alignItems="flex-start">
            <Box flexDirection="column" alignItems="center" borderStyle="round" borderDimColor>
              {picture(el, image, fitCells(image.size), `sent-${image.n}`, drawn[i] ?? null, 'no preview')}
              <Box flexDirection="row" columnGap={1}>
                <Button key={`image-peek:zoom:${image.n}`} label="⤢ zoom" dimColor onPress={() => zoom(image)} />
                <Button key={`image-peek:original:${image.n}`} label="↗ original" dimColor onPress={() => openOriginal($, image)} />
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const el = $.ui.resolve(e)
    const { Box, Button, Text } = el
    const image = await read($, zoomed)
    if (image === null) return <Text dimColor>No image selected.</Text>
    // Two rows under the picture: the open button and the caption.
    const cells = fitBox(image.size, e.props.bodyColumns, e.props.scroll.bodyRows - 2)
    const thumb = pictures ? null : await thumbFor($, image, ZOOM_SIDE)
    return (
      <Box flexDirection="column" alignItems="center">
        {picture(el, image, cells, 'zoom', thumb, 'no preview')}
        <Button key="image-peek:pane-original" label="↗ open original" hotkey="o" onPress={() => openOriginal($, image)} />
        <Text dimColor>Image #{image.n} · o opens the original · Esc to close</Text>
      </Box>
    )
  })
}
