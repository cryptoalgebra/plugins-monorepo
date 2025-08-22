### PNPM
**At the project root**

- To run some bash command:
```bash
pnpm --filter=@cryptoalgebra/abstract-plugin exec -- npx hardhat init
```

- To update some package everywhere:
```bash
pnpm -r up @cryptoalgebra/integral-core@1.2.2
```

- To "link" local packages together:
```bash
pnpm add @cryptoalgebra/default-plugin --workspace --filter=@cryptoalgebra/volatility-oracle-plugin
```

### Lerna
**In master branch at the project root**

- To update a version
```bash
npx lerna version --no-private
```
This will find changed packages since its last _tag_

- To publish a new version (executes `lerna version` under the hood)
```bash
npx lerna publish --no-private from-git/from-package
```
with `from-git` flag will publish a new version if there are now such tag in the origin   
with `from-pacakge` flag will publish a new version if it has not been published to npm

## License

Algebra and Algebra Integral smart-contracts is licensed under the Business Source License 1.1 [(BUSL-1.1)](https://github.com/cryptoalgebra/plugins-monorepo/blob/1.2.2-master/LICENSE) and the MIT License (MIT). Licenses for smart contracts are specified in SPDX headers.