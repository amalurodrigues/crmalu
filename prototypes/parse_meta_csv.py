"""
Parser de export CSV do Meta Ads Manager -> tabela normalizada.

v2: espera o template de exportação com IDs (Identificação da campanha /
conjunto / anúncio) e quebra diária (coluna "Dia"). Se essas colunas não
existirem no arquivo, cai no modo v1 (chave por nome, período único) e avisa.

PROTÓTIPO DE VALIDAÇÃO. A lógica aqui (chave, SUM/SUM, null-safe division,
parsing de tags de nomenclatura) é a que packages/metrics e o adapter de CSV
devem replicar em TypeScript na Fase 1. Ver:
  - docs/02-modelo-de-dados.md   (grão das tabelas de fato)
  - docs/04-camada-de-metricas.md (regra SUM/SUM, nunca média de média)
  - docs/03-ingestao-csv-meta-ads.md (este parser, formalizado)
  - docs/09-qa-reconciliacao.md  (tolerância de 0,5% em spend/impressões)

Uso:
  python3 parse_meta_csv.py caminho/do/export.csv
"""
import sys
import re
import csv
from dataclasses import dataclass, field
from collections import defaultdict

NULL_MARKERS = {"–", "-", "", "N/A", "n/a"}
REQUIRED_ID_COLS = {
    "Identificação da campanha",
    "Identificação do conjunto de anúncios",
    "Identificação do anúncio",
}


def to_null(value: str):
    return None if value.strip() in NULL_MARKERS else value.strip()


def to_number(value: str):
    v = to_null(value)
    return float(v) if v is not None else None


ATTRIBUTION_MAP = {
    "Clique de 7 dias ou visualização de 1 dia": "7d_click_1d_view",
    "Clique de 7 dias": "7d_click",
    "Clique de 1 dia": "1d_click",
}


def normalize_attribution(raw: str) -> str:
    return ATTRIBUTION_MAP.get(raw.strip(), raw.strip())


def extract_currency(header_row: list[str]) -> str:
    """'Valor gasto (BRL)' -> 'BRL'. A moeda vem embutida no cabeçalho,
    não numa coluna — se a conta mudar de moeda, o header muda e isto
    precisa ser revisitado."""
    for col in header_row:
        m = re.search(r"Valor gasto \((\w{3})\)", col)
        if m:
            return m.group(1)
    raise ValueError("Não encontrei a coluna 'Valor gasto (XXX)' — cabeçalho mudou?")


def extract_tags(adset_name: str) -> list[str]:
    """'[EstágioProbatório][Whatsapp][Frio]' -> ['EstágioProbatório','Whatsapp','Frio']
    Padrão observado: [Vertical][Canal][Temperatura de público]."""
    return re.findall(r"\[(.*?)\]", adset_name)


@dataclass
class AdRow:
    ad_id: str | None          # chave real quando disponível
    campaign_id: str | None
    adset_id: str | None
    ad_name: str
    adset_name: str
    natural_key: str           # ad_id se disponível, senão adset_name::ad_name
    date: str | None           # None se o export for período único (v1)
    status: str
    result_type: str | None
    results: float
    spend: float
    impressions: int
    reach: int                 # NÃO somar entre linhas — públicos se sobrepõem
    attribution_window: str
    currency: str
    hook_rate: float | None    # já vem como razão pronta do Meta, não como contagem bruta
    vertical: str | None
    canal: str | None
    temperatura: str | None
    period_start: str
    period_end: str


def parse(path: str) -> tuple[list[AdRow], bool]:
    """Retorna (linhas, modo_com_id). modo_com_id=False dispara aviso no report()."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        currency = extract_currency(header)
        spend_col = next(c for c in header if c.startswith("Valor gasto"))
        has_ids = REQUIRED_ID_COLS.issubset(set(header))
        has_day = "Dia" in header

        rows = []
        for r in reader:
            tags = extract_tags(r["Nome do conjunto de anúncios"])
            vertical = tags[0] if len(tags) > 0 else None
            canal = tags[1] if len(tags) > 1 else None
            temperatura = tags[2] if len(tags) > 2 else None

            ad_id = to_null(r["Identificação do anúncio"]) if has_ids else None
            natural_key = ad_id or f"{r['Nome do conjunto de anúncios']}::{r['Nome do anúncio']}"

            rows.append(AdRow(
                ad_id=ad_id,
                campaign_id=to_null(r["Identificação da campanha"]) if has_ids else None,
                adset_id=to_null(r["Identificação do conjunto de anúncios"]) if has_ids else None,
                ad_name=r["Nome do anúncio"],
                adset_name=r["Nome do conjunto de anúncios"],
                natural_key=natural_key,
                date=to_null(r["Dia"]) if has_day else None,
                status=r["Status de veiculação"],
                result_type=to_null(r["Tipo de resultado"]),
                results=to_number(r["Resultados"]) or 0,
                spend=to_number(r[spend_col]) or 0,
                impressions=int(to_number(r["Impressões"]) or 0),
                reach=int(to_number(r["Alcance"]) or 0),
                attribution_window=normalize_attribution(r["Configuração de atribuição"]),
                currency=currency,
                hook_rate=to_number(r["Hook"]),
                vertical=vertical,
                canal=canal,
                temperatura=temperatura,
                period_start=r["Início dos relatórios"],
                period_end=r["Encerramento dos relatórios"],
            ))
    return rows, has_ids


def cpa(spend: float, results: float):
    """Null-safe. CPA de 0 resultado é indefinido, não é R$ 0,00."""
    return spend / results if results > 0 else None


def report(rows: list[AdRow], has_ids: bool):
    # com quebra diária, "Início/Encerramento dos relatórios" repete o próprio
    # dia da linha — o período real do arquivo é o min/max de "Dia".
    if rows[0].date:
        periodo = f"{min(r.date for r in rows)} a {max(r.date for r in rows)}"
    else:
        periodo = f"{rows[0].period_start} a {rows[0].period_end}"
    print(f"\n{len(rows)} linhas lidas | moeda: {rows[0].currency} | "
          f"janela: {rows[0].attribution_window} | período: {periodo}\n")

    if has_ids:
        print("✓ Export com IDs — chave = Identificação do anúncio. "
              "Nomes reaproveitados entre conjuntos não são mais um problema.\n")
    else:
        # aviso de colisão de chave — natural_key vs nome de anúncio isolado
        by_ad_name = defaultdict(list)
        for r in rows:
            by_ad_name[r.ad_name].append(r.adset_name)
        colisoes = {k: v for k, v in by_ad_name.items() if len(set(v)) > 1}
        if colisoes:
            print("⚠ Export sem ID — nomes de anúncio reaproveitados em conjuntos "
                  "diferentes (nome do anúncio sozinho NÃO é chave confiável):")
            for name, adsets in colisoes.items():
                print(f"  '{name}' aparece em: {sorted(set(adsets))}")
            print()

    if rows[0].date:
        # idempotência: (ad_id, date) deve ser único — é o que garante upsert seguro
        by_key_date = defaultdict(int)
        for r in rows:
            by_key_date[(r.natural_key, r.date)] += 1
        dup = {k: v for k, v in by_key_date.items() if v > 1}
        if dup:
            print(f"⚠ {len(dup)} combinações (entidade, dia) duplicadas — "
                  f"upsert vai colidir. Investigar antes de importar.\n")
        else:
            print(f"✓ Grão diário confirmado: {len(by_key_date)} combinações "
                  f"(entidade, dia) únicas — pronto para upsert idempotente.\n")

        # série temporal por entidade — o que a quebra por dia destrava
        by_entity_day = defaultdict(dict)
        names = {}
        for r in rows:
            by_entity_day[r.natural_key][r.date] = r.spend
            names[r.natural_key] = f"{r.ad_name} ({r.vertical})"
        print("Série de gasto diário por anúncio:")
        all_dates = sorted({r.date for r in rows})
        for key, by_date in by_entity_day.items():
            serie = "  ".join(f"{d[-2:]}/08=R${by_date.get(d,0):.2f}" for d in all_dates)
            print(f"  {names[key]:45s} {serie}")
        print()

    # agregação correta por vertical: SUM/SUM, nunca média de "Custo por resultado"
    by_vertical = defaultdict(lambda: {"spend": 0.0, "results": 0.0})
    for r in rows:
        key = r.vertical or "(sem tag)"
        by_vertical[key]["spend"] += r.spend
        by_vertical[key]["results"] += r.results

    print("CPA por vertical (SUM spend / SUM resultados — método correto):")
    for v, agg in by_vertical.items():
        c = cpa(agg["spend"], agg["results"])
        c_str = f"R$ {c:.2f}" if c is not None else "—"
        print(f"  {v:20s} spend=R$ {agg['spend']:.2f}  resultados={agg['results']:.0f}  CPA={c_str}")

    total_spend = sum(r.spend for r in rows)
    total_results = sum(r.results for r in rows)
    total_reach_soma_errada = sum(r.reach for r in rows)
    print(f"\nTotal geral: spend=R$ {total_spend:.2f} resultados={total_results:.0f} "
          f"CPA={cpa(total_spend, total_results):.2f}")
    print(f"⚠ Soma ingênua de 'Alcance' entre anúncios = {total_reach_soma_errada} "
          f"— NÃO é o alcance real do conjunto (públicos se sobrepõem). "
          f"Não existe, neste export, uma forma correta de obter reach agregado; "
          f"isso exige export separado por período no nível campanha/conjunto.")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        print("Uso: python3 parse_meta_csv.py caminho/do/export.csv")
        sys.exit(1)
    rows, has_ids = parse(path)
    report(rows, has_ids)
