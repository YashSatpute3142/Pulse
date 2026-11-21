import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';

export function createCloudinaryStorage(env) {
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });

  return {
    async upload({ buffer, kind, ext, userId }) {
      const rand = crypto.randomBytes(12).toString('base64url');
      // Images: public_id without extension (Cloudinary adds the format). Raw files: the extension is part of the public_id.
      const publicId = kind === 'image' ? `pulse/${userId}/${rand}` : `pulse/${userId}/${rand}.${ext}`;
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { public_id: publicId, resource_type: kind === 'image' ? 'image' : 'raw', overwrite: false, unique_filename: false },
          (err, res) => (err ? reject(err) : resolve(res)),
        ).end(buffer);
      });
      return { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height };
    },

    async destroy(items) {
      await Promise.allSettled(items.map((i) => cloudinary.uploader.destroy(i.publicId, { resource_type: i.kind === 'image' ? 'image' : 'raw' })));
    },
  };
}
