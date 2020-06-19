var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

mongoose.connect('mongodb://localhost:8445/btc-analysis?maxPoolSize=100', { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true});

const BlockSchema = new mongoose.Schema({
    hash: { type: String, unique: true },
    height: { type: Number, unique: true },
    size: Number,
    version: Number,
    tx: [String],
    time: { type: Date },
    difficulty: String
});
BlockSchema.index({ height: 1, hash: 1 });

const AccountSchema = new mongoose.Schema({
    pubkeyhash: { type: String, unique: true },
    address: { type: String, unique: true },
    utxos: [String],
    isExchange: { type: Boolean, default: false }
});
AccountSchema.index({ pubkeyhash: 1 });

const UTXOSchema = new mongoose.Schema({
    hash: { type: String },
    blockNum: Number,
    inputs: [String],
    outputs: [String],
    value: String,
    fee: String
});
UTXOSchema.index({ hash: 1, blockNum: 1 });

var Blocks = mongoose.model('Blocks', BlockSchema);
var Accounts = mongoose.model('Accounts', AccountSchema);
var UTXOs = mongoose.model('UTXOs', UTXOSchema);

module.exports = {
    Blocks,
    Accounts,
    UTXOs,
};