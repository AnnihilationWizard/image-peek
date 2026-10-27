import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { blockCells, buttonOffsets, drawsPictures, fitBox, fitCells, fitRow, imageNumbers, pngSize, sentFor, shouldHintHerdr } from '../hooks/layout'
import { decodeThumb } from '../hooks/png'

// A real 4 x 2 PNG: left half red, right half blue.
const RED_BLUE = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAE0lEQVR4nGP4z8AARGDiPwMyBwBnsgf5Q2OaZwAAAABJRU5ErkJggg=='

const SESSION = '/tmp/claude-501/-work/sess-1'
const DIR = `${SESSION}/images`
const ITERM: Record<string, string> = { TERM_PROGRAM: 'iTerm.app', TERM: 'xterm-256color' }
const GHOSTTY: Record<string, string> = { TERM_PROGRAM: 'ghostty' }
// What Herdr 0.9.5 sets in its panes.
const HERDR: Record<string, string> = { HERDR_ENV: '1', TERM_PROGRAM: 'herdr', TERM: 'xterm-256color', COLORTERM: 'truecolor' }
const ran = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const dirEntry = { name: '-work', kind: 'dir', size: 0, mtimeMs: 0, isLink: false } as const

const BAND = {
  plugin: 'image-peek',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const PANE = {
  plugin: 'image-peek',
  component: 'Pane',
  requestId: 'image-peek',
  props: { title: 'Image #1', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const userRow = (text: string) =>
  ({
    plugin: 'image-peek',
    component: 'UserMessage',
    requestId: 'row-1',
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  }) as const

/** The engine beneath the mod: one session whose paste cache holds 1.png, in the terminal `env` names. */
function engine(on: On, env: Record<string, string>, draft: () => string, opened: string[] = [], runs: string[][] = []) {
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => ({ value: { text: draft(), cursor: draft().length } }))
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return ran('501\n')
  })
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.list', () => ({ value: [dirEntry] }))
  on('fs.exists', ($, e) => ({ value: e.path === DIR || e.path === `${DIR}/1.png` }))
  on('fs.read', () => ({ value: { base64: RED_BLUE } }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
}

test('image numbers come from the text, deduplicated, in order', () => {
  expect(imageNumbers('look [Image #2] and [Image #1] again [Image #2]')).toEqual([2, 1])
  expect(imageNumbers('[Image 1] [image #3] #4')).toEqual([])
})

test('PNG size is read from the header and a real PNG decodes to its colors', () => {
  expect(pngSize(RED_BLUE)).toEqual({ width: 4, height: 2 })
  const thumb = decodeThumb(Uint8Array.fromBase64(RED_BLUE))!
  expect([thumb.width, thumb.height]).toEqual([4, 2])
  expect([...thumb.rgb.slice(0, 3)]).toEqual([255, 0, 0])
  expect([...thumb.rgb.slice(9, 12)]).toEqual([0, 0, 255])
  // A smaller side shrinks it, keeping the shape.
  const small = decodeThumb(Uint8Array.fromBase64(RED_BLUE), 2)!
  expect([small.width, small.height]).toEqual([2, 1])
})

test('half blocks carry the top pixel as foreground and the bottom as background', () => {
  const thumb = { width: 1, height: 2, rgb: new Uint8Array([255, 0, 0, 0, 0, 255]) }
  const words = new Uint32Array(Uint8Array.fromBase64(blockCells(thumb, 1, 1)).buffer)
  expect([...words]).toEqual([0x2580, 0xff0000, 0x0000ff])
})

test('tiles keep their shape and the row fits the band', () => {
  expect(fitCells({ width: 500, height: 500 })).toEqual({ columns: 12, rows: 6 })
  expect(fitCells({ width: 3000, height: 500 })).toEqual({ columns: 32, rows: 3 })
  expect(fitRow([{ width: 500, height: 500 }], 7, 120)).toEqual([{ columns: 8, rows: 4 }])
  expect(fitRow([{ width: 500, height: 500 }], 3, 120)).toEqual([])
  expect(fitBox({ width: 400, height: 200 }, 40, 19)).toEqual({ columns: 40, rows: 10 })
  expect(buttonOffsets(['Image #1', 'Image #12'])).toEqual([0, 13])
})

test('only kitty and Ghostty get pictures unless forced; iTerm2 gets blocks', () => {
  expect(drawsPictures(ITERM)).toBe(false)
  expect(drawsPictures(GHOSTTY)).toBe(true)
  expect(drawsPictures({ ...GHOSTTY, TMUX: '/tmp/tmux' })).toBe(false)
  expect(drawsPictures({ ...ITERM, CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(true)
  expect(drawsPictures({ ...GHOSTTY, IMAGE_PEEK_RENDERER: 'blocks' })).toBe(false)
})

test('two sent prompts with the same words but different pictures get none', () => {
  const a = { text: 'see [Image #1]', images: [{ n: 1, path: '/a.png' }] }
  const b = { text: 'see [Image #1]', images: [{ n: 1, path: '/b.png' }] }
  expect(sentFor([a], ' see [Image #1] ')).toBe(a)
  expect(sentFor([a, b], 'see [Image #1]')).toBeUndefined()
  expect(sentFor([a, { ...a }], 'see [Image #1]')).toEqual(a)
})

test('in iTerm2 a pasted image shows as half blocks above the prompt and clears when sent', async ($, on) => {
  const clock = mock.clock(on)
  let draft = 'why [Image #1] [Image #2]'
  engine(on, ITERM, () => draft)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  // #2 has no cached file.
  expect(await ui.find({ type: 'Text', text: 'no preview' })).toBeDefined()
  await ui.unmount()

  draft = ''
  await clock.advance(200)
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ type: 'Raster' })).toBeUndefined()
  expect(await after.find({ type: 'Text', text: 'engine row' })).toBeDefined()
})

test('a tile above the prompt opens the original when its label is pressed', async ($, on) => {
  const clock = mock.clock(on)
  const runs: string[][] = []
  engine(on, GHOSTTY, () => 'see [Image #1] [Image #2]', [], runs)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'image-peek:draft:1' })
  expect(runs.at(-1)).toEqual(['open', `${DIR}/1.png`])
  // #2 has no cached file, so its label is plain text, not a button.
  expect(await ui.find({ type: 'Button', key: 'image-peek:draft:2' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '#2' })).toBeDefined()
})

test('in Ghostty the band draws the real picture from the cached file', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, GHOSTTY, () => 'see [Image #1]')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Image' }))?.props).toMatchObject({ source: { file: `${DIR}/1.png`, format: 'png' } })
})

test('a sent prompt with an image gets a button that opens it in the zoom pane', async ($, on) => {
  const clock = mock.clock(on)
  const opened: string[] = []
  engine(on, ITERM, () => 'look [Image #1]', opened)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  await $.prompt.submit({
    text: 'look [Image #1]',
    attachments: [{ type: 'image', mediaType: 'image/png' }],
    origin: { kind: 'composer' },
    wait: false,
  })

  const row = await $.ui.mount({ ...userRow('look [Image #1]'), surface: 'terminal' })
  expect(await row.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  expect(await row.find({ type: 'Button', key: 'image-peek:open:1' })).toBeDefined()
  // The hover card is drawn in half blocks too.
  expect(await row.find({ type: 'Raster' })).toBeDefined()

  await row.press({ key: 'image-peek:open:1' })
  expect(opened).toEqual(['image-peek'])

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Raster' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Image #1/ })).toBeDefined()
})

test('a typed [Image #1] with no attached image gets no button', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, ITERM, () => '')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  await $.prompt.submit({ text: 'typed [Image #1]', origin: { kind: 'composer' }, wait: false })

  const row = await $.ui.mount({ ...userRow('typed [Image #1]'), surface: 'terminal' })
  expect(await row.find({ type: 'Button' })).toBeUndefined()
  expect(await row.find({ type: 'Text', text: 'engine row' })).toBeDefined()
})

test('the desktop app draws its own rows', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, ITERM, () => 'look [Image #1]')

  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Raster' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: 'engine row' })).toBeDefined()
})

test('the open-original button opens the cached JPG paste, not its PNG copy', async ($, on) => {
  const clock = mock.clock(on)
  const runs: string[][] = []
  const draft = 'look [Image #1]'
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('env.get', ($, e) => ({ value: ITERM[e.name] }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return ran('501\n')
  })
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.list', ($, e) => ({
    value: e.path === DIR ? [{ name: '1.jpg', kind: 'file', size: 10, mtimeMs: 0, isLink: false }] : [dirEntry],
  }))
  // The sips copy exists once made; 1.png never does.
  on('fs.exists', ($, e) => ({ value: e.path === DIR || (e.path === `${SESSION}/image-peek-1.png` && runs.some(argv => argv[0] === 'sips')) }))
  on('fs.read', () => ({ value: { base64: RED_BLUE } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  await $.prompt.submit({
    text: draft,
    attachments: [{ type: 'image', mediaType: 'image/jpeg' }],
    origin: { kind: 'composer' },
    wait: false,
  })

  const row = await $.ui.mount({ ...userRow(draft), surface: 'terminal' })
  await row.press({ key: 'image-peek:original:1' })
  expect(runs.at(-1)).toEqual(['open', `${DIR}/1.jpg`])

  await row.press({ key: 'image-peek:open:1' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'image-peek:pane-original' })
  expect(runs.at(-1)).toEqual(['open', `${DIR}/1.jpg`])
})

test('Herdr gets blocks unless pictures are forced, and the hint shows only when not forced', () => {
  expect(drawsPictures(HERDR)).toBe(false)
  expect(drawsPictures({ ...HERDR, CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(true)
  expect(drawsPictures({ ...HERDR, IMAGE_PEEK_RENDERER: 'image' })).toBe(true)
  expect(shouldHintHerdr(HERDR)).toBe(true)
  expect(shouldHintHerdr({ ...HERDR, CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(false)
  expect(shouldHintHerdr(GHOSTTY)).toBe(false)
  expect(shouldHintHerdr(ITERM)).toBe(false)
})

test('in Herdr the band draws blocks and the hint is toasted once, not every session', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  mock.store(on)
  engine(on, HERDR, () => 'see [Image #1]')
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toMatch(/CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1/)
})

test('in Herdr with pictures forced the band draws the real picture and no hint', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  mock.store(on)
  engine(on, { ...HERDR, CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' }, () => 'see [Image #1]')
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(toasts).toEqual([])
})

const storedEntry = (sessionId: string, path = `${DIR}/1.png`) => ({
  text: 'look [Image #1]',
  images: [{ n: 1, path, size: { width: 4, height: 2 }, original: path }],
  sessionId,
})

test('after /resume a sent prompt gets its button back from the store', async ($, on) => {
  const clock = mock.clock(on)
  // What the session wrote before it was closed; the session state starts empty.
  mock.store(on, { sent: [storedEntry('sess-1')] })
  engine(on, ITERM, () => '')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const row = await $.ui.mount({ ...userRow('look [Image #1]'), surface: 'terminal' })
  expect(await row.find({ type: 'Button', key: 'image-peek:open:1' })).toBeDefined()
})

test('a prompt from before a --fork-session resume is found under the old session id', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { sent: [storedEntry('old-session')] })
  engine(on, ITERM, () => '')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const row = await $.ui.mount({ ...userRow('look [Image #1]'), surface: 'terminal' })
  expect(await row.find({ type: 'Button', key: 'image-peek:open:1' })).toBeDefined()
})

test('a stored prompt whose cached file is gone gets no button', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { sent: [storedEntry('sess-1', `${DIR}/9.png`)] })
  engine(on, ITERM, () => '')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const row = await $.ui.mount({ ...userRow('look [Image #1]'), surface: 'terminal' })
  expect(await row.find({ type: 'Button' })).toBeUndefined()
  expect(await row.find({ type: 'Text', text: 'engine row' })).toBeDefined()
})

test('sending a prompt with an image keeps it in the store with its session id', async ($, on) => {
  const clock = mock.clock(on)
  const store = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  engine(on, ITERM, () => 'look [Image #1]')

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  await $.prompt.submit({
    text: 'look [Image #1]',
    attachments: [{ type: 'image', mediaType: 'image/png' }],
    origin: { kind: 'composer' },
    wait: false,
  })

  expect(store.get('sent')).toMatchObject([{ text: 'look [Image #1]', sessionId: 'sess-1', images: [{ n: 1, path: `${DIR}/1.png` }] }])
})

// Windows Terminal on Windows: half blocks. The temp folder's apostrophe would end a quoted
// PowerShell string if the path went into the script as is.
const WINDOWS_TEMP = "C:\\Users\\O'Brien\\AppData\\Local\\Temp"
const WINDOWS: Record<string, string> = { OS: 'Windows_NT', TEMP: WINDOWS_TEMP, WT_SESSION: '1' }
const WINDOWS_SESSION = `${WINDOWS_TEMP}/claude/-work/win-1`
const WINDOWS_DIR = `${WINDOWS_SESSION}/images`

/** The script a `powershell.exe -EncodedCommand` run was given (base64 of UTF-16LE text). */
const decodedScript = (argv: string[]) => String.fromCharCode(...new Uint16Array(Uint8Array.fromBase64(argv.at(-1)!).buffer))
const base64Of = (text: string) => new TextEncoder().encode(text).toBase64()

/** The engine on Windows, whose paste cache holds 1.jpg; `opens` says whether rundll32 succeeds. */
function windowsEngine(on: On, runs: string[][], opens = true) {
  const draft = 'look [Image #1]'
  on('session.start', () => ({ cwd: 'C:\\work' }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('env.get', ($, e) => ({ value: WINDOWS[e.name] }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return e.argv[0] === 'rundll32.exe' && !opens ? { value: { ...ran('').value, exitCode: 1 } } : ran('')
  })
  on('session.id', () => ({ value: 'win-1' }))
  on('fs.list', ($, e) => ({
    value: e.path.endsWith(WINDOWS_DIR) ? [{ name: '1.jpg', kind: 'file', size: 10, mtimeMs: 0, isLink: false }] : [dirEntry],
  }))
  // The PowerShell copy exists once made. The test host, not being Windows, takes C:\ paths as
  // relative to the mod's folder, so they are matched by their end.
  on('fs.exists', ($, e) => ({
    value:
      e.path.endsWith(WINDOWS_DIR) || (e.path.endsWith(`${WINDOWS_SESSION}/image-peek-1.png`) && runs.some(argv => argv[0] === 'powershell.exe')),
  }))
  on('fs.read', () => ({ value: { base64: RED_BLUE } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
}

test('on Windows a JPG paste is converted with PowerShell and its original opens in the default viewer', async ($, on) => {
  const clock = mock.clock(on)
  const runs: string[][] = []
  windowsEngine(on, runs)

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: 'C:\\work' })
  await clock.advance(200)

  const convert = runs.find(argv => argv[0] === 'powershell.exe')!
  expect(convert.slice(0, 4)).toEqual(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
  const script = decodedScript(convert)
  // The paths reach the script only as base64, with backslashes for .NET.
  expect(script).not.toContain("O'Brien")
  expect(script).toContain(base64Of(`${WINDOWS_TEMP}\\claude\\-work\\win-1\\images\\1.jpg`))
  expect(script).toContain(base64Of(`${WINDOWS_TEMP}\\claude\\-work\\win-1\\image-peek-1.png`))
  expect(script).toMatch(/Max\(\$image.Width, \$image.Height\)/)
  expect(runs.some(argv => argv[0] === 'sips')).toBe(false)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  await ui.press({ key: 'image-peek:draft:1' })
  expect(runs.at(-1)).toEqual(['rundll32.exe', 'url.dll,FileProtocolHandler', `${WINDOWS_TEMP}\\claude\\-work\\win-1\\images\\1.jpg`])
  expect(runs.some(argv => argv[0] === 'open' || argv[0] === 'xdg-open')).toBe(false)
})

test('on Windows a file the default viewer cannot open is toasted, without trying open or xdg-open', async ($, on) => {
  const clock = mock.clock(on)
  const runs: string[][] = []
  const toasts: string[] = []
  windowsEngine(on, runs, false)
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: 'C:\\work' })
  await clock.advance(200)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'image-peek:draft:1' })
  expect(runs.at(-1)?.[0]).toBe('rundll32.exe')
  expect(runs.some(argv => argv[0] === 'open' || argv[0] === 'xdg-open')).toBe(false)
  expect(toasts).toEqual([`image-peek: could not open ${WINDOWS_DIR}/1.jpg`])
})
