import express from 'express';
import { 
  getCanchas, 
  getCanchaById, 
  createCancha, 
  updateCancha,
  deleteCancha 
} from '../controladores/canchaCtrl.js';
import { verifyToken } from '../jwt/verifyToken.js';

const router = express.Router();

// Rutas públicas
router.get('/', getCanchas);
router.get('/:id', getCanchaById);

// Rutas protegidas (solo admin)
router.post('/', verifyToken, createCancha);
router.put('/:id', verifyToken, updateCancha);


router.delete('/:id', verifyToken, deleteCancha);

export default router;