import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <Image
        src="/brand/logo.png"
        alt="Laya"
        width={734}
        height={734}
        priority
        className="h-40 w-40 dark:hidden"
      />
      <Image
        src="/brand/logo-white.png"
        alt="Laya"
        width={734}
        height={734}
        priority
        className="hidden h-40 w-40 dark:block"
      />

      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Bientôt disponible
        </h1>
        <p className="max-w-md text-base text-zinc-600 dark:text-zinc-400">
          Laya est en bêta fermée. Bientôt, l&apos;assistant juridique du droit
          du travail ivoirien — avec citations vérifiables sur chaque réponse.
        </p>
      </div>

      <span className="inline-flex items-center gap-2 rounded-full border border-brand-indigo/20 bg-brand-indigo/5 px-3 py-1 text-xs font-medium text-brand-indigo dark:border-brand-gold/30 dark:bg-brand-gold/10 dark:text-brand-gold">
        <span className="size-1.5 rounded-full bg-brand-indigo dark:bg-brand-gold" />
        Bêta fermée
      </span>
    </main>
  );
}
