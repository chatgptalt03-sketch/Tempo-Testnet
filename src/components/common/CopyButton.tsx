import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

export function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();

  return (
    <Button type="button" onClick={() => navigator.clipboard.writeText(value)} variant="outline" size="sm">
      {t('common.copy')}
    </Button>
  );
}
