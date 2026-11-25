import type { FastifyReply } from 'fastify'
import { z } from 'zod'

export interface Issue {
  path: string
  message: string
}

/** Lower-cased uuid so ids compare equal to what Postgres returns. */
export const uuid = z.uuid().transform((s) => s.toLowerCase())

export const trimmed = (max: number) => z.string().trim().min(1).max(max)

/** Converts zod issues to `{ path, message }` without ever echoing input values. */
export function toIssues(error: z.ZodError): Issue[] {
  return error.issues.flatMap((issue): Issue[] => {
    const base = issue.path.map(String)
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: [...base, key.slice(0, 64)].join('.'),
        message: 'Champ non autorisé.',
      }))
    }
    return [{ path: base.join('.'), message: issue.message }]
  })
}

export function sendInvalid(reply: FastifyReply, issues: Issue[]) {
  return reply.code(400).send({ error: 'Requête invalide.', issues })
}

/** Parses `data`; on failure replies 400 and returns null. */
export function parseBody<S extends z.ZodType>(
  schema: S,
  data: unknown,
  reply: FastifyReply,
): z.output<S> | null {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  sendInvalid(reply, toIssues(result.error))
  return null
}

/** Parses path params; a malformed id is indistinguishable from an unknown resource. */
export function parseParams<S extends z.ZodType>(
  schema: S,
  data: unknown,
  reply: FastifyReply,
  notFoundMessage: string,
): z.output<S> | null {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  reply.code(404).send({ error: notFoundMessage })
  return null
}
