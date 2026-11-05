require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const User = require('../src/modules/user/user.model');
const Wallet = require('../src/modules/wallet/wallet.model');
const Transaction = require('../src/modules/transaction/transaction.model');
const featured = require('../src/modules/auth/demo-accounts');

const file = path.resolve(__dirname, '../demo-logins.local.json');
const id = key => new mongoose.Types.ObjectId(createHash('sha256').update('digipay-demo-v1/' + key).digest('hex').slice(0, 24));
const firstNames = ['Mira', 'Nila', 'Arif', 'Tara', 'Ishan', 'Diya', 'Rohan', 'Sana'];
const surnames = ['Sen', 'Ali', 'Das', 'Roy', 'Noor'];

function newAccounts() {
  return Array.from({ length: 40 }, (_, index) => {
    const n = index + 1;
    const role = n <= 32 ? 'user' : n <= 38 ? 'agent' : 'admin';
    const phone = '+9997' + String(n).padStart(9, '0');
    const shared = featured.find(a => a.phone === phone);
    return {
      id: id('user-' + n).toHexString(), role, name: firstNames[index % 8] + ' ' + surnames[Math.floor(index / 8)],
      email: shared?.email || role + '.' + n + '@demo.digipay.test', phone,
      password: shared?.password || randomBytes(18).toString('base64url'), featured: Boolean(shared),
      approved: n !== 37 && n !== 38, walletBlocked: n === 31 || n === 32,
    };
  });
}

function makeLedger(accounts, now, openingBalance) {
  const balances = accounts.map(() => Math.round(openingBalance * 100));
  const transactions = [];
  function record(type, actor, target, cents) {
    const cashIn = type === 'cash_in';
    const credit = type === 'add_money' || cashIn;
    const owner = type.startsWith('cash_') ? target : actor;
    balances[owner] += credit ? cents : -cents;
    if (balances[owner] < 0) throw new Error('Invalid fixture balance.');
    if (type === 'send_money') balances[target] += cents;
    const from = credit ? (cashIn ? actor : null) : owner;
    const to = credit ? owner : type === 'send_money' ? target : type === 'cash_out' ? actor : null;
    const date = new Date(now - (256 - transactions.length) * 9000000);
    transactions.push({
      _id: id('transaction-' + transactions.length), actor: accounts[actor].id, demo: true,
      type, from: from === null ? undefined : accounts[from].id, to: to === null ? undefined : accounts[to].id,
      amount: cents / 100, commission: type.startsWith('cash_') ? Math.round(cents / 100) / 100 : 0,
      resultBalance: balances[owner] / 100, status: 'completed', createdAt: date, updatedAt: date,
    });
  }
  for (let i = 0; i < 32; i++) record('add_money', i, null, 175000 + i * 2500);
  for (let round = 0; round < 7; round++) {
    for (let i = 0; i < 32; i++) {
      const amount = 2400 + ((round * 31 + i * 13) % 80) * 100;
      const agent = 32 + i % 4;
      switch ((round + i) % 4) {
        case 0: record('send_money', i, (i + round + 1) % 32, amount); break;
        case 1: record('cash_in', agent, i, amount); break;
        case 2: record('cash_out', agent, i, amount); break;
        default: record('withdraw', i, null, amount);
      }
    }
  }
  return { transactions, balances };
}

async function seed() {
  await connectDB();
  if (mongoose.connection.name !== 'digipay_wallet') throw new Error('Expected the digipay_wallet database.');
  const ids = Array.from({ length: 40 }, (_, i) => id('user-' + (i + 1)));
  const existing = await User.countDocuments({ _id: { $in: ids }, demo: true });
  if (existing) {
    if (existing !== 40 || !fs.existsSync(file)) throw new Error('Existing seed differs from the local manifest. No records changed.');
    console.log('All 40 demo accounts already exist. No new records written.'); return;
  }
  let accounts;
  if (fs.existsSync(file)) accounts = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    accounts = newAccounts();
    fs.writeFileSync(file, JSON.stringify(accounts, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  if (accounts.length !== 40 || accounts.some((a, i) => a.id !== ids[i].toHexString())) throw new Error('Invalid local seed manifest.');
  if (!featured.every(a => accounts.some(b => a.email === b.email && a.phone === b.phone && a.password === b.password && a.role === b.role))) throw new Error('Featured credential mismatch.');
  const now = Date.now();
  const { transactions, balances } = makeLedger(accounts, now, Number(process.env.START_BALANCE ?? 50));
  const createdAt = new Date(now - 30 * 86400000);
  const users = [];
  for (const a of accounts) {
    users.push({ _id: a.id, name: a.name, email: a.email, phone: a.phone, role: a.role,
      password: await bcrypt.hash(a.password, 12), isApproved: a.approved, demo: true, featured: a.featured, createdAt, updatedAt: createdAt });
  }
  const wallets = accounts.map((a, i) => ({ _id: id('wallet-' + (i+1)), user: a.id, balance: balances[i] / 100,
    demo: true, featured: a.featured, isBlocked: a.walletBlocked, createdAt, updatedAt: new Date(now) })).filter((_, i) => accounts[i].role !== 'admin');
  await mongoose.connection.transaction(async session => {
    // Insert-only. A collision with an existing identity or ledger entry rolls back the whole seed.
    await User.insertMany(users, { session, ordered: true });
    await Wallet.insertMany(wallets, { session, ordered: true });
    await Transaction.insertMany(transactions, { session, ordered: true });
  });
  const saved = await Wallet.find({ _id: { $in: wallets.map(w => w._id) }, demo: true }).lean();
  const savedBalances = new Map(saved.map(w => [String(w.user), Math.round(w.balance * 100)]));
  const count = await Transaction.countDocuments({ _id: { $in: transactions.map(t => t._id) }, demo: true });
  if (count !== transactions.length || accounts.some((a, i) => a.role !== 'admin' && savedBalances.get(a.id) !== balances[i])) throw new Error('Seed verification failed.');
  console.log('Verified in digipay_wallet: 32 personal users, 6 agents, 2 admins, 38 wallets and ' + count + ' transactions.');
}

seed().catch(err => { console.error('Seed failed:', err.code || err.name, err.name === 'Error' ? err.message : 'Check the database connection and fixture uniqueness.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
