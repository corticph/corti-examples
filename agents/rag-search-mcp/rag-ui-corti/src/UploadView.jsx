import { useRef, useState } from 'react'
import { Loader2, Upload, FileUp, CheckCircle2 } from 'lucide-react'
import { uploadDocument } from './api.js'
import { MONO, Banner, ScreenHeader } from './ui.jsx'

const SHARED = 'shared'

// Upload a document to the MCP index, scoped to one of the clinician's patients
// or "shared". The clinician can pick a .txt/.md file (read in-browser) or paste
// text directly — both feed the same text box.
export default function UploadView({ clinician, onBack }) {
  const patients = clinician?.patients ?? []
  const [scope,     setScope]     = useState(patients[0] ? `patient:${patients[0].mrn}` : SHARED)
  const [text,      setText]      = useState('')
  const [fileName,  setFileName]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,     setError]     = useState('')
  const [uploadResult, setUploadResult] = useState(null)

  const fileInputRef = useRef(null)

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError('Only .txt or .md files are supported.')
      return
    }
    setError('')
    setFileName(file.name)
    setText(await file.text())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    if (!text.trim()) { setError('Add some text or pick a file.'); return }
    setSubmitting(true)
    setError('')
    try {
      const result = await uploadDocument({ scope, text })
      setUploadResult(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function uploadAnother() {
    setUploadResult(null)
    setText('')
    setFileName('')
    setError('')
  }

  const scopeLabel = (s) =>
    s === SHARED ? 'Shared / reference (all clinicians)' : s.replace(/^patient:/, '')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScreenHeader title="Upload document" onBack={onBack} />

      <main className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {uploadResult ? (
            <Banner variant="success" className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} />
                <span className="text-sm font-semibold">Document uploaded</span>
              </div>
              <p className="text-xs">Scope: <span style={MONO}>{scopeLabel(uploadResult.scope)}</span></p>
              <p className="text-xs">Indexed chunks: {uploadResult.chunks}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={uploadAnother}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Upload another
                </button>
                <button
                  onClick={onBack}
                  className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </Banner>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Belongs to</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {patients.map((p) => (
                    <option key={p.mrn} value={`patient:${p.mrn}`}>{p.name} ({p.mrn})</option>
                  ))}
                  <option value={SHARED}>Shared / reference (all clinicians)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block">Document</label>
                <div className="flex items-center gap-2 mb-2">
                  <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={onPickFile} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <FileUp size={14} />
                    Choose .txt / .md file
                  </button>
                  {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
                </div>
                <textarea
                  value={text}
                  onChange={(e) => { setText(e.target.value); setFileName('') }}
                  disabled={submitting}
                  rows={14}
                  placeholder="Paste document text here, or choose a file above…"
                  className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  style={MONO}
                />
              </div>

              {error && <Banner variant="error">{error}</Banner>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !text.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting
                    ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                    : <><Upload size={14} /> Upload</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
