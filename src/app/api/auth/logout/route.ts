import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { getSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  if (session) {
    await auditLog({
      actorId: session.id,
      event: "LOGOUT",
      entity: "User",
      entityId: session.id,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}
