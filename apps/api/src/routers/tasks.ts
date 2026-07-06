import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

const TriggerSchema = z.object({
  type: z.enum(['manual', 'scheduled', 'on_app_launch', 'after_db_update']),
  cron: z.string().optional(),   // for scheduled
  delay: z.number().optional(),  // seconds delay for on_app_launch
})

export const tasksRouter = router({
  /** All tasks in an environment. */
  listForEnvironment: publicProcedure
    .input(z.object({ environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.task.findMany({
        where: { environmentId: input.environmentId },
        include: {
          template: {
            include: { application: { select: { id: true, name: true, version: true } } },
          },
          triggerCatalogEntry: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  /** Create a new task. */
  create: publicProcedure
    .input(
      z.object({
        environmentId: z.string(),
        templateId: z.string(),
        scopeType: z.enum(['group', 'device_selection']),
        scopeId: z.string(),
        trigger: TriggerSchema,
        params: z.record(z.unknown()).default({}),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.task.create({
        data: {
          environmentId: input.environmentId,
          templateId: input.templateId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          trigger: input.trigger as Parameters<typeof ctx.prisma.task.create>[0]['data']['trigger'],
          params: input.params as Parameters<typeof ctx.prisma.task.create>[0]['data']['params'],
          enabled: input.enabled,
        },
        include: {
          template: {
            include: { application: { select: { id: true, name: true, version: true } } },
          },
        },
      })
    }),

  /** Enable or disable a task. */
  toggleEnabled: publicProcedure
    .input(z.object({ taskId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.task.update({
        where: { id: input.taskId },
        data: { enabled: input.enabled },
      })
    }),

  /** Delete a task. */
  delete: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.task.delete({ where: { id: input.taskId } })
    }),
})
