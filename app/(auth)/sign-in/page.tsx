import { SignInForm } from "./form";

export const metadata = {
  title: "Connexion — Laya",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/" } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-sm text-muted-foreground">
          Bon retour. Entre tes identifiants pour continuer.
        </p>
      </div>

      <SignInForm next={next} />
    </div>
  );
}
