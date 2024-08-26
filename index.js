import { ElectrumNetworkProvider, TransactionBuilder } from 'cashscript';
import {
    instantiateSha256,
    utf8ToBin
  } from '@bitauth/libauth';

import getWallet from './getWallet.js';
import { promptInt, prompt, promptBool } from './prompt.js';

import config from './config.json' assert { type: 'json' };

const Dust = 1000n;

const provider = new ElectrumNetworkProvider(config.Network);
const sha256 = await instantiateSha256();

async function sendTransaction(buildFunc) {
    let transaction = buildFunc(Dust * 2n);
    const transactionHex = await transaction.build();
    const transactionBytes = BigInt(transactionHex.length) / 2n;
    transaction = buildFunc(transactionBytes + 1n);

    const shouldSend = promptBool('Send transaction (no)? ', 'false');
    if (shouldSend) {
        console.log('broadcasting transaction...');
        const response = await transaction.send();
        console.log(response);
    } else {
        console.log('skipping broadcasting transaction...');
        console.log(`transaction hex: ${await transaction.build()}`)
        console.log('transaction', transaction);
        transaction.inputs.forEach(input => {
            console.log('token input', input.token)
        });
        transaction.outputs.forEach(output => {
            console.log('token output', output.token)
        });
    }
}

async function showUTXOs() {
    const { address: walletAddress } = await getWallet();
    const address = prompt(`Address: ${walletAddress}`, walletAddress);
    const inputs = await provider.getUtxos(address);

    console.log(`Found '${inputs.length}' UTXOs`);

    inputs.forEach((i, index) => {
        console.log(`Input (${index}): `, i);
    });
}

async function sendAuthHead() {
    const { address } = await getWallet();
    const inputs = await provider.getUtxos(address);

    console.log(`Found '${inputs.length}' UTXOs`);

    inputs.forEach((i, index) => {
        console.log(`Input (${index}): `, i);
    });

    let inputIndex;
    do {
        inputIndex = promptInt('Which input: ', 0);
    } while (inputIndex >= inputs.length);

    const input = inputs[inputIndex];

    if (input.satoshis <= Dust * 4) {
        throw Error('Need more than 4000 satoshis to preform this action.');
    }

    const sendAuthHeadTo = prompt('Send auth head to: ');

    const build = (fee) => {
        const builder = new TransactionBuilder({ provider });
        builder
            .addInput(input, signatureTemplate.unlockP2PKH())
            .addOutput({
                to: sendAuthHeadTo,
                amount: Dust,
            })
            .addOutput({
                to: address,
                amount: input.satoshis - Dust - fee,
                token: input.token,
            });
        return builder;
    }

    await sendTransaction(build);
}

async function updateTokenBcmr() {
    const { address } = await getWallet();
    const inputs = await provider.getUtxos(address);

    console.log(`Found '${inputs.length}' UTXOs`);

    inputs.forEach((i, index) => {
        console.log(`Input (${index}): `, i);
    });

    let inputIndex;
    do {
        inputIndex = promptInt('Which input: ', 0);
    } while (inputIndex >= inputs.length);

    const input = inputs[inputIndex];

    if (input.satoshis <= Dust * 4) {
        throw Error('Need more than 4000 satoshis to preform this action.');
    }

    const sendAuthHeadTo = prompt('Send auth head to: ');
    const bcmrUrl = prompt('BCMR url: ');

    const serverResponse = await fetch(new URL(bcmrUrl));

    if (serverResponse.status != 200) {
        throw Error('Unable to continue, there was a problem getting the bcmr meta data', serverResponse);
    }

    const bcmrMeta = await serverResponse.text();
    const bcmrHash = sha256.hash(utf8ToBin(bcmrMeta));

    const build = (fee) => {
        const builder = new TransactionBuilder({ provider });
        builder
            .addInput(input, signatureTemplate.unlockP2PKH())
            .addOutput({
                to: sendAuthHeadTo,
                amount: Dust,
            })
            addOpReturnOutput(['BCMR', bcmrHash, bcmrUrl])
            .addOutput({
                to: address,
                amount: input.satoshis - Dust - fee,
                token: input.token,
            });
        return builder;
    }

    await sendTransaction(build);
}

async function main() {
    let exit = false;
    do {
        const menu = `Menu:
    0: Exit
    1: Show UTXOs
    2: Send Auth Head
    3: Update Token's BCMR
    
Choose Selection: `;
        console.log(menu);
        const response = promptInt('', 0);
        console.log('response', response);

        switch (response) {
            case 1:
                console.log('showing utxos');
                await showUTXOs();
                break;
            case 2:
                console.log('sending auth head to a new address');
                await sendAuthHead();
                break;
            case 3:
                console.log('updating a token BCMR');
                await updateTokenBcmr();
                break;
            case 0:
                exit = true;
                break;
        }
    } while (!exit);
}

try {
    await main();
} catch (error) {
    console.error('An unhandled exception was thrown: ', error.message);
    console.error(error);
}