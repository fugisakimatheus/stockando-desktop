import { useEffect, useState } from 'react'

function App(): React.JSX.Element {
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadUsers(): Promise<void> {
      try {
        const response = await fetch('http://127.0.0.1:3000/api/users', {
          signal: controller.signal
        })

        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const data = (await response.json()) as { id: number; name: string; email: string }[]
        setUsers(data)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadUsers()

    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-3 text-2xl font-bold">Usuarios do SQLite</h1>
      <p className="mb-4 text-sm text-zinc-500">Dados vindos do Fastify no Main Process</p>

      {loading ? <p>Carregando...</p> : null}
      {error ? <p className="text-red-500">Erro ao carregar: {error}</p> : null}

      {!loading && !error ? (
        <pre className="overflow-x-auto rounded-md bg-zinc-900 p-4 text-xs text-zinc-100">
          {JSON.stringify(users, null, 2)}
        </pre>
      ) : null}
    </main>
  )
}

export { App }
