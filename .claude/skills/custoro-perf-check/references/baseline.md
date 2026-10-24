# Baseline: `main` at dbdeeda (after PR 7)

Median of 6 warm runs, executor time, `scripts/explain-bench.sh run` with `references/statements.example.sql`, on one Mac in Docker, 2026-10-24. Data: `gen-volume.sql` on a fresh `01-schema.sql` + `02-seed.sql`: 2000 customers, 500 products, 50 000 invoices, 250 000 lines, 100 000 worksheets (MySQL also holds the demo rows and a few test rows).

These numbers are only a yardstick for "is this the right order of magnitude". Measure `main` on your own machine before comparing a branch.

| Statement                         | MySQL 8.4.11 | MariaDB 11.4.13 |
| --------------------------------- | -----------: | --------------: |
| invoice list, page 1              |     0.048 ms |        0.072 ms |
| invoice list, page 1350           |      3.42 ms |         3.60 ms |
| invoice list, total               |      2.29 ms |         3.06 ms |
| invoice list, keyword search      |      9.41 ms |         5.48 ms |
| lines of one invoice              |     0.006 ms |        0.009 ms |
| public PDF lookup by hash         |   < 0.001 ms |      < 0.001 ms |
| worksheets by customer, page 1    |      9.32 ms |         8.21 ms |
| worksheets by customer, page 100  |      9.80 ms |         7.79 ms |
| worksheets by customer, total     |      0.73 ms |         4.42 ms |
| customer picker (up to 1000 rows) |      1.48 ms |         1.09 ms |
| product picker (up to 1000 rows)  |      0.44 ms |         0.18 ms |

For comparison, the same deep invoice page before PR 7 (join first, then sort and skip 26 980 rows) measured 24.6 ms on MySQL and 21.4 ms on MariaDB here, 7.6 and 7.0 times slower than the deferred join now in `getInvoices`. Both return the same 20 rows (`digest` checksums are equal).
