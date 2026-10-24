import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const allowed = new Set([
      process.env.APP_URL || "http://localhost:3000",
      ...(process.env.NODE_ENV !== "production"
        ? ["http://localhost:3000", "http://127.0.0.1:3000"]
        : []),
    ]);
    if (origin && !allowed.has(origin))
      return NextResponse.json(
        { error: { message: "Request origin is not allowed." } },
        { status: 403 },
      );
  }
  try {
    let body: Buffer | undefined;
    if (!["GET", "HEAD"].includes(req.method) && req.body) {
      const reader = req.body.getReader();
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 5 * 1024 * 1024) {
          await reader.cancel();
          return NextResponse.json(
            { error: { message: "Upload exceeds 5 MB." } },
            { status: 413 },
          );
        }
        chunks.push(Buffer.from(chunk.value));
      }
      body = Buffer.concat(chunks);
    }
    const url = `${process.env.API_URL || "http://127.0.0.1:4100"}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
    const upstream = await fetch(url, {
      method: req.method,
      redirect: "manual",
      headers: {
        "Content-Type": req.headers.get("content-type") || "application/json",
        Cookie: req.headers.get("cookie") || "",
        ...(req.headers.get("x-forwarded-for") ? {"X-Forwarded-For":req.headers.get("x-forwarded-for")!}:{}),
        ...(req.headers.get("origin")
          ? { Origin: req.headers.get("origin")! }
          : {}),
      },
      body: body ? new Uint8Array(body).buffer : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
        ...(upstream.headers.get("location") ? {Location:upstream.headers.get("location")!}:{}),
        "X-Content-Type-Options": "nosniff",
        ...(upstream.headers.get("content-disposition")
          ? {
              "Content-Disposition": upstream.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
      },
    });
    for (const value of upstream.headers.getSetCookie())
      response.headers.append("Set-Cookie", value);
    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            "The service is unavailable. Please make sure the CrewUp API and database are running.",
        },
      },
      { status: 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as DELETE,
  proxy as PUT,
};
