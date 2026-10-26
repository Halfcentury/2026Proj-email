import Link from "next/link";
import { BRAND_NAME } from "@/utils/branding";
export function BasicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto max-w-6xl px-6 py-6">
        <Link href="/mail" className="font-semibold">
          {BRAND_NAME}
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}
