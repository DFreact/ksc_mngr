import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

const StatusSchema = z.enum(['draft', 'in_review', 'approved', 'applied', 'rejected', 'rolled_back'])

// Valid state transitions
const TRANSITIONS: Record<string, string[]> = {
  draft:      ['in_review'],
  in_review:  ['draft', 'approved', 'rejected'],
  approved:   ['applied', 'rejected'],
  applied:    ['rolled_back'],
  rejected:   [],
  rolled_back:[],
}

const DiffEntrySchema = z.object({
  field:  z.string(),
  before: z.unknown(),
  after:  z.unknown(),
})

export const changeRequestsRouter = router({
  /** All change requests for an environment, optionally filtered by status. */
  list: publicProcedure
    .input(z.object({ environmentId: z.string(), status: StatusSchema.optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.changeRequest.findMany({
        where: {
          environmentId: input.environmentId,
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          _count: { select: { revisions: true, approvals: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  /** Full change request with revisions and approvals. */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.changeRequest.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          revisions: { orderBy: { createdAt: 'asc' } },
          approvals: { orderBy: { createdAt: 'asc' } },
        },
      })
    }),

  /** Create a new draft change request. */
  create: publicProcedure
    .input(
      z.object({
        environmentId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        authorId: z.string().min(1),   // display name
        relatedTicket: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.changeRequest.create({
        data: {
          environmentId: input.environmentId,
          title: input.title,
          description: input.description ?? null,
          authorId: input.authorId,
          relatedTicket: input.relatedTicket ?? null,
          status: 'draft',
        },
      })
    }),

  /** Update title / description / relatedTicket (only while draft). */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        relatedTicket: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      return ctx.prisma.changeRequest.update({ where: { id }, data })
    }),

  /** Add or update a revision (what entity changed and how). */
  addRevision: publicProcedure
    .input(
      z.object({
        changeRequestId: z.string(),
        entityType: z.string(),
        entityId: z.string(),
        entityName: z.string(),
        diff: z.array(DiffEntrySchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Upsert: one revision per entity per change request
      const existing = await ctx.prisma.revision.findFirst({
        where: { changeRequestId: input.changeRequestId, entityId: input.entityId },
      })
      const data = {
        entityType: input.entityType,
        entityName: input.entityName,
        diff: input.diff as Parameters<typeof ctx.prisma.revision.create>[0]['data']['diff'],
      }
      if (existing) {
        return ctx.prisma.revision.update({ where: { id: existing.id }, data })
      }
      return ctx.prisma.revision.create({
        data: { changeRequestId: input.changeRequestId, entityId: input.entityId, ...data },
      })
    }),

  /** Transition the status along the workflow. */
  transition: publicProcedure
    .input(z.object({ id: z.string(), toStatus: StatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.prisma.changeRequest.findUniqueOrThrow({ where: { id: input.id } })
      const allowed = TRANSITIONS[req.status] ?? []
      if (!allowed.includes(input.toStatus)) {
        throw new Error(`Переход ${req.status} → ${input.toStatus} недопустим`)
      }
      return ctx.prisma.changeRequest.update({
        where: { id: input.id },
        data: { status: input.toStatus },
      })
    }),

  /** Add an approval decision to a change request. */
  addApproval: publicProcedure
    .input(
      z.object({
        changeRequestId: z.string(),
        approverId: z.string().min(1),
        decision: z.enum(['approved', 'rejected']),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.approval.create({
        data: {
          changeRequestId: input.changeRequestId,
          approverId: input.approverId,
          decision: input.decision,
          comment: input.comment ?? null,
          decidedAt: new Date(),
        },
      })
    }),

  /** Delete a change request (only draft or rejected). */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.changeRequest.delete({ where: { id: input.id } })
    }),
})
