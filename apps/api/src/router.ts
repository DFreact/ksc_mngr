import { router } from './trpc.js'
import { catalogRouter } from './routers/catalog.js'
import { groupsRouter } from './routers/groups.js'
import { policiesRouter } from './routers/policies.js'
import { tasksRouter } from './routers/tasks.js'
import { automationsRouter } from './routers/automations.js'
import { discoveryRouter } from './routers/discovery.js'
import { changeRequestsRouter } from './routers/changeRequests.js'
import { infraRouter } from './routers/infra.js'
import { coverageRouter } from './routers/coverage.js'

export const appRouter = router({
  catalog: catalogRouter,
  groups: groupsRouter,
  policies: policiesRouter,
  tasks: tasksRouter,
  automations: automationsRouter,
  discovery: discoveryRouter,
  changeRequests: changeRequestsRouter,
  infra: infraRouter,
  coverage: coverageRouter,
})

export type AppRouter = typeof appRouter
