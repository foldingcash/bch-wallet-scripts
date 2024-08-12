import { ElectrumNetworkProvider } from 'cashscript';

import getWallet from './getWallet.js';
import { promptInt, prompt } from './prompt.js';

import config from './config.json' assert { type: 'json' };

const provider = new ElectrumNetworkProvider(config.Network);

async function showUTXOs(){

    const address = prompt('Address: ');
    const wallet = await getWallet();
    const inputs = await provider.getUtxos(address);

    console.log(`Found '${inputs.length}' UTXOs`);

    inputs.forEach((i, index) => {
        console.log(`Input (${index}): `, i);
    })
}

async function main() {
    let exit = false;
    do {
        const menu = `Menu:
    1: Show UTXOs
    2: Exit
    
Choose Selection: `;
        console.log(menu);
        const response = promptInt();
        console.log('response', response);

        switch(response) {
            case 1:
                console.log('showing utxos');
                await showUTXOs();
                break;
            case 2:
                exit = true;
                break;
        }
    } while(!exit);
}

try {
    await main();
} catch(error) {
    console.error('An unhandled exception was thrown: ', error.message);
    console.error(error);
}