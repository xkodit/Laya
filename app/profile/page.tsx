import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/lib/auth/logout-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/app/app-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { ChangePasswordDialog } from "@/components/profile/change-password-dialog";
import { DeleteAccountDialog } from "@/components/profile/delete-account-dialog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profil — Laya",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, user_type, company, preferred_language")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/sign-in");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <div className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-10 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
          <p className="text-sm text-muted-foreground">
            Gère tes informations, ton mot de passe, et ton compte.
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-border bg-background p-6">
          <h2 className="text-base font-semibold">Informations</h2>
          <ProfileForm
            defaults={{
              full_name: profile.full_name,
              user_type: profile.user_type,
              company: profile.company ?? "",
              preferred_language: profile.preferred_language ?? "fr",
            }}
          />
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-background p-6">
          <h2 className="text-base font-semibold">Compte</h2>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile.email} disabled />
            <p className="text-xs text-muted-foreground">
              L&apos;email ne peut pas être modifié.
            </p>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Mot de passe</p>
              <p className="text-xs text-muted-foreground">
                Vérification du mot de passe actuel requise.
              </p>
            </div>
            <ChangePasswordDialog />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="text-base font-semibold text-destructive">
            Zone dangereuse
          </h2>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Se déconnecter</p>
              <p className="text-xs text-muted-foreground">
                Termine la session sur cet appareil.
              </p>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="outline">
                <LogOut />
                Se déconnecter
              </Button>
            </form>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-destructive/20 pt-4">
            <div>
              <p className="text-sm font-medium">Supprimer le compte</p>
              <p className="text-xs text-muted-foreground">
                Suppression irréversible de toutes les données.
              </p>
            </div>
            <DeleteAccountDialog email={profile.email} />
          </div>
        </section>
      </div>
    </div>
  );
}
