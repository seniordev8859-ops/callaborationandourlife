import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic redirects only; every API route and page re-checks the user in the database.
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const adminOnly = pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/keys") || pathname.startsWith("/admin/notifications") || pathname.startsWith("/admin/feedback") || pathname.startsWith("/admin/logs") || pathname.startsWith("/admin/prompt-test") || pathname.startsWith("/admin/api-access");
  const staff = session.role === "admin" || session.role === "user";
  const caller = session.role === "caller";
  // Callers only use their interview pages, profiles and My Page.
  if (caller && !["/caller", "/me", "/profiles", "/notifications", "/feedback", "/help"].some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/caller/requests", req.url));
  }
  // Bidders work from Generate Resume and View Generated Resumes; other workspace pages are hidden from them.
  if (session.role === "bidder" && (pathname === "/dashboard" || ["/overview", "/feedback"].some((p) => pathname === p || pathname.startsWith(p + "/")))) {
    return NextResponse.redirect(new URL("/dashboard/import", req.url));
  }
  if (!caller && pathname.startsWith("/caller")) {
    return NextResponse.redirect(new URL(staff ? "/admin" : "/dashboard/import", req.url));
  }
  if (pathname.startsWith("/admin") && (!staff || (adminOnly && session.role !== "admin"))) {
    return NextResponse.redirect(new URL(staff ? "/admin" : "/dashboard/import", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/applications/:path*", "/profiles/:path*", "/me/:path*", "/admin/:path*", "/interviews/:path*", "/caller/:path*", "/notifications/:path*", "/feedback/:path*", "/overview/:path*", "/help"],
};
