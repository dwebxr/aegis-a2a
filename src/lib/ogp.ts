/**
 * Fetches the og:image URL from a given page URL.
 * Returns undefined if the page cannot be fetched or no og:image is found.
 */
export async function fetchOgImage(pageUrl: string): Promise<string | undefined> {
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Aegis-A2A-Bot/1.0",
      "Accept": "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return undefined;

  // Read only the first 50KB to find og:image in <head>
  const reader = res.body?.getReader();
  if (!reader) return undefined;

  let html = "";
  const decoder = new TextDecoder();
  const MAX_BYTES = 50_000;

  while (html.length < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  reader.cancel();

  // Match og:image meta tag (both property and name variants, both quote styles)
  const ogMatch = html.match(
    /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogMatch) return ogMatch[1];

  // Reverse attribute order: content before property
  const reverseMatch = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i
  );
  if (reverseMatch) return reverseMatch[1];

  // Fallback: twitter:image
  const twitterMatch = html.match(
    /<meta[^>]+(?:property|name)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  );
  if (twitterMatch) return twitterMatch[1];

  const twitterReverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image["']/i
  );
  if (twitterReverse) return twitterReverse[1];

  return undefined;
}
