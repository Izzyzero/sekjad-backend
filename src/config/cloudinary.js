// placeholder file for src/config/cloudinary.js
const envObj = require("./env");

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: envObj.cloud_name,
  api_key: envObj.cloud_api_key,
  api_secret: envObj.cloud_api_secret,
});

module.exports =  cloudinary ;