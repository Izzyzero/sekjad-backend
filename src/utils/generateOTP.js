const crypto = require('crypto');

module.exports = () => crypto.randomInt(100000, 1000000).toString();
