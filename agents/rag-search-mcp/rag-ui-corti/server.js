import express from 'express'
import { PORT, CORTI, MCP_URL } from './config.js'
import authRoutes from './routes/auth.js'
import cliniciansRoutes from './routes/clinicians.js'
import agentRoutes from './routes/agent.js'
import chatRoutes from './routes/chat.js'
import documentsRoutes from './routes/documents.js'

const app = express()
// 25 MB cap; uploaded file parts arrive as base64 inside the message body.
app.use(express.json({ limit: '25mb' }))

app.use('/api', authRoutes)
app.use('/api', cliniciansRoutes)
app.use('/api', agentRoutes)
app.use('/api', chatRoutes)
app.use('/api', documentsRoutes)

app.listen(PORT, () =>
  console.log(`API server → http://localhost:${PORT}  [env=${CORTI.env} tenant=${CORTI.tenant}] MCP_URL=${MCP_URL}`),
)
