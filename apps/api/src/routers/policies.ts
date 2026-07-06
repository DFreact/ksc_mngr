import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { resolveEffectiveSettings } from '@ksc/domain'

const PolicyStatusSchema = z.enum(['active', 'inactive', 'out_of_office'])

export const policiesRouter = router({
  /** All policies in an environment, optionally filtered by application. */
  listForEnvironment: publicProcedure
    .input(z.object({ environmentId: z.string(), applicationId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.policy.findMany({
        where: {
          targetGroup: { environmentId: input.environmentId },
          ...(input.applicationId ? { applicationId: input.applicationId } : {}),
        },
        include: { application: true, targetGroup: true },
        orderBy: [{ targetGroup: { name: 'asc' } }, { name: 'asc' }],
      })
    }),

  /** All policies attached to a specific group (any application). */
  listForGroup: publicProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.policy.findMany({
        where: { targetGroupId: input.groupId },
        include: { application: true },
        orderBy: { name: 'asc' },
      })
    }),

  /** Full policy with all settings, list settings, event settings. */
  get: publicProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.policy.findUniqueOrThrow({
        where: { id: input.policyId },
        include: {
          application: true,
          targetGroup: true,
          settings: {
            include: { parameter: true },
          },
          eventSettings: {
            include: { event: true },
          },
        },
      })
    }),

  /** Create a new policy on a group. */
  create: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        applicationId: z.string(),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Enforce: one active policy per application per group
      const existing = await ctx.prisma.policy.findFirst({
        where: {
          targetGroupId: input.groupId,
          applicationId: input.applicationId,
          status: 'active',
        },
      })
      if (existing) {
        throw new Error('На эту группу уже назначена активная политика для данного приложения')
      }
      return ctx.prisma.policy.create({
        data: {
          name: input.name,
          applicationId: input.applicationId,
          targetGroupId: input.groupId,
          status: 'active',
          inheritFromParent: true,
          forceInheritToChildren: false,
        },
        include: { application: true },
      })
    }),

  /** Update policy metadata (name, status, inheritance flags). */
  updateMeta: publicProcedure
    .input(
      z.object({
        policyId: z.string(),
        name: z.string().min(1).optional(),
        status: PolicyStatusSchema.optional(),
        inheritFromParent: z.boolean().optional(),
        forceInheritToChildren: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { policyId, ...data } = input
      return ctx.prisma.policy.update({
        where: { id: policyId },
        data,
        include: { application: true },
      })
    }),

  /** Set or update a single parameter value in a policy. */
  upsertSetting: publicProcedure
    .input(
      z.object({
        policyId: z.string(),
        parameterId: z.string(),
        value: z.unknown(), // JsonValue — typed loosely, Zod doesn't have a built-in Json type
        forced: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.policySetting.upsert({
        where: {
          policyId_parameterId: {
            policyId: input.policyId,
            parameterId: input.parameterId,
          },
        },
        create: {
          policyId: input.policyId,
          parameterId: input.parameterId,
          value: input.value as Parameters<typeof ctx.prisma.policySetting.create>[0]['data']['value'],
          forced: input.forced,
          inherited: false,
        },
        update: {
          value: input.value as Parameters<typeof ctx.prisma.policySetting.update>[0]['data']['value'],
          forced: input.forced,
          inherited: false,
        },
      })
    }),

  /** Remove a parameter setting (revert to default / inherited). */
  deleteSetting: publicProcedure
    .input(z.object({ policyId: z.string(), parameterId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.policySetting.deleteMany({
        where: { policyId: input.policyId, parameterId: input.parameterId },
      })
    }),

  /** Toggle the lock (forced) flag on a single setting. */
  toggleLock: publicProcedure
    .input(z.object({ policyId: z.string(), parameterId: z.string(), forced: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.policySetting.update({
        where: {
          policyId_parameterId: {
            policyId: input.policyId,
            parameterId: input.parameterId,
          },
        },
        data: { forced: input.forced },
      })
    }),

  // ─── List-table settings (per-policy rows for named list types) ────────────

  /** All rows of one list type in a policy, ordered. */
  listRows: publicProcedure
    .input(z.object({ policyId: z.string(), listTypeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.policyListSetting.findMany({
        where: { policyId: input.policyId, listTypeId: input.listTypeId },
        orderBy: { sortOrder: 'asc' },
      })
    }),

  /** Row counts per list type for a policy (for tab badges). */
  listRowCounts: publicProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.policyListSetting.groupBy({
        by: ['listTypeId'],
        where: { policyId: input.policyId, listTypeId: { not: null } },
        _count: true,
      })
      return Object.fromEntries(rows.map(r => [r.listTypeId, r._count]))
    }),

  addRow: publicProcedure
    .input(z.object({
      policyId: z.string(),
      listTypeId: z.string(),
      rowData: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.prisma.policyListSetting.findFirst({
        where: { policyId: input.policyId, listTypeId: input.listTypeId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      return ctx.prisma.policyListSetting.create({
        data: {
          policyId: input.policyId,
          listTypeId: input.listTypeId,
          rowData: input.rowData as Parameters<typeof ctx.prisma.policyListSetting.create>[0]['data']['rowData'],
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
      })
    }),

  updateRow: publicProcedure
    .input(z.object({ rowId: z.string(), rowData: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.policyListSetting.update({
        where: { id: input.rowId },
        data: { rowData: input.rowData as Parameters<typeof ctx.prisma.policyListSetting.update>[0]['data']['rowData'] },
      })
    }),

  deleteRow: publicProcedure
    .input(z.object({ rowId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.policyListSetting.delete({ where: { id: input.rowId } })
    }),

  // ─── Export / import of the full policy configuration ──────────────────────

  /**
   * Полная конфигурация политики в человекочитаемом JSON.
   * Параметры адресуются путём «категория / подкатегория / группа / имя» —
   * стабильно между базами, в отличие от внутренних id.
   */
  exportConfig: publicProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const policy = await ctx.prisma.policy.findUniqueOrThrow({
        where: { id: input.policyId },
        include: {
          application: true,
          settings: { include: { parameter: true } },
          listSettings: { where: { listTypeId: { not: null } }, orderBy: { sortOrder: 'asc' } },
          deviceSettings: { include: { deviceType: true } },
        },
      })
      const paramPath = (p: { category: string; subcategory: string | null; group: string | null; name: string }) =>
        [p.category, p.subcategory, p.group, p.name].filter(Boolean).join(' / ')

      const lists: Record<string, unknown[]> = {}
      for (const row of policy.listSettings) {
        const key = row.listTypeId!
        if (!lists[key]) lists[key] = []
        lists[key].push(row.rowData)
      }

      return {
        format: 'ksc-mgmt-policy/1',
        name: policy.name,
        application: policy.application.name,
        applicationVersion: policy.application.version,
        status: policy.status,
        inheritFromParent: policy.inheritFromParent,
        forceInheritToChildren: policy.forceInheritToChildren,
        settings: policy.settings.map(s => ({
          parameter: paramPath(s.parameter),
          value: s.value,
          forced: s.forced,
        })),
        lists,
        devices: policy.deviceSettings.map(d => ({
          deviceType: d.deviceType.name,
          access: d.access,
        })),
      }
    }),

  /**
   * Применить конфигурацию (формат exportConfig) к политике.
   * replace=true — существующие настройки/списки/матрица устройств заменяются целиком.
   * Нераспознанные пути параметров не прерывают импорт, а возвращаются списком.
   */
  importConfig: publicProcedure
    .input(z.object({
      policyId: z.string(),
      config: z.object({
        format: z.literal('ksc-mgmt-policy/1'),
        settings: z.array(z.object({
          parameter: z.string(),
          value: z.unknown(),
          forced: z.boolean().optional(),
        })).optional(),
        lists: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
        devices: z.array(z.object({ deviceType: z.string(), access: z.string() })).optional(),
        inheritFromParent: z.boolean().optional(),
        forceInheritToChildren: z.boolean().optional(),
      }),
      replace: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const policy = await ctx.prisma.policy.findUniqueOrThrow({
        where: { id: input.policyId },
        select: { id: true, applicationId: true },
      })

      const params = await ctx.prisma.parameterCatalog.findMany({
        where: { applicationId: policy.applicationId },
        select: { id: true, category: true, subcategory: true, group: true, name: true },
      })
      const byPath = new Map(
        params.map(p => [[p.category, p.subcategory, p.group, p.name].filter(Boolean).join(' / '), p.id]),
      )
      const deviceTypes = await ctx.prisma.deviceTypeCatalog.findMany({ select: { id: true, name: true } })
      const deviceByName = new Map(deviceTypes.map(d => [d.name, d.id]))
      const listTypeIds = new Set(
        (await ctx.prisma.listTypeCatalog.findMany({ select: { id: true } })).map(l => l.id),
      )

      const unknownParameters: string[] = []
      const unknownDevices: string[] = []
      const unknownLists: string[] = []
      let settingsApplied = 0
      let listRowsApplied = 0
      let devicesApplied = 0

      await ctx.prisma.$transaction(async tx => {
        if (input.replace) {
          await tx.policySetting.deleteMany({ where: { policyId: policy.id } })
          await tx.policyListSetting.deleteMany({ where: { policyId: policy.id, listTypeId: { not: null } } })
          await tx.policyDeviceSetting.deleteMany({ where: { policyId: policy.id } })
        }

        for (const s of input.config.settings ?? []) {
          const parameterId = byPath.get(s.parameter)
          if (!parameterId) { unknownParameters.push(s.parameter); continue }
          const value = s.value as Parameters<typeof tx.policySetting.create>[0]['data']['value']
          await tx.policySetting.upsert({
            where: { policyId_parameterId: { policyId: policy.id, parameterId } },
            create: { policyId: policy.id, parameterId, value, forced: s.forced ?? false },
            update: { value, forced: s.forced ?? false },
          })
          settingsApplied++
        }

        for (const [listTypeId, rows] of Object.entries(input.config.lists ?? {})) {
          if (!listTypeIds.has(listTypeId)) { unknownLists.push(listTypeId); continue }
          if (!input.replace) {
            await tx.policyListSetting.deleteMany({ where: { policyId: policy.id, listTypeId } })
          }
          let order = 0
          for (const row of rows) {
            await tx.policyListSetting.create({
              data: {
                policyId: policy.id,
                listTypeId,
                rowData: row as Parameters<typeof tx.policyListSetting.create>[0]['data']['rowData'],
                sortOrder: order++,
              },
            })
            listRowsApplied++
          }
        }

        for (const d of input.config.devices ?? []) {
          const deviceTypeId = deviceByName.get(d.deviceType)
          if (!deviceTypeId) { unknownDevices.push(d.deviceType); continue }
          await tx.policyDeviceSetting.upsert({
            where: { policyId_deviceTypeId: { policyId: policy.id, deviceTypeId } },
            create: { policyId: policy.id, deviceTypeId, access: d.access },
            update: { access: d.access },
          })
          devicesApplied++
        }

        const metaPatch: Record<string, boolean> = {}
        if (input.config.inheritFromParent !== undefined) metaPatch.inheritFromParent = input.config.inheritFromParent
        if (input.config.forceInheritToChildren !== undefined) metaPatch.forceInheritToChildren = input.config.forceInheritToChildren
        if (Object.keys(metaPatch).length > 0) {
          await tx.policy.update({ where: { id: policy.id }, data: metaPatch })
        }
      })

      return { settingsApplied, listRowsApplied, devicesApplied, unknownParameters, unknownLists, unknownDevices }
    }),

  // ─── Device control matrix ─────────────────────────────────────────────────

  /** Access mode per device type for a policy. */
  listDeviceSettings: publicProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.policyDeviceSetting.findMany({
        where: { policyId: input.policyId },
      })
    }),

  setDeviceAccess: publicProcedure
    .input(z.object({ policyId: z.string(), deviceTypeId: z.string(), access: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.policyDeviceSetting.upsert({
        where: { policyId_deviceTypeId: { policyId: input.policyId, deviceTypeId: input.deviceTypeId } },
        create: { policyId: input.policyId, deviceTypeId: input.deviceTypeId, access: input.access },
        update: { access: input.access },
      })
    }),

  /** Set event-level settings for a policy. */
  upsertEventSetting: publicProcedure
    .input(
      z.object({
        policyId: z.string(),
        eventId: z.string(),
        storageDays: z.number().int().min(0).optional(),
        channels: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { policyId, eventId, ...data } = input
      // Get event defaults for missing fields
      const event = await ctx.prisma.eventCatalog.findUniqueOrThrow({ where: { id: eventId } })
      return ctx.prisma.policyEventSetting.upsert({
        where: { policyId_eventId: { policyId, eventId } },
        create: {
          policyId,
          eventId,
          storageDays: data.storageDays ?? event.defaultStorageDays,
          channels: (data.channels ?? event.availableChannels) as Parameters<typeof ctx.prisma.policyEventSetting.create>[0]['data']['channels'],
          enabled: data.enabled ?? true,
        },
        update: {
          ...(data.storageDays !== undefined ? { storageDays: data.storageDays } : {}),
          ...(data.channels !== undefined ? { channels: data.channels as Parameters<typeof ctx.prisma.policyEventSetting.update>[0]['data']['channels'] } : {}),
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        },
      })
    }),

  /**
   * Resolve effective settings for multiple policies in one round-trip.
   * Used by the comparison matrix. All policyIds must belong to the same environment.
   * Returns Record<policyId, EffectiveSettingsMap>.
   */
  compareMatrix: publicProcedure
    .input(z.object({ policyIds: z.array(z.string()).min(1).max(8) }))
    .query(async ({ ctx, input }) => {
      if (input.policyIds.length === 0) return {}

      // Anchor on the first policy to find the environment
      const anchor = await ctx.prisma.policy.findUniqueOrThrow({
        where: { id: input.policyIds[0] },
        select: { applicationId: true, targetGroupId: true },
      })
      if (!anchor.targetGroupId) return {}

      const group = await ctx.prisma.administrationGroup.findUniqueOrThrow({
        where: { id: anchor.targetGroupId },
        select: { environmentId: true },
      })

      const [allGroups, allPolicies, allSettings] = await Promise.all([
        ctx.prisma.administrationGroup.findMany({
          where: { environmentId: group.environmentId },
          select: { id: true, parentId: true },
        }),
        ctx.prisma.policy.findMany({
          where: { applicationId: anchor.applicationId, targetGroup: { environmentId: group.environmentId } },
          select: {
            id: true,
            applicationId: true,
            targetGroupId: true,
            status: true,
            inheritFromParent: true,
            forceInheritToChildren: true,
          },
        }),
        ctx.prisma.policySetting.findMany({
          where: {
            policy: { applicationId: anchor.applicationId, targetGroup: { environmentId: group.environmentId } },
          },
          select: { policyId: true, parameterId: true, value: true, forced: true, inherited: true },
        }),
      ])

      const mappedPolicies = allPolicies.map(p => ({
        ...p,
        status: p.status as 'active' | 'inactive' | 'out_of_office',
        targetGroupId: p.targetGroupId,
      }))
      const mappedSettings = allSettings.map(s => ({
        ...s,
        value: s.value as import('@ksc/domain').JsonValue,
      }))
      const mappedGroups = allGroups.map(g => ({ id: g.id, parentId: g.parentId }))

      const result: Record<string, ReturnType<typeof resolveEffectiveSettings>> = {}
      for (const policyId of input.policyIds) {
        result[policyId] = resolveEffectiveSettings(policyId, mappedPolicies, mappedSettings, mappedGroups)
      }
      return result
    }),

  /**
   * Resolve effective settings for a policy, accounting for all levels of
   * inheritance (sections 12 & 13). Returns a flat map of parameterId → EffectiveSetting.
   */
  resolveEffective: publicProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const policy = await ctx.prisma.policy.findUniqueOrThrow({
        where: { id: input.policyId },
        select: {
          id: true,
          applicationId: true,
          targetGroupId: true,
          status: true,
          inheritFromParent: true,
          forceInheritToChildren: true,
        },
      })

      if (!policy.targetGroupId) {
        // No group attached — nothing to inherit
        const ownSettings = await ctx.prisma.policySetting.findMany({
          where: { policyId: input.policyId },
        })
        return Object.fromEntries(
          ownSettings.map(s => [
            s.parameterId,
            {
              parameterId: s.parameterId,
              value: s.value,
              source: 'own' as const,
              lockedFromAbove: false,
              sourceGroupId: null,
              sourcePolicyId: input.policyId,
            },
          ]),
        )
      }

      // Load all groups + all policies for this application in this environment
      const group = await ctx.prisma.administrationGroup.findUniqueOrThrow({
        where: { id: policy.targetGroupId },
      })
      const allGroups = await ctx.prisma.administrationGroup.findMany({
        where: { environmentId: group.environmentId },
        select: { id: true, parentId: true },
      })
      const allPolicies = await ctx.prisma.policy.findMany({
        where: {
          applicationId: policy.applicationId,
          targetGroup: { environmentId: group.environmentId },
        },
        select: {
          id: true,
          applicationId: true,
          targetGroupId: true,
          status: true,
          inheritFromParent: true,
          forceInheritToChildren: true,
        },
      })
      const allSettings = await ctx.prisma.policySetting.findMany({
        where: {
          policy: {
            applicationId: policy.applicationId,
            targetGroup: { environmentId: group.environmentId },
          },
        },
        select: { policyId: true, parameterId: true, value: true, forced: true, inherited: true },
      })

      return resolveEffectiveSettings(
        input.policyId,
        allPolicies.map(p => ({
          ...p,
          status: p.status as 'active' | 'inactive' | 'out_of_office',
          targetGroupId: p.targetGroupId,
        })),
        allSettings.map(s => ({
          ...s,
          value: s.value as import('@ksc/domain').JsonValue,
        })),
        allGroups.map(g => ({ id: g.id, parentId: g.parentId })),
      )
    }),
})
