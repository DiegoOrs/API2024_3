import express from 'express';
import { 
  getDisponibilidadByCancha, 
  createDisponibilidad, 
  updateDisponibilidad, 
  deleteDisponibilidad 
} from '../controladores/disponibilidadCtrl.js';
import { verifyToken } from '../jwt/verifyToken.js';

const router = express.Router();

// Ruta pública
router.get('/', getDisponibilidadByCancha);
router.get('/cancha/:id', getDisponibilidadByCancha); // Cambiado para mejor semántica
// Rutas protegidas (solo admin)
router.post('/', verifyToken, createDisponibilidad);
router.put('/:id', verifyToken, updateDisponibilidad);
router.delete('/:id', verifyToken, deleteDisponibilidad);

export default router;