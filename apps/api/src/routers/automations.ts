import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

const AutomationKindSchema = z.enum([
  'moving_rule',
  'tagging_rule',
  'task_trigger',
  'device_selection',
  'discovery_poll',
])

// Leaf rule: one criteria check
const ConditionLeafSchema: z.ZodType<ConditionLeaf> = z.object({
  criteriaKey: z.string(),
  op: z.string(),
  value: z.unknown(),
})

interface ConditionLeaf {
  criteriaKey: string
  op: string
  value?: unknown
}

interface ConditionGroup {
  operator: 'and' | 'or'
  rules: Array<ConditionLeaf | ConditionGroup>
}

// Group rule: AND/OR of leaves or sub-groups
const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(['and', 'or']),
    rules: z.array(z.union([ConditionLeafSchema, ConditionGroupSchema])),
  }),
)

const ActionSchema = z.object({
  type: z.enum(['move_to_group', 'assign_tag', 'run_task', 'named_selection', 'notify']),
  groupId: z.string().optional(),
  groupName: z.string().optional(),
  tagName: z.string().optional(),
  templateId: z.string().optional(),
  selectionName: z.string().optional(),
})

export const automationsRouter = router({
  /** All automation rules for an environment. */
  list: publicProcedure
    .input(z.object({ environmentId: z.string(), kind: AutomationKindSchema.optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.automationRule.findMany({
        where: {
          environmentId: input.environmentId,
          ...(input.kind ? { kind: input.kind } : {}),
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      })
    }),

  /** Create a new automation rule. */
  create: publicProcedure
    .input(
      z.object({
        environmentId: z.string(),
        kind: AutomationKindSchema,
        name: z.string().min(1),
        priority: z.number().int().default(100),
        condition: ConditionGroupSchema,
        action: ActionSchema,
        enabled: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.automationRule.create({
        data: {
          environmentId: input.environmentId,
          kind: input.kind,
          name: input.name,
          priority: input.priority,
          condition: input.condition as unknown as Parameters<typeof ctx.prisma.automationRule.create>[0]['data']['condition'],
          action: input.action as unknown as Parameters<typeof ctx.prisma.automationRule.create>[0]['data']['action'],
          enabled: input.enabled,
        },
      })
    }),

  /** Update name, priority, condition, or action. */
  update: publicProcedure
    .input(
      z.object({
        ruleId: z.string(),
        name: z.string().min(1).optional(),
        priority: z.number().int().optional(),
        condition: ConditionGroupSchema.optional(),
        action: ActionSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { ruleId, condition, action, ...rest } = input
      return ctx.prisma.automationRule.update({
        where: { id: ruleId },
        data: {
          ...rest,
          ...(condition !== undefined
            ? { condition: condition as unknown as Parameters<typeof ctx.prisma.automationRule.update>[0]['data']['condition'] }
            : {}),
          ...(action !== undefined
            ? { action: action as unknown as Parameters<typeof ctx.prisma.automationRule.update>[0]['data']['action'] }
            : {}),
        },
      })
    }),

  /** Enable or disable a rule. */
  toggleEnabled: publicProcedure
    .input(z.object({ ruleId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.automationRule.update({
        where: { id: input.ruleId },
        data: { enabled: input.enabled },
      })
    }),

  /** Delete a rule. */
  delete: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.automationRule.delete({ where: { id: input.ruleId } })
    }),
})
