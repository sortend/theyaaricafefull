"use client";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ padding: 48, maxWidth: 640, margin: "0 auto" }}>
      <h1>Something went wrong</h1>
      <p role="alert" style={{ opacity: 0.8 }}>{error.message}</p>
      <button onClick={reset} style={{ padding: "12px 24px" }}>Try again</button>
    </main>
  );
}
