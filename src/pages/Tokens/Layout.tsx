import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

function tabClassName(isActive: boolean) {
  return cn(
    'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'bg-[#66D121] text-white'
      : 'text-gray-700 hover:bg-[#66D121]/10 hover:text-[#2F6E0C] dark:text-gray-200 dark:hover:bg-[#66D121]/15 dark:hover:text-[#66D121]',
  );
}

export default function TokensLayout() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.tokens.title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('page.tokens.subtitle')}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
          <NavLink
            to="/tokens"
            end
            className={({ isActive }) => tabClassName(isActive)}
          >
            {t('page.tokens.myTokensTab')}
          </NavLink>
              <NavLink
                to="/issuance/create"
                className={({ isActive }) => tabClassName(isActive)}
              >
                {t('page.tokens.issuanceTab')}
              </NavLink>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
