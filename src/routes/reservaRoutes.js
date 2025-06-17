import express from 'express';
import { 
  createReserva, 
  getReservasByUser, 
  cancelReserva,
  confirmReserva,
  marcarReservaCompletada, 
  getAllReservas,
  getHistorialReservas,
  getDetalleReserva, 
  
} from '../controladores/reservaCtrl.js';
import { verifyToken } from '../jwt/verifyToken.js';

const router = express.Router();

// Rutas protegidas para usuarios
router.post('/', verifyToken, createReserva);
router.get('/user', verifyToken, getReservasByUser); // Mantener para compatibilidad
router.get('/historial', verifyToken, getHistorialReservas); // Nueva ruta para historial
router.get('/historial/:id', verifyToken, getDetalleReserva); // Detalle de reserva específica
router.put('/cancel/:id', verifyToken, cancelReserva);
router.patch('/:id/completar', verifyToken, marcarReservaCompletada);

// Rutas protegidas solo para admin
router.get('/all', verifyToken, getAllReservas);
router.put('/confirm/:id', verifyToken, confirmReserva);

// Ruta para obtener disponibilidad de una reserva (mantenida para compatibilidad)
router.get('/:id/disponibilidad', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [reserva] = await conmysql.query(
      `SELECT d.*, c.nombre as cancha_nombre 
       FROM reservas r
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       JOIN canchas c ON d.id_cancha = c.id_cancha
       WHERE r.id_reserva = ?`,
      [id]
    );

    if (reserva.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada'
      });
    }

    res.json({
      success: true,
      data: reserva[0]
    });
  } catch (error) {
    return handleError(res, error, 'obtener disponibilidad de reserva');
  }
});

export default router;