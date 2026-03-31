/**
 * Agent routes — POST /api/agent/chat
 * Auth applied by the parent router in index.js (req.uid is available).
 *
 * SSE event protocol:
 *   { type: 'tool_call', tool, callId }   — sub-agent starting a SQL tool
 *   { type: 'tool_done', callId, count }  — SQL tool returned
 *   { type: 'text', text }                — final answer token (one or more)
 *   { type: 'done' }                      — stream complete
 */
import { Router } from 'express'
import { runChat } from '../agent/chat.js'

export const agentRouter = Router()

agentRouter.post('/chat', async (req, res, next) => {
  try {
    const { message, history = [], mode = 'Auto' } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' })
    }

    // Sanitize history: only allow alternating user/assistant text messages
    const cleanHistory = history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }))

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const pendingAgents = new Map()
    const emit = (event) => {
      if (event.type === 'agent_start') {
        pendingAgents.set(event.agent, { question: event.question, startTime: Date.now() })
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      } else if (event.type === 'agent_done') {
        const p = pendingAgents.get(event.agent)
        const duration = p ? Date.now() - p.startTime : 0
        res.write(`data: ${JSON.stringify({ ...event, duration })}\n\n`)
        pendingAgents.delete(event.agent)
      } else {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    }

    try {
      for await (const chunk of runChat({ message, history: cleanHistory, mode, userId: req.uid, emit })) {
        emit({ type: 'text', text: chunk })
      }
    } catch (err) {
      emit({ type: 'error', message: 'Something went wrong. Please try again.' })
    }

    emit({ type: 'done' })
    res.end()
  } catch (err) {
    next(err)
  }
})
