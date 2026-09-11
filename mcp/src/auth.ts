export interface SecretBindings {
  AREA67_API_TOKEN?: string;
  AREA67_OWNER_ID?: string;
}

export interface Principal {
  ownerId: string;
  authMode: "development_token";
}

export async function authorizeRequest(
  request: Request,
  env: Cloudflare.Env & SecretBindings,
): Promise<Principal | null> {
  const expected = env.AREA67_API_TOKEN;
  if (!expected || expected.length < 24) return null;
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const supplied = authorization.slice(7);
  const encoder = new TextEncoder();
  const suppliedBytes = encoder.encode(supplied);
  const expectedBytes = encoder.encode(expected);
  if (suppliedBytes.byteLength !== expectedBytes.byteLength) return null;
  const valid = crypto.subtle.timingSafeEqual(suppliedBytes, expectedBytes);
  if (!valid) return null;
  return {
    ownerId: env.AREA67_OWNER_ID?.trim() || "jorge",
    authMode: "development_token",
  };
}
