// Run once before enabling Google sign-in. Changes only the two named indexes.
require('../src/config/env');
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function main() {
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    const indexes = await User.collection.indexes();
    const phoneIndex = indexes.find((index) => index.key.phoneNumber === 1 && Object.keys(index.key).length === 1);
    if (phoneIndex && !phoneIndex.partialFilterExpression) {
        await User.collection.dropIndex(phoneIndex.name);
    }
    await User.collection.createIndex({ phoneNumber: 1 }, {
        unique: true, partialFilterExpression: { phoneNumber: { $type: 'string' } },
    });
    await User.collection.createIndex({ googleId: 1 }, {
        unique: true, partialFilterExpression: { googleId: { $type: 'string' } },
    });
    console.log('Google authentication indexes are ready');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
