import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@freeappstore/sdk/hooks'
import { type NavItem, Card, EmptyState, PageHeader, ProfilePage, Shell, useToast } from '@freeappstore/sdk/ui'
import { deletePlaylist, deleteShare, deleteSong, listPlaylists, listShares, listSongs, savePlaylist, saveShare, saveSong, type Playlist, type Share, type Song } from './library'
import { fas, hostShares, joinShare, type SharedInfo } from './sharing'
import { useTabRecorder } from './useTabRecorder'

const NAV: NavItem[] = [
  { label: 'Library', href: '/', title: 'Library — MyTunes' },
  { label: 'Record', href: '/record', title: 'Record — MyTunes' },
  { label: 'Playlists', href: '/playlists', title: 'Playlists — MyTunes' },
  { label: 'Shared links', href: '/shares', title: 'Shared links — MyTunes' },
  { label: 'Account', href: '/account', title: 'Account — MyTunes' },
]
const primary = 'rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:opacity-50'
const secondary = 'rounded-xl border border-[var(--line-strong)] px-4 py-2 font-semibold'
const field = 'w-full rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-[var(--ink)]'
const clock = (n: number) => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0')
const link = (token: string) => location.origin + '/s/' + token

export default function App() {
  const [path, setPath] = useState(location.pathname)
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [ready, setReady] = useState(false)
  const { user } = useAuth(fas)
  async function refresh() {
    const [a, b, c] = await Promise.all([listSongs(), listPlaylists(), listShares()])
    setSongs(a.sort((x, y) => y.createdAt - x.createdAt))
    setPlaylists(b.sort((x, y) => y.createdAt - x.createdAt))
    setShares(c.sort((x, y) => y.createdAt - x.createdAt))
    setReady(true)
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const sync = () => setPath(location.pathname)
    addEventListener('popstate', sync)
    return () => removeEventListener('popstate', sync)
  }, [])
  useEffect(() => {
    if (user && ready && shares.length) return hostShares(shares, songs, playlists)
  }, [user, ready, shares, songs, playlists])
  const navigate = (href: string) => { history.pushState(null, '', href); setPath(href) }
  async function createShare(kind: Share['kind'], targetId: string) {
    const old = shares.find(s => s.kind === kind && s.targetId === targetId)
    if (old) return old
    const share: Share = { token: crypto.randomUUID().replaceAll('-', ''), kind, targetId, createdAt: Date.now() }
    await saveShare(share); await refresh()
    return share
  }
  return <Shell app={fas} appName="MyTunes" nav={NAV} onNavigate={navigate} requireAuth>
    <div className="mx-auto w-full max-w-5xl p-4 pb-20 sm:p-8">
      {path.startsWith('/s/') ? <SharedScreen token={path.slice(3)} /> :
        path === '/record' ? <RecordScreen refresh={refresh} /> :
        path === '/playlists' ? <PlaylistsScreen songs={songs} playlists={playlists} refresh={refresh} createShare={createShare} /> :
        path === '/shares' ? <SharesScreen shares={shares} songs={songs} playlists={playlists} refresh={refresh} /> :
        path === '/account' ? <><PageHeader title="Account" /><ProfilePage app={fas} /></> :
        <LibraryScreen songs={songs} playlists={playlists} refresh={refresh} createShare={createShare} navigate={navigate} />}
    </div>
  </Shell>
}

function RecordScreen({ refresh }: { refresh: () => Promise<void> }) {
  const recording = useTabRecorder()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!recording.preview) { setUrl(''); return }
    const next = URL.createObjectURL(recording.preview)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [recording.preview])
  async function save() {
    if (!recording.preview || !title.trim()) return
    try {
      await saveSong({ id: crypto.randomUUID(), title: title.trim(), artist: artist.trim(), duration: recording.seconds, createdAt: Date.now(), audio: recording.preview })
      await refresh(); recording.discard(); setTitle(''); setArtist('')
      toast.show('Saved to your library', { variant: 'success' })
    } catch { toast.show('Could not save on this device', { variant: 'error' }) }
  }
  return <>
    <PageHeader title="Record a song" description="Capture audio playing in another tab and save it to this device." />
    <Card><div className="space-y-4">
      <ol className="list-inside list-decimal text-sm text-[var(--muted)]"><li>Open the song in another tab.</li><li>Click Record and choose that tab.</li><li>Enable Share tab audio, play the song, then click Stop.</li></ol>
      <p className="text-sm text-[var(--muted)]">Only record and share audio you have permission to use. Protected audio may be blocked by the browser.</p>
      {recording.state === 'recording' ? <div className="flex items-center gap-4"><strong>● {clock(recording.seconds)}</strong><button className={primary} onClick={recording.stop}>Stop recording</button></div> :
        <button className={primary} disabled={recording.state === 'requesting'} onClick={() => void recording.start()}>{recording.state === 'requesting' ? 'Opening tab picker…' : 'Record from another tab'}</button>}
      {recording.error && <p role="alert" className="text-[var(--danger)]">{recording.error}</p>}
    </div></Card>
    {recording.preview && <Card><div className="mt-4 space-y-3">
      <h2 className="text-xl font-bold">Save recording</h2><audio controls className="w-full" src={url} />
      <label className="block">Song title<input className={field} value={title} onChange={e => setTitle(e.target.value)} maxLength={100} /></label>
      <label className="block">Artist or source<input className={field} value={artist} onChange={e => setArtist(e.target.value)} maxLength={100} /></label>
      <div className="flex gap-2"><button className={primary} disabled={!title.trim()} onClick={() => void save()}>Save to library</button><button className={secondary} onClick={recording.discard}>Discard</button></div>
    </div></Card>}
  </>
}

function ShareButton({ kind, id, createShare }: { kind: Share['kind']; id: string; createShare: (kind: Share['kind'], id: string) => Promise<Share> }) {
  const toast = useToast()
  async function copy() {
    try { const share = await createShare(kind, id); await navigator.clipboard.writeText(link(share.token)); toast.show('Listening link copied', { variant: 'success' }) }
    catch { toast.show('Open Shared links to copy the link', { variant: 'error' }) }
  }
  return <button className={secondary} onClick={() => void copy()}>Share {kind}</button>
}

function SongPlayer({ song }: { song: Song }) {
  const [url, setUrl] = useState('')
  useEffect(() => { const next = URL.createObjectURL(song.audio); setUrl(next); return () => URL.revokeObjectURL(next) }, [song.audio])
  return <audio aria-label={'Play ' + song.title} controls preload="none" src={url} className="w-full" />
}

function LibraryScreen({ songs, playlists, refresh, createShare, navigate }: { songs: Song[]; playlists: Playlist[]; refresh: () => Promise<void>; createShare: (kind: Share['kind'], id: string) => Promise<Share>; navigate: (href: string) => void }) {
  const toast = useToast()
  async function add(songId: string, playlistId: string) {
    const p = playlists.find(item => item.id === playlistId)
    if (!p || p.songIds.includes(songId)) return
    await savePlaylist({ ...p, songIds: [...p.songIds, songId] }); await refresh()
    toast.show('Added to playlist', { variant: 'success' })
  }
  async function remove(id: string) {
    if (!confirm('Delete this recording from this device?')) return
    await deleteSong(id)
    await Promise.all(playlists.filter(p => p.songIds.includes(id)).map(p => savePlaylist({ ...p, songIds: p.songIds.filter(x => x !== id) })))
    await refresh()
  }
  return <>
    <PageHeader title="Your library" description="Recordings stay on this device. Keep MyTunes open while someone listens through a link." actions={<button className={primary} onClick={() => navigate('/record')}>Record a song</button>} />
    {!songs.length ? <EmptyState title="No songs yet" message="Record from another tab to start your library." action={<button className={primary} onClick={() => navigate('/record')}>Record your first song</button>} /> :
      <div className="grid gap-4">{songs.map(song => <Card key={song.id}><div className="space-y-3">
        <div><h2 className="text-lg font-bold">{song.title}</h2><p className="text-sm text-[var(--muted)]">{song.artist || 'Unknown artist'} · {clock(song.duration)}</p></div>
        <SongPlayer song={song} />
        <div className="flex flex-wrap gap-2"><ShareButton kind="song" id={song.id} createShare={createShare} />
          {playlists.length > 0 && <select className={field} aria-label={'Add ' + song.title + ' to playlist'} defaultValue="" onChange={e => void add(song.id, e.target.value)}><option value="" disabled>Add to playlist…</option>{playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <button className={secondary} onClick={() => void remove(song.id)}>Delete</button></div>
      </div></Card>)}</div>}
  </>
}

function PlaylistsScreen({ songs, playlists, refresh, createShare }: { songs: Song[]; playlists: Playlist[]; refresh: () => Promise<void>; createShare: (kind: Share['kind'], id: string) => Promise<Share> }) {
  const [name, setName] = useState('')
  async function create() { if (name.trim()) { await savePlaylist({ id: crypto.randomUUID(), name: name.trim(), songIds: [], createdAt: Date.now() }); setName(''); await refresh() } }
  async function remove(id: string) { if (confirm('Delete playlist? Songs stay in your library.')) { await deletePlaylist(id); await refresh() } }
  async function removeSongFrom(p: Playlist, id: string) { await savePlaylist({ ...p, songIds: p.songIds.filter(x => x !== id) }); await refresh() }
  return <>
    <PageHeader title="Playlists" description="Group your recordings into playlists." />
    <Card><div className="flex flex-wrap gap-2"><input className={field} aria-label="New playlist name" placeholder="New playlist name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create() }} maxLength={100} /><button className={primary} disabled={!name.trim()} onClick={() => void create()}>Create playlist</button></div></Card>
    <div className="mt-5 grid gap-4">{playlists.map(p => <Card key={p.id}><div className="space-y-3">
      <div><h2 className="text-xl font-bold">{p.name}</h2><p className="text-sm text-[var(--muted)]">{p.songIds.length} songs</p></div>
      {p.songIds.map(id => songs.find(s => s.id === id)).filter((s): s is Song => Boolean(s)).map(s => <div className="border-t border-[var(--line)] pt-3" key={s.id}><div className="flex justify-between"><strong>{s.title}</strong><button className="underline" onClick={() => void removeSongFrom(p, s.id)}>Remove</button></div><SongPlayer song={s} /></div>)}
      <div className="flex gap-2"><ShareButton kind="playlist" id={p.id} createShare={createShare} /><button className={secondary} onClick={() => void remove(p.id)}>Delete playlist</button></div>
    </div></Card>)}</div>
  </>
}

function SharesScreen({ shares, songs, playlists, refresh }: { shares: Share[]; songs: Song[]; playlists: Playlist[]; refresh: () => Promise<void> }) {
  const toast = useToast()
  async function revoke(token: string) { await deleteShare(token); await refresh(); toast.show('Link revoked', { variant: 'success' }) }
  return <>
    <PageHeader title="Shared links" description="The browser with your recordings must stay open for listeners to stream." />
    {!shares.length ? <EmptyState title="No links yet" message="Share a song from Library or a playlist from Playlists." /> :
      <div className="grid gap-3">{shares.map(s => <Card key={s.token}><div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold">{s.kind === 'song' ? songs.find(x => x.id === s.targetId)?.title : playlists.find(x => x.id === s.targetId)?.name || 'Deleted item'}</h2><p className="break-all text-sm text-[var(--muted)]">{link(s.token)}</p></div>
        <div className="flex gap-2"><button className={secondary} onClick={() => void navigator.clipboard.writeText(link(s.token)).then(() => toast.show('Link copied', { variant: 'success' }))}>Copy</button><button className={secondary} onClick={() => void revoke(s.token)}>Revoke</button></div>
      </div></Card>)}</div>}
  </>
}

type Playback = { id: string; mime: string; chunks: Uint8Array<ArrayBuffer>[]; queue: Uint8Array<ArrayBuffer>[]; source?: MediaSource; buffer?: SourceBuffer; ended: boolean; received: number }
function SharedScreen({ token }: { token: string }) {
  const [state, setState] = useState('connecting')
  const [info, setInfo] = useState<SharedInfo | null>(null)
  const [error, setError] = useState('')
  const [url, setUrl] = useState('')
  const [received, setReceived] = useState(0)
  const [playing, setPlaying] = useState('')
  const playback = useRef<Playback | null>(null)
  const client = useRef<ReturnType<typeof joinShare> | null>(null)
  const urlRef = useRef('')
  function replaceUrl(next: string) { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = next; setUrl(next) }
  function pump() {
    const current = playback.current
    if (!current?.source || !current.buffer || current.buffer.updating) return
    const chunk = current.queue.shift()
    if (chunk) current.buffer.appendBuffer(chunk)
    else if (current.ended && current.source.readyState === 'open') current.source.endOfStream()
  }
  function start(id: string, mime: string) {
    const current: Playback = { id, mime, chunks: [], queue: [], ended: false, received: 0 }
    playback.current = current; setPlaying(id); setReceived(0); setError('')
    if ('MediaSource' in window && MediaSource.isTypeSupported(mime)) {
      const source = new MediaSource(); current.source = source
      source.addEventListener('sourceopen', () => {
        if (playback.current !== current) return
        current.buffer = source.addSourceBuffer(mime)
        current.buffer.addEventListener('updateend', pump)
        pump()
      }, { once: true })
      replaceUrl(URL.createObjectURL(source))
    } else replaceUrl('')
  }
  useEffect(() => {
    const connection = joinShare(token, {
      onState: setState, onInfo: setInfo, onStart: start,
      onChunk: (id, bytes) => {
        const current = playback.current
        if (!current || current.id !== id) return
        current.chunks.push(bytes); current.queue.push(bytes); current.received += bytes.length
        setReceived(current.received); pump()
      },
      onEnd: id => {
        const current = playback.current
        if (!current || current.id !== id) return
        current.ended = true
        if (!current.source) replaceUrl(URL.createObjectURL(new Blob(current.chunks, { type: current.mime })))
        else pump()
      },
      onError: setError,
    })
    client.current = connection
    return () => { connection.close(); client.current = null; if (urlRef.current) URL.revokeObjectURL(urlRef.current) }
  }, [token])
  return <>
    <PageHeader title={info?.title || 'Shared music'} description="Listen to a shared song or playlist." />
    {!info && <Card><p className="text-[var(--muted)]">{state === 'open' ? 'Waiting for the owner to open MyTunes…' : 'Connection: ' + state}</p><p className="mt-2 text-sm">The owner must keep their MyTunes browser open for this link to play.</p></Card>}
    {error && <p role="alert" className="mt-4 text-[var(--danger)]">{error}</p>}
    {info && <div className="grid gap-3">{info.tracks.map(track => <Card key={track.id}><div className="space-y-3">
      <div><h2 className="font-bold">{track.title}</h2><p className="text-sm text-[var(--muted)]">{track.artist || 'Unknown artist'} · {clock(track.duration)}</p></div>
      <button className={primary} onClick={() => { setPlaying(track.id); setReceived(0); client.current?.request(track.id) }}>Stream song</button>
      {playing === track.id && <><p className="text-sm text-[var(--muted)]">Received {(received / 1024 / 1024).toFixed(1)} MB</p>{url && <audio aria-label={'Listen to ' + track.title} className="w-full" controls autoPlay src={url} />}</>}
    </div></Card>)}</div>}
  </>
}
