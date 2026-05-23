"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidUserType } from "@/lib/auth/user-types";

export type ActionState = { error?: string; success?: boolean } | undefined;

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const userType = String(formData.get("user_type") ?? "");
  const company = String(formData.get("company") ?? "").trim();

  if (!fullName) return { error: "Le nom est requis." };
  if (!isValidUserType(userType)) return { error: "Type d'utilisateur invalide." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      user_type: userType,
      company: company || null,
    })
    .eq("id", user.id);

  if (error) return { error: `Mise à jour échouée : ${error.message}` };

  revalidatePath("/profile");
  return { success: true };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Tous les champs sont requis." };
  }
  if (newPassword.length < 8) {
    return { error: "Le nouveau mot de passe doit faire au moins 8 caractères." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "La confirmation ne correspond pas." };
  }
  if (newPassword === currentPassword) {
    return { error: "Le nouveau mot de passe doit être différent." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    redirect("/sign-in");
  }

  // Re-verify the current password by attempting sign-in. Supabase's
  // updateUser({password}) doesn't enforce current-password ownership, so
  // we do it manually here.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: "Mot de passe actuel incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return { error: `Échec : ${updateError.message}` };
  }

  return { success: true };
}

export async function deleteAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const emailConfirm = String(formData.get("email_confirm") ?? "")
    .trim()
    .toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }
  if (emailConfirm !== user.email?.toLowerCase()) {
    return { error: "L'email ne correspond pas." };
  }

  // auth.users delete cascades to profiles (FK on delete cascade), which then
  // cascades to conversations, messages, feedback, etc.
  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: `Suppression échouée : ${error.message}` };
  }

  await supabase.auth.signOut();
  redirect("/");
}
