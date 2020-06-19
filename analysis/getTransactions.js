/*
 * Transactions, Active accounts, Initial state
 */
var cluster = require('cluster');
var { Blocks, Accounts, UTXOs } = require('./mongoAPIs');
const ProgressBar = require('./progress');
var bitcore = require('bitcore-lib');
var RpcClient = require('bitcoind-rpc');
var fs = require('fs');
var BufferReader = bitcore.encoding.BufferReader;
var Opcode = bitcore.Opcode;

var config = {
    protocol: 'http',
    user: 'huisu',
    pass: 'ssuhuisu',
    host: '127.0.0.1',
    port: '8332',
};

var rpc = new RpcClient(config);

const INITIAL_BLOCK = 1;
const BATCH = 1000;

if (cluster.isMaster) {
	let start = INITIAL_BLOCK;
	let end = 600000;
	let workers = 2; // require('os').cpus().length - 1;

	// Parse arguments
	if (process.argv.length >= 4) {
		start = process.argv[2] * 1;
		end = process.argv[3] * 1;
		if (process.argv[4]) workers = process.argv[4];
	}

	// Make progressBar
	const limits = [];
	for (let i = 0; i < parseInt((end - start + 1) / BATCH); i++) {
		limits.push(BATCH);
	}
	let remainder = (end - start + 1) % BATCH;
	if (remainder > 0) {
		limits.push(remainder);
	}
	let progressBar = new ProgressBar(limits.length, start, BATCH);
	progressBar.addBars(limits.slice(0, workers));

	// Process fork
	for (let i = 0; i < workers; i++) {
		let worker = cluster.fork();
		worker.send({
			progid: i,
			nonce: i,
			start: start + BATCH * i,
			amount: limits[i]
		});

		worker.on('message', function (msg) {
			progressBar.forward(msg.progid, msg.nonce, 1);
		});
	}
	let nonce = workers;

	// fork next process
	cluster.on('exit', function(worker, progid, signal) {
		// console.log(`${progid} finished`);
		if (nonce <= limits.length) {
			let worker = cluster.fork();
			progressBar.update(progid, limits[nonce]);
			worker.send({
				progid: progid,
				nonce: nonce,
				start: start + BATCH * nonce,
				amount: limits[nonce]
			});
			worker.on('message', function (msg) {
				progressBar.forward(msg.progid, msg.nonce, 1);
			});
			nonce++;
			progressBar.forwardIndicator();
		}
	});
} else {
	process.on('message', async (msg) => {
		for (let i = msg.start; i < msg.start + msg.amount; i++) {
			await getTransactions(i);
			process.send({progid: msg.progid, nonce: msg.nonce});
		}
		process.exit(msg.progid);
	});
}

function getTransactions(height) {
	return new Promise(async (resolve, reject) => {
		let block = await Blocks.findOne({height: height}).catch((e) => { console.error('Blocks', e.message); reject(); });
		let txs = block.tx;
		txs.forEach(async txid => {
			if (await UTXOs.findOne({txid: txid})) resolve();
			let result = await getTransaction(txid);
			if (!result) {
				return;
			}
			let accounts = result.accounts;
			let value = result.value;
			await UTXOs.create({
				hash: txid,
				blockNum: height,
				inputs: accounts.inputs,
				outputs: accounts.outputs,
				value: value,
				fee: 0
			});
			let all_accounts = accounts.inputs.concat(accounts.outputs);
			// console.log(all_accounts);
			all_accounts.forEach(async pubkeyhash => {
				await Accounts.updateOne(
					{ pubkeyhash: pubkeyhash },
					{ $push: { utxos: txid }},
					{ upsert: true }
				);
			});
		});
		resolve();
	});
}

function getTransaction(txid) {
	return new Promise((resolve, reject) => {
		rpc.getRawTransaction(txid, (err, ret) => {
			if (err) {
				console.error(err);
				reject(err);
			}
			if (!ret) {
				fs.appendFileSync('error_message.txt', txid + '\n', 'utf8');
				resolve(undefined);
			}
			resolve(getAddressesFromTx(ret.result));
		});
	})
}

function getAddressesFromTx(tx) {
    let accounts = {
        inputs: [],
        outputs: []
    };
    let transaction = bitcore.Transaction(tx);
    let isCoinBase = true;
    transaction.inputs.forEach(input => {
        let pkh = getPubkeyHashFromInputScript(input);
        if (pkh) {
            accounts.inputs.push(pkh);
            isCoinBase = false;
        }
    });
    let value = 0;
    transaction.outputs.forEach(output => {
        let pkh = getPubkeyHashFromOutputScript(output, isCoinBase);
        accounts.outputs = accounts.outputs.concat(pkh);
        value += output._satoshis;
    });
    return { accounts: accounts, value: value };
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
			try {
				// return bitcore.Address.fromPublicKey(bitcore.PublicKey.fromString(decodedScript[1])).toString();
				return bitcore.crypto.Hash.sha256ripemd160(bitcore.PublicKey.fromString(decodedScript[1]).toBuffer()).toString('hex');	
			} catch(e) {
				fs.appendFileSync('error_message.txt', JSON.stringify(input) + '\n', 'utf8');
				return null;
			}
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
