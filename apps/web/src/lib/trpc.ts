import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@ksc/api'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      // Uses Vite proxy in dev; in prod the API is on the same host or env var
      url: `${import.meta.env.VITE_API_URL ?? ''}/trpc`,
    }),
  ],
})
