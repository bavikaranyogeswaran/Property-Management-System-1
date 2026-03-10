# Uploads Directory

This directory stores uploaded property and unit images.

## Structure

- Images are stored with unique filenames: `originalname-timestamp-random.ext`
- Max file size: 5MB per image
- Allowed formats: JPEG, JPG, PNG, GIF, WEBP

## Access

Images are served statically at: `http://localhost:3000/uploads/filename.jpg`

**Note**: This directory should be added to `.gitignore` in production.
