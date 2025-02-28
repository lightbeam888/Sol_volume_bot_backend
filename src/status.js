"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mainKp = exports.solanaConnection = void 0;
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("./constants");
const utils_1 = require("./utils");
const bs58_1 = __importDefault(require("bs58"));
exports.solanaConnection = new web3_js_1.Connection(constants_1.RPC_ENDPOINT, {
    wsEndpoint: constants_1.RPC_WEBSOCKET_ENDPOINT,
});
exports.mainKp = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(constants_1.PRIVATE_KEY));
const baseMint = new web3_js_1.PublicKey(constants_1.TOKEN_MINT);
const distritbutionNum = constants_1.DISTRIBUTE_WALLET_NUM > 20 ? 20 : constants_1.DISTRIBUTE_WALLET_NUM;
let quoteVault = null;
let poolKeys;
let sold = 0;
let bought = 0;
let totalSolPut = 0;
let changeAmount = 0;
let buyNum = 0;
let sellNum = 0;
utils_1.logger.level = constants_1.LOG_LEVEL;
const data = (0, utils_1.readJson)();
const walletPks = data.map((data) => data.pubkey);
console.log('🚀 ~ walletPks:', walletPks);
const state = {
    quoteVault: null,
    poolKeys: null,
    stats: {
        sold: 0,
        bought: 0,
        totalSolPut: 0,
        changeAmount: 0,
        buyNum: 0,
        sellNum: 0,
    },
};
// Improved error handling and connection management
const initializeConnection = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const solBalance = yield exports.solanaConnection.getBalance(exports.mainKp.publicKey);
        console.log({
            walletAddress: exports.mainKp.publicKey.toBase58(),
            poolTokenMint: baseMint.toBase58(),
            solBalance: (solBalance / web3_js_1.LAMPORTS_PER_SOL).toFixed(3),
            checkInterval: constants_1.CHECK_BAL_INTERVAL,
        });
        state.poolKeys = yield utils_1.PoolKeys.fetchPoolKeyInfo(exports.solanaConnection, baseMint, spl_token_1.NATIVE_MINT);
        state.quoteVault = state.poolKeys.quoteVault;
        return state.poolKeys.id;
    }
    catch (error) {
        utils_1.logger.error('Failed to initialize connection:', error);
        throw error;
    }
});
// Optimized transaction tracking
function trackWalletOnLog(connection, quoteVault) {
    return __awaiter(this, void 0, void 0, function* () {
        const initialWsolBal = yield getTokenBalance(connection, quoteVault);
        if (!initialWsolBal)
            return;
        // Set up balance checking interval
        setupBalanceChecking(connection, quoteVault, initialWsolBal);
        // Set up transaction monitoring
        setupTransactionMonitoring(connection, quoteVault);
    });
}
// Helper functions for better code organization
function getTokenBalance(connection, vault) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const balance = (yield connection.getTokenAccountBalance(vault)).value.uiAmount;
            if (!balance) {
                utils_1.logger.error('Quote vault mismatch');
                return null;
            }
            return balance;
        }
        catch (error) {
            utils_1.logger.error('Failed to get token balance:', error);
            return null;
        }
    });
}
function setupBalanceChecking(connection, quoteVault, initialBalance) {
    setInterval(() => __awaiter(this, void 0, void 0, function* () {
        const currentBalance = yield getTokenBalance(connection, quoteVault);
        if (!currentBalance)
            return;
        state.stats.changeAmount = currentBalance - initialBalance;
        (0, utils_1.deleteConsoleLines)(1);
        console.log(`Other users bought ${state.stats.buyNum - state.stats.bought} times and ` +
            `sold ${state.stats.sellNum - state.stats.sold} times, ` +
            `total SOL change is ${state.stats.changeAmount - state.stats.totalSolPut}SOL`);
    }), constants_1.CHECK_BAL_INTERVAL);
}
function setupTransactionMonitoring(connection, quoteVault) {
    connection.onLogs(quoteVault, (_a) => __awaiter(this, [_a], void 0, function* ({ err, signature }) {
        var _b, _c, _d;
        if (err)
            return;
        try {
            const parsedData = yield connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed',
            });
            const signer = (_b = parsedData === null || parsedData === void 0 ? void 0 : parsedData.transaction.message.accountKeys.find((elem) => elem.signer)) === null || _b === void 0 ? void 0 : _b.pubkey.toBase58();
            if (signer && !walletPks.includes(signer)) {
                const isUserBuying = Number((_c = parsedData === null || parsedData === void 0 ? void 0 : parsedData.meta) === null || _c === void 0 ? void 0 : _c.preBalances[0]) > Number((_d = parsedData === null || parsedData === void 0 ? void 0 : parsedData.meta) === null || _d === void 0 ? void 0 : _d.postBalances[0]);
                isUserBuying ? state.stats.buyNum++ : state.stats.sellNum++;
            }
        }
        catch (error) {
            utils_1.logger.error('Error processing transaction:', error);
        }
    }), 'confirmed');
}
// Simplified main function
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const poolId = yield initializeConnection();
        yield trackWalletOnLog(exports.solanaConnection, state.quoteVault);
    }
    catch (error) {
        utils_1.logger.error('Failed to start application:', error);
        process.exit(1);
    }
});
main();
