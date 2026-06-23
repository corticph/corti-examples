import { useEffect, useState } from 'react'
import { Loader2, ChevronRight, LogOut } from 'lucide-react'
import { listClinicians, signInClinician } from './api.js'
import { Banner, ScreenHeader } from './ui.jsx'

// Clinician sign-in: a picker over the mock clinician directory. Selecting a
// clinician records the identity on the backend (no password, stubbed auth)
// and returns their profile, including the patient panel.
export default function ClinicianSignInView({ onSignIn, onDisconnect }) {
  const [clinicians, setClinicians] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [signingId,  setSigningId]  = useState(null)
  const [signInError, setSignInError] = useState('')

  async function handleSelect(clinician) {
    if (signingId) return
    setSigningId(clinician.id)
    setSignInError('')
    try {
      const profile = await signInClinician(clinician.id)
      onSignIn(profile)
    } catch (err) {
      setSignInError(err.message)
      setSigningId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await listClinicians()
        if (!cancelled) setClinicians(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScreenHeader
        title="Sign in"
        right={
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={16} />
            Disconnect
          </button>
        }
      />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-6">
            <span
              className="inline-block w-3 h-3 rounded-full mb-3"
              style={{ background: 'hsl(var(--corti-lime))' }}
            />
            <h1 className="text-lg font-semibold text-foreground mb-1">Select clinician</h1>
            <p className="text-sm text-muted-foreground">Choose your identity to continue</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {error && <Banner variant="error" className="mb-4">{error}</Banner>}
          {signInError && <Banner variant="error" className="mb-4">{signInError}</Banner>}

          {!loading && !error && (
            <ul className="space-y-2">
              {clinicians.map((clinician) => (
                <li key={clinician.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(clinician)}
                    disabled={!!signingId}
                    className="w-full bg-card border border-border rounded-lg p-4 flex items-center gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-card-foreground truncate">{clinician.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{clinician.role}</p>
                    </div>
                    {signingId === clinician.id
                      ? <Loader2 size={16} className="text-muted-foreground flex-shrink-0 animate-spin" />
                      : <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
