/**
 * Teste de RLS DE VERDADE: roda supabase/tests/rls_familiar.sh contra o
 * Postgres local do Supabase (container supabase_db_voucontigo).
 *
 * Sem o container de pé o teste é pulado — CI sem banco não quebra.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_voucontigo";
const SCRIPT = path.resolve(__dirname, "../../supabase/tests/rls_familiar.sh");

function bancoNoAr(): boolean {
  try {
    const nomes = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return nomes.split("\n").includes(CONTAINER);
  } catch {
    return false;
  }
}

describe.skipIf(!bancoNoAr())("RLS do papel familiar (psql real)", () => {
  it("todas as verificações passam", () => {
    const saida = execFileSync("bash", [SCRIPT], { encoding: "utf8", timeout: 120_000 });
    expect(saida).not.toMatch(/^FAIL \|/m);
    expect(saida).toContain("RESULTADO OK");
  }, 120_000);
});
