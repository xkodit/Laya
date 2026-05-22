export const USER_TYPES = [
  { value: "salarie", label: "Salarié / Employé" },
  { value: "cadre", label: "Cadre / Manager" },
  { value: "rh", label: "RH / DRH" },
  { value: "dirigeant", label: "Dirigeant / Chef d'entreprise" },
  { value: "avocat", label: "Avocat / Juriste" },
  { value: "etudiant", label: "Étudiant en droit" },
  { value: "autre", label: "Autre" },
] as const;

export type UserType = (typeof USER_TYPES)[number]["value"];

const ALLOWED = new Set(USER_TYPES.map((u) => u.value));

export function isValidUserType(v: string): v is UserType {
  return ALLOWED.has(v as UserType);
}
