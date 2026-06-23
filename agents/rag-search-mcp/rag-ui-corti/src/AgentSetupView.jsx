import { useEffect, useState } from 'react'
import { Loader2, LogOut, Sparkles, AlertTriangle } from 'lucide-react'
import { getActiveAgent, getSetupConfig, provisionAgent } from './api.js'
import { MONO, Banner, ScreenHeader } from './ui.jsx'

// After Corti connect: detect whether an orchestrator wired to the configured
// MCP already exists (matched by MCP URL, any name). If so, use it. If not,
// show a confirmation screen (system prompt + MCP config) with an agent-name
// field, and create it on confirm.
export default function AgentSetupView({ onReady, onDisconnect }) {
  const [phase,   setPhase]   = useState('checking') // checking | setup | creating
  const [error,   setError]   = useState('')
  const [config,  setConfig]  = useState(null)       // { systemPrompt, mcpServer, mcpConfigured }
  const [name,    setName]    = useState('Document Search Orchestrator')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [active, setupConfig] = await Promise.all([getActiveAgent(), getSetupConfig()])
        if (cancelled) return
        setConfig(setupConfig)
        if (active.agent) {
          onReady(active.agent) // already set up, skip straight through
        } else {
          setPhase('setup')
        }
      } catch (err) {
        if (!cancelled) { setError(err.message); setPhase('setup') }
      }
    })()
    return () => { cancelled = true }
  }, [onReady])

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter an agent name.'); return }
    setPhase('creating')
    setError('')
    try {
      const agent = await provisionAgent(name.trim())
      onReady(agent)
    } catch (err) {
      setError(err.message)
      setPhase('setup')
    }
  }

  if (phase === 'checking') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="ml-2 text-sm">Checking for your orchestrator…</span>
      </div>
    )
  }

  const mcp = config?.mcpServer
  const creating = phase === 'creating'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ScreenHeader
        title="Set up orchestrator"
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
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-sm text-muted-foreground">
            No orchestrator wired to this document search service was found in your tenant.
            Review what it will be created with, give it a name, and confirm.
          </p>

          {config && !config.mcpConfigured && (
            <Banner variant="warning" className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>MCP_URL is not configured on the server. Set it in the app's environment before creating the agent.</span>
            </Banner>
          )}

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Agent name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
              placeholder="Document Search Orchestrator"
              className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">MCP server</div>
            <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-1" style={MONO}>
              <div><span className="text-muted-foreground">name: </span>{mcp?.name}</div>
              <div><span className="text-muted-foreground">transport: </span>{mcp?.transportType}</div>
              <div><span className="text-muted-foreground">authorization: </span>{mcp?.authorizationType}</div>
              <div className="break-all"><span className="text-muted-foreground">url: </span>{mcp?.url || '(unset)'}</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">System prompt</div>
            <pre className="bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed" style={MONO}>
              {config?.systemPrompt}
            </pre>
          </div>

          {error && <Banner variant="error">{error}</Banner>}

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={creating || !config?.mcpConfigured}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {creating
                ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                : <><Sparkles size={14} /> Create agent</>}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
