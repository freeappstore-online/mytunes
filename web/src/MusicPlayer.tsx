import { useEffect, useRef, useState } from 'react'
import type { TrackInfo } from './sharing'

type Repeat = 'off' | 'all' | 'one'
type Props = {
  tracks: TrackInfo[]
  selectedId: string
  src: string
  onSelect: (id: string) => void
  isStream?: boolean
  note?: string
}

const format = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  return Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0')
}
const control = 'rounded-full px-3 py-2 text-lg hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40'

export function MusicPlayer({ tracks, selectedId, src, onSelect, isStream = false, note }: Props) {
  const audio = useRef<HTMLAudioElement>(null)
  const playWhenReady = useRef(true)
  const track = tracks.find(item => item.id === selectedId)
  const index = tracks.findIndex(item => item.id === selectedId)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('mytunes-volume') ?? 0.8))
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [repeat, setRepeat] = useState<Repeat>('off')
  const [shuffle, setShuffle] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    playWhenReady.current = true
    setError('')
    setPosition(0)
    setDuration(track?.duration || 0)
    setBuffered(0)
  }, [selectedId])
  useEffect(() => {
    const element = audio.current
    if (!element || !src) return
    element.volume = Math.max(0, Math.min(1, volume))
    element.muted = muted
    element.playbackRate = speed
    if (playWhenReady.current) void element.play().catch(() => setPlaying(false))
  }, [src])
  useEffect(() => {
    if (audio.current) audio.current.volume = Math.max(0, Math.min(1, volume))
    localStorage.setItem('mytunes-volume', String(volume))
  }, [volume])
  useEffect(() => { if (audio.current) audio.current.muted = muted }, [muted])
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed }, [speed])

  function select(id: string) {
    if (id === selectedId && audio.current) {
      audio.current.currentTime = 0
      void audio.current.play()
      return
    }
    playWhenReady.current = true
    onSelect(id)
  }
  function next(fromEnd = false) {
    if (!tracks.length) return
    if (fromEnd && repeat === 'one') {
      if (audio.current) { audio.current.currentTime = 0; void audio.current.play() }
      return
    }
    if (fromEnd && repeat === 'off' && index === tracks.length - 1 && !shuffle) {
      setPlaying(false)
      return
    }
    const nextIndex = shuffle && tracks.length > 1
      ? (index + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length
      : (index + 1) % tracks.length
    select(tracks[nextIndex].id)
  }
  function previous() {
    if (audio.current && audio.current.currentTime > 3) { audio.current.currentTime = 0; return }
    if (tracks.length) select(tracks[(index - 1 + tracks.length) % tracks.length].id)
  }
  function toggle() {
    if (!audio.current) return
    if (audio.current.paused) { playWhenReady.current = true; void audio.current.play() }
    else { playWhenReady.current = false; audio.current.pause() }
  }
  function skip(seconds: number) {
    if (!audio.current) return
    const end = isStream ? buffered : (audio.current.duration || track?.duration || 0)
    audio.current.currentTime = Math.max(0, Math.min(end, audio.current.currentTime + seconds))
  }
  function updateTime() {
    const element = audio.current
    if (!element) return
    setPosition(element.currentTime)
    if (Number.isFinite(element.duration)) setDuration(element.duration)
    if (element.buffered.length) setBuffered(element.buffered.end(element.buffered.length - 1))
  }
  function seek(value: number) {
    if (!audio.current) return
    const target = isStream ? Math.min(value, buffered) : value
    audio.current.currentTime = target
    setPosition(target)
  }
  useEffect(() => {
    if (!track || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist || 'Unknown artist', album: 'MyTunes' })
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => void audio.current?.play(),
      pause: () => audio.current?.pause(),
      previoustrack: previous,
      nexttrack: () => next(),
      seekbackward: () => skip(-10),
      seekforward: () => skip(10),
      seekto: details => { if (details.seekTime != null) seek(details.seekTime) },
    }
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler) } catch { /* browser lacks this action */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null) } catch { /* browser lacks this action */ }
      }
    }
  }, [selectedId, tracks, buffered, repeat, shuffle, isStream])

  if (!track) return null
  const total = duration || track.duration
  const seekLimit = isStream ? Math.min(total || buffered, buffered) : total
  const playable = Boolean(src)

  return <section aria-label="Music player" className="rounded-3xl border border-[var(--line-strong)] bg-[var(--panel-strong)] p-5 shadow-xl backdrop-blur-md" tabIndex={0}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return
      if (event.key === ' ') { event.preventDefault(); toggle() }
      if (event.key === 'ArrowLeft') { event.preventDefault(); skip(-10) }
      if (event.key === 'ArrowRight') { event.preventDefault(); skip(10) }
      if (event.key.toLowerCase() === 'm') setMuted(value => !value)
    }}>
    <audio ref={audio} src={src || undefined} preload="auto" onTimeUpdate={updateTime} onProgress={updateTime} onLoadedMetadata={updateTime}
      onError={() => { setPlaying(false); setError('This recording could not play in this browser.') }}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => next(true)} />
    <div className="flex items-center gap-4">
      <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-4xl text-[var(--accent-deep)]">♫</div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Now playing</p><h2 className="truncate text-xl font-bold">{track.title}</h2><p className="truncate text-sm text-[var(--muted)]">{track.artist || 'Unknown artist'}</p></div>
    </div>
    {note && <p className="mt-3 text-xs text-[var(--muted)]">{note}</p>}
    {isStream && <p className="mt-1 text-xs text-[var(--muted)]">Seek within the audio received so far.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    <div className="mt-5">
      <label htmlFor="mytunes-seek" className="sr-only">Seek through song</label>
      <input id="mytunes-seek" type="range" min={0} max={Math.max(seekLimit, 0.01)} step={0.1} value={Math.min(position, Math.max(seekLimit, 0.01))}
        onChange={event => seek(Number(event.target.value))} disabled={!playable || seekLimit <= 0} className="w-full" style={{ accentColor: 'var(--accent)' }} />
      <div className="flex justify-between text-xs tabular-nums text-[var(--muted)]"><span>{format(position)}</span><span>{format(total)}</span></div>
    </div>
    <div className="mt-3 flex items-center justify-center gap-1">
      <button className={control} aria-label="Shuffle" aria-pressed={shuffle} title="Shuffle" onClick={() => setShuffle(value => !value)} style={{ color: shuffle ? 'var(--accent)' : undefined }}>⇄</button>
      <button className={control} aria-label="Previous track" title="Previous track" onClick={previous}>⏮</button>
      <button className={control} aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => skip(-10)} disabled={!playable}>↶10</button>
      <button className="rounded-full bg-[var(--accent)] px-5 py-3 text-xl text-white disabled:opacity-50" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} disabled={!playable} onClick={toggle}>{playing ? '⏸' : '▶'}</button>
      <button className={control} aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => skip(10)} disabled={!playable}>10↷</button>
      <button className={control} aria-label="Next track" title="Next track" onClick={() => next()}>⏭</button>
      <button className={control} aria-label={'Repeat: ' + repeat} title={'Repeat: ' + repeat} onClick={() => setRepeat(value => value === 'off' ? 'all' : value === 'all' ? 'one' : 'off')} style={{ color: repeat === 'off' ? undefined : 'var(--accent)' }}>{repeat === 'one' ? '🔂' : '🔁'}</button>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      <button className={control} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(value => !value)}>{muted || volume === 0 ? '🔇' : '🔊'}</button>
      <label htmlFor="mytunes-volume" className="sr-only">Volume</label>
      <input id="mytunes-volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={event => { setVolume(Number(event.target.value)); setMuted(false) }}
        className="min-w-24 flex-1" style={{ accentColor: 'var(--accent)' }} />
      <label className="flex items-center gap-2">Speed
        <select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1">
          {[0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
    </div>
    <button className="mt-5 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-left font-semibold" aria-expanded={queueOpen} onClick={() => setQueueOpen(value => !value)}>Queue · {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} {queueOpen ? '⌃' : '⌄'}</button>
    {queueOpen && <ol className="mt-2 max-h-56 overflow-y-auto">{tracks.map((item, i) => <li key={item.id}><button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--accent-soft)]" aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => select(item.id)}><span className="w-6 text-sm text-[var(--muted)]">{i + 1}</span><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="text-xs text-[var(--muted)]">{format(item.duration)}</span></button></li>)}</ol>}
  </section>
}
