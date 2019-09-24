/*
local Parity node:
* update Parity (see: https://wiki.parity.io/Setup#one-line-binary-installer ) :
* bash <(curl https://get.parity.io -L)
* curl --data '{"method":"parity_chainStatus","params":[],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST localhost:8545
* parity --min-peers=50 --cache-size=8192 --chain=ropsten
* geth attach ~/.local/share/io.parity.ethereum/jsonrpc.ipc
* */

'use strict';

const appVersion = "1.1.0";

/* ------ Initialize required packages ---------------- */

// https://log4js-node.github.io/log4js-node/
// https://github.com/log4js-node/log4js-node
let log4js = require('log4js');

// https://www.npmjs.com/package/jsonfile
const jsonfile = require('jsonfile');

// https://github.com/axios/axios
const axios = require('axios');

// https://github.com/ethereumjs/ethereumjs-tx
// const Tx = require('ethereumjs-tx');
const Tx = require('ethereumjs-tx').Transaction;

// https://web3js.readthedocs.io/en/v1.2.1/web3.html#id4
const Web3 = require('web3');

/* -------- Set up logs ---------------------------------*/

log4js.configure({
    appenders: {
        everything: {
            // type: 'file',
            type: 'dateFile', // see: https://log4js-node.github.io/log4js-node/dateFile.html
            filename: './logs/all-the-logs.log',
            // pattern: '.yyyy-MM-dd-hh', // new file every hour
            // compress: true, // store in .gz file
        },
        // see: https://log4js-node.github.io/log4js-node/faq.html
        errorsAppender: {
            type: 'dateFile',
            filename: './logs/errors.log',
        },
        errors: {
            type: 'logLevelFilter',
            appender: 'errorsAppender',
            level: 'error'
        },
        out: {
            type: 'stdout'
        } // > https://log4js-node.github.io/log4js-node/stdout.html
    },
    categories: {
        default: {
            appenders: ['everything', 'errors', 'out'],
            level: 'debug' // < 'debug'
        }
    }
});
const logger = log4js.getLogger();

/*
// check logger output:
logger.trace('Entering cheese testing');
logger.debug('Got cheese.');
logger.info('Cheese is Comté.');
logger.warn('Cheese is quite smelly.');
logger.error('Cheese is too ripe!');
logger.fatal('Cheese was breeding ground for listeria.');

// check on https://regex101.com/
const regexForLog = new RegExp('^(\\[)(\\d\\d\\d\\d\-\\d\\d-\\d\\d)(T)(\\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d)(]\\s\\[)([A-Z]+)(]\\s)([a-z]+)(\\s-\\s)(.+)$');
*/

/* ------- Initialize Web3js -------------------------- */

// see: ./config.Example.json
const config = jsonfile.readFileSync("./config.json");

const networkId = "3"; // TODO: Ropsten

/* Infura: */

// const infuraWebsocket = new Web3.providers.WebsocketProvider('wss://' + config.infuraHost[networkId] + '/ws/v3/' + config.infuraProjectId);
// const web3 = new Web3(infuraWebsocket);

const infuraHttp = new Web3.providers.HttpProvider('https://' + config.infuraHost[networkId] + '/v3/' + config.infuraProjectId);
const web3 = new Web3(infuraHttp);

/* Local: */

// const net = require('net');
// const os = require('os');
// const localHttp = new Web3.providers.HttpProvider('http://localhost:8545');
// const localWebsocket = new Web3.providers.WebsocketProvider('ws://localhost:8546');
// const localParityIPC = new Web3.providers.IpcProvider(os.homedir() + '/.local/share/io.parity.ethereum/jsonrpc.ipc', net);

const privateKey = Buffer.from(config.botAccountPrivateKey, 'hex');
const botAddress = config.botAccountAddress;

if (!web3.utils.isAddress(botAddress)) {
    logger.error("Address for bot", botAddress, "is not a valid Ethereum address");
}

// nonce
// we also calculate nonce locally to prevent failing transactions when Infura provides nonce already used
let txCounterLocal = 0; // < should be a number

logger.debug("======== App ver. " + appVersion + " started ========");
logger.debug("NodeJS version: ", process.version);
logger.debug("Web3.version:", web3.version, ", web3 current provider:", web3.currentProvider.constructor.name);
logger.debug("Network:", config.networkName[networkId]);

let factoryContract;

const factoryContractData = {
    address: config.contractAddress[networkId],
};

let cryptosharesContractsAbi;

// Interval to check smart contract state.
// This should be big enough to make sure all transactions sent will be mined before we start the next check.
const intervalInSeconds = 120;
const intervalInMilliseconds = intervalInSeconds * 1000;

// Commission bot will take from the fee set for tx.
// The rest will be used for gas.
const botCommission = 0.1;
// This is the coefficient we use to calculate tx fee for transaction.
const txFeeFactor = 1 - botCommission;

// Minimal gas price at which the transaction makes sense.
const minGasPriceForTxInWei = 5000000000; // 5 Gwei
// const minGasPriceForTxInWei = 1; // for test nets

web3.eth.net.isListening() // here web3 should establish a connection
    .then((result) => {

        logger.debug("Web3 is connected: " + web3.currentProvider.connected + ". Node is listening:", result);

        return web3.eth.getBalance(botAddress);
    })
    .then((result) => {

        logger.debug("Bot address:", botAddress);
        logger.debug(
            "Current balance: ",
            result,
            "Wei",
            "(" + web3.utils.fromWei(result) + " ETH)"
        );

        // get contract ABI from etherscan
        // (works if smart contract code was verified on etherscan)
        return axios.get(
            config.etherscanApiLink[networkId]
            + "api?module=contract&action=getabi&address="
            + factoryContractData.address + "&apikey"
            + config.etherscanApiKeyToken
        );
    })
    .then((result) => {

        if (result.data.status === "0") {
            throw result.data.result;
        }

        factoryContractData.abi = JSON.parse(result.data.result);

        // https://web3js.readthedocs.io/en/v1.2.1/web3-eth-contract.html#new-contract
        factoryContract = new web3.eth.Contract(
            factoryContractData.abi,
            factoryContractData.address
        );

        logger.debug("Factory contract:", factoryContract._address);
        logger.debug("Will check factory ledger every " + intervalInSeconds + " seconds");

        setInterval(
            main,
            intervalInMilliseconds
        );

    })
    .catch((error) => {
        logger.error(error);
    });

function main() {

    // number of contracts deployed by the factory contract
    let cryptosharesContractsCounter;

    factoryContract.methods.cryptoSharesContractsCounter().call()
        .then((result) => {
            result = parseInt(result);
            if (result > 0) {
                cryptosharesContractsCounter = result;
                if (!cryptosharesContractsAbi) {
                    // get data of the first cryptoshares contract from the ledger:
                    return factoryContract.methods.cryptoSharesContractsLedger(1).call();
                } else {
                    contractsLoop(cryptosharesContractsCounter);
                }
            }
        })
        .then((result) => {
            if (result) {
                // Get cryptoshares contract ABI (the same for all contracts deployed from the factory contract) from
                // the etherscan.io This works if cryptoshares smart contract code was verified on etherscan.
                return axios.get(
                    config.etherscanApiLink[networkId]
                    + "api?module=contract&action=getabi&address="
                    + result.contractAddress + "&apikey"
                    + config.etherscanApiKeyToken
                );
            }
        })
        .then((result) => {
            if (result) {
                cryptosharesContractsAbi = JSON.parse(result.data.result);
                contractsLoop(cryptosharesContractsCounter);
            }
        })
        .catch((error) => {
            logger.error("main() ERROR");
            logger.error(error);
        });
}

function contractsLoop(cryptoSharesContractsCounter) {

    logger.debug(cryptoSharesContractsCounter + " contracts on the ledger");

    // run payDividends() func for each cryptoshares contract already deployed
    for (let i = 1; i <= cryptoSharesContractsCounter; i++) {
        payDividends(i);
    }
}

function payDividends(contractNumber) {

    // contract instance (web3)
    let contract;

    let dividendsRoundNumber;

    factoryContract.methods.cryptoSharesContractsLedger(contractNumber.toString()).call()
        .then((result) => {

            contract = new web3.eth.Contract(
                cryptosharesContractsAbi,
                result.contractAddress
            );

            return contract.methods.dividendsRoundsCounter().call();
        })
        .then((result) => {
            dividendsRoundNumber = parseInt(result);
            if (dividendsRoundNumber > 0) {
                return contract.methods.dividendsRound(result).call();
            } else {
                logger.debug(
                    "Contract #",
                    contractNumber,
                    "(" + contract._address + ")",
                    "round counter: ",
                    dividendsRoundNumber
                );
            }
        })
        .then((result) => {

            if (result && dividendsRoundNumber > 0) {

                // logger.debug("Contract", contract._address, "Round #", dividendsRoundsCounter);
                // logger.debug(result);

                if (result.roundIsRunning) {

                    result.allRegisteredShareholders = parseInt(result.allRegisteredShareholders);
                    result.shareholdersCounter = parseInt(result.shareholdersCounter);
                    result.weiForTxFees = parseInt(result.weiForTxFees);

                    const numberOfTransactionsToSend
                        = result.allRegisteredShareholders - result.shareholdersCounter;

                    const feeForTxInWei
                        = Math.floor(
                        (result.weiForTxFees / result.allRegisteredShareholders) * txFeeFactor
                    );

                    logger.debug(
                        "Contract #",
                        contractNumber, "(" + contract._address + ")",
                        "running round :",
                        dividendsRoundNumber,
                        ", number of tx to send:",
                        numberOfTransactionsToSend,
                        ", fee for tx:",
                        web3.utils.fromWei(feeForTxInWei.toString()),
                        "ETH",
                        "(" + feeForTxInWei + ") Wei"
                    );

                    if (numberOfTransactionsToSend > 0 && feeForTxInWei > 0) {
                        for (let j = 1; j <= numberOfTransactionsToSend; j++) {
                            payDividendsToNext(contract._address, contractNumber, feeForTxInWei);
                        }
                    } else {
                        logger.debug(
                            "Fee for tx in contract #",
                            contractNumber,
                            "is to small to send transactions"
                        );
                    }
                } else {
                    logger.debug(
                        "Contract #",
                        contractNumber, "(" + contract._address + ")",
                        "last round : ",
                        dividendsRoundNumber
                    );
                }
            }
        })
        .catch((error) => {
            logger.error("payDividends to contractNumber #", contractNumber, "ERROR:");
            logger.error(error);
        });
}

function payDividendsToNext(contractAddress, contractNumber, feeForTxInWei) {

    if (!cryptosharesContractsAbi) {
        logger.error("cryptosharesContractsAbi contract ABI is not defined");
        return;
    }

    const contract = new web3.eth.Contract(
        cryptosharesContractsAbi,
        contractAddress
    );

    let gasPrice = 0;
    let gasEstimate;
    let botBalance;

    const payDividendsToNextTxObject = contract.methods.payDividendsToNext();

    web3.eth.getBalance(botAddress)
        .then((result) => {
            logger.debug(
                "Current balance: ",
                result,
                "Wei",
                "(" + web3.utils.fromWei(result) + ") ETH"
            );
            botBalance = parseInt(result);
            return payDividendsToNextTxObject.estimateGas();
        })
        .then((result) => {
            gasEstimate = parseInt(result);
            gasPrice = Math.floor(feeForTxInWei / gasEstimate);
            if (gasPrice > minGasPriceForTxInWei && (gasPrice * gasEstimate) <= botBalance) {
                return web3.eth.getTransactionCount(botAddress);
            } else if ((gasPrice * gasEstimate) > botBalance) {
                logger.error(
                    "Not enough ETH for tx. Current balance:",
                    botBalance,
                    "Wei needed:",
                    (gasPrice * gasEstimate)
                )
            }
        })
        .then((result) => {
            if (result) {

                let nonceFromInfura = parseInt(result);

                logger.debug("Nonce from Infura:", nonceFromInfura, "(", result, "); local nonce:", txCounterLocal);

                // ensure that local nonce is not less than nonce from Infura
                if (txCounterLocal < nonceFromInfura) {
                    txCounterLocal = nonceFromInfura;
                }

                const txData = {
                    nonce: web3.utils.toHex(txCounterLocal),
                    gasLimit: web3.utils.toHex(gasEstimate),
                    // gasPrice: web3.utils.toHex(10e9), // 10 Gwei
                    gasPrice: web3.utils.toHex(gasPrice),
                    to: contract._address,
                    from: botAddress,
                    // value: web3.utils.toHex(web3.utils.toWei('123', 'wei'))
                    data: payDividendsToNextTxObject.encodeABI()
                };

                // see:
                // https://web3js.readthedocs.io/en/v1.2.1/web3-eth.html#id67
                // // {'chain': 'ropsten'}
                let opts;
                if (networkId !== "1") {
                    opts = {};
                    opts.chain = config.networkName[networkId].toLowerCase();
                }

                const transaction = new Tx(txData, opts);
                transaction.sign(privateKey);

                const serializedTx = transaction.serialize();
                const rawTx = '0x' + serializedTx.toString('hex');

                txCounterLocal++;

                return web3.eth.sendSignedTransaction(rawTx);
            }
        })
        .then((result) => {
            if (result) {
                // console.log("tx receipt:");
                // console.log(result);
                logger.info(
                    "Tx sent to contract #",
                    contractNumber,
                    ", tx hash:",
                    result.transactionHash
                );

                // logger.info(result);
            }
        })
        .catch((error) => {
            logger.error("payDividendsToNext (contract #", contractNumber, ") ERROR:");
            logger.error(error);
        });

}