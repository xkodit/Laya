import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

        {children}
      </div>
    </main>
  );
}
