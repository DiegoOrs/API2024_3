import express from 'express';
import { 
  createSancion, 
  getSancionesByUser, 
  getSancionesActivas,
  removeSancion
} from '../controladores/sancionCtrl.js';
import { verifyToken } from '../jwt/verifyToken.js';

const router = express.Router();

// Ruta pública (para ver sanciones de un usuario)
router.get('/user/:id_usuario', getSancionesByUser);

// Rutas protegidas solo para admin
router.post('/', verifyToken, createSancion);
router.get('/activas', verifyToken, getSancionesActivas);
router.delete('/:id', verifyToken, removeSancion);

export default router;