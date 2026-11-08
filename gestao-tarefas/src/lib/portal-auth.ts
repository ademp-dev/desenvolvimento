import { timingSafeEqual } from "node:crypto";

// Autenticação das chamadas do portal ADEMP (ademp.app.br) às rotas /api/portal/*.
// São chamadas servidor-a-servidor: o portal envia "Authorization: Bearer <PORTAL_API_KEY>".

export function portalKeyOk(req: Request): boolean {
  const esperada = process.env.PORTAL_API_KEY ?? "";
  const header = req.headers.get("authorization") ?? "";
  const recebida = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (esperada.length < 32 || recebida.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(recebida), Buffer.from(esperada));
}
