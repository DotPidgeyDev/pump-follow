const rpcUrl =
    process.env.SOLANA_RPC_URL ??
    'https://api.mainnet-beta.solana.com';

interface RpcResponse<T> {
    result: T;
    error?: {
        code: number;
        message: string;
    };
}

export async function rpcRequest<T>(
    method: string,
    params: unknown[]
): Promise<T> {
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
        }),
    });

    if (!response.ok) {
        throw new Error(
            `Solana RPC request failed: ${response.status}`
        );
    }

    const data =
        await response.json() as RpcResponse<T>;

    if (data.error) {
        throw new Error(data.error.message);
    }

    return data.result;
}