import { NATIVE_MINT, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  VersionedTransaction,
  TransactionInstruction,
  TransactionMessage,
  ComputeBudgetProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import base58 from 'bs58';
import express from 'express';
import cors from 'cors';
import {
  ADDITIONAL_FEE,
  BUY_AMOUNT,
  BUY_INTERVAL_MAX,
  BUY_INTERVAL_MIN,
  BUY_LOWER_AMOUNT,
  BUY_UPPER_AMOUNT,
  DISTRIBUTE_WALLET_NUM,
  DISTRIBUTION_AMOUNT,
  IS_RANDOM,
  MIN_DISTRIBUTE_AMOUNT,
  MAX_DISTRIBUTE_AMOUNT,
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  TOKEN_MINT,
} from './src/constants';
import { Data, editJson, logger, readJson, saveDataToFile, sleep } from './src/utils';
import { gather } from './gather';
import { getBuyTx, getBuyTxWithJupiter, getSellTx, getSellTxWithJupiter } from './src/utils/swapOnlyAmm';
import { execute } from './src/executor/legacy';
import { getPoolKeys } from './src/utils/getPoolInfo';
import { SWAP_ROUTING } from './src/constants';

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY));
let baseMint = new PublicKey(TOKEN_MINT);
let distritbutionNum = DISTRIBUTE_WALLET_NUM > 10 ? 10 : DISTRIBUTE_WALLET_NUM;
let poolId: PublicKey;
let poolKeys = null;
let status = 'stopped';

// Add these variables to track runtime and statistics
let startTime: Date | null = null;
let statistics = {
  buys: 0,
  sells: 0,
  errors: 0
};

// Store runtime configuration
let runtimeConfig = {
  TOKEN_MINT: TOKEN_MINT,
  DISTRIBUTE_WALLET_NUM: DISTRIBUTE_WALLET_NUM,
  BUY_LOWER_AMOUNT: BUY_LOWER_AMOUNT,
  BUY_UPPER_AMOUNT: BUY_UPPER_AMOUNT,
  ADDITIONAL_FEE: ADDITIONAL_FEE,
  BUY_INTERVAL_MIN: BUY_INTERVAL_MIN,
  BUY_INTERVAL_MAX: BUY_INTERVAL_MAX,
  MIN_DISTRIBUTE_AMOUNT: MIN_DISTRIBUTE_AMOUNT,
  MAX_DISTRIBUTE_AMOUNT: MAX_DISTRIBUTE_AMOUNT
};

let botProcess: any = null;

// Add these helper functions for formatting
function formatRunTime(start: Date | null): string {
  if (!start) return '0h 0m 0s';
  
  const diff = Math.floor((new Date().getTime() - start.getTime()) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  
  return `${hours}h ${minutes}m ${seconds}s`;
}

const main = async () => {
  const solBalance = (await solanaConnection.getBalance(mainKp.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`Volume bot is running`);
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`);
  console.log(`Pool token mint: ${runtimeConfig.TOKEN_MINT}`);
  console.log(`Wallet SOL balance: ${solBalance.toFixed(3)}SOL`);
  console.log(`Buying interval max: ${runtimeConfig.BUY_INTERVAL_MAX}ms`);
  console.log(`Buying interval min: ${runtimeConfig.BUY_INTERVAL_MIN}ms`);
  console.log(`Buy upper limit amount: ${runtimeConfig.BUY_UPPER_AMOUNT}SOL`);
  console.log(`Buy lower limit amount: ${runtimeConfig.BUY_LOWER_AMOUNT}SOL`);
  console.log(`Minimum distribute amount: ${runtimeConfig.MIN_DISTRIBUTE_AMOUNT}SOL`);
  console.log(`Maximum distribute amount: ${runtimeConfig.MAX_DISTRIBUTE_AMOUNT}SOL`);
  console.log(`Distribute SOL to ${runtimeConfig.DISTRIBUTE_WALLET_NUM} wallets`);

  if (SWAP_ROUTING) {
    console.log('Buy and sell with jupiter swap v6 routing');
  } else {
    poolKeys = await getPoolKeys(solanaConnection, baseMint);
    if (poolKeys == null) {
      return;
    }
    // poolKeys = await PoolKeys.fetchPoolKeyInfo(solanaConnection, baseMint, NATIVE_MINT)
    poolId = new PublicKey(poolKeys.id);
    console.log(`Successfully fetched pool info`);
    console.log(`Pool id: ${poolId.toBase58()}`);
  }

  let data:
    | {
        kp: Keypair;
        buyAmount: number;
      }[]
    | null = null;

  // if (solBalance < (BUY_LOWER_AMOUNT + ADDITIONAL_FEE) * distritbutionNum) {
  //   console.log('Sol balance is not enough for distribution');
  // }
  data = await distributeSol(mainKp, runtimeConfig.DISTRIBUTE_WALLET_NUM);
  if (data === null) {
    console.log('Distribution failed');
    return;
  }
  await sleep(10000);
  const processes = data.map(async ({ kp }, i) => {
    await sleep(((runtimeConfig.BUY_INTERVAL_MAX + runtimeConfig.BUY_INTERVAL_MIN) * i) / 2);
    while (status === 'running' || status === 'paused') {
      // Skip execution if paused, but keep the loop running
      if (status === 'paused') {
        await sleep(5000);
        continue;
      }
      
      // buy part
      const BUY_INTERVAL = Math.round(Math.random() * (runtimeConfig.BUY_INTERVAL_MAX - runtimeConfig.BUY_INTERVAL_MIN) + runtimeConfig.BUY_INTERVAL_MIN);

      const solBalance = (await solanaConnection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
      
      let buyAmount: number;
      if (IS_RANDOM)
        buyAmount = Number((Math.random() * (runtimeConfig.BUY_UPPER_AMOUNT - runtimeConfig.BUY_LOWER_AMOUNT) + runtimeConfig.BUY_LOWER_AMOUNT).toFixed(6));
      else buyAmount = BUY_AMOUNT;

      if (solBalance < runtimeConfig.ADDITIONAL_FEE) {
        console.log('Balance is not enough: ', solBalance, 'SOL');
        statistics.errors++;
        await sleep(5000);
        continue;
      }

      // try buying until success
      let i = 0;
      let buySuccess = false;
      while (status === 'running' && !buySuccess && i < 10) {
        const result = await buy(kp, baseMint, buyAmount, poolId);
        if (result) {
          buySuccess = true;
          statistics.buys++;
          logger.info(`Buy successful - Total buys: ${statistics.buys}`);
          break;
        } else {
          i++;
          console.log('Buy failed, try again');
          statistics.errors++;
          await sleep(2000);
        }
      }
      
      if (status !== 'running') continue;
      if (!buySuccess) {
        console.log('Error in buy transaction');
        statistics.errors++;
        continue;
      }

      await sleep(3000);
      
      if (status !== 'running') continue;

      // try selling until success
      let j = 0;
      let sellSuccess = false;
      while (status === 'running' && !sellSuccess && j < 10) {
        const result = await sell(poolId, baseMint, kp);
        if (result) {
          sellSuccess = true;
          statistics.sells++;
          logger.info(`Sell successful - Total sells: ${statistics.sells}`);
          break;
        } else {
          j++;
          console.log('Sell failed, try again');
          statistics.errors++;
          await sleep(2000);
        }
      }
      
      if (status !== 'running') continue;
      if (!sellSuccess) {
        console.log('Error in sell transaction');
        statistics.errors++;
        continue;
      }
      
      await sleep(5000 + distritbutionNum * BUY_INTERVAL);
    }
    
    logger.info(`Bot process exited for wallet ${kp.publicKey.toString().slice(0, 6)}...`);
  });

};

const distributeSol = async (mainKp: Keypair, distritbutionNum: number) => {
  const data: Data[] = [];
  const wallets = [];
  try {
    const sendSolTx: TransactionInstruction[] = [];
    sendSolTx.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: runtimeConfig.ADDITIONAL_FEE * LAMPORTS_PER_SOL * 100000 / 100_000 }),
    );
    for (let i = 0; i < distritbutionNum; i++) {
      let solAmount = Math.random() * (runtimeConfig.MAX_DISTRIBUTE_AMOUNT - runtimeConfig.MIN_DISTRIBUTE_AMOUNT) + runtimeConfig.MIN_DISTRIBUTE_AMOUNT;
      console.log(solAmount);
      if (solAmount < runtimeConfig.ADDITIONAL_FEE + runtimeConfig.BUY_UPPER_AMOUNT) solAmount = runtimeConfig.ADDITIONAL_FEE + runtimeConfig.BUY_UPPER_AMOUNT;

      const wallet = Keypair.generate();
      wallets.push({ kp: wallet, buyAmount: solAmount });
      console.log(`Distributing ${solAmount} SOL to ${wallet.publicKey.toBase58()}`);
      sendSolTx.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: wallet.publicKey,
          lamports: Math.round(solAmount * LAMPORTS_PER_SOL),
        }),
      );
    }
    wallets.map((wallet) => {
      data.push({
        privateKey: base58.encode(wallet.kp.secretKey),
        pubkey: wallet.kp.publicKey.toBase58(),
        solBalance: wallet.buyAmount,
        tokenBuyTx: null,
        tokenSellTx: null,
      });
    });
    try {
      saveDataToFile(data);
    } catch (error) {}

    let index = 0;
    while (true) {
      try {
        if (index > 3) {
          console.log('Error in distribution');
          return null;
        }
        const siTx = new Transaction().add(...sendSolTx);
        const latestBlockhash = await solanaConnection.getLatestBlockhash();
        siTx.feePayer = mainKp.publicKey;
        siTx.recentBlockhash = latestBlockhash.blockhash;
        const messageV0 = new TransactionMessage({
          payerKey: mainKp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: sendSolTx,
        }).compileToV0Message();
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([mainKp]);
        const txSig = await execute(transaction, latestBlockhash);
        const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
        console.log('SOL distributed ', tokenBuyTx);
        break;
      } catch (error) {
        console.log(`Failed to transfer SOL: ${error}`);
        index++;
      }
    }

    console.log('Success in transferring sol');
    return wallets;
  } catch (error) {
    console.log(`Failed to transfer SOL: ${error}`);
    return null;
  }
};

const buy = async (newWallet: Keypair, baseMint: PublicKey, buyAmount: number, poolId: PublicKey) => {
  let solBalance: number = 0;
  try {
    solBalance = await solanaConnection.getBalance(newWallet.publicKey);
    console.log({solBalance});
    // Convert from lamports to SOL for any calculations or comparisons
    const solBalanceInSol = solBalance / LAMPORTS_PER_SOL;
    
    if (solBalanceInSol < runtimeConfig.ADDITIONAL_FEE) {
      console.log('Balance is not enough: ', solBalanceInSol, 'SOL');
      statistics.errors++;
      return null;
    }
  } catch (error) {
    console.log('Error getting balance of wallet');
    return null;
  }
  if (solBalance == 0) {
    return null;
  }
  try {
    let tx;
    if (SWAP_ROUTING) tx = await getBuyTxWithJupiter(newWallet, baseMint, buyAmount);
    else tx = await getBuyTx(solanaConnection, newWallet, baseMint, NATIVE_MINT, buyAmount, poolId.toBase58());
    if (tx == null) {
      console.log(`Error getting buy transaction`);
      return null;
    }
    const latestBlockhash = await solanaConnection.getLatestBlockhash();
    const txSig = await execute(tx, latestBlockhash);
    const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
    editJson({
      tokenBuyTx,
      pubkey: newWallet.publicKey.toBase58(),
      solBalance: solBalance / 10 ** 9 - buyAmount,
    });
    return tokenBuyTx;
  } catch (error) {
    return null;
  }
};

const sell = async (poolId: PublicKey, baseMint: PublicKey, wallet: Keypair) => {
  try {
    const data: Data[] = readJson();
    if (data.length == 0) {
      await sleep(1000);
      return null;
    }

    const tokenAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey);
    const tokenBalInfo = await solanaConnection.getTokenAccountBalance(tokenAta);
    if (!tokenBalInfo) {
      console.log('Balance incorrect');
      return null;
    }
    const tokenBalance = tokenBalInfo.value.amount;

    try {
      let sellTx;
      if (SWAP_ROUTING) sellTx = await getSellTxWithJupiter(wallet, baseMint, tokenBalance);
      else sellTx = await getSellTx(solanaConnection, wallet, baseMint, NATIVE_MINT, tokenBalance, poolId.toBase58());

      if (sellTx == null) {
        console.log(`Error getting buy transaction`);
        return null;
      }

      const latestBlockhashForSell = await solanaConnection.getLatestBlockhash();
      const txSellSig = await execute(sellTx, latestBlockhashForSell, false);
      const tokenSellTx = txSellSig ? `https://solscan.io/tx/${txSellSig}` : '';
      const solBalance = await solanaConnection.getBalance(wallet.publicKey);
      editJson({
        pubkey: wallet.publicKey.toBase58(),
        tokenSellTx,
        solBalance,
      });
      return tokenSellTx;
    } catch (error) {
      return null;
    }
  } catch (error) {
    return null;
  }
};

// Add this function to harvest SOL from all temporary wallets
const harvestRemainingSOL = async () => {
  try {
    logger.info('Harvesting remaining SOL from all temporary wallets');
    
    // Read wallet data from JSON file
    const walletData: Data[] = readJson();
    if (!walletData || walletData.length === 0) {
      logger.info('No wallet data found to harvest');
      return;
    }
    
    logger.info(`Found ${walletData.length} wallets to harvest SOL from`);
    
    // Create a transaction to gather SOL from all wallets
    const harvestTx: TransactionInstruction[] = [];
    harvestTx.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
    );
    
    let totalHarvested = 0;
    const minRentExempt = await solanaConnection.getMinimumBalanceForRentExemption(0);
    
    // Process each wallet and add a transfer instruction
    for (const wallet of walletData) {
      try {
        if (!wallet.privateKey) continue;
        
        const walletKp = Keypair.fromSecretKey(base58.decode(wallet.privateKey));
        const walletBalance = await solanaConnection.getBalance(walletKp.publicKey);
        
        // Skip wallets with insignificant balance
        if (walletBalance <= minRentExempt) {
          logger.info(`Skipping wallet ${wallet.pubkey.slice(0, 6)}... with only ${walletBalance/LAMPORTS_PER_SOL} SOL`);
          continue;
        }
        
        // Transfer all SOL minus rent exemption to allow transaction
        const transferAmount = walletBalance - minRentExempt;
        if (transferAmount <= 0) continue;
        
        totalHarvested += transferAmount / LAMPORTS_PER_SOL;
        
        harvestTx.push(
          SystemProgram.transfer({
            fromPubkey: walletKp.publicKey,
            toPubkey: mainKp.publicKey,
            lamports: transferAmount,
          })
        );
        
        logger.info(`Added instruction to transfer ${transferAmount/LAMPORTS_PER_SOL} SOL from ${wallet.pubkey.slice(0, 6)}...`);
      } catch (error) {
        logger.error(`Error processing wallet ${wallet.pubkey}: ${error}`);
      }
    }
    
    if (harvestTx.length <= 2) {
      logger.info('No wallets with sufficient balance to harvest');
      return;
    }
    
    // Execute the transaction
    try {
      const transaction = new Transaction().add(...harvestTx);
      const latestBlockhash = await solanaConnection.getLatestBlockhash();
      transaction.feePayer = mainKp.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;
      
      // Sign with all wallets and the main wallet
      let signers = [mainKp];
      for (const wallet of walletData) {
        if (wallet.privateKey) {
          signers.push(Keypair.fromSecretKey(base58.decode(wallet.privateKey)));
        }
      }
      
      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        solanaConnection,
        transaction,
        signers,
        { commitment: 'confirmed' }
      );
      
      logger.info(`Successfully harvested ${totalHarvested.toFixed(4)} SOL back to main wallet`);
      logger.info(`Transaction: https://solscan.io/tx/${signature}`);
      return signature;
    } catch (error) {
      logger.error(`Failed to execute harvest transaction: ${error}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error in harvestRemainingSOL: ${error}`);
    return null;
  }
};

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;


// API Endpoints
app.get('/api/status', async (req, res) => {
  try {
    // Get active wallets from the data file
    const walletData: Data[] = readJson();
    let activeWallets = walletData.length > 0 
      ? walletData.map(wallet => ({
          address: wallet.pubkey,
          solBalance: wallet.solBalance || 0,
          privateKey: wallet.privateKey || null,
          lastBuyTx: wallet.tokenBuyTx || null,
          lastSellTx: wallet.tokenSellTx || null
        })) 
      : [];
    activeWallets = await Promise.all(activeWallets.map(async (wallet) => {
      const balance = await solanaConnection.getBalance(new PublicKey(wallet.address));
      return {
        ...wallet,
        solBalance: balance / LAMPORTS_PER_SOL
      };
    }));
    // Get main wallet balance
    const mainWalletBalance = (await solanaConnection.getBalance(mainKp.publicKey)) / LAMPORTS_PER_SOL;
    
    res.json({
      isRunning: status === 'running',
      status: status,
      config: runtimeConfig,
      mainWallet: {
        address: mainKp.publicKey.toString(),
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
  } catch (error) {
    console.error('Error in status endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to get status',
      isRunning: status === 'running',
      status: status
    });
  }
});

app.post('/api/start', async (req, res) => {
  // Update configuration if provided
  if (req.body && req.body.config) {
    runtimeConfig = {
      ...runtimeConfig,
      ...req.body.config
    };
    
    // Update global variables with new config values
    if (runtimeConfig.TOKEN_MINT) {
      baseMint = new PublicKey(runtimeConfig.TOKEN_MINT);
    }
    
    if (runtimeConfig.DISTRIBUTE_WALLET_NUM) {
      const newDistNum = runtimeConfig.DISTRIBUTE_WALLET_NUM > 10 ? 10 : runtimeConfig.DISTRIBUTE_WALLET_NUM;
      // Update the global variable
      distritbutionNum = newDistNum;
    }
    
    logger.info('Updated configuration:', runtimeConfig);
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
});

app.post('/api/stop', async (req, res) => {
  status = 'stopped';
  
  // Harvest remaining SOL from temporary wallets
  try {
    logger.info('Stopping bot and harvesting remaining SOL');
    // const harvestResult = await harvestRemainingSOL();
    await gather()
    
    // Reset the bot process
    botProcess = null;
    res.json({status, message: 'Bot stopped'})
    // if (harvestResult) {
    //   res.json({ 
    //     status,
    //     message: 'Bot stopped successfully and SOL harvested',
    //     harvestTx: `https://solscan.io/tx/${harvestResult}`
    //   });
    // } else {
    //   res.json({ 
    //     status,
    //     message: 'Bot stopped successfully, but SOL harvest failed or was not needed'
    //   });
    // }
  } catch (error) {
    logger.error(`Error during stop and harvest: ${error}`);
    res.json({ 
      status,
      message: 'Bot stopped, but encountered errors during SOL harvesting'
    });
  }
});

app.post('/api/pause', async (req, res) => {
  status = 'paused';
  res.json({ status });
});

app.post('/api/resume', async (req, res) => {
  status = 'running';
  res.json({ status });
});

// Start server
app.listen(port, () => {
  logger.info(`Volume Bot API server running on port ${port}`);
});