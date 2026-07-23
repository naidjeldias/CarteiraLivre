import { FiiDetailView } from "@/components/FiiDetailView";

export default function FiiPage({ params }: { params: { ticker: string } }) {
  const ticker = decodeURIComponent(params.ticker).trim().toUpperCase();
  return <FiiDetailView ticker={ticker} />;
}
