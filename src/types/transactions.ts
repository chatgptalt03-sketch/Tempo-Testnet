export interface Transaction {
  hash: string;
  status: 'pending' | 'success' | 'failed';
  createdAt: number;
}
