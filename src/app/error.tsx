"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-4xl tracking-tight">Something broke</h1>
      <p className="mt-3 text-sm leading-6 text-moss">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-canopy-deep px-4 py-2 text-sm font-semibold text-paper"
      >
        Try again
      </button>
    </main>
  );
}
