import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="md:flex">
      <Nav role={user.role} name={user.name} logout={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
