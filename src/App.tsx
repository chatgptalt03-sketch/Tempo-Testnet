import { MainLayout } from '@/components/layout/MainLayout';
import { AppRoutes } from '@/routes';

export default function App() {
  return (
    <MainLayout>
      <AppRoutes />
    </MainLayout>
  );
}
