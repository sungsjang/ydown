import { redirect } from "next/navigation";
import { isSignedIn } from "@/lib/auth";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await isSignedIn())) redirect("/login");
  return <Dashboard />;
}
