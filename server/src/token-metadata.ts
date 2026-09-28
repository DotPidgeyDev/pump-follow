interface PumpFunCoin {
    mint: string;
    name: string;
    symbol: string;
    image_uri?: string | null;
    metadata_uri?: string | null;
    usd_market_cap?: number | null;
}

const cache =
    new Map<string, PumpFunCoin>();

const API_BASE =
    'https://frontend-api-v3.pump.fun';

export async function getTokenMetadata(
    mint: string
): Promise<PumpFunCoin | null> {
    const cached =
        cache.get(mint);

    if (cached) {
        return cached;
    }

    const response =
        await fetch(
            `${API_BASE}/coins-v2/${mint}`
        );

    if (!response.ok) {
        console.error(
            `Pump.fun metadata request failed: ${response.status}`
        );

        return null;
    }

    const coin =
        await response.json() as PumpFunCoin;

    cache.set(
        mint,
        coin
    );

    return coin;
}