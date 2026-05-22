import { SignUpForm } from "./form";

export const metadata = {
  title: "Créer un compte — Laya",
};

export default function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
        <p className="text-sm text-muted-foreground">
          Laya est en bêta fermée. Si ton email est sur la liste, ton compte
          sera créé immédiatement.
        </p>
      </div>

      <SignUpForm />
    </div>
  );
}
