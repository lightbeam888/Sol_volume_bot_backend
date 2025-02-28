"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADDITIONAL_FEE = exports.LOG_LEVEL = exports.POOL_ID = exports.TOKEN_MINT = exports.TX_FEE = exports.WALLET_NUM = exports.DISTRIBUTE_WALLET_NUM = exports.SELL_PERCENT = exports.SELL_ALL_BY_TIMES = exports.BUY_INTERVAL_MAX = exports.BUY_INTERVAL_MIN = exports.MAX_DISTRIBUTE_AMOUNT = exports.MIN_DISTRIBUTE_AMOUNT = exports.BUY_LOWER_AMOUNT = exports.BUY_UPPER_AMOUNT = exports.BUY_AMOUNT = exports.DISTRIBUTION_AMOUNT = exports.SWAP_ROUTING = exports.IS_RANDOM = exports.RPC_WEBSOCKET_ENDPOINT = exports.RPC_ENDPOINT = exports.PRIVATE_KEY = void 0;
const utils_1 = require("../utils");
exports.PRIVATE_KEY = (0, utils_1.retrieveEnvVariable)('PRIVATE_KEY', utils_1.logger);
exports.RPC_ENDPOINT = (0, utils_1.retrieveEnvVariable)('RPC_ENDPOINT', utils_1.logger);
exports.RPC_WEBSOCKET_ENDPOINT = (0, utils_1.retrieveEnvVariable)('RPC_WEBSOCKET_ENDPOINT', utils_1.logger);
exports.IS_RANDOM = (0, utils_1.retrieveEnvVariable)('IS_RANDOM', utils_1.logger) === 'true';
exports.SWAP_ROUTING = (0, utils_1.retrieveEnvVariable)('SWAP_ROUTING', utils_1.logger) === 'true';
exports.DISTRIBUTION_AMOUNT = Number((0, utils_1.retrieveEnvVariable)('DISTRIBUTION_AMOUNT', utils_1.logger));
exports.BUY_AMOUNT = Number((0, utils_1.retrieveEnvVariable)('BUY_AMOUNT', utils_1.logger));
exports.BUY_UPPER_AMOUNT = Number((0, utils_1.retrieveEnvVariable)('BUY_UPPER_AMOUNT', utils_1.logger));
exports.BUY_LOWER_AMOUNT = Number((0, utils_1.retrieveEnvVariable)('BUY_LOWER_AMOUNT', utils_1.logger));
exports.MIN_DISTRIBUTE_AMOUNT = Number((0, utils_1.retrieveEnvVariable)('MIN_DISTRIBUTE_AMOUNT', utils_1.logger));
exports.MAX_DISTRIBUTE_AMOUNT = Number((0, utils_1.retrieveEnvVariable)('MAX_DISTRIBUTE_AMOUNT', utils_1.logger));
exports.BUY_INTERVAL_MIN = Number((0, utils_1.retrieveEnvVariable)('BUY_INTERVAL_MIN', utils_1.logger));
exports.BUY_INTERVAL_MAX = Number((0, utils_1.retrieveEnvVariable)('BUY_INTERVAL_MAX', utils_1.logger));
exports.SELL_ALL_BY_TIMES = Number((0, utils_1.retrieveEnvVariable)('SELL_ALL_BY_TIMES', utils_1.logger));
exports.SELL_PERCENT = Number((0, utils_1.retrieveEnvVariable)('SELL_PERCENT', utils_1.logger));
exports.DISTRIBUTE_WALLET_NUM = Number((0, utils_1.retrieveEnvVariable)('DISTRIBUTE_WALLET_NUM', utils_1.logger));
// export const CHECK_BAL_INTERVAL = Number(retrieveEnvVariable('CHECK_BAL_INTERVAL', logger))
exports.WALLET_NUM = Number((0, utils_1.retrieveEnvVariable)('WALLET_NUM', utils_1.logger));
exports.TX_FEE = Number((0, utils_1.retrieveEnvVariable)('TX_FEE', utils_1.logger));
exports.TOKEN_MINT = (0, utils_1.retrieveEnvVariable)('TOKEN_MINT', utils_1.logger);
exports.POOL_ID = (0, utils_1.retrieveEnvVariable)('POOL_ID', utils_1.logger);
exports.LOG_LEVEL = (0, utils_1.retrieveEnvVariable)('LOG_LEVEL', utils_1.logger);
exports.ADDITIONAL_FEE = Number((0, utils_1.retrieveEnvVariable)('ADDITIONAL_FEE', utils_1.logger));
// export const JITO_KEY = retrieveEnvVariable('JITO_KEY', logger)
// export const BLOCKENGINE_URL = retrieveEnvVariable('BLOCKENGINE_URL', logger)
// export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE', logger))
