import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

const ScheduleSchema = z.object({
  type: z.enum(['interval', 'cron']),
  intervalMinutes: z.number().int().min(1).optional(),
  cron: z.string().optional(),
})

export const infraRouter = router({
  // ─── KSN ────────────────────────────────────────────────────────────────────

  /** Get or return null if not configured. */
  getKsn: publicProcedure
    .input(z.object({ environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.ksnConfig.findUnique({ where: { environmentId: input.environmentId } })
    }),

  /** Upsert KSN config for an environment. */
  upsertKsn: publicProcedure
    .input(z.object({
      environmentId: z.string(),
      participationEnabled: z.boolean(),
      extendedModeEnabled: z.boolean(),
      provider: z.enum(['global', 'private']),
      allowDirectFallback: z.boolean(),
      privateKsnConfigPath: z.string().optional(),
      proxyHostRef: z.enum(['admin_server', 'distribution_point']),
      tcpPort: z.number().int().default(13111),
      udpEnabled: z.boolean(),
      udpPort: z.number().int().default(15111),
    }))
    .mutation(async ({ ctx, input }) => {
      const { environmentId, ...data } = input
      return ctx.prisma.ksnConfig.upsert({
        where: { environmentId },
        create: { environmentId, ...data },
        update: data,
      })
    }),

  // ─── Backup ──────────────────────────────────────────────────────────────────

  listBackup: publicProcedure
    .input(z.object({ environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.backupPolicyDefinition.findMany({
        where: { environmentId: input.environmentId },
        orderBy: { createdAt: 'desc' },
      })
    }),

  createBackup: publicProcedure
    .input(z.object({
      environmentId: z.string(),
      schedule: ScheduleSchema,
      storageTarget: z.enum(['local_path', 's3', 'azure']).default('local_path'),
      storagePath: z.string().optional(),
      passwordProtected: z.boolean().default(true),
      retentionDays: z.number().int().min(1).default(30),
      notes: z.string().optional(),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { environmentId, schedule, ...rest } = input
      return ctx.prisma.backupPolicyDefinition.create({
        data: {
          environmentId,
          schedule: schedule as Parameters<typeof ctx.prisma.backupPolicyDefinition.create>[0]['data']['schedule'],
          ...rest,
        },
      })
    }),

  updateBackup: publicProcedure
    .input(z.object({
      id: z.string(),
      schedule: ScheduleSchema.optional(),
      storageTarget: z.enum(['local_path', 's3', 'azure']).optional(),
      storagePath: z.string().optional(),
      passwordProtected: z.boolean().optional(),
      retentionDays: z.number().int().min(1).optional(),
      notes: z.string().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, schedule, ...rest } = input
      return ctx.prisma.backupPolicyDefinition.update({
        where: { id },
        data: {
          ...rest,
          ...(schedule !== undefined
            ? { schedule: schedule as Parameters<typeof ctx.prisma.backupPolicyDefinition.update>[0]['data']['schedule'] }
            : {}),
        },
      })
    }),

  deleteBackup: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.backupPolicyDefinition.delete({ where: { id: input.id } })
    }),

  // ─── Server Hierarchy ────────────────────────────────────────────────────────

  listServers: publicProcedure
    .input(z.object({ environmentId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.administrationServerNode.findMany({
        where: input.environmentId ? { environmentId: input.environmentId } : undefined,
        include: { children: true },
        orderBy: { createdAt: 'asc' },
      })
    }),

  createServer: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      role: z.enum(['primary', 'secondary', 'virtual']),
      parentId: z.string().optional(),
      environmentId: z.string().optional(),
      connectionAddress: z.string().optional(),
      osKind: z.enum(['linux', 'windows']).default('linux'),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.administrationServerNode.create({ data: input })
    }),

  updateServer: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      connectionAddress: z.string().optional(),
      osKind: z.enum(['linux', 'windows']).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return ctx.prisma.administrationServerNode.update({ where: { id }, data })
    }),

  deleteServer: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.administrationServerNode.delete({ where: { id: input.id } })
    }),

  // ─── RBAC ────────────────────────────────────────────────────────────────────

  listFunctionalAreas: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.kscFunctionalAreaCatalog.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    })
  }),

  listRoles: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.kscRoleDefinition.findMany({
      include: {
        grants: { include: { functionalArea: true } },
      },
      orderBy: [{ isPredefined: 'desc' }, { name: 'asc' }],
    })
  }),

  listUserAssignments: publicProcedure
    .input(z.object({ environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.kscUserRoleAssignment.findMany({
        where: { environmentId: input.environmentId },
        include: { role: true },
        orderBy: { createdAt: 'desc' },
      })
    }),

  addUserAssignment: publicProcedure
    .input(z.object({
      environmentId: z.string(),
      userRef: z.string().min(1),
      roleId: z.string(),
      scopeObjectId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.kscUserRoleAssignment.create({ data: input })
    }),

  deleteUserAssignment: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.kscUserRoleAssignment.delete({ where: { id: input.id } })
    }),
})
