// @flow

import invariant from 'assert';

import {Connection} from '../connection';
import {Transaction} from '../transaction';
import {sleep} from './sleep';
import type {Account} from '../account';
import type {TransactionSignature} from '../transaction';
import {DEFAULT_TICKS_PER_SLOT, NUM_TICKS_PER_SECOND} from '../timing';

/**
 * 签名，发送并确认交易
 */
export async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  ...signers: Array<Account>
): Promise<TransactionSignature> {
  let sendRetries = 10;
  let signature;
  for (;;) {
    const start = Date.now();
    signature = await connection.sendTransaction(transaction, ...signers);

    // 等待几个插槽进行确认
    let status = 'SignatureNotFound';
    let statusRetries = 6;
    for (;;) {
      status = await connection.getSignatureStatus(signature);
      if (status !== 'SignatureNotFound') {
        break;
      }

      if (--statusRetries <= 0) {
        break;
      }
      // 睡了大约半个插槽
      await sleep((500 * DEFAULT_TICKS_PER_SLOT) / NUM_TICKS_PER_SECOND);
    }

    if (status === 'Confirmed') {
      break;
    }
    if (--sendRetries <= 0) {
      const duration = (Date.now() - start) / 1000;
      throw new Error(
        `Transaction '${signature}' was not confirmed in ${duration.toFixed(
          2,
        )} seconds (${status})`,
      );
    }

    if (status !== 'AccountInUse' && status !== 'SignatureNotFound') {
      throw new Error(`Transaction ${signature} failed (${status})`);
    }

    // 在0..100ms内重试以尝试避免另一个AccountInUse冲突
    await sleep(Math.random() * 100);
  }

  invariant(signature !== undefined);
  return signature;
}
