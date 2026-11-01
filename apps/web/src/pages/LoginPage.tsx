import React, { useState } from 'react';
import { Navigate } from '@tanstack/react-router';
import {
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Globe,
  Sun,
  Moon,
} from 'lucide-react';
import { EdgekitLogo } from '../components/common/EdgekitLogo';
import { useAuth } from '../context/auth-context';
import { useI18n } from '../i18n/context';
import { useTheme } from '../theme/context';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const LoginPage: React.FC = () => {
  const { isAuthenticated, isLoading, login, isLoggingIn, error: authError } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [apiKey, setApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background text-foreground gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-500 animate-pulse">
          <EdgekitLogo module="queue" size={28} />
        </div>
        <p className="text-xs text-muted-foreground animate-pulse">{t.common.loading}</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmed = apiKey.trim();
    if (!trimmed) {
      setLocalError(t.login.invalidKey);
      return;
    }

    const success = await login(trimmed);
    if (!success) {
      setLocalError(authError || t.login.invalidKey);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-8 select-none">
      {/* Language & Theme Controls Top Right */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          <Globe className="size-3.5" />
          <span className="font-semibold text-[10px] uppercase bg-muted px-1 py-0.5 rounded border border-border/70">
            {locale === 'pt-BR' ? 'PT-BR' : 'EN'}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label={t.navbar.themeTooltip}
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="size-4 text-pink-500" />
          ) : (
            <Sun className="size-4 text-amber-500" />
          )}
        </Button>
      </div>

      <div className="w-full max-w-sm space-y-6">
        {/* Logo and Product Title */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-500 shadow-lg shadow-pink-500/10 mb-1">
            <EdgekitLogo module="queue" size={32} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-bold tracking-tight text-foreground">Edgekit</span>
            <span className="text-xl font-semibold text-pink-500">Queue</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">{t.login.subtitle}</p>
        </div>

        {/* Login Card */}
        <Card className="border-border shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="size-4 text-pink-500" />
              <span>Autenticação de Acesso</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Informe a chave de API configurada no seu Worker.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {displayError && (
                <Alert variant="destructive" className="py-2.5 px-3">
                  <AlertCircle className="size-4" />
                  <AlertDescription className="text-xs">{displayError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="apiKey" className="text-xs font-medium">
                  {t.login.apiKeyLabel}
                </Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showPassword ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t.login.apiKeyPlaceholder || "eq_..."}
                    className="pr-9 font-mono text-xs"
                    required
                  />
                  <button
                    type="button"
                    aria-label="Alternar visibilidade da chave"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">{t.login.defaultKeyHint}</p>
              </div>

              <Button
                type="submit"
                disabled={isLoggingIn || !apiKey.trim()}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white font-medium text-xs h-9 transition-colors gap-2"
              >
                {isLoggingIn && <Loader2 className="size-3.5 animate-spin" />}
                <span>{isLoggingIn ? t.login.authenticating : t.login.submit}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-[11px] text-muted-foreground">
          Open Source Cloudflare Workers & SQLite Durable Objects
        </p>
      </div>
    </div>
  );
};
