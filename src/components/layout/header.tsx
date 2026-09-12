import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

interface HeaderProps {
  email: string | null;
  fullName: string | null;
  role: string | null;
}

export function Header({ email, fullName, role }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
      <MobileNav />
      <div className="flex-1" />
      <ThemeToggle />
      <UserMenu email={email} fullName={fullName} role={role} />
    </header>
  );
}
