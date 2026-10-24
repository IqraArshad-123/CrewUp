import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Read only: never prints credentials or modifies either database.
const settings = dotenv.parse(readFileSync('.env.atlas'));
if (!settings.ATLAS_PASSWORD) {
  console.error('Atlas password is missing in the private .env.atlas file.');
  process.exit(1);
}
const uri = `mongodb+srv://${encodeURIComponent(settings.ATLAS_USER)}:${encodeURIComponent(settings.ATLAS_PASSWORD)}@${settings.ATLAS_HOST}/${encodeURIComponent(settings.ATLAS_DATABASE)}?retryWrites=true&w=majority&authSource=admin`;
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  await client.db().command({ ping: 1 });
  const collections = await client.db().listCollections({}, { nameOnly: true }).toArray();
  console.log(JSON.stringify({ connected: true, database: settings.ATLAS_DATABASE, collections: collections.map(c => c.name) }));
} catch (error) {
  console.error('Atlas connection failed. Error category: ' + (error.codeName || error.name || 'Unknown'));
  process.exitCode = 1;
} finally {
  await client.close();
}
