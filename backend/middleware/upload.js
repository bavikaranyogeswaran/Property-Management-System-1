import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import 'dotenv/config';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary Storage (Public)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pms_uploads',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx'],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      return `${name}-${uniqueSuffix}`;
    },
  },
});

// Configure Private Storage (Authenticated)
const privateStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pms_private',
    resource_type: 'auto',
    access_mode: 'authenticated', // Requires signed URL
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx'],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      return `doc-${uniqueSuffix}`;
    },
  },
});

// File filter - additional layer of security
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg|bmp|tiff|ico|pdf|doc|docx/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  const mimetypePatterns = [
    /^image\//,
    /^application\/pdf$/,
    /^application\/msword$/,
    /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
  ];

  const mimetype = mimetypePatterns.some((pattern) =>
    pattern.test(file.mimetype)
  );

  if (extname || mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image and document files are allowed'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: fileFilter,
});

const privateUpload = multer({
  storage: privateStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for documents
  },
  fileFilter: fileFilter,
});

export { upload, privateUpload };
export default upload;
