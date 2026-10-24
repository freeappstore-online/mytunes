import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import { type NavItem, PageHeader, ProfilePage, Shell, useToast } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'mytunes' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). Add one entry per screen;
// `title` becomes the browser tab title on that route.
const NAV: NavItem[] = [
  { label: 'Home', href: '/', title: 'mytunes' },
  { label: 'Account', href: '/account', title: 'Account — mytunes' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  // requireAuth: this app works with the signed-in user's data, so the Shell
  // shows a sign-in screen until the visitor signs in (one account for every
  // FreeAppStore app). The topbar's profile menu handles sign-out.
  return (
    <Shell app={fas} appName="mytunes" nav={NAV} onNavigate={navigate} requireAuth>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
        {path === '/account' ? <Account /> : <Home />}
      </div>
    </Shell>
  )
}

function Home() {
  const { user } = useAuth(fas)
  const toast = useToast()
  const [note, setNote] = useState('')

  // Per-user cloud storage: follows the user across devices.
  useEffect(() => {
    fas.kv.get<string>('note').then((saved) => setNote(saved ?? ''))
  }, [])

  const save = async () => {
    try {
      await fas.kv.set('note', note)
      toast.show('Saved', { variant: 'success' })
    } catch {
      toast.show('Could not save', { variant: 'error' })
    }
  }

  return (
    <>
      <PageHeader title="mytunes" description={`Signed in as ${user?.login ?? ''}. Edit web/src/App.tsx to start building.`} />
      <label className="block text-sm font-semibold text-[var(--ink)]" htmlFor="note">
        Your note (saved to your account)
      </label>
      <textarea
        id="note"
        className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-[var(--ink)]"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white"
        onClick={save}
      >
        Save
      </button>
      <p className="mt-8 text-sm text-[var(--muted)]">
        mytunes is a free app on <a href="https://freeappstore.online" className="underline">FreeAppStore</a>.
      </p>
    </>
  )
}

function Account() {
  return (
    <>
      <PageHeader title="Account" />
      <ProfilePage app={fas} />
    </>
  )
}
