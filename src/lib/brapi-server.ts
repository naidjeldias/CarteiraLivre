export function getBrapiToken(): string | undefined {
  return process.env.BRAPI_TOKEN?.trim() || undefined;
}

export function brapiHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export function isValidB3Ticker(ticker: string): boolean {
  return /^[A-Z]{4}\d{1,2}[A-Z]?$/.test(ticker.trim().toUpperCase());
}
