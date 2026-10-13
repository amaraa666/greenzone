export function imageUrlsFromStored(value: string | null) {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return [value];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed.slice(0, 3);
    }
  } catch {
    return [value];
  }

  return [value];
}

export function storeImageUrls(urls: string[]) {
  return JSON.stringify(urls.slice(0, 3));
}
