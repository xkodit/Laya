"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowlisted } from "@/lib/auth/allowlist";
import { isValidUserType } from "@/lib/auth/user-types";

export type SignUpState =
  | { error: string }
  | { success: true; email: string }
  | undefined;

export async function signUpAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const userType = String(formData.get("user_type") ?? "");
  const company = String(formData.get("company") ?? "").trim();

  if (!email || !password || !fullName || !userType) {
    return { error: "Tous les champs obligatoires doivent être remplis." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (!isValidUserType(userType)) {
    return { error: "Type d'utilisateur invalide." };
  }

  // Closed beta gate — non-allowlisted emails get redirected to the
  // request-access page, pre-filling the email.
  if (!isAllowlisted(email)) {
    redirect(`/request-access?email=${encodeURIComponent(email)}`);
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        user_type: userType,
        company: company || null,
        preferred_language: "fr",
      },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, email };
}
