// placeholder file for src/utils/cloudinaryUpload.js
const multer = require("multer");
const storage = multer.memoryStorage();

// 1. File Type Validation
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png" ||
    file.mimetype === "image/gif" ||
    file.mimetype === "image/webp"
  ) {
    cb(null, true); // Accept
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed!"), false); // Reject
  }
};

const upload = multer({
  storage,
  //   5mb file size
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter,
});

module.exports = { upload };
