import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser().catch(() => null);
  if (!user) redirect("/login");
  redirect(user.role === "bidder" ? "/dashboard/import" : user.role === "caller" ? "/caller/requests" : "/admin");
}
