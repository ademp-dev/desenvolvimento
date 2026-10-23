// Utilitários de endereço de e-mail (sem dependências de banco).

/** Extrai o e-mail de "Nome <email@x>" ou devolve o próprio texto se já for um e-mail. */
export function extractEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  const raw = angle ? angle[1] : value.trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(raw) ? raw.toLowerCase() : null;
}
