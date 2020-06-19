var bitcore = require('bitcore-lib');
var RpcClient = require('bitcoind-rpc');
var BufferReader = bitcore.encoding.BufferReader;
var Opcode = bitcore.Opcode;

var config = {
    protocol: 'http',
    user: '',
    pass: '',
    host: '127.0.0.1',
    port: '8332',
};

// config can also be an url, e.g.:
//var config = 'http://127.0.0.1:8332';

var rpc = new RpcClient(config);

var txids = [];

// function showNewTransactions() {
//     rpc.getRawMemPool(function (err, ret) {
//         if (err) {
//             console.error(err);
//             return setTimeout(showNewTransactions, 10000);
//         }

//         function batchCall() {
//             ret.result.forEach(function (txid) {
//                 if (txids.indexOf(txid) === -1) {
//                     rpc.getRawTransaction(txid);
//                 }
//             });
//         }

//         rpc.batch(batchCall, function (err, rawtxs) {
//             if (err) {
//                 console.error(err);
//                 return setTimeout(showNewTransactions, 10000);
//             }

//             rawtxs.map(function (rawtx) {
//                 var tx = new bitcore.Transaction(rawtx.result);
//                 console.log('\n\n\n' + tx.id + ':', tx.toObject());
//             });

//             txids = ret.result;
//             setTimeout(showNewTransactions, 2500);
//         });
//     });
// }

// showNewTransactions();
getTransaction("e1882d41800d96d0fddc196cd8d3f0b45d65b030c652d97eaba79a1174e64d58");
getTransaction("fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4");
getTransaction("8dc867fb984661ad8b4a27c7904a06e35a8e32ba68141e9e5195711367ff6db5");
getBlock("000000001aeae195809d120b5d66a39c83eb48792e068f8ea1fea19d84a4278a");
getBlock("000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f");

function getBlock(blockHash) {
    rpc.getBlock(blockHash, (err, ret) => {
        if (err) {
            console.error(err);
            return;
            // return setTimeout(getTransaction, 10000);
        }
        console.log(ret);
    });
}


function getTransaction(txid) {
    rpc.getRawTransaction(txid, (err, ret) => {
        if (err) {
            console.error(err);
            return;
            // return setTimeout(getTransaction, 10000);
        }
        console.log(getAddressesFromTx(ret.result));
        // console.log(aaa(ret.result));
    });
}

function getAddressesFromTx(tx) {
    let addrs = {
        inputs: [],
        outputs: []
    };
    let transaction = bitcore.Transaction(tx);
    let isCoinBase = true;
    transaction.inputs.forEach(input => {
        let pkh = getPubkeyHashFromInputScript(input);
        if (pkh) {
            addrs.inputs.push(pkh);
            isCoinBase = false;
        }
    });
    let totalValue = 0;
    transaction.outputs.forEach(output => {
        let pkh = getPubkeyHashFromOutputScript(output, isCoinBase);
        addrs.outputs.push(pkh);
        totalValue += output._satoshis;
    });
    console.log(totalValue);
    return addrs;
}

/**
 * Input {
 *   prevTxId: <Buffer a3 e0 07 40 9d 04 ec 5d 7f 99 63 22 54 a8 44 55 78 2a 00 67 0f af 66 c5 d2 fc 23 89 bf d2 bc 5d>,
 *   outputIndex: 5,
 *   _scriptBuffer: <Buffer >,
 *   sequenceNumber: 4294967295,
 *   witnesses: [
 *     <Buffer 30 45 02 21 00 fb 47 8c 4f 01 d2 0e 1d cf 23 08 86 68 fc fc 08 0a 30 a0 e6 c3 db 91 41 38 ec 07 ba 03 03 d3 f9 02 20 01 4a 8d 3e 49 59 44 e1 89 20 2d ... 22 more bytes>,
 *     <Buffer 02 c4 db a7 ba 5c 56 f3 69 d0 84 60 5c 08 01 43 c7 78 75 fc 1b 35 d8 53 c9 e9 10 1c bd f0 4f b8 a0>
 *   ]
 * }
 */
function getPubkeyHashFromInputScript(input) {
    if (input.witnesses && input.witnesses.length > 0) {
        // console.log(input.witnesses[1].toString('hex'))
        // address (SegWit X)
        // return bitcore.Address.fromPublicKey(bitcore.PublicKey.fromString(input.witnesses[1].toString('hex'))).toString();
        var scriptPubKeyBuffer = input.witnesses[input.witnesses.length - 1];
        // scriptPubKey = new bitcore.Script(scriptPubKeyBuffer);
        var hash = bitcore.crypto.Hash.sha256ripemd160(scriptPubKeyBuffer);
        return hash.toString('hex');

        // return bitcore.Address.fromPublicKeyHash(input.witnesses[1]).toString();
    } else if (input.script) {
        // console.log(input);
        let decodedScript = input.script.toASM().split(" ")
        if (decodedScript.length === 2) {
            // return bitcore.Address.fromPublicKey(bitcore.PublicKey.fromString(decodedScript[1])).toString();
            return bitcore.crypto.Hash.sha256ripemd160(bitcore.PublicKey.fromString(decodedScript[1]).toBuffer()).toString('hex');
        }
    }
    // else: coinbase tx (no input address)
    return null;
};

/**
 * Output {
 *   _satoshisBN: BN { negative: 0, words: [ 19129088, 8 ], length: 2, red: null },
 *   _satoshis: 556000000,
 *   _scriptBuffer: <Buffer 76 a9 14 c3 98 ef a9 c3 92 ba 60 13 c5 e0 4e e7 29 75 5e f7 f5 8b 32 88 ac>
 * }
 */
function getPubkeyHashFromOutputScript(output, isCoinBase) {
    let addresses = [];
    let br = new BufferReader(output._scriptBuffer);
    while (!br.finished()) {
        try {
            let opcodenum = br.readUInt8();
            let len = 0;
            if (opcodenum > 0 && opcodenum < Opcode.OP_PUSHDATA1) {
                len = opcodenum;
            } else if (opcodenum === Opcode.OP_PUSHDATA1) {
                len = br.readUInt8();
            } else if (opcodenum === Opcode.OP_PUSHDATA2) {
                len = br.readUInt16LE();
            } else if (opcodenum === Opcode.OP_PUSHDATA4) {
                len = br.readUInt32LE();
            }
            if (len > 0) {
                // addresses.push(bitcore.Address.fromPublicKeyHash(br.read(len)).toString());
                if (isCoinBase) {
                    addresses.push(bitcore.crypto.Hash.sha256ripemd160(br.read(len)).toString('hex'));
                } else {
                    addresses.push(br.read(len).toString('hex'));
                }
            }
        } catch (e) {
            if (e instanceof RangeError) {
                throw new errors.Script.InvalidBuffer(buffer.toString('hex'));
            }
            throw e;
        }
    }
    return addresses;
}
