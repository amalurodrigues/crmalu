import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash de senha com scrypt do próprio Node.
 *
 * scrypt em vez de bcrypt/argon2 por dois motivos. O primeiro é que ele já vem
 * no runtime: `packages/*` deste repo já quebrou dois deploys por dependência
 * usada e não declarada, e a melhor dependência é a que não existe. O segundo é
 * que scrypt é deliberadamente caro em MEMÓRIA, não só em CPU — é o que torna
 * ataque por GPU ou ASIC pouco vantajoso, que é exatamente a ameaça contra um
 * banco de senhas vazado.
 *
 * Os parâmetros ficam gravados dentro do próprio hash. Quando o custo precisar
 * subir (hardware fica mais rápido todo ano), hashes antigos continuam
 * verificáveis com os parâmetros com que nasceram, e cada senha migra sozinha
 * no próximo login. Sem isso, aumentar o custo obrigaria a resetar todo mundo.
 */
const SCRYPT_N = 16384; // 2^14 — ~16 MB de memória por verificação
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Verificação em tempo constante.
 *
 * `timingSafeEqual` em vez de `===`: comparação normal para no primeiro byte
 * diferente, e a diferença de microssegundos entre "errou no 1º byte" e "errou
 * no 30º" é mensurável pela rede. Com tempo suficiente isso deixa descobrir o
 * hash byte a byte.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");

  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false; // parâmetros corrompidos no banco
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
