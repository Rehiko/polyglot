Deno.serve(() => {
  return new Response(
    "Google Calendar is already connected. This setup endpoint is disabled.",
    {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
});