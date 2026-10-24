import { initApp } from '@freeappstore/sdk'
import type { Playlist, Share, Song } from './library'

export const fas = initApp({ appId: 'mytunes' })
export type TrackInfo = Pick<Song, 'id' | 'title' | 'artist' | 'duration'>
export type SharedInfo = { title: string; tracks: TrackInfo[] }

type Room = ReturnType<typeof fas.rooms.join>
type Wire =
  | { type: 'hello' }
  | { type: 'info'; to: string; info: SharedInfo }
  | { type: 'info_start'; to: string }
  | { type: 'info_chunk'; to: string; data: string }
  | { type: 'info_end'; to: string }
  | { type: 'request'; songId: string }
  | { type: 'start'; to: string; songId: string; mime: string; size: number }
  | { type: 'chunk'; to: string; songId: string; data: string }
  | { type: 'end'; to: string; songId: string }
  | { type: 'error'; to: string; message: string }

function infoFor(share: Share, songs: Song[], playlists: Playlist[]): SharedInfo | null {
  if (share.kind === 'song') {
    const song = songs.find(item => item.id === share.targetId)
    return song ? { title: song.title, tracks: [{ id: song.id, title: song.title, artist: song.artist, duration: song.duration }] } : null
  }
  const playlist = playlists.find(item => item.id === share.targetId)
  return playlist ? {
    title: playlist.name,
    tracks: playlist.songIds.map(id => songs.find(song => song.id === id)).filter((song): song is Song => Boolean(song))
      .map(song => ({ id: song.id, title: song.title, artist: song.artist, duration: song.duration })),
  } : null
}

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decode(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function sendInfo(room: Room, to: string, info: SharedInfo, active: () => boolean) {
  const bytes = new TextEncoder().encode(JSON.stringify(info))
  if (bytes.length < 3000) { room.send<Wire>({ type: 'info', to, info }); return }
  room.send<Wire>({ type: 'info_start', to })
  for (let offset = 0; offset < bytes.length && active(); offset += 2048) {
    room.send<Wire>({ type: 'info_chunk', to, data: encode(bytes.subarray(offset, offset + 2048)) })
    await sleep(50)
  }
  if (active()) room.send<Wire>({ type: 'info_end', to })
}

async function sendSong(room: Room, to: string, song: Song, active: () => boolean) {
  room.send<Wire>({ type: 'start', to, songId: song.id, mime: song.audio.type || 'audio/webm', size: song.audio.size })
  // Rooms accept up to 4 KB per message and 100 messages per second. 2 KB binary
  // packets sent at 20/s leave room for the JSON envelope and normal signaling.
  const bytes = new Uint8Array(await song.audio.arrayBuffer())
  for (let offset = 0; offset < bytes.length && active(); offset += 2048) {
    room.send<Wire>({ type: 'chunk', to, songId: song.id, data: encode(bytes.subarray(offset, offset + 2048)) })
    await sleep(50)
  }
  if (active()) room.send<Wire>({ type: 'end', to, songId: song.id })
}

export function hostShares(shares: Share[], songs: Song[], playlists: Playlist[]): () => void {
  const rooms: Room[] = []
  let active = true
  const requested = new Map<string, string>()
  for (const share of shares) {
    const info = infoFor(share, songs, playlists)
    if (!info) continue
    const room = fas.rooms.join(`mytunes-${share.token}`)
    rooms.push(room)
    room.onMessage<Wire>(message => {
      if (!active) return
      const data = message.data
      if (data.type === 'hello') {
        void sendInfo(room, message.from.uid, info, () => active).catch(() => {})
      } else if (data.type === 'request') {
        const song = songs.find(item => item.id === data.songId && info.tracks.some(track => track.id === item.id))
        const request = crypto.randomUUID()
        requested.set(message.from.uid, request)
        if (song) void sendSong(room, message.from.uid, song, () => active && requested.get(message.from.uid) === request).catch(() => {
          if (active) room.send<Wire>({ type: 'error', to: message.from.uid, message: 'Transfer stopped. Please try again.' })
        })
      }
    })
  }
  return () => { active = false; rooms.forEach(room => room.close()) }
}

export function joinShare(token: string, handlers: {
  onState: (state: string) => void
  onInfo: (info: SharedInfo) => void
  onStart: (songId: string, mime: string) => void
  onChunk: (songId: string, bytes: Uint8Array<ArrayBuffer>) => void
  onEnd: (songId: string) => void
  onError: (message: string) => void
}) {
  const room = fas.rooms.join(`mytunes-${token}`)
  const self = () => fas.auth.user?.id
  let infoChunks: Uint8Array<ArrayBuffer>[] = []
  room.onConnectionState(state => {
    handlers.onState(state)
    if (state === 'open') room.send<Wire>({ type: 'hello' })
  })
  const hello = setInterval(() => room.send<Wire>({ type: 'hello' }), 4000)
  room.onMessage<Wire>(message => {
    const data = message.data
    if ('to' in data && data.to !== self()) return
    if (data.type === 'info') handlers.onInfo(data.info)
    if (data.type === 'info_start') infoChunks = []
    if (data.type === 'info_chunk') infoChunks.push(decode(data.data))
    if (data.type === 'info_end') {
      const total = infoChunks.reduce((n, chunk) => n + chunk.length, 0)
      const joined = new Uint8Array(total)
      let offset = 0
      for (const chunk of infoChunks) { joined.set(chunk, offset); offset += chunk.length }
      try { handlers.onInfo(JSON.parse(new TextDecoder().decode(joined)) as SharedInfo) }
      catch { handlers.onError('Could not read this playlist. Ask the owner to reopen MyTunes.') }
      infoChunks = []
    }
    if (data.type === 'start') handlers.onStart(data.songId, data.mime)
    if (data.type === 'chunk') handlers.onChunk(data.songId, decode(data.data))
    if (data.type === 'end') handlers.onEnd(data.songId)
    if (data.type === 'error') handlers.onError(data.message)
  })
  return {
    request: (songId: string) => room.send<Wire>({ type: 'request', songId }),
    close: () => { clearInterval(hello); room.close() },
  }
}
