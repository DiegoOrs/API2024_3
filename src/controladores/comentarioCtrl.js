import { conmysql } from '../bd.js';
import { handleError } from '../utils/errorHandler.js';

// Crear comentario
export const createComentario = async (req, res) => {
  try {
    const { id_reserva, comentario, calificacion } = req.body;
    const id_usuario = req.user.id;
    
    // Verificar que la reserva pertenece al usuario y está completada
    const [reserva] = await conmysql.query(
      `SELECT id_reserva FROM reservas 
       WHERE id_reserva = ? AND id_usuario = ? AND estado = 'completada'`,
      [id_reserva, id_usuario]
    );
    
    if (reserva.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No puedes comentar esta reserva'
      });
    }
    
    // Verificar si ya hay un comentario para esta reserva
    const [existing] = await conmysql.query(
      'SELECT id_comentario FROM comentarios_reservas WHERE id_reserva = ?',
      [id_reserva]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya has comentado esta reserva'
      });
    }
    
    // Crear comentario
    const [result] = await conmysql.query(
      `INSERT INTO comentarios_reservas 
      (id_reserva, id_usuario, comentario, calificacion) 
      VALUES (?, ?, ?, ?)`,
      [id_reserva, id_usuario, comentario, calificacion]
    );
    
    res.status(201).json({
      success: true,
      message: 'Comentario creado exitosamente',
      data: { id_comentario: result.insertId }
    });
  } catch (error) {
    return handleError(res, error, 'crear comentario');
  }
};

// Crear comentario para una reserva específica (desde la ruta /reservas/:id/comentarios)
export const createComentarioForReserva = async (req, res) => {
  try {
    const id_reserva = req.params.id;
    const { comentario, calificacion } = req.body;
    const id_usuario = req.user.id;

    // Validar calificación
    if (calificacion < 1 || calificacion > 5) {
      return res.status(400).json({
        success: false,
        message: 'La calificación debe ser entre 1 y 5'
      });
    }

    // Verificar reserva
    const [reserva] = await conmysql.query(
      `SELECT id_reserva, estado FROM reservas 
       WHERE id_reserva = ? AND id_usuario = ?`,
      [id_reserva, id_usuario]
    );
    
    if (reserva.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reserva no encontrada'
      });
    }

    if (reserva[0].estado !== 'completada') {
      return res.status(400).json({
        success: false,
        message: 'Solo puedes comentar reservas completadas'
      });
    }
    
    // Verificar comentario existente
    const [existing] = await conmysql.query(
      'SELECT id_comentario FROM comentarios_reservas WHERE id_reserva = ?',
      [id_reserva]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya has comentado esta reserva'
      });
    }
    
    // Crear comentario
    const [result] = await conmysql.query(
      `INSERT INTO comentarios_reservas 
       (id_reserva, id_usuario, comentario, calificacion) 
       VALUES (?, ?, ?, ?)`,
      [id_reserva, id_usuario, comentario, calificacion]
    );
    
    res.status(201).json({
      success: true,
      message: 'Comentario creado exitosamente',
      data: {
        id_comentario: result.insertId,
        id_reserva,
        id_usuario,
        comentario,
        calificacion,
        fecha_comentario: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error al crear comentario:', error);
    return handleError(res, error, 'crear comentario para reserva');
  }
};

// Obtener comentarios por cancha con información detallada del usuario (para administradores)
export const getComentariosByCanchaAdmin = async (req, res) => {
  try {
    const { id_cancha } = req.params;
    
    // Verificar que el usuario sea administrador
    if (req.user.tipo_usuario !== 'administrador') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo administradores pueden acceder a esta información.'
      });
    }
    
    const [comentarios] = await conmysql.query(
      `SELECT cr.*, 
              u.nombre as nombre_usuario, 
              u.email as email_usuario,
              u.telefono as telefono_usuario,
              p.foto_perfil as foto_usuario,
              r.fecha_reserva, 
              d.fecha as fecha_reservada,
              c.nombre as nombre_cancha
       FROM comentarios_reservas cr
       JOIN reservas r ON cr.id_reserva = r.id_reserva
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       JOIN canchas c ON d.id_cancha = c.id_cancha
       JOIN usuarios u ON cr.id_usuario = u.id_usuario
       LEFT JOIN perfiles_ciudadanos p ON u.id_usuario = p.id_usuario
       WHERE d.id_cancha = ?
       ORDER BY cr.fecha_comentario DESC`,
      [id_cancha]
    );
    
    res.json({
      success: true,
      data: comentarios
    });
  } catch (error) {
    return handleError(res, error, 'obtener comentarios para administrador');
  }
};

// Obtener comentarios por cancha
export const getComentariosByCancha = async (req, res) => {
  try {
    const { id_cancha } = req.params;
    
    const [comentarios] = await conmysql.query(
      `SELECT cr.*, u.nombre as nombre_usuario, 
              p.foto_perfil as foto_usuario,
              r.fecha_reserva, d.fecha as fecha_reservada
       FROM comentarios_reservas cr
       JOIN reservas r ON cr.id_reserva = r.id_reserva
       JOIN disponibilidad d ON r.id_disponibilidad = d.id_disponibilidad
       JOIN usuarios u ON cr.id_usuario = u.id_usuario
       LEFT JOIN perfiles_ciudadanos p ON u.id_usuario = p.id_usuario
       WHERE d.id_cancha = ?
       ORDER BY cr.fecha_comentario DESC`,
      [id_cancha]
    );
    
    res.json({
      success: true,
      data: comentarios
    });
  } catch (error) {
    return handleError(res, error, 'obtener comentarios');
  }
};

// Eliminar comentario (admin o dueño)
export const deleteComentario = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;
    const esAdmin = req.user.tipo_usuario === 'administrador';
    
    // Verificar comentario
    const [comentario] = await conmysql.query(
      'SELECT id_usuario FROM comentarios_reservas WHERE id_comentario = ?',
      [id]
    );
    
    if (comentario.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Comentario no encontrado'
      });
    }
    
    // Verificar permisos
    if (!esAdmin && comentario[0].id_usuario !== id_usuario) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para esta acción'
      });
    }
    
    // Eliminar comentario
    await conmysql.query(
      'DELETE FROM comentarios_reservas WHERE id_comentario = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Comentario eliminado exitosamente'
    });
  } catch (error) {
    return handleError(res, error, 'eliminar comentario');
  }
};

