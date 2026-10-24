import { useEffect, useRef, useState } from 'react'

export function useTabRecorder() {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'ready'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const started = useRef(0)
  const mounted = useRef(true)

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stream.current?.getTracks().forEach(track => track.stop())
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  const discard = () => { setPreview(null); setState('idle'); setSeconds(0); setError('') }

  const start = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setError('Tab audio capture needs a supported desktop browser.')
      return
    }
    discard()
    setState('requesting')
    try {
      // The browser requires video in the picker; only the audio track is recorded.
      const capture = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
      if (!mounted.current) { capture.getTracks().forEach(track => track.stop()); return }
      stream.current = capture
      const tracks = capture.getAudioTracks()
      if (!tracks.length) throw new Error('Choose a tab and enable Share tab audio in the picker.')
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
        .find(type => MediaRecorder.isTypeSupported(type))
      const media = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined)
      recorder.current = media
      const chunks: Blob[] = []
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      media.onstop = () => {
        if (!mounted.current) return
        const audio = new Blob(chunks, { type: media.mimeType || mime || 'audio/webm' })
        if (audio.size) { setPreview(audio); setState('ready') }
        else { setError('The tab produced no audio.'); setState('idle') }
      }
      media.onerror = () => { setError('Recording failed. Try again.'); stop(); setState('idle') }
      capture.getTracks().forEach(track => track.addEventListener('ended', () => { if (media.state === 'recording') stop() }))
      media.start(1000)
      started.current = Date.now()
      timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250)
      setState('recording')
    } catch (reason) {
      stream.current?.getTracks().forEach(track => track.stop())
      setError(reason instanceof Error ? reason.message : 'Could not capture the tab.')
      setState('idle')
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; stop() }
  }, [])
  return { state, seconds, preview, error, start, stop, discard }
}
