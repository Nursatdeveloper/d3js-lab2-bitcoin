"""Сборка data/bitcoin_monthly.csv из открытого API blockchain.com.

Скачивает дневные ряды пяти метрик сети Bitcoin, усредняет их по месяцам
и сохраняет в CSV. Нужен только стандартный Python 3.

    python tools/build_csv.py
"""
import collections
import datetime
import json
import os
import urllib.request

CHARTS = {
    "market-price": "price_usd",
    "n-transactions": "transactions_per_day",
    "hash-rate": "hash_rate_ehs",
    "avg-block-size": "avg_block_size_mb",
    "transaction-fees-usd": "fees_usd_per_day",
}
START_MONTH = "2019-01"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "bitcoin_monthly.csv")


def fetch(chart):
    url = f"https://api.blockchain.info/charts/{chart}?timespan=all&sampled=true&format=json"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)["values"]


def main():
    by_month = collections.defaultdict(lambda: collections.defaultdict(list))
    for chart, column in CHARTS.items():
        for point in fetch(chart):
            ts = datetime.datetime.fromtimestamp(point["x"], datetime.timezone.utc)
            by_month[ts.strftime("%Y-%m")][column].append(point["y"])

    current = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m")
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        fh.write("month," + ",".join(CHARTS.values()) + "\n")
        for month in sorted(by_month):
            # Пропускаем ранние и текущий (неполный) месяц
            if month < START_MONTH or month >= current:
                continue
            avg = {k: sum(v) / len(v) for k, v in by_month[month].items()}
            if len(avg) < len(CHARTS):
                continue
            row = [
                month,
                round(avg["price_usd"], 2),
                round(avg["transactions_per_day"]),
                round(avg["hash_rate_ehs"] / 1e6, 2),  # TH/s -> EH/s
                round(avg["avg_block_size_mb"], 3),
                round(avg["fees_usd_per_day"]),
            ]
            fh.write(",".join(map(str, row)) + "\n")


if __name__ == "__main__":
    main()
