import { join } from 'node:path'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import Fastify, { type FastifyInstance } from 'fastify'

import { users } from './db/schema'

const HOST = '127.0.0.1'
const PORT = 3000

let fastifyInstance: FastifyInstance | null = null

export async function startServer(): Promise<FastifyInstance> {
  if (fastifyInstance) return fastifyInstance

  const dbPath = join(app.getPath('userData'), 'database.sqlite')
  const sqlite = new Database(dbPath)

  // Ensure the demo table exists before serving requests.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    )
  `)

  const db = drizzle(sqlite)
  const fastify = Fastify({ logger: true })

  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Methods', 'GET,OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type')
    return payload
  })

  fastify.options('/api/users', async (_request, reply) => {
    reply.code(204).send()
  })

  fastify.get('/api/users', async () => {
    return db.select().from(users).all()
  })

  await fastify.listen({ host: HOST, port: PORT })
  fastify.log.info(`Fastify running at http://${HOST}:${PORT}`)

  fastifyInstance = fastify
  return fastify
}

export async function stopServer(): Promise<void> {
  if (!fastifyInstance) return

  await fastifyInstance.close()
  fastifyInstance = null
}
