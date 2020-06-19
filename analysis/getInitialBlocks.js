var RpcClient = require('bitcoind-rpc');
var { Blocks } = require('./mongoAPIs');

var config = {
    protocol: 'http',
    user: '',
    pass: '',
    host: '127.0.0.1',
    port: '8332',
};

var rpc = new RpcClient(config);

const INITIAL_BLOCK_HASH = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";


(async function start() {
    for (let height = 0, nextblockhash = INITIAL_BLOCK_HASH; height <= 600000;) {
        result = await getBlock(nextblockhash);
        // console.log(result);
        height = result.height;
        nextblockhash = result.nextblockhash;

    }
})();


/**
 *
 * @param {String} blockHash
 * {
 * result: {
 *   hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
 *   confirmations: 616061,
 *   strippedsize: 285,
 *   size: 285,
 *   weight: 1140,
 *   height: 0,
 *   version: 1,
 *   versionHex: '00000001',
 *   merkleroot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
 *   tx: [
 *     '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'
 *   ],
 *   time: 1231006505,
 *   mediantime: 1231006505,
 *   nonce: 2083236893,
 *   bits: '1d00ffff',
 *   difficulty: 1,
 *   chainwork: '0000000000000000000000000000000000000000000000000000000100010001',
 *   nTx: 1,
 *   nextblockhash: '00000000839a8e6886ab5951d76f411475428afc90947ee320161bbf18eb6048'
 * },
 * error: null,
 * id: 37452
 * }
 */
function getBlock(blockHash) {
    return new Promise(async (resolve, reject) => {
        await rpc.getBlock(blockHash, async (err, ret) => {
            if (err) {
                console.error(err);
                reject(err);
            }
            let block = ret.result;
            await Blocks.create({
                hash: block.hash,
                height: block.height,
                size: block.size,
                version: block.version,
                tx: block.tx,
                time: new Date(block.time * 1000),
                difficulty: block.difficulty
            }).catch((e) => { console.error(e.message) });
            resolve({ height: ret.result.height, nextblockhash: ret.result.nextblockhash });
        });
    });
}
