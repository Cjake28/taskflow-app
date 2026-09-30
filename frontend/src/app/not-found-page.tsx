import { ArrowLeft, House, LogIn } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const signedIn = status === 'authenticated';

  const goBack = () => {
    // No in-app history (e.g. a pasted link): fall back to the home screen.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(signedIn ? '/dashboard' : '/login', { replace: true });
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <title>Page not found · TaskFlow</title>
      <section className="w-full max-w-[460px] rounded-card bg-card px-6 py-11 text-center shadow-card">
        <p
          aria-hidden="true"
          className="mb-3 bg-[linear-gradient(135deg,var(--primary),var(--primary-2))] bg-clip-text text-[88px] leading-none font-extrabold tracking-[-0.05em] text-transparent"
        >
          404
        </p>
        <h1 className="text-lg font-extrabold">This page doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
          The link might be broken, or the page may have moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button variant="secondary" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
            Go back
          </Button>
          <Button asChild>
            {signedIn ? (
              <Link to="/dashboard">
                <House aria-hidden="true" />
                Dashboard
              </Link>
            ) : (
              <Link to="/login">
                <LogIn aria-hidden="true" />
                Log in
              </Link>
            )}
          </Button>
        </div>
      </section>
    </main>
  );
}
