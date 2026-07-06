import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './router.js'
import { createContext } from './trpc.js'

const app = express()

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
)

app.use(express.json())

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
