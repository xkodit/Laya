"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncAdminRole } from "@/lib/auth/sync-admin-role";

export type SignInState = { error?: string } | undefined;

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!email || !password) {
    return { error: "Email et mot de passe sont requis." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Identifiants invalides. Vérifie ton email et ton mot de passe." };
  }

  if (data.user?.email) {
    await syncAdminRole(data.user.id, data.user.email);
  }

  redirect(next);
}
