import multer from "multer";
import path from "path";
import fs from "fs";

// Make sure 'uploads/' exists
const uploadDir = "public/uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, file.originalname.trim());
  },
});

const upload = multer({ storage });

export default upload;
