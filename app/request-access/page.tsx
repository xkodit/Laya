import Image from "next/image";
import Link from "next/link";
import { RequestAccessForm } from "./form";

export const metadata = {
  title: "Demander l'accès — Laya",
};

export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md space-y-8">
        <Link
          href="/"
          className="flex items-center justify-center"
          aria-label="Retour à l'accueil de Laya"
        >
          <Image
            src="/brand/logo.png"
            alt="Laya"
            width={734}
            height={734}
            priority
            className="h-12 w-12 dark:hidden"
          />
          <Image
            src="/brand/logo-white.png"
            alt="Laya"
            width={734}
            height={734}
            priority
            className="hidden h-12 w-12 dark:block"
          />
        </Link>

        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Laya est en bêta fermée
            </h1>
            <p className="text-sm text-muted-foreground">
              Laisse-nous tes coordonnées — nous reviendrons vers toi dès
              qu&apos;une place se libère.
            </p>
          </div>

          <RequestAccessForm initialEmail={email} />

          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
