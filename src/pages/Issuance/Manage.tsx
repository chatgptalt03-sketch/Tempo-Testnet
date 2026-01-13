import { TokenManagement } from '@/components/stablecoin/TokenManagement';
import { PolicySettings } from '@/components/stablecoin/PolicySettings';

export default function IssuanceManage() {
  return (
    <div className="space-y-6">
      <TokenManagement />
      <PolicySettings />
    </div>
  );
}
