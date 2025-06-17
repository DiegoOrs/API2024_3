import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PNG o JPEG'), false);
  }
};

// Cambiado a .single('imagen')
const upload = multer({ storage, fileFilter }).single('imagen');

export { upload };
