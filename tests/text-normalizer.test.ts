import test from "node:test";
import assert from "node:assert/strict";

import { cleanExtractedText } from "@/lib/normalization/text-normalizer";

test("preserva unicode válido e repara mojibake óbvio sem requebrar texto correto", () => {
  const simpleMojibake = Buffer.from("é", "utf8").toString("latin1");
  const doubleMojibake = Buffer.from(simpleMojibake, "utf8").toString("latin1");

  assert.equal(cleanExtractedText("O que é Inventário?"), "O que é Inventário?");
  assert.equal(cleanExtractedText("Gestão dos Estoques"), "Gestão dos Estoques");
  assert.equal(
    cleanExtractedText("Alteração de Pedidos Pães Industrializados"),
    "Alteração de Pedidos Pães Industrializados",
  );
  assert.equal(
    cleanExtractedText("Inventário é a contagem das mercadorias físicas."),
    "Inventário é a contagem das mercadorias físicas.",
  );
  assert.equal(cleanExtractedText(`O que ${simpleMojibake} Inventário?`), "O que é Inventário?");
  assert.equal(cleanExtractedText(`O que ${doubleMojibake} Inventário?`), "O que é Inventário?");
});
