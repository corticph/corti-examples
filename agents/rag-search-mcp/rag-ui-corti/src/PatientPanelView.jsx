import { MessageSquare, LogOut, Upload, Loader2 } from 'lucide-react'
import { MONO, Banner, ScreenHeader } from './ui.jsx'

// After clinician sign-in: show the patients this clinician has access to and a
// Start chat button. The chat is scoped to exactly this panel.
export default function PatientPanelView({ clinician, onStartChat, starting, startError, onUpload, onSignOut }) {
  const patients = clinician?.patients ?? []

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScreenHeader
        title="Patients"
        right={
          <>
            {clinician && (
              <span className="text-xs text-muted-foreground">{clinician.name} · {clinician.role}</span>
            )}
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </>
        }
      />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Patients you have access to
          </p>

          {patients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No patients in your panel.</p>
          ) : (
            <ul className="space-y-2 mb-6">
              {patients.map((p) => (
                <li
                  key={p.mrn}
                  className="w-full bg-card border border-border rounded-lg p-4 flex items-center gap-3"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: 'hsl(var(--corti-lime))' }}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-card-foreground truncate">{p.name}</h3>
                    <p className="text-xs text-muted-foreground truncate" style={MONO}>{p.mrn}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <button
              onClick={onStartChat}
              disabled={starting}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {starting
                ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
                : <><MessageSquare size={16} /> Start chat</>}
            </button>
            <button
              onClick={onUpload}
              disabled={starting}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Upload size={16} />
              Upload document
            </button>
            {startError && <Banner variant="error">{startError}</Banner>}
          </div>
        </div>
      </main>
    </div>
  )
}
