import { Button } from '@shared/ui/button'
import { Link } from '@tanstack/react-router'
import { Home, SearchX } from 'lucide-react'

function NotFoundPage(): React.JSX.Element {
  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center gap-8 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.05),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.025),_transparent_34%)] p-6 dark:bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.08),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(96,165,250,0.04),_transparent_34%)]">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-10 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 dark:shadow-[0_10px_45px_rgba(2,6,23,0.35)]">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-background/80 text-muted-foreground shadow-sm">
          <SearchX className="size-8" />
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">404</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            A página que você procura não existe ou foi movida para outro endereço.
          </p>
        </div>

        <Link to="/">
          <Button variant="default" size="lg">
            <Home className="size-4" />
            Voltar ao início
          </Button>
        </Link>
      </div>
    </div>
  )
}

export { NotFoundPage }
