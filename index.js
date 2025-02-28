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
const bs58_1 = __importDefault(require("bs58"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const constants_1 = require("./src/constants");
const utils_1 = require("./src/utils");
const swapOnlyAmm_1 = require("./src/utils/swapOnlyAmm");
const legacy_1 = require("./src/executor/legacy");
const getPoolInfo_1 = require("./src/utils/getPoolInfo");
const constants_2 = require("./src/constants");
exports.solanaConnection = new web3_js_1.Connection(constants_1.RPC_ENDPOINT, {
    wsEndpoint: constants_1.RPC_WEBSOCKET_ENDPOINT,
});
exports.mainKp = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(constants_1.PRIVATE_KEY));
let baseMint = new web3_js_1.PublicKey(constants_1.TOKEN_MINT);
let distritbutionNum = constants_1.DISTRIBUTE_WALLET_NUM > 10 ? 10 : constants_1.DISTRIBUTE_WALLET_NUM;
let poolId;
let poolKeys = null;
let status = 'stopped';
// Add these variables to track runtime and statistics
let startTime = null;
let statistics = {
    buys: 0,
    sells: 0,
    errors: 0
};
// Store runtime configuration
let runtimeConfig = {
    TOKEN_MINT: constants_1.TOKEN_MINT,
    DISTRIBUTE_WALLET_NUM: constants_1.DISTRIBUTE_WALLET_NUM,
    BUY_LOWER_AMOUNT: constants_1.BUY_LOWER_AMOUNT,
    BUY_UPPER_AMOUNT: constants_1.BUY_UPPER_AMOUNT,
    ADDITIONAL_FEE: constants_1.ADDITIONAL_FEE,
    BUY_INTERVAL_MIN: constants_1.BUY_INTERVAL_MIN,
    BUY_INTERVAL_MAX: constants_1.BUY_INTERVAL_MAX,
    MIN_DISTRIBUTE_AMOUNT: constants_1.MIN_DISTRIBUTE_AMOUNT,
    MAX_DISTRIBUTE_AMOUNT: constants_1.MAX_DISTRIBUTE_AMOUNT
};
let botProcess = null;
// Add these helper functions for formatting
function formatRunTime(start) {
    if (!start)
        return '0h 0m 0s';
    const diff = Math.floor((new Date().getTime() - start.getTime()) / 1000);
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
}
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    const solBalance = (yield exports.solanaConnection.getBalance(exports.mainKp.publicKey)) / web3_js_1.LAMPORTS_PER_SOL;
    console.log(`Volume bot is running`);
    console.log(`Wallet address: ${exports.mainKp.publicKey.toBase58()}`);
    console.log(`Pool token mint: ${runtimeConfig.TOKEN_MINT}`);
    console.log(`Wallet SOL balance: ${solBalance.toFixed(3)}SOL`);
    console.log(`Buying interval max: ${runtimeConfig.BUY_INTERVAL_MAX}ms`);
    console.log(`Buying interval min: ${runtimeConfig.BUY_INTERVAL_MIN}ms`);
    console.log(`Buy upper limit amount: ${runtimeConfig.BUY_UPPER_AMOUNT}SOL`);
    console.log(`Buy lower limit amount: ${runtimeConfig.BUY_LOWER_AMOUNT}SOL`);
    console.log(`Minimum distribute amount: ${runtimeConfig.MIN_DISTRIBUTE_AMOUNT}SOL`);
    console.log(`Maximum distribute amount: ${runtimeConfig.MAX_DISTRIBUTE_AMOUNT}SOL`);
    console.log(`Distribute SOL to ${runtimeConfig.DISTRIBUTE_WALLET_NUM} wallets`);
    if (constants_2.SWAP_ROUTING) {
        console.log('Buy and sell with jupiter swap v6 routing');
    }
    else {
        poolKeys = yield (0, getPoolInfo_1.getPoolKeys)(exports.solanaConnection, baseMint);
        if (poolKeys == null) {
            return;
        }
        // poolKeys = await PoolKeys.fetchPoolKeyInfo(solanaConnection, baseMint, NATIVE_MINT)
        poolId = new web3_js_1.PublicKey(poolKeys.id);
        console.log(`Successfully fetched pool info`);
        console.log(`Pool id: ${poolId.toBase58()}`);
    }
    let data = null;
    // if (solBalance < (BUY_LOWER_AMOUNT + ADDITIONAL_FEE) * distritbutionNum) {
    //   console.log('Sol balance is not enough for distribution');
    // }
    data = yield distributeSol(exports.mainKp, runtimeConfig.DISTRIBUTE_WALLET_NUM);
    if (data === null) {
        console.log('Distribution failed');
        return;
    }
    yield (0, utils_1.sleep)(10000);
    const processes = data.map((_a, i_1) => __awaiter(void 0, [_a, i_1], void 0, function* ({ kp }, i) {
        yield (0, utils_1.sleep)(((runtimeConfig.BUY_INTERVAL_MAX + runtimeConfig.BUY_INTERVAL_MIN) * i) / 2);
        while (status === 'running' || status === 'paused') {
            // Skip execution if paused, but keep the loop running
            if (status === 'paused') {
                yield (0, utils_1.sleep)(5000);
                continue;
            }
            // buy part
            const BUY_INTERVAL = Math.round(Math.random() * (runtimeConfig.BUY_INTERVAL_MAX - runtimeConfig.BUY_INTERVAL_MIN) + runtimeConfig.BUY_INTERVAL_MIN);
            const solBalance = (yield exports.solanaConnection.getBalance(kp.publicKey)) / web3_js_1.LAMPORTS_PER_SOL;
            let buyAmount;
            if (constants_1.IS_RANDOM)
                buyAmount = Number((Math.random() * (runtimeConfig.BUY_UPPER_AMOUNT - runtimeConfig.BUY_LOWER_AMOUNT) + runtimeConfig.BUY_LOWER_AMOUNT).toFixed(6));
            else
                buyAmount = constants_1.BUY_AMOUNT;
            if (solBalance < runtimeConfig.ADDITIONAL_FEE) {
                console.log('Balance is not enough: ', solBalance, 'SOL');
                statistics.errors++;
                yield (0, utils_1.sleep)(5000);
                continue;
            }
            // try buying until success
            let i = 0;
            let buySuccess = false;
            while (status === 'running' && !buySuccess && i < 10) {
                const result = yield buy(kp, baseMint, buyAmount, poolId);
                if (result) {
                    buySuccess = true;
                    statistics.buys++;
                    utils_1.logger.info(`Buy successful - Total buys: ${statistics.buys}`);
                    break;
                }
                else {
                    i++;
                    console.log('Buy failed, try again');
                    statistics.errors++;
                    yield (0, utils_1.sleep)(2000);
                }
            }
            if (status !== 'running')
                continue;
            if (!buySuccess) {
                console.log('Error in buy transaction');
                statistics.errors++;
                continue;
            }
            yield (0, utils_1.sleep)(3000);
            if (status !== 'running')
                continue;
            // try selling until success
            let j = 0;
            let sellSuccess = false;
            while (status === 'running' && !sellSuccess && j < 10) {
                const result = yield sell(poolId, baseMint, kp);
                if (result) {
                    sellSuccess = true;
                    statistics.sells++;
                    utils_1.logger.info(`Sell successful - Total sells: ${statistics.sells}`);
                    break;
                }
                else {
                    j++;
                    console.log('Sell failed, try again');
                    statistics.errors++;
                    yield (0, utils_1.sleep)(2000);
                }
            }
            if (status !== 'running')
                continue;
            if (!sellSuccess) {
                console.log('Error in sell transaction');
                statistics.errors++;
                continue;
            }
            yield (0, utils_1.sleep)(5000 + distritbutionNum * BUY_INTERVAL);
        }
        utils_1.logger.info(`Bot process exited for wallet ${kp.publicKey.toString().slice(0, 6)}...`);
    }));
});
const distributeSol = (mainKp, distritbutionNum) => __awaiter(void 0, void 0, void 0, function* () {
    const data = [];
    const wallets = [];
    try {
        const sendSolTx = [];
        sendSolTx.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: runtimeConfig.ADDITIONAL_FEE * web3_js_1.LAMPORTS_PER_SOL * 100000 / 100000 }));
        for (let i = 0; i < distritbutionNum; i++) {
            let solAmount = Math.random() * (runtimeConfig.MAX_DISTRIBUTE_AMOUNT - runtimeConfig.MIN_DISTRIBUTE_AMOUNT) + runtimeConfig.MIN_DISTRIBUTE_AMOUNT;
            console.log(solAmount);
            if (solAmount < runtimeConfig.ADDITIONAL_FEE + runtimeConfig.BUY_UPPER_AMOUNT)
                solAmount = runtimeConfig.ADDITIONAL_FEE + runtimeConfig.BUY_UPPER_AMOUNT;
            const wallet = web3_js_1.Keypair.generate();
            wallets.push({ kp: wallet, buyAmount: solAmount });
            console.log(`Distributing ${solAmount} SOL to ${wallet.publicKey.toBase58()}`);
            sendSolTx.push(web3_js_1.SystemProgram.transfer({
                fromPubkey: mainKp.publicKey,
                toPubkey: wallet.publicKey,
                lamports: Math.round(solAmount * web3_js_1.LAMPORTS_PER_SOL),
            }));
        }
        wallets.map((wallet) => {
            data.push({
                privateKey: bs58_1.default.encode(wallet.kp.secretKey),
                pubkey: wallet.kp.publicKey.toBase58(),
                solBalance: wallet.buyAmount,
                tokenBuyTx: null,
                tokenSellTx: null,
            });
        });
        try {
            (0, utils_1.saveDataToFile)(data);
        }
        catch (error) { }
        let index = 0;
        while (true) {
            try {
                if (index > 3) {
                    console.log('Error in distribution');
                    return null;
                }
                const siTx = new web3_js_1.Transaction().add(...sendSolTx);
                const latestBlockhash = yield exports.solanaConnection.getLatestBlockhash();
                siTx.feePayer = mainKp.publicKey;
                siTx.recentBlockhash = latestBlockhash.blockhash;
                const messageV0 = new web3_js_1.TransactionMessage({
                    payerKey: mainKp.publicKey,
                    recentBlockhash: latestBlockhash.blockhash,
                    instructions: sendSolTx,
                }).compileToV0Message();
                const transaction = new web3_js_1.VersionedTransaction(messageV0);
                transaction.sign([mainKp]);
                const txSig = yield (0, legacy_1.execute)(transaction, latestBlockhash);
                const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
                console.log('SOL distributed ', tokenBuyTx);
                break;
            }
            catch (error) {
                console.log(`Failed to transfer SOL: ${error}`);
                index++;
            }
        }
        console.log('Success in transferring sol');
        return wallets;
    }
    catch (error) {
        console.log(`Failed to transfer SOL: ${error}`);
        return null;
    }
});
const buy = (newWallet, baseMint, buyAmount, poolId) => __awaiter(void 0, void 0, void 0, function* () {
    let solBalance = 0;
    try {
        solBalance = yield exports.solanaConnection.getBalance(newWallet.publicKey);
        console.log({ solBalance });
        // Convert from lamports to SOL for any calculations or comparisons
        const solBalanceInSol = solBalance / web3_js_1.LAMPORTS_PER_SOL;
        if (solBalanceInSol < runtimeConfig.ADDITIONAL_FEE) {
            console.log('Balance is not enough: ', solBalanceInSol, 'SOL');
            statistics.errors++;
            return null;
        }
    }
    catch (error) {
        console.log('Error getting balance of wallet');
        return null;
    }
    if (solBalance == 0) {
        return null;
    }
    try {
        let tx;
        if (constants_2.SWAP_ROUTING)
            tx = yield (0, swapOnlyAmm_1.getBuyTxWithJupiter)(newWallet, baseMint, buyAmount);
        else
            tx = yield (0, swapOnlyAmm_1.getBuyTx)(exports.solanaConnection, newWallet, baseMint, spl_token_1.NATIVE_MINT, buyAmount, poolId.toBase58());
        if (tx == null) {
            console.log(`Error getting buy transaction`);
            return null;
        }
        const latestBlockhash = yield exports.solanaConnection.getLatestBlockhash();
        const txSig = yield (0, legacy_1.execute)(tx, latestBlockhash);
        const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
        (0, utils_1.editJson)({
            tokenBuyTx,
            pubkey: newWallet.publicKey.toBase58(),
            solBalance: solBalance / 10 ** 9 - buyAmount,
        });
        return tokenBuyTx;
    }
    catch (error) {
        return null;
    }
});
const sell = (poolId, baseMint, wallet) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = (0, utils_1.readJson)();
        if (data.length == 0) {
            yield (0, utils_1.sleep)(1000);
            return null;
        }
        const tokenAta = yield (0, spl_token_1.getAssociatedTokenAddress)(baseMint, wallet.publicKey);
        const tokenBalInfo = yield exports.solanaConnection.getTokenAccountBalance(tokenAta);
        if (!tokenBalInfo) {
            console.log('Balance incorrect');
            return null;
        }
        const tokenBalance = tokenBalInfo.value.amount;
        try {
            let sellTx;
            if (constants_2.SWAP_ROUTING)
                sellTx = yield (0, swapOnlyAmm_1.getSellTxWithJupiter)(wallet, baseMint, tokenBalance);
            else
                sellTx = yield (0, swapOnlyAmm_1.getSellTx)(exports.solanaConnection, wallet, baseMint, spl_token_1.NATIVE_MINT, tokenBalance, poolId.toBase58());
            if (sellTx == null) {
                console.log(`Error getting buy transaction`);
                return null;
            }
            const latestBlockhashForSell = yield exports.solanaConnection.getLatestBlockhash();
            const txSellSig = yield (0, legacy_1.execute)(sellTx, latestBlockhashForSell, false);
            const tokenSellTx = txSellSig ? `https://solscan.io/tx/${txSellSig}` : '';
            const solBalance = yield exports.solanaConnection.getBalance(wallet.publicKey);
            (0, utils_1.editJson)({
                pubkey: wallet.publicKey.toBase58(),
                tokenSellTx,
                solBalance,
            });
            return tokenSellTx;
        }
        catch (error) {
            return null;
        }
    }
    catch (error) {
        return null;
    }
});
// Add this function to harvest SOL from all temporary wallets
const harvestRemainingSOL = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        utils_1.logger.info('Harvesting remaining SOL from all temporary wallets');
        // Read wallet data from JSON file
        const walletData = (0, utils_1.readJson)();
        if (!walletData || walletData.length === 0) {
            utils_1.logger.info('No wallet data found to harvest');
            return;
        }
        utils_1.logger.info(`Found ${walletData.length} wallets to harvest SOL from`);
        // Create a transaction to gather SOL from all wallets
        const harvestTx = [];
        harvestTx.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }), web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250000 }));
        let totalHarvested = 0;
        const minRentExempt = yield exports.solanaConnection.getMinimumBalanceForRentExemption(0);
        // Process each wallet and add a transfer instruction
        for (const wallet of walletData) {
            try {
                if (!wallet.privateKey)
                    continue;
                const walletKp = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(wallet.privateKey));
                const walletBalance = yield exports.solanaConnection.getBalance(walletKp.publicKey);
                // Skip wallets with insignificant balance
                if (walletBalance <= minRentExempt) {
                    utils_1.logger.info(`Skipping wallet ${wallet.pubkey.slice(0, 6)}... with only ${walletBalance / web3_js_1.LAMPORTS_PER_SOL} SOL`);
                    continue;
                }
                // Transfer all SOL minus rent exemption to allow transaction
                const transferAmount = walletBalance - minRentExempt;
                if (transferAmount <= 0)
                    continue;
                totalHarvested += transferAmount / web3_js_1.LAMPORTS_PER_SOL;
                harvestTx.push(web3_js_1.SystemProgram.transfer({
                    fromPubkey: walletKp.publicKey,
                    toPubkey: exports.mainKp.publicKey,
                    lamports: transferAmount,
                }));
                utils_1.logger.info(`Added instruction to transfer ${transferAmount / web3_js_1.LAMPORTS_PER_SOL} SOL from ${wallet.pubkey.slice(0, 6)}...`);
            }
            catch (error) {
                utils_1.logger.error(`Error processing wallet ${wallet.pubkey}: ${error}`);
            }
        }
        if (harvestTx.length <= 2) {
            utils_1.logger.info('No wallets with sufficient balance to harvest');
            return;
        }
        // Execute the transaction
        try {
            const transaction = new web3_js_1.Transaction().add(...harvestTx);
            const latestBlockhash = yield exports.solanaConnection.getLatestBlockhash();
            transaction.feePayer = exports.mainKp.publicKey;
            transaction.recentBlockhash = latestBlockhash.blockhash;
            // Sign with all wallets and the main wallet
            let signers = [exports.mainKp];
            for (const wallet of walletData) {
                if (wallet.privateKey) {
                    signers.push(web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(wallet.privateKey)));
                }
            }
            // Send and confirm transaction
            const signature = yield (0, web3_js_1.sendAndConfirmTransaction)(exports.solanaConnection, transaction, signers, { commitment: 'confirmed' });
            utils_1.logger.info(`Successfully harvested ${totalHarvested.toFixed(4)} SOL back to main wallet`);
            utils_1.logger.info(`Transaction: https://solscan.io/tx/${signature}`);
            return signature;
        }
        catch (error) {
            utils_1.logger.error(`Failed to execute harvest transaction: ${error}`);
            return null;
        }
    }
    catch (error) {
        utils_1.logger.error(`Error in harvestRemainingSOL: ${error}`);
        return null;
    }
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: 'https://sol-volume-bot-frontend.vercel.app/', // Replace with your frontend's origin (e.g., React/Vue dev server)
    methods: ['GET', 'POST'], // Allow only specific methods
    allowedHeaders: ['Content-Type'], // Allow specific headers
    credentials: true // If you need to send cookies or auth headers
}));
app.use(express_1.default.json());
const port = process.env.PORT || 5000;
// API Endpoints
app.get('/api/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get active wallets from the data file
        const walletData = (0, utils_1.readJson)();
        let activeWallets = walletData.length > 0
            ? walletData.map(wallet => ({
                address: wallet.pubkey,
                solBalance: wallet.solBalance || 0,
                privateKey: wallet.privateKey || null,
                lastBuyTx: wallet.tokenBuyTx || null,
                lastSellTx: wallet.tokenSellTx || null
            }))
            : [];
        activeWallets = yield Promise.all(activeWallets.map((wallet) => __awaiter(void 0, void 0, void 0, function* () {
            const balance = yield exports.solanaConnection.getBalance(new web3_js_1.PublicKey(wallet.address));
            return Object.assign(Object.assign({}, wallet), { solBalance: balance / web3_js_1.LAMPORTS_PER_SOL });
        })));
        // Get main wallet balance
        const mainWalletBalance = (yield exports.solanaConnection.getBalance(exports.mainKp.publicKey)) / web3_js_1.LAMPORTS_PER_SOL;
        res.json({
            isRunning: status === 'running',
            status: status,
            config: runtimeConfig,
            mainWallet: {
                address: exports.mainKp.publicKey.toString(),
                balance: mainWalletBalance
            },
            statistics: {
                buys: statistics.buys,
                sells: statistics.sells,
                errors: statistics.errors,
                runTimeFormatted: status != 'stopped' ? formatRunTime(startTime) : '0h 0m 0s',
                runTimeSeconds: status != 'stopped' ? Math.floor((new Date().getTime() - (startTime || new Date()).getTime()) / 1000) : 0
            },
            activeWallets: activeWallets
        });
    }
    catch (error) {
        console.error('Error in status endpoint:', error);
        res.status(500).json({
            error: 'Failed to get status',
            isRunning: status === 'running',
            status: status
        });
    }
}));
app.post('/api/start', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Update configuration if provided
    if (req.body && req.body.config) {
        runtimeConfig = Object.assign(Object.assign({}, runtimeConfig), req.body.config);
        // Update global variables with new config values
        if (runtimeConfig.TOKEN_MINT) {
            baseMint = new web3_js_1.PublicKey(runtimeConfig.TOKEN_MINT);
        }
        if (runtimeConfig.DISTRIBUTE_WALLET_NUM) {
            const newDistNum = runtimeConfig.DISTRIBUTE_WALLET_NUM > 10 ? 10 : runtimeConfig.DISTRIBUTE_WALLET_NUM;
            // Update the global variable
            distritbutionNum = newDistNum;
        }
        utils_1.logger.info('Updated configuration:', runtimeConfig);
    }
    status = 'running';
    startTime = new Date();
    statistics = { buys: 0, sells: 0, errors: 0 };
    // Start bot with updated configuration
    if (botProcess === null) {
        botProcess = main();
    }
    res.json({
        status,
        message: 'Bot started successfully'
    });
}));
app.post('/api/stop', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    status = 'stopped';
    // Harvest remaining SOL from temporary wallets
    try {
        utils_1.logger.info('Stopping bot and harvesting remaining SOL');
        const harvestResult = yield harvestRemainingSOL();
        // Reset the bot process
        botProcess = null;
        if (harvestResult) {
            res.json({
                status,
                message: 'Bot stopped successfully and SOL harvested',
                harvestTx: `https://solscan.io/tx/${harvestResult}`
            });
        }
        else {
            res.json({
                status,
                message: 'Bot stopped successfully, but SOL harvest failed or was not needed'
            });
        }
    }
    catch (error) {
        utils_1.logger.error(`Error during stop and harvest: ${error}`);
        res.json({
            status,
            message: 'Bot stopped, but encountered errors during SOL harvesting'
        });
    }
}));
app.post('/api/pause', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    status = 'paused';
    res.json({ status });
}));
app.post('/api/resume', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    status = 'running';
    res.json({ status });
}));
// Start server
app.listen(port, () => {
    utils_1.logger.info(`Volume Bot API server running on port ${port}`);
});
