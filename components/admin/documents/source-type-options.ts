export const SOURCE_TYPE_OPTIONS = [
  { value: "loi", label: "Loi" },
  { value: "decret", label: "Décret" },
  { value: "convention", label: "Convention collective" },
  { value: "arrete", label: "Arrêté" },
  { value: "handbook", label: "Manuel / Guide" },
  { value: "doctrine", label: "Doctrine / Commentaire" },
] as const;

export type SourceTypeValue = (typeof SOURCE_TYPE_OPTIONS)[number]["value"];

export function sourceTypeLabel(value: string | null | undefined): string {
  const hit = SOURCE_TYPE_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? value ?? "—";
}
