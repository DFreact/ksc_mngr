import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { resolveEffectiveSettings, computePolicyCoverage } from '@ksc/domain'
import type { ControlMappingRow, ThreatVectorRow } from '@ksc/domain'

export const coverageRouter = router({
  listThreatVectors: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.threatVectorCatalog.findMany({
      orderBy: [{ tactic: 'asc' }, { name: 'asc' }],
    })
  }),

  listControlMappings: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.controlMapping.findMany({
      include: {
        parameter: { select: { id: true, name: true, category: true, applicationId: true } },
        threatVectors: { select: { id: true, name: true, tactic: true } },
      },
    })
  }),

  reportForPolicy: publicProcedure
    .input(z.object({ policyId: z.string(), environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Приложение выбранной политики — чтобы учитывать только его контроли
      // (иначе контроль другой версии/приложения ошибочно попадёт в «не включено»)
      const policy = await ctx.prisma.policy.findUniqueOrThrow({
        where: { id: input.policyId },
        select: { applicationId: true },
      })

      // Load data for effective settings resolution
      const [allGroups, allPolicies, allSettings] = await Promise.all([
        ctx.prisma.administrationGroup.findMany({
          where: { environmentId: input.environmentId },
          select: { id: true, parentId: true },
        }),
        ctx.prisma.policy.findMany({
          where: { targetGroup: { environmentId: input.environmentId } },
          select: {
            id: true, applicationId: true, targetGroupId: true,
            status: true, inheritFromParent: true, forceInheritToChildren: true,
          },
        }),
        ctx.prisma.policySetting.findMany({
          where: { policy: { targetGroup: { environmentId: input.environmentId } } },
          select: { policyId: true, parameterId: true, value: true, forced: true, inherited: true },
        }),
      ])

      const effective = resolveEffectiveSettings(
        input.policyId,
        allPolicies.map(p => ({
          ...p,
          status: p.status as 'active' | 'inactive' | 'out_of_office',
        })),
        allSettings.map(s => ({
          ...s,
          value: s.value as import('@ksc/domain').JsonValue,
          inherited: s.inherited ?? false,
        })),
        allGroups,
      )

      // Load control mappings (только для приложения политики) + threat vectors
      const [rawMappings, threatVectors] = await Promise.all([
        ctx.prisma.controlMapping.findMany({
          where: { parameter: { applicationId: policy.applicationId } },
          include: { threatVectors: { select: { id: true } } },
        }),
        ctx.prisma.threatVectorCatalog.findMany({
          orderBy: [{ tactic: 'asc' }, { name: 'asc' }],
        }),
      ])

      const controlMappings: ControlMappingRow[] = rawMappings.map(m => ({
        id: m.id,
        parameterId: m.parameterId,
        requiredState: m.requiredState as { value: unknown },
        coverageStrength: m.coverageStrength as ControlMappingRow['coverageStrength'],
        threatVectors: m.threatVectors,
      }))

      const tvRows: ThreatVectorRow[] = threatVectors.map(v => ({
        id: v.id,
        tactic: v.tactic,
        name: v.name,
      }))

      const coverage = computePolicyCoverage(effective, controlMappings, tvRows)

      return {
        policyId: input.policyId,
        effectiveSettingsCount: Object.keys(effective).length,
        threatVectors: threatVectors.map(v => ({
          id: v.id,
          tactic: v.tactic,
          name: v.name,
          description: v.description,
          mitreTechniqueRef: v.mitreTechniqueRef,
        })),
        coverage,
      }
    }),
})
