import { initTRPC } from '@trpc/server'
import { prisma } from '@ksc/db'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'

export const createContext = (_opts: CreateExpressContextOptions) => ({
  prisma,
})

type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure
