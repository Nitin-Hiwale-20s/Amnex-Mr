// Loads .env (local only) and connects to MongoDB (Atlas or local) with clear error messages.
// Works both as a normal server (Render/local) and as a serverless function (Vercel):
// the connection is cached and reused between requests.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const dns = require('dns');
const mongoose = require('mongoose');

const DEFAULT_DB = 'itms_tracker';

function getUri() {
  // Accept both names: MONGODB_URI (Atlas default) and MONGO_URI (older versions)
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || '')
    .trim()
    .replace(/^["']|["']$/g, '');

  // On Render / Vercel the MongoDB URI is required
  if (!uri && (process.env.NODE_ENV === 'production' || process.env.VERCEL)) {
    throw new Error('MONGODB_URI is missing. Set it in the Environment Variables of Render / Vercel.');
  }

  const finalUri = uri || 'mongodb://127.0.0.1:27017/' + DEFAULT_DB;

  // Atlas gives a URI without a database name -> MongoDB would silently use "test". Add ours.
  const m = finalUri.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (m && (!m[2] || m[2] === '/')) {
    return `${m[1]}/${process.env.MONGODB_DB || DEFAULT_DB}${m[3] || ''}`;
  }
  return finalUri;
}

const hide = uri => uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');

function explain(err, uri) {
  const msg = String(err.message || err);
  const tips = [];
  if (/querySrv|ENOTFOUND|ECONNREFUSED.*_mongodb/i.test(msg))
    tips.push('DNS problem: cannot resolve the Atlas address. Add DNS_SERVERS=8.8.8.8,1.1.1.1 to the environment (or switch network).');
  if (/auth|bad auth/i.test(msg))
    tips.push('Wrong username or password. In Atlas -> Database Access check the user / reset the password (avoid special characters like @ : / in it, or URL-encode them).');
  if (/whitelist|IP|ReplicaSetNoPrimary|Server selection timed out|timed out/i.test(msg))
    tips.push('Atlas is blocking this server. In Atlas -> Network Access -> Add IP Address -> "Allow access from anywhere" (0.0.0.0/0). Wait 1-2 minutes after saving.');
  if (/ECONNREFUSED.*27017/i.test(msg))
    tips.push('No local MongoDB is running. Put your Atlas link in MONGODB_URI.');
  return `\nCould not connect to MongoDB (${hide(uri)})\n${msg}\n\n${tips.map(t => '  -> ' + t).join('\n') || '  -> Check MONGODB_URI'}\n`;
}

// Cached connection (reused by every request; survives warm serverless invocations)
let pending = null;

async function connect() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (pending) return pending;

  pending = (async () => {
    if (process.env.DNS_SERVERS) {
      dns.setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
    }
    const uri = getUri();
    mongoose.set('strictQuery', true);
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, maxPoolSize: 5 });
    } catch (err) {
      const e = new Error(explain(err, uri));
      e.isConnectError = true;
      throw e;
    }
    // make sure unique indexes exist (a serial number can exist only once)
    await Promise.all(
      Object.values(mongoose.models).map(m =>
        m.init().catch(e => console.warn('Index warning (' + m.modelName + '): ' + e.message))
      )
    );
    console.log('MongoDB connected: ' + mongoose.connection.name);
    return mongoose;
  })();

  try {
    return await pending;
  } catch (err) {
    pending = null; // allow retry on the next request
    throw err;
  }
}

module.exports = { connect };
