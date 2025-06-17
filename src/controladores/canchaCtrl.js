import { conmysql } from '../bd.js';
import { handleError } from '../utils/errorHandler.js';

// Obtener todas las canchas
export const getCanchas = async (req, res) => {
  try {
    const [canchas] = await conmysql.query('SELECT * FROM canchas');
    
    res.json({
      success: true,
      data: canchas
    });
  } catch (error) {
    return handleError(res, error, 'obtener canchas');
  }
};

// Obtener cancha por ID
export const getCanchaById = async (req, res) => {
  try {
    const { id } = req.params;
    const [cancha] = await conmysql.query('SELECT * FROM canchas WHERE id_cancha = ?', [id]);
    
    if (cancha.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cancha no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: cancha[0]
    });
  } catch (error) {
    return handleError(res, error, 'obtener cancha');
  }
};

// Crear nueva cancha (solo admin)
export const createCancha = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { nombre, direccion, latitud, longitud, descripcion, tipo_deporte, descripcion_cancha } = req.body;
    
    const [result] = await conmysql.query(
      `INSERT INTO canchas 
      (nombre, direccion, latitud, longitud, descripcion, tipo_deporte, descripcion_cancha) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, direccion, latitud, longitud, descripcion, tipo_deporte, descripcion_cancha]
    );
    
    res.status(201).json({
      success: true,
      message: 'Cancha creada exitosamente',
      data: { id_cancha: result.insertId }
    });
  } catch (error) {
    return handleError(res, error, 'crear cancha');
  }
};

// Actualizar cancha (solo admin)
export const updateCancha = async (req, res) => {
  if (req.user.tipo_usuario !== 'administrador') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción'
    });
  }

  try {
    const { id } = req.params;
    const { nombre, direccion, latitud, longitud, descripcion, tipo_deporte, descripcion_cancha } = req.body;
    
    const [result] = await conmysql.query(
      `UPDATE canchas 
       SET nombre = ?, direccion = ?, latitud = ?, longitud = ?, 
           descripcion = ?, tipo_deporte = ?, descripcion_cancha = ? 
       WHERE id_cancha = ?`,
      [nombre, direccion, latitud, longitud, descripcion, tipo_deporte, descripcion_cancha, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cancha no encontrada'
      });
    }
    
    res.json({
      success: true,
      message: 'Cancha actualizada exitosamente'
    });
  } catch (error) {
    return handleError(res, error, 'actualizar cancha');
  }
};


// Eliminar cancha (solo admin)
export const deleteCancha = async (req, res) => {
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
    
    // Verificar si la cancha existe
    const [cancha] = await connection.query('SELECT id_cancha FROM canchas WHERE id_cancha = ?', [id]);
    
    if (cancha.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Cancha no encontrada'
      });
    }
    
    // Eliminar disponibilidades relacionadas
    await connection.query('DELETE FROM disponibilidad WHERE id_cancha = ?', [id]);
    
    // Eliminar reservas relacionadas (a través de disponibilidad)
    const [disponibilidades] = await connection.query(
      'SELECT id_disponibilidad FROM disponibilidad WHERE id_cancha = ?',
      [id]
    );
    
    for (const disp of disponibilidades) {
      await connection.query('DELETE FROM reservas WHERE id_disponibilidad = ?', [disp.id_disponibilidad]);
    }
    
    // Finalmente eliminar la cancha
    await connection.query('DELETE FROM canchas WHERE id_cancha = ?', [id]);
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Cancha eliminada exitosamente'
    });
  } catch (error) {
    await connection.rollback();
    return handleError(res, error, 'eliminar cancha');
  } finally {
    connection.release();
  }
};