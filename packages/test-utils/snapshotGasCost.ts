import { TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';
import { expect } from './expect';
import { Contract, ContractTransactionResponse } from 'ethers';

// Set by scripts/mutate.js: the transaction still runs, only the gas comparison is skipped
const SKIP = !!process.env.SKIP_GAS_SNAPSHOTS;
const matchGas = (gas: number) => {
  if (!SKIP) expect(gas).toMatchSnapshot();
};

export default async function snapshotGasCost(
  x:
    | TransactionResponse
    | Promise<TransactionResponse>
    | ContractTransactionResponse
    | Promise<ContractTransactionResponse>
    | TransactionReceipt
    | Promise<BigInt>
    | BigInt
    | Promise<bigint>
    | bigint
    | Contract
    | Promise<Contract>
): Promise<void> {
  const resolved = await x;
  if (typeof resolved == 'bigint' || resolved instanceof BigInt || resolved instanceof Number) {
    matchGas(Number(resolved));
  } else if ('deploymentTransaction' in resolved) {
    const receipt = await resolved.deploymentTransaction()?.wait();
    if (receipt) {
      matchGas(Number(receipt.gasUsed));
    } else {
        console.warn('⚠️Deployment transaction returned null. Skipping gas usage snapshot.\n', new Error().stack);
    }
  } else if ('wait' in resolved) {
    const waited = await resolved.wait();
    if (waited) {
        matchGas(Number(waited.gasUsed));
    } else {
        console.warn('⚠️Transaction returned null. Skipping gas usage snapshot.\n', new Error().stack);
    }
  }
}
