import { ElectrumNetworkProvider, TransactionBuilder } from 'cashscript';
import {
    instantiateSha256,
    utf8ToBin,
    binToHex,
    encodePrivateKeyWif,
} from '@bitauth/libauth';

import getWallet from './getWallet.js';
import { promptInt, prompt, promptBool } from './prompt.js';

import config from './config.json' assert { type: 'json' };

const Dust = 1000n;

const { address, signatureTemplate } = await getWallet();

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
    const inputAddress = prompt(`Address: ${address}`, address);
    const inputs = await provider.getUtxos(inputAddress);

    console.log(`Found '${inputs.length}' UTXOs`);

    inputs.forEach((i, index) => {
        console.log(`Input (${index}): `, i);
    });
}

async function sendAuthHead() {
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

    if (input.satoshis <= Dust * 4n) {
        console.log('Need more than 4000 satoshis to preform this action.');
        return;
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

    if (input.satoshis <= Dust * 2n) {
        console.log('Need more than 2000 satoshis to perform this action.');
        return;
    }

    if (!!input.token) {
        console.log('Token support is not available for this command');
        return;
    }

    const bcmrUrl = prompt('BCMR url: ');

    if (!bcmrUrl.startsWith('https://')) {
        console.log('Only HTTPS is supported....the url should start with "https://"');
        return;
    }

    if (bcmrUrl.endsWith('/')) {
        console.log('Url not expected to end in "/"...try again or enhance this script to support this url');
        return;
    }

    const serverResponse = await fetch(new URL(bcmrUrl));

    if (serverResponse.status != 200) {
        console.log('Unable to continue, there was a problem getting the bcmr meta data', serverResponse);
        return;
    }

    const bcmrMeta = await serverResponse.text();
    const bcmrHash = sha256.hash(utf8ToBin(bcmrMeta));

    const opReturn = {
        bcmrHash: `0x${binToHex(bcmrHash)}`,
        bcmrUrl: bcmrUrl.replace('https://', '').trimEnd(),
    };

    const build = (fee) => {
        const builder = new TransactionBuilder({ provider });
        builder
            .addInput(input, signatureTemplate.unlockP2PKH())
            .addOutput({
                to: address,
                amount: input.satoshis - fee,
            })
            .addOpReturnOutput(['BCMR', opReturn.bcmrHash, opReturn.bcmrUrl]);
        return builder;
    }

    await sendTransaction(build);
}

async function combineInputs() {
    const inputs = await provider.getUtxos(address);

    console.log(`Found '${inputs.length}' UTXOs`);

    if (inputs.length < 2) {
        console.log('Need at least two inputs to combine');
        return;
    }

    inputs.forEach((i, index) => {
        console.log(`Input (${index}): `, i);
    });

    let firstInputIndex;
    do {
        firstInputIndex = promptInt('First input: ', 0);
    } while (firstInputIndex >= inputs.length);

    inputs.forEach((i, index) => {
        if (firstInputIndex === index) {
            return;
        }
        console.log(`Input (${index}): `, i);
    });

    let secondInputIndex;
    do {
        secondInputIndex = promptInt('Second input: ', 0);
    } while (secondInputIndex >= inputs.length);

    const firstInput = inputs[firstInputIndex];
    const secondInput = inputs[secondInputIndex];

    const totalSatoshis = firstInput.satoshis + secondInput.satoshis;

    if (totalSatoshis <= Dust * 4n) {
        console.log('Need more than 4000 satoshis to preform this action.');
        return;
    }

    if (!!firstInput.token && !!secondInput.token) {
        if (firstInput.token?.category !== secondInput.token?.category) {
            console.log('Unable to combine these inputs as you risk losing your tokens, unable to combine different token types');
            return;
        }
    }

    if (!!firstInput.token?.nft || !!secondInput.token?.nft) {
        console.log('Unable to combine these inputs as you risk losing your nfts, unable to combine nfts');
        return;
    }

    let outputToken;
    if (!!firstInput.token || !!secondInput.token) {
        outputToken = {
            amount: (firstInput.token?.amount ?? 0n) + (secondInput.token?.amount ?? 0n),
            category: firstInput.token?.category ?? secondInput.token.category,
        };
    }

    const build = (fee) => {
        const builder = new TransactionBuilder({ provider });
        builder
            .addInput(firstInput, signatureTemplate.unlockP2PKH())
            .addInput(secondInput, signatureTemplate.unlockP2PKH())
            .addOutput({
                to: address,
                amount: totalSatoshis - fee,
                token: outputToken
            });
        return builder;
    }

    await sendTransaction(build);
}

async function encodePrivateKey() {
    const { decodedWif } = await getWallet();
    let network;
    do {
        network = prompt('Network: ');
    } while(network !== 'mainnet' && network !== 'chipnet' && network !== 'testnet');
    const wif = encodePrivateKeyWif(decodedWif.privateKey, network);
    console.log(`${network} encoded WIF`, wif);
}

async function main() {
    let exit = false;
    do {
        const menu = `Menu:
    0: Exit
    1: Show UTXOs
    2: Send Auth Head
    3: Update Token's BCMR
    4: Combine Inputs
    5: Encode Private Key To WIF
    
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
            case 4:
                console.log('combining inputs');
                await combineInputs();
                break;
            case 5:
                console.log('encoding private key to WIF')
                await encodePrivateKey();
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