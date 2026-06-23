import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Paperclip, Send, X, File as FileIcon } from 'lucide-react'
import { sendAgentMessage } from './api.js'
import { Banner } from './ui.jsx'

const MAX_FILE_BYTES = 20 * 1024 * 1024

function textFromParts(parts = []) {
  return parts
    .filter(part => part?.kind === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

// The agent's reply text lives in the message or the (possibly input-required) task.
function extractAgentText(response) {
  const parts = response?.message?.parts
    ?? response?.task?.status?.message?.parts
    ?? response?.task?.history?.slice(-1)?.[0]?.parts
    ?? []
  return textFromParts(parts)
}

// Minimal chat box; contextId continuity and input-required follow-ups are
// threaded internally.
export default function AgentChatView({ agent, clinician, initialContextId, onBack }) {
  const [messages,     setMessages]     = useState([])
  const [input,        setInput]        = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  // Seeded with the pre-bound context from Start chat, so the first question is
  // already scoped on the MCP.
  const [contextId,    setContextId]    = useState(initialContextId || '')
  const [awaitingTaskId, setAwaitingTaskId] = useState('')

  const fileInputRef = useRef(null)
  const scrollRef    = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  function onPickFiles(event) {
    const files = Array.from(event.target.files ?? [])
    if (files.length) setPendingFiles(existing => [...existing, ...files])
    event.target.value = ''
  }
  function removeFile(indexToRemove) {
    setPendingFiles(existing => existing.filter((_, index) => index !== indexToRemove))
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (loading) return
    if (!text && pendingFiles.length === 0) return

    const oversize = pendingFiles.find(file => file.size > MAX_FILE_BYTES)
    if (oversize) { setError(`"${oversize.name}" exceeds the 20 MB per-file limit.`); return }

    const filesForSend = pendingFiles
    const fileNames    = filesForSend.map(file => file.name)
    setMessages(existing => [...existing, { role: 'user', text, files: fileNames }])
    setInput('')
    setPendingFiles([])
    setLoading(true)
    setError('')

    try {
      // taskId is sent only while the agent is awaiting input, so the reply
      // continues that task rather than starting a new one.
      const response = await sendAgentMessage(agent.id, {
        text,
        files:     filesForSend,
        contextId: contextId || undefined,
        taskId:    awaitingTaskId || undefined,
      })
      const nextContextId = response?.task?.contextId ?? response?.message?.contextId ?? contextId
      const state         = response?.task?.status?.state
      if (nextContextId) setContextId(nextContextId)
      setAwaitingTaskId(state === 'input-required' ? (response?.task?.id || '') : '')
      const agentText = extractAgentText(response)
      setMessages(existing => [...existing, { role: 'agent', text: agentText || '(empty response)' }])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl flex flex-col gap-3">
        {/* Back + agent name */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{agent.name}</span>
          {clinician ? (
            <span className="text-xs text-muted-foreground truncate">{clinician.name}</span>
          ) : <span className="w-10" />}
        </div>

        {/* Chat box */}
        <div className="bg-card border border-border rounded-lg flex flex-col" style={{ height: '70vh' }}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-8">
                Ask a question about your patients' records or the shared reference material.
              </p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background border border-border text-foreground'
                  }`}
                >
                  {message.text}
                  {message.files?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {message.files.map((name, fileIndex) => (
                        <span key={fileIndex} className="inline-flex items-center gap-1 text-xs opacity-80">
                          <FileIcon size={12} /> {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-background border border-border rounded-lg px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {error && <Banner variant="error" className="mx-4 mb-2">{error}</Banner>}

          {pendingFiles.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {pendingFiles.map((file, index) => (
                <span key={index} className="inline-flex items-center gap-1 text-xs border border-border rounded-md px-2 py-1 text-foreground">
                  <FileIcon size={12} /> {file.name}
                  <button type="button" onClick={() => removeFile(index)} className="text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Attach files"
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading}
              placeholder="Type a message…"
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={loading || (!input.trim() && pendingFiles.length === 0)}
              className="flex items-center justify-center w-9 h-9 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
