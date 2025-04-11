- To run some bash command:
```bash
pnpm --filter=@cryptoalgebra/abstract-plugin exec -- npx hardhat init
```

- To update some package everywhere:
```bash
- pnpm -r up @cryptoalgebra/integral-core@1.2.2
```

- To "link" local packages together:
```bash
- pnpm add @cryptoalgebra/base-plugin --workspace --filter=@cryptoalgebra/volatility-oracle-plugin
```