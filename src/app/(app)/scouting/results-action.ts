"use server"

import { z } from 'zod'
import { defineAction } from '@/lib/actions/define'
import { listScoutingResults } from '@/lib/repos/scouting'

export const listResultsAction = defineAction(
  z.object({ runId: z.string().min(1).max(60) }),
  async (input, ctx) => listScoutingResults(ctx, input.runId),
)
