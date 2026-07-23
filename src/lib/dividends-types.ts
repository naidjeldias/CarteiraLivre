export interface FiiDividendRow {
  label: string;
  rate: number;
  paymentDate: string;
  lastDatePrior?: string;
  relatedTo?: string | null;
}
