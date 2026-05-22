"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { isValidUserType } from "@/lib/auth/user-types";

export type RequestAccessState =
  | { error: string }
  | { success: true }
  | undefined;

export async function requestAccessAction(
  _prev: RequestAccessState,
  formData: FormData,
): Promise<RequestAccessState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const userType = String(formData.get("user_type") ?? "");
  const company = String(formData.get("company") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!email || !userType) {
    return { error: "Email et profil sont requis." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Adresse email invalide." };
  }
  if (!isValidUserType(userType)) {
    return { error: "Profil invalide." };
  }

  const service = createServiceClient();
  const { error } = await service.from("beta_requests").insert({
    email,
    user_type: userType,
    company: company || null,
    reason: reason || null,
  });

  if (error) {
    return { error: "Impossible d'enregistrer ta demande pour le moment. Réessaie dans quelques minutes." };
  }

  return { success: true };
}
