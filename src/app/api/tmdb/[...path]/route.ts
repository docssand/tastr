import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/**
 * TMDB accetta due credenziali diverse, con schemi di autenticazione non interscambiabili:
 * la API Key v3 (32 caratteri esadecimali) va in query string come `api_key`, mentre
 * l'API Read Access Token v4 (un JWT) va nell'header `Authorization: Bearer`.
 * Usare lo schema sbagliato fa rispondere `status_code: 7` ("Invalid API key"),
 * quindi scegliamo in base al formato invece di imporne uno.
 */
const V3_API_KEY = /^[0-9a-f]{32}$/i;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/tmdb/[...path]">) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    // 503 e non 500: il client lo tratta come errore di configurazione, non come intoppo da ritentare.
    return NextResponse.json({ error: "TMDB_API_KEY non configurata sul server." }, { status: 503 });
  }

  const { path } = await ctx.params;
  const url = new URL(`${TMDB_BASE_URL}/${path.join("/")}`);
  url.search = request.nextUrl.search;

  const headers: HeadersInit = { accept: "application/json" };
  if (V3_API_KEY.test(apiKey)) {
    url.searchParams.set("api_key", apiKey);
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, { headers });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
