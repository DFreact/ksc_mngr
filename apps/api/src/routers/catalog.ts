import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

export const catalogRouter = router({
  /**
   * List ParameterCatalog entries, optionally filtered by applicationId or category.
   */
  listParameters: publicProcedure
    .input(
      z.object({
        applicationId: z.string().optional(),
        category: z.string().optional(),
        search: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.parameterCatalog.findMany({
        where: {
          ...(input?.applicationId ? { applicationId: input.applicationId } : {}),
          ...(input?.category ? { category: input.category } : {}),
          ...(input?.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: 'insensitive' } },
                  { description: { contains: input.search, mode: 'insensitive' } },
                ],
              }
            : {}),
          removedInVersion: null,
        },
        include: { application: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      })
    }),

  /**
   * List EventCatalog entries.
   */
  listEvents: publicProcedure
    .input(
      z.object({
        applicationId: z.string().optional(),
        component: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.eventCatalog.findMany({
        where: {
          ...(input?.applicationId ? { applicationId: input.applicationId } : {}),
          ...(input?.component ? { component: input.component } : {}),
        },
        include: { application: true },
        orderBy: [{ component: 'asc' }, { name: 'asc' }],
      })
    }),

  /**
   * List all applications.
   */
  listApplications: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.application.findMany({
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    })
  }),

  /** List CriteriaCatalog entries for ConditionBuilder. */
  listCriteria: publicProcedure
    .input(z.object({ group: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      type CriteriaGroup = 'network' | 'ad' | 'application' | 'protection' | 'virtualisation'
      return ctx.prisma.criteriaCatalog.findMany({
        where: input?.group ? { group: input.group as CriteriaGroup } : undefined,
        orderBy: [{ group: 'asc' }, { criteriaKey: 'asc' }],
      })
    }),

  /** List TaskTemplate catalog entries. */
  listTaskTemplates: publicProcedure
    .input(z.object({ applicationId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.taskTemplate.findMany({
        where: input?.applicationId ? { applicationId: input.applicationId } : undefined,
        include: { application: { select: { id: true, name: true, version: true } } },
        orderBy: [{ application: { name: 'asc' } }, { name: 'asc' }],
      })
    }),

  // ─── KSC console navigation ────────────────────────────────────────────────

  /** Section tree with components (ordered as in the KSC console). */
  listSections: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.kscSection.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    })
  }),

  /** Subcategory → section/component mappings with breadcrumb info. */
  listSubcategoryMappings: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.kscSubcategoryMapping.findMany({
      include: {
        section: { select: { id: true, name: true } },
        component: { select: { id: true, name: true } },
      },
    })
  }),

  /** Admin override: re-pin a subcategory to a different section/component. */
  overrideSubcategoryMapping: publicProcedure
    .input(z.object({
      excelSubcategory: z.string(),
      sectionId: z.string(),
      componentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.kscSubcategoryMapping.upsert({
        where: { excelSubcategory: input.excelSubcategory },
        create: {
          excelSubcategory: input.excelSubcategory,
          sectionId: input.sectionId,
          componentId: input.componentId,
          verified: true,
          overridden: true,
        },
        update: {
          sectionId: input.sectionId,
          componentId: input.componentId,
          verified: true,
          overridden: true,
        },
      })
    }),

  // ─── List-table types & device control ────────────────────────────────────

  /** Named list-table schemas (trusted devices, exclusions, packet rules…). */
  listListTypes: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.listTypeCatalog.findMany({ orderBy: { name: 'asc' } })
  }),

  /** Device type catalog + device control metadata (buses, custom rules schema). */
  getDeviceControl: publicProcedure.query(async ({ ctx }) => {
    const [deviceTypes, meta] = await Promise.all([
      ctx.prisma.deviceTypeCatalog.findMany({ orderBy: { name: 'asc' } }),
      ctx.prisma.deviceControlMeta.findUnique({ where: { id: 'default' } }),
    ])
    return { deviceTypes, meta }
  }),
})
