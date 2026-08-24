import { handlers } from "../../../../auth";

// Precisa de Node: o provider de credenciais usa scrypt e o driver do Postgres.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
