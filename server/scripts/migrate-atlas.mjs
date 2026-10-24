import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { MongoClient, BSON } from 'mongodb';
const cfg = dotenv.parse(readFileSync('.env.atlas'));
if (!cfg.ATLAS_PASSWORD) throw new Error('Missing Atlas password');
const uri = `mongodb+srv://${encodeURIComponent(cfg.ATLAS_USER)}:${encodeURIComponent(cfg.ATLAS_PASSWORD)}@${cfg.ATLAS_HOST}/${cfg.ATLAS_DATABASE}?retryWrites=true&w=majority&authSource=admin`;
const source = new MongoClient('mongodb://127.0.0.1:27018/crewup?replicaSet=crewup');
const target = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
const digest = docs => createHash('sha256').update(BSON.EJSON.stringify(docs, { relaxed: false })).digest('hex');
try {
  await source.connect(); await target.connect();
  const src = source.db('crewup'), dst = target.db('crewup');
  if ((await dst.listCollections().toArray()).length) throw new Error('Target must be empty; refusing overwrite');
  const report = [];
  for (const { name } of await src.listCollections({}, { nameOnly: true }).toArray()) {
    const docs = await src.collection(name).find().sort({ _id: 1 }).toArray();
    await dst.createCollection(name);
    if (docs.length) await dst.collection(name).insertMany(docs);
    const copied = await dst.collection(name).find().sort({ _id: 1 }).toArray();
    if (digest(docs) !== digest(copied)) throw new Error('Data comparison failed: ' + name);
    for (const index of await src.collection(name).listIndexes().toArray()) {
      if (index.name === '_id_') continue;
      const { key, v, ns, ...options } = index;
      const resolvedKey = key._fts ? Object.fromEntries(Object.keys(index.weights).map(k => [k, 'text'])) : key;
      await dst.collection(name).createIndex(resolvedKey, options);
    }
    report.push({ collection: name, records: docs.length, verified: true });
  }
  let env = readFileSync('.env.local', 'utf8');
  env = env.replace(/^MONGODB_URI=.*$/m, 'MONGODB_URI=' + uri);
  writeFileSync('.env.local', env);
  writeFileSync('../Atlas-Migration-Report.json', JSON.stringify({ completedAt: new Date().toISOString(), database: 'crewup', collections: report, sourceRetained: true }, null, 2));
  console.log(JSON.stringify({ migrated: true, collections: report, configurationUpdated: true }));
} catch (error) {
  console.error('Migration stopped; local source retained. Category: ' + (error.codeName || error.name));
  process.exitCode = 1;
} finally { await source.close(); await target.close(); }
