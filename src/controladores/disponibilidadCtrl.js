import { conmysql } from '../bd.js';
import { handleError } from '../utils/errorHandler.js';

// Obtener disponibilidad por cancha y fecha
export const getDisponibilidadByCancha = async (req, res) => {
  try {
    const id_cancha = req.params.id; // Ahora obtenemos el ID de los parámetros de la ruta
    const { fecha } = req.query;
    
    console.log('ID recibido en backend:', id_cancha); // Para depuración
    
    // Validar parámetros
    if (!id_cancha) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro id_cancha es requerido'
      });
    }

    // Obtener información de la cancha y disponibilidad
    const [cancha] = await conmysql.query(
      'SELECT nombre, direccion FROM canchas WHERE id_cancha = ?',
      [id_cancha]
    );

    if (cancha.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cancha no encontrada'
      });
    }

    let query = `
      SELECT d.*, 
        CASE 
          WHEN r.id_reserva IS NOT NULL THEN 'reservado'
          ELSE d.estado
        END as estado_real
      FROM disponibilidad d
      LEFT JOIN reservas r ON d.id_disponibilidad = r.id_disponibilidad
      WHERE d.id_cancha = ?
    `;
    
    const params = [id_cancha];
    
    if (fecha) {
      query += ' AND d.fecha = ?';
      params.push(fecha);
    }
    
    query += ' ORDER BY d.fecha, d.hora_inicio';
    
    const [disponibilidad] = await conmysql.query(query, params);
    
    res.json({
      success: true,
      data: {
        cancha: cancha[0],
        disponibilidad
      }
    });
  } catch (error) {
    return handleError(res, error, 'obtener disponibilidad');
  }
};

// Crear disponibilidad (solo admin)
export const createDisponibilidad = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { id_cancha, hora_inicio, hora_fin, fecha } = req.body;
    
    // Validar que no exista ya esa disponibilidad
    const [existing] = await conmysql.query(
      `SELECT id_disponibilidad FROM disponibilidad 
       WHERE id_cancha = ? AND fecha = ? AND hora_inicio = ? AND hora_fin = ?`,
      [id_cancha, fecha, hora_inicio, hora_fin]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una disponibilidad para ese horario'
      });
    }
    
    const [result] = await conmysql.query(
      `INSERT INTO disponibilidad 
      (id_cancha, hora_inicio, hora_fin, fecha, estado) 
      VALUES (?, ?, ?, ?, 'disponible')`,
      [id_cancha, hora_inicio, hora_fin, fecha]
    );
    
    res.status(201).json({
      success: true,
      message: 'Disponibilidad creada exitosamente',
      data: { id_disponibilidad: result.insertId }
    });
  } catch (error) {
    return handleError(res, error, 'crear disponibilidad');
  }
};

// Actualizar disponibilidad (solo admin)
export const updateDisponibilidad = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { id } = req.params;
    const { estado } = req.body;
    
    const [result] = await conmysql.query(
      'UPDATE disponibilidad SET estado = ? WHERE id_disponibilidad = ?',
      [estado, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Disponibilidad no encontrada'
      });
    }
    
    res.json({
      success: true,
      message: 'Disponibilidad actualizada exitosamente'
    });
  } catch (error) {
    return handleError(res, error, 'actualizar disponibilidad');
  }
};

// Eliminar disponibilidad (solo admin)
export const deleteDisponibilidad = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  const connection = await conmysql.getConnection();
  await connection.beginTransaction();

  try {
    const { id } = req.params;
    
    // Verificar si hay reservas asociadas
    const [reservas] = await connection.query(
      'SELECT id_reserva FROM reservas WHERE id_disponibilidad = ?',
      [id]
    );
    
    if (reservas.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar, hay reservas asociadas'
      });
    }
    
    // Eliminar disponibilidad
    const [result] = await connection.query(
      'DELETE FROM disponibilidad WHERE id_disponibilidad = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Disponibilidad no encontrada'
      });
    }
    
    await connection.commit();
    res.json({
      success: true,
      message: 'Disponibilidad eliminada exitosamente'
    });
  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'eliminar disponibilidad');
  } finally {
    connection.release();
  }
};