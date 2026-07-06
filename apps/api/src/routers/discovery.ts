import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

const ScheduleSchema = z.object({
  type: z.enum(['interval', 'cron']),
  intervalMinutes: z.number().int().min(1).optional(), // for 'interval'
  cron: z.string().optional(),                         // for 'cron'
})

// Domain controller target
const DomainTargetSchema = z.object({
  address: z.string(),
  directoryKind: z.enum(['active_directory', 'samba']).default('active_directory'),
  authRef: z.string().optional(),
})

// IP range target
const IpRangeTargetSchema = z.object({
  start: z.string(),
  end: z.string().optional(),   // end IP or use CIDR in start
  cidr: z.string().optional(),
  reverseDnsRequired: z.boolean().default(false),
})

const TargetsSchema = z.union([
  z.array(DomainTargetSchema),
  z.array(IpRangeTargetSchema),
  z.array(z.unknown()),
])

export const discoveryRouter = router({
  /** All discovery poll configs for an environment. */
  list: publicProcedure
    .input(z.object({ environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.discoveryPollConfig.findMany({
        where: { environmentId: input.environmentId },
        orderBy: { createdAt: 'asc' },
      })
    }),

  /** Create a new discovery poll config. */
  create: publicProcedure
    .input(
      z.object({
        environmentId: z.string(),
        pollType: z.enum(['domain_controller', 'ip_range', 'zeroconf']),
        schedule: ScheduleSchema,
        executor: z.string().default('admin_server'),
        description: z.string().optional(),
        targets: TargetsSchema.optional(),
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.discoveryPollConfig.create({
        data: {
          environmentId: input.environmentId,
          pollType: input.pollType,
          schedule: input.schedule as Parameters<typeof ctx.prisma.discoveryPollConfig.create>[0]['data']['schedule'],
          executor: input.executor,
          description: input.description ?? null,
          targets: (input.targets ?? null) as Parameters<typeof ctx.prisma.discoveryPollConfig.create>[0]['data']['targets'],
          enabled: input.enabled,
        },
      })
    }),

  /** Update a discovery poll config. */
  update: publicProcedure
    .input(
      z.object({
        configId: z.string(),
        schedule: ScheduleSchema.optional(),
        executor: z.string().optional(),
        description: z.string().optional(),
        targets: TargetsSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { configId, schedule, targets, ...rest } = input
      return ctx.prisma.discoveryPollConfig.update({
        where: { id: configId },
        data: {
          ...rest,
          ...(schedule !== undefined
            ? { schedule: schedule as Parameters<typeof ctx.prisma.discoveryPollConfig.update>[0]['data']['schedule'] }
            : {}),
          ...(targets !== undefined
            ? { targets: targets as Parameters<typeof ctx.prisma.discoveryPollConfig.update>[0]['data']['targets'] }
            : {}),
        },
      })
    }),

  /** Enable or disable a poll config. */
  toggleEnabled: publicProcedure
    .input(z.object({ configId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.discoveryPollConfig.update({
        where: { id: input.configId },
        data: { enabled: input.enabled },
      })
    }),

  /** Delete a poll config. */
  delete: publicProcedure
    .input(z.object({ configId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.discoveryPollConfig.delete({ where: { id: input.configId } })
    }),
})
