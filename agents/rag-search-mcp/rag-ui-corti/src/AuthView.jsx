import { useState } from 'react'
import { authenticate } from './api.js'
import { Banner } from './ui.jsx'

export default function AuthView({ onAuth }) {
  const [status, setStatus] = useState('idle')
  const [error,  setError]  = useState('')

  async function handleConnect() {
    setStatus('loading')
    setError('')
    try {
      await authenticate()
      onAuth()
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="bg-card border border-border rounded-lg p-10 w-full max-w-sm text-center">
        <div className="mb-6">
          <span
            className="inline-block w-3 h-3 rounded-full mb-4"
            style={{ background: 'hsl(var(--corti-lime))' }}
          />
          <h1 className="text-xl font-semibold text-foreground mb-2">RAG UI</h1>
          <p className="text-sm text-muted-foreground">Connect to start a scoped document chat</p>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Server-side server-to-server token using client_id + client_secret.
        </p>

        <button
          onClick={handleConnect}
          disabled={status === 'loading'}
          className="w-full bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-semibold py-2.5 px-4 rounded-lg transition-opacity"
        >
          {status === 'loading' ? 'Connecting…' : 'Connect to Corti'}
        </button>

        {status === 'error' && <Banner variant="error" className="mt-4 text-left">{error}</Banner>}
      </div>
    </div>
  )
}
