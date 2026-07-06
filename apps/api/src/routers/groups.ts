import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { buildGroupTree } from '@ksc/domain'

export const groupsRouter = router({
  /**
   * Return the full group tree for an environment as a nested structure.
   */
  tree: publicProcedure
    .input(z.object({ environmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const groups = await ctx.prisma.administrationGroup.findMany({
        where: { environmentId: input.environmentId },
        orderBy: { name: 'asc' },
      })
      return buildGroupTree(groups)
    }),

  /**
   * List all environments (for the environment switcher).
   */
  listEnvironments: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.environment.findMany({ orderBy: { name: 'asc' } })
  }),

  /**
   * Create an environment with an optional seed group tree.
   */
  createEnvironment: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.environment.create({
        data: {
          name: input.name,
          description: input.description,
          administrationGroups: {
            create: [
              { name: 'Управляемые устройства', description: 'Корневая группа' },
              { name: 'Нераспределённые устройства', description: 'Новые устройства до первичной сортировки' },
            ],
          },
        },
      })
    }),

  /**
   * Create a group inside an environment.
   */
  createGroup: publicProcedure
    .input(
      z.object({
        environmentId: z.string(),
        parentId: z.string().nullable().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.administrationGroup.create({
        data: {
          environmentId: input.environmentId,
          parentId: input.parentId ?? null,
          name: input.name,
          description: input.description,
        },
      })
    }),

  /** Rename a group. */
  renameGroup: publicProcedure
    .input(z.object({ groupId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.administrationGroup.update({
        where: { id: input.groupId },
        data: { name: input.name },
      })
    }),

  /** Delete a group. Cascades to children via DB FK cascade. */
  deleteGroup: publicProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.administrationGroup.delete({ where: { id: input.groupId } })
    }),

  /** Move a group to a different parent (or to root if parentId is null). */
  moveGroup: publicProcedure
    .input(z.object({ groupId: z.string(), newParentId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.administrationGroup.update({
        where: { id: input.groupId },
        data: { parentId: input.newParentId },
      })
    }),
})
