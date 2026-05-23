import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const metadata = {
  title: "Admin — Laya",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="grid h-screen grid-cols-[16rem_1fr] bg-muted/30">
      <AdminSidebar
        profile={{ full_name: profile.full_name, email: profile.email }}
      />
      <main className="overflow-y-auto">{children}</main>
    </div>
  );
}
