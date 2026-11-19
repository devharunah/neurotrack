import { exportUserData } from "@/lib/account";
import { exportFileName } from "@/lib/account/schema";
import { getSessionUser } from "@/lib/auth";

// Personal data: computed per request, never cached by Next or any proxy.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const data = await exportUserData(user);
  if (!data) {
    return Response.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(new Date())}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
