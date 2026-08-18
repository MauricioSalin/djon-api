export function firstMaterialImage(body?: string) {
  if (!body) return undefined;

  const match =
    /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i.exec(body);

  return match?.slice(1).find(Boolean)?.trim() || undefined;
}
