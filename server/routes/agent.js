/**
 * Agent routes — POST /api/agent/chat
 * Auth applied by the parent router in index.js (req.uid is available).
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

    const reply = await runChat({ message, history: cleanHistory, mode, userId: req.uid })
    res.json({ reply })
  } catch (err) {
    next(err)
  }
})
