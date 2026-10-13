import Link from "next/link";

function Mark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8">
      <rect width="32" height="32" rx="9" fill="#0f3d28" />
      <circle cx="16" cy="16" r="7" fill="#e4f56a" />
      <circle cx="16" cy="16" r="2.5" fill="#0f3d28" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-sand/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" aria-label="Green Zone" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="hidden font-display text-xl leading-none tracking-tight sm:inline">Green Zone</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm font-medium">
          <Link href="/#board" className="shrink-0 rounded-full px-3 py-2 text-moss hover:bg-paper">
            Board
          </Link>
          <Link href="/admin" className="shrink-0 rounded-full px-3 py-2 text-moss hover:bg-paper">
            Admin
          </Link>
          <Link
            href="/report"
            className="shrink-0 rounded-full bg-canopy-deep px-4 py-2 text-paper hover:bg-canopy"
          >
            Report
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-10 text-sm text-moss">
      Teams of three file what they find. Points land when an admin verifies the ticket.
    </footer>
  );
}
