import { conmysql } from '../bd.js';
import { handleError } from '../utils/errorHandler.js';

// Crear sanción (admin)
export const createSancion = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { id_usuario, id_reserva, motivo, dias_sancion } = req.body;
    
    // Calcular fecha de fin de sanción
    const fecha_fin = new Date();
    fecha_fin.setDate(fecha_fin.getDate() + parseInt(dias_sancion));
    
    // Crear sanción
    const [result] = await conmysql.query(
      `INSERT INTO sanciones 
      (id_usuario, id_reserva, motivo, fecha_fin, activa) 
      VALUES (?, ?, ?, ?, 1)`,
      [id_usuario, id_reserva, motivo, fecha_fin]
    );
    
    // Bloquear usuario para reservas
    await conmysql.query(
      'UPDATE usuarios SET fecha_bloqueo_reservas = ? WHERE id_usuario = ?',
      [fecha_fin, id_usuario]
    );
    
    res.status(201).json({
      success: true,
      message: 'Sanción aplicada exitosamente',
      data: { id_sancion: result.insertId }
    });
  } catch (error) {
    return handleError(res, error, 'crear sanción');
  }
};

// Obtener sanciones por usuario
export const getSancionesByUser = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    
    const [sanciones] = await conmysql.query(
      `SELECT s.*, u.nombre as nombre_usuario, 
              r.id_reserva as num_reserva
       FROM sanciones s
       JOIN usuarios u ON s.id_usuario = u.id_usuario
       LEFT JOIN reservas r ON s.id_reserva = r.id_reserva
       WHERE s.id_usuario = ?
       ORDER BY s.fecha_inicio DESC`,
      [id_usuario]
    );
    
    res.json({
      success: true,
      data: sanciones
    });
  } catch (error) {
    return handleError(res, error, 'obtener sanciones');
  }
};

// Obtener todas las sanciones activas (admin)
export const getSancionesActivas = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const [sanciones] = await conmysql.query(
      `SELECT s.*, u.nombre as nombre_usuario, u.email as email_usuario,
              r.id_reserva as num_reserva
       FROM sanciones s
       JOIN usuarios u ON s.id_usuario = u.id_usuario
       LEFT JOIN reservas r ON s.id_reserva = r.id_reserva
       WHERE s.activa = 1 AND s.fecha_fin > NOW()
       ORDER BY s.fecha_inicio DESC`
    );
    
    res.json({
      success: true,
      data: sanciones
    });
  } catch (error) {
    return handleError(res, error, 'obtener sanciones activas');
  }
};

// Eliminar sanción (admin)
export const removeSancion = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { id } = req.params;
    
    // Obtener sanción para saber el usuario
    const [sancion] = await conmysql.query(
      'SELECT id_usuario FROM sanciones WHERE id_sancion = ?',
      [id]
    );
    
    if (sancion.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sanción no encontrada'
      });
    }
    
    // Eliminar sanción
    await conmysql.query(
      'UPDATE sanciones SET activa = 0 WHERE id_sancion = ?',
      [id]
    );
    
    // Verificar si el usuario tiene otras sanciones activas
    const [otrasSanciones] = await conmysql.query(
      'SELECT id_sancion FROM sanciones WHERE id_usuario = ? AND activa = 1 AND fecha_fin > NOW()',
      [sancion[0].id_usuario]
    );
    
    // Si no hay más sanciones activas, desbloquear usuario
    if (otrasSanciones.length === 0) {
      await conmysql.query(
        'UPDATE usuarios SET fecha_bloqueo_reservas = NULL WHERE id_usuario = ?',
        [sancion[0].id_usuario]
      );
    }
    
    res.json({
      success: true,
      message: 'Sanción eliminada exitosamente'
    });
  } catch (error) {
    return handleError(res, error, 'eliminar sanción');
  }
};