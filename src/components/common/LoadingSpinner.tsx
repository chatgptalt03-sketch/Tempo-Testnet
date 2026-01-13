import { useI18n } from '@/lib/i18n';

export function LoadingSpinner() {
  const { t } = useI18n();
  return <div>{t('common.loading')}</div>;
}
