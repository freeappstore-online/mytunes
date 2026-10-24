export type Song = { id: string; title: string; artist: string; duration: number; createdAt: number; audio: Blob }
export type Playlist = { id: string; name: string; songIds: string[]; createdAt: number }
export type Share = { token: string; kind: 'song' | 'playlist'; targetId: string; createdAt: number }

type Store = 'songs' | 'playlists' | 'shares'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('music-share-library', 1)
    request.onupgradeneeded = () => {
      for (const name of ['songs', 'playlists', 'shares']) {
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: name === 'shares' ? 'token' : 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transact<T>(store: Store, mode: IDBTransactionMode, action: (object: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = action(tx.objectStore(store))
      let value: T
      request.onsuccess = () => { value = request.result }
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export const listSongs = () => transact<Song[]>('songs', 'readonly', store => store.getAll())
export const listPlaylists = () => transact<Playlist[]>('playlists', 'readonly', store => store.getAll())
export const listShares = () => transact<Share[]>('shares', 'readonly', store => store.getAll())
export const saveSong = (song: Song) => transact('songs', 'readwrite', store => store.put(song))
export const savePlaylist = (playlist: Playlist) => transact('playlists', 'readwrite', store => store.put(playlist))
export const saveShare = (share: Share) => transact('shares', 'readwrite', store => store.put(share))
export const deleteSong = (id: string) => transact('songs', 'readwrite', store => store.delete(id))
export const deletePlaylist = (id: string) => transact('playlists', 'readwrite', store => store.delete(id))
export const deleteShare = (token: string) => transact('shares', 'readwrite', store => store.delete(token))
