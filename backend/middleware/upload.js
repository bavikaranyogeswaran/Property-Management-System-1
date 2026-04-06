import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import { Readable } from 'stream';
import 'dotenv/config';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Helper to upload a buffer to Cloudinary using upload_stream
 */
const streamUpload = (fileBuffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );

    const readableStream = new Readable();
    readableStream.push(fileBuffer);
    readableStream.push(null);
    readableStream.pipe(stream);
  });
};

// Use Memory Storage instead of unmaintained CloudinaryStorage
const storage = multer.memoryStorage();

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

// Internal multer instances
const internalUpload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: fileFilter,
});

const internalPrivateUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for documents
  },
  fileFilter: fileFilter,
});

/**
 * Middleware factory to handle direct Cloudinary upload after Multer
 */
const wrapCloudinaryUpload = (multerMiddleware, cloudOptions = {}) => {
  return async (req, res, next) => {
    multerMiddleware(req, res, async (err) => {
      if (err) return next(err);

      try {
        const uploadFile = async (file, options) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          const name = path.basename(file.originalname, ext);

          const finalOptions = {
            ...cloudOptions,
            public_id: `${name}-${uniqueSuffix}`,
            resource_type: 'auto',
          };

          const result = await streamUpload(file.buffer, finalOptions);

          // Map Cloudinary results back to Multer-style objects to ensure backward compatibility
          file.path = result.secure_url;
          file.filename = result.public_id; // public_id is stored in .filename by multer-storage-cloudinary
          return file;
        };

        // Handle single file
        if (req.file) {
          await uploadFile(req.file, cloudOptions);
        }

        // Handle multiple files (array or fields)
        if (req.files) {
          if (Array.isArray(req.files)) {
            await Promise.all(
              req.files.map((file) => uploadFile(file, cloudOptions))
            );
          } else {
            const uploadPromises = [];
            for (const fieldname in req.files) {
              req.files[fieldname].map((file) =>
                uploadPromises.push(uploadFile(file, cloudOptions))
              );
            }
            await Promise.all(uploadPromises);
          }
        }

        next();
      } catch (error) {
        next(error);
      }
    });
  };
};

// Exported Public/Private instances mirroring original API
const upload = {
  single: (fieldname) =>
    wrapCloudinaryUpload(internalUpload.single(fieldname), {
      folder: 'pms_uploads',
    }),
  array: (fieldname, maxCount) =>
    wrapCloudinaryUpload(internalUpload.array(fieldname, maxCount), {
      folder: 'pms_uploads',
    }),
  fields: (fields) =>
    wrapCloudinaryUpload(internalUpload.fields(fields), {
      folder: 'pms_uploads',
    }),
};

const privateUpload = {
  single: (fieldname) =>
    wrapCloudinaryUpload(internalPrivateUpload.single(fieldname), {
      folder: 'pms_private',
      access_mode: 'authenticated',
    }),
  array: (fieldname, maxCount) =>
    wrapCloudinaryUpload(internalPrivateUpload.array(fieldname, maxCount), {
      folder: 'pms_private',
      access_mode: 'authenticated',
    }),
  fields: (fields) =>
    wrapCloudinaryUpload(internalPrivateUpload.fields(fields), {
      folder: 'pms_private',
      access_mode: 'authenticated',
    }),
};

export { upload, privateUpload };
export default upload;
