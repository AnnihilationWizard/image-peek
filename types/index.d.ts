export type PastedImage = {
  n: number
  /** Absolute path of the PNG to draw (the cached paste or its converted copy); null when it can't be found. */
  path: string | null
  /** Pixel size; null when unknown, and the tile falls back to a default shape. */
  size: { width: number; height: number } | null
  /** Absolute path of the paste as Claude Code cached it (any format), opened at full size. */
  original?: string
}

/** A prompt the person sent, as its row shows it, with the pictures it carried. */
export type SentPrompt = {
  text: string
  images: PastedImage[]
  /** The session it was sent in; also kept in the mod's store so /resume finds it. */
  sessionId?: string
}

declare module 'claude-code' {
  interface PluginState {
    'image-peek': {
      /** The pictures the draft in the prompt box references now. */
      images: PastedImage[]
      /** Prompts sent this session that carried pictures, oldest first. */
      sent: SentPrompt[]
      /** The picture the zoom pane shows. */
      zoomed: PastedImage | null
    }
  }
}
