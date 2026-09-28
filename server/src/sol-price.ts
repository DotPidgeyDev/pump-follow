interface SolPriceResponse {
    solPrice: number;
}

const API_URL =
    'https://frontend-api-v3.pump.fun/sol-price';

let cachedPrice: number | null = null;
let cachedAt = 0;

const CACHE_DURATION_MS = 60_000;

export async function getSolPrice(): Promise<number> {
    const now = Date.now();

    if (
        cachedPrice !== null &&
        now - cachedAt < CACHE_DURATION_MS
    ) {
        return cachedPrice;
    }

    const response = await fetch(API_URL);

    if (!response.ok) {
        throw new Error(
            `SOL price request failed: ${response.status}`
        );
    }

    const data =
        await response.json() as SolPriceResponse;

    if (
        typeof data.solPrice !== 'number' ||
        !Number.isFinite(data.solPrice)
    ) {
        throw new Error(
            'Invalid SOL price returned by Pump.fun'
        );
    }

    cachedPrice = data.solPrice;
    cachedAt = now;

    return cachedPrice;
}