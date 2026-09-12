const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

function fileFilter(req, file, cb) {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Seuls les fichiers image sont autorisés'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 6,     // matches MAX_IMAGES in products.js
    fields: 20,   // non-file form fields expected per request
    parts: 30     // fields + files combined, generous headroom
  }
});

// Security fix: the MIME type / extension checks above only look at what the
// client *claims* the file is - trivially forged in a raw multipart request.
// This checks the actual bytes on disk after upload (a real PNG/JPEG/GIF/WEBP
// starts with a fixed, well-known byte signature no text editor can fake by
// just renaming a file), and deletes+rejects anything that doesn't match.
function hasValidImageSignature(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    if (bytesRead < 4) return false;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
    // GIF: "GIF8"
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
    // WEBP: "RIFF"....`WEBP`
    if (bytesRead >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;

    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
}

function validateImageContent(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  if (files.length === 0) return next();

  const invalid = files.filter(f => !hasValidImageSignature(f.path));
  if (invalid.length > 0) {
    // Clean up every uploaded file from this request, not just the bad one -
    // otherwise valid files from the same request would be orphaned on disk.
    files.forEach(f => { try { fs.unlinkSync(f.path); } catch { /* already gone */ } });
    return res.status(400).json({ error: "Un ou plusieurs fichiers ne sont pas des images valides (contenu non reconnu)." });
  }
  next();
}

module.exports = upload;
module.exports.uploadDir = uploadDir;
module.exports.validateImageContent = validateImageContent;
