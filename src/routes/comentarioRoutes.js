import express from 'express';
import { 
  createComentario, 
  getComentariosByCancha, 
  getComentariosByCanchaAdmin,
  deleteComentario,
  createComentarioForReserva
} from '../controladores/comentarioCtrl.js';
import { verifyToken } from '../jwt/verifyToken.js';

const router = express.Router();

// Ruta pública
router.get('/cancha/:id_cancha', getComentariosByCancha);

// Ruta para administradores con información detallada del usuario
router.get('/cancha/:id_cancha/admin', verifyToken, getComentariosByCanchaAdmin);

// Ruta para crear comentario en reserva específica
router.post('/reservas/:id/comentarios', verifyToken, createComentarioForReserva);
// Rutas protegidas
router.post('/', verifyToken, createComentario);
router.delete('/:id', verifyToken, deleteComentario);

export default router;