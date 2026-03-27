import { PASSWORD_RULES } from '@/utils/passwordValidation';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const total = PASSWORD_RULES.length;
  const percentage = (passed / total) * 100;

  const barColor =
    percentage <= 40
      ? 'bg-destructive'
      : percentage <= 80
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className="space-y-2">
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <ul className="space-y-1">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-muted-foreground'}`}
            >
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
